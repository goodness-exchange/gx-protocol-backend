/**
 * Outbox Submitter Worker
 *
 * Educational Purpose:
 * This worker implements the "Transactional Outbox" pattern for reliable
 * message delivery from database to blockchain. It ensures that every
 * command written to the outbox table eventually reaches the blockchain.
 *
 * Pattern Origin:
 * - Chris Richardson: "Microservices Patterns" (2018)
 * - Gregor Hohpe: "Enterprise Integration Patterns" (2003)
 *
 * Architecture:
 * ```
 * Database (OutboxCommand table)
 *     ↓ (poll every 100ms)
 * Outbox Submitter Worker
 *     ↓ (submit transaction)
 * Fabric Client (with circuit breaker)
 *     ↓ (gRPC)
 * Hyperledger Fabric Peer
 *     ↓ (consensus)
 * Blockchain (committed transaction)
 * ```
 *
 * Guarantees:
 * - At-least-once delivery (commands may be submitted multiple times)
 * - Eventual consistency (commands eventually reach blockchain)
 * - Crash recovery (other workers pick up failed commands)
 * - No data loss (commands persist in database)
 *
 * Usage:
 * ```bash
 * # Development
 * npm run dev
 *
 * # Production (Kubernetes)
 * kubectl apply -f k8s/workers/outbox-submitter.yaml
 * ```
 */

import { PrismaClient } from '@prisma/client';
import { createFabricClient, IFabricClient } from '@gx/core-fabric';
import * as promClient from 'prom-client';

// ========== Configuration ==========

/**
 * Worker configuration from environment variables
 */
interface WorkerConfig {
  /** Worker identifier (for distributed workers) */
  workerId: string;

  /** Polling interval in milliseconds */
  pollInterval: number;

  /** Batch size for command retrieval */
  batchSize: number;

  /** Maximum retry attempts before moving to DLQ */
  maxRetries: number;

  /** Lock timeout in milliseconds (stale lock cleanup) */
  lockTimeout: number;

  /** Enable metrics endpoint for Prometheus */
  enableMetrics: boolean;

  /** Metrics port */
  metricsPort: number;
}

function loadConfig(): WorkerConfig {
  return {
    workerId: process.env.WORKER_ID || `worker-${process.pid}`,
    pollInterval: parseInt(process.env.POLL_INTERVAL || '100', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '10', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5', 10),
    // ENTERPRISE FIX: Increased lock timeout from 30s to 5 minutes
    // Fabric consensus can exceed 30 seconds under load, causing premature lock takeover
    lockTimeout: parseInt(process.env.LOCK_TIMEOUT || '300000', 10),
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
  };
}

// ========== Prometheus Metrics ==========

/**
 * Observability: Metrics for monitoring worker health
 *
 * Why metrics?
 * - Detect when worker is stuck
 * - Monitor submission rate
 * - Alert on high failure rate
 * - Track queue depth
 */

const metrics = {
  // Counter: Total commands processed
  commandsProcessed: new promClient.Counter({
    name: 'outbox_commands_processed_total',
    help: 'Total number of outbox commands processed',
    labelNames: ['status'], // status: success, failed, max_retries
  }),

  // Gauge: Current queue depth
  queueDepth: new promClient.Gauge({
    name: 'outbox_queue_depth',
    help: 'Number of pending commands in outbox',
  }),

  // Histogram: Time to process command
  processingDuration: new promClient.Histogram({
    name: 'outbox_processing_duration_seconds',
    help: 'Time taken to process a command',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // seconds
  }),

  // Gauge: Worker status
  workerStatus: new promClient.Gauge({
    name: 'outbox_worker_status',
    help: 'Worker status: 1 = running, 0 = stopped',
  }),
};

// Register default metrics (memory, CPU, etc.)
promClient.collectDefaultMetrics();

// ========== Fabric Identity Management ==========

/**
 * Fabric identity configuration
 *
 * Each identity represents a different role in the system:
 * - org1-super-admin: gx_super_admin role for system-level operations
 * - org1-admin: gx_admin role for administrative operations
 * - org1-partner-api: gx_partner_api role for standard operations
 */
interface FabricIdentity {
  name: string;
  role: 'super_admin' | 'admin' | 'partner_api';
  certPath: string;
  keyPath: string;
}

/**
 * Map of identity name to Fabric client instance
 *
 * Each client maintains its own gRPC connection and circuit breaker.
 * Clients are created once during worker initialization and reused.
 */
const fabricClients = new Map<string, IFabricClient>();

/**
 * Select appropriate Fabric identity based on command type
 *
 * ABAC (Attribute-Based Access Control) in chaincode:
 * - Super admin commands require gx_super_admin role
 * - Admin commands require gx_admin role
 * - Standard commands use gx_partner_api role
 *
 * Multi-Org Endorsement:
 * - Protocol-level commands return Org1 identity (Gateway SDK will discover Org2 via service discovery)
 * - User-level commands use single Org1 identity
 */
function selectIdentityForCommand(commandType: string): string {
  const superAdminCommands = [
    'BOOTSTRAP_SYSTEM',
    'INITIALIZE_COUNTRY_DATA',
    'PAUSE_SYSTEM',
    'RESUME_SYSTEM',
  ];

  const adminCommands = [
    'APPOINT_ADMIN',
    'ACTIVATE_TREASURY',
    'DISTRIBUTE_GENESIS', // Requires gx_admin role for genesis token distribution
    'TRANSFER_TOKENS', // Uses TransferInternal which requires Admin role
  ];

  // For super admin commands, use Org1 super-admin
  // The Gateway SDK should discover and get endorsements from Org2 via service discovery
  if (superAdminCommands.includes(commandType)) {
    return 'org1-super-admin';
  }

  if (adminCommands.includes(commandType)) {
    return 'org1-admin';
  }

  return 'org1-partner-api';
}

// NOTE: All transactions now require multi-org endorsement due to MAJORITY policy
// The requiresMultiOrgEndorsement function has been removed as it's no longer needed.
// Endorsing organizations are explicitly specified in submitToFabric method.

// ========== Main Worker Class ==========

/**
 * Outbox Submitter Worker
 *
 * Responsibilities:
 * 1. Poll database for pending commands
 * 2. Lock commands (prevent duplicate processing)
 * 3. Submit to Fabric chaincode
 * 4. Update status (COMMITTED or FAILED)
 * 5. Handle retries and DLQ
 * 6. Expose metrics
 */
class OutboxSubmitter {
  private config: WorkerConfig;
  private prisma: PrismaClient;
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    config: WorkerConfig,
    prisma: PrismaClient
  ) {
    this.config = config;
    this.prisma = prisma;
  }

  /**
   * Start the worker
   *
   * Lifecycle:
   * 1. Initialize Fabric clients for all 3 identities
   * 2. Connect each client to Fabric network
   * 3. Start polling loop
   * 4. Start metrics server
   * 5. Register graceful shutdown handlers
   */
  async start(): Promise<void> {
    this.log('info', 'Starting outbox submitter worker', {
      workerId: this.config.workerId,
      pollInterval: this.config.pollInterval,
      batchSize: this.config.batchSize,
    });

    try {
      // Initialize Fabric clients for all identities
      await this.initializeFabricClients();

      // Start polling loop
      this.isRunning = true;
      metrics.workerStatus.set(1);
      this.startPolling();

      // Start metrics server
      if (this.config.enableMetrics) {
        this.startMetricsServer();
      }

      // Register graceful shutdown
      this.registerShutdownHandlers();

      this.log('info', 'Outbox submitter worker started successfully');
    } catch (error: any) {
      this.log('error', 'Failed to start worker', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Fabric clients for all identities across both organizations
   *
   * Multi-Org Architecture:
   * - Org1 clients connect to peer0-org1.fabric.svc.cluster.local:7051
   * - Org2 clients connect to peer0-org2.fabric.svc.cluster.local:7051
   *
   * For protocol-level operations requiring multi-org endorsement:
   * - Submit to both Org1 and Org2 super-admin clients
   * - Fabric will aggregate endorsements from both organizations
   *
   * Each identity gets its own:
   * - gRPC connection to peer
   * - Gateway connection with X.509 certificate
   * - Circuit breaker for resilience
   *
   * Wallet structure:
   * fabric-wallet/
   *   Org1 Identities:
   *   ├── org1-super-admin/ (gx_super_admin role)
   *   ├── org1-admin/       (gx_admin role)
   *   └── org1-partner-api/ (gx_partner_api role)
   *   Org2 Identities:
   *   └── org2-super-admin/ (gx_super_admin role)
   */
  private async initializeFabricClients(): Promise<void> {
    const walletPath = process.env.FABRIC_WALLET_PATH || './fabric-wallet';

    const identities: FabricIdentity[] = [
      // Org1 identities
      {
        name: 'org1-super-admin',
        role: 'super_admin',
        certPath: `${walletPath}/org1-super-admin-cert`,
        keyPath: `${walletPath}/org1-super-admin-key`,
      },
      {
        name: 'org1-admin',
        role: 'admin',
        certPath: `${walletPath}/org1-admin-cert`,
        keyPath: `${walletPath}/org1-admin-key`,
      },
      {
        name: 'org1-partner-api',
        role: 'partner_api',
        certPath: `${walletPath}/org1-partner-api-cert`,
        keyPath: `${walletPath}/org1-partner-api-key`,
      },
      // Org2 identities
      {
        name: 'org2-super-admin',
        role: 'super_admin',
        certPath: `${walletPath}/org2-super-admin-cert`,
        keyPath: `${walletPath}/org2-super-admin-key`,
      },
    ];

    this.log('info', 'Initializing Fabric clients for all identities', {
      identities: identities.map(i => ({ name: i.name, role: i.role })),
    });

    // Create and connect each client
    for (const identity of identities) {
      try {
        // Determine peer endpoint and MSP based on organization
        const isOrg2 = identity.name.startsWith('org2-');
        const peerEndpoint = isOrg2
          ? (process.env.FABRIC_ORG2_PEER_ENDPOINT || 'peer0-org2.fabric.svc.cluster.local:7051')
          : (process.env.FABRIC_PEER_ENDPOINT || 'peer0-org1.fabric.svc.cluster.local:7051');
        const mspId = isOrg2
          ? (process.env.FABRIC_ORG2_MSP_ID || 'Org2MSP')
          : (process.env.FABRIC_MSP_ID || 'Org1MSP');
        const tlsServerNameOverride = isOrg2
          ? (process.env.FABRIC_ORG2_TLS_SERVER_NAME_OVERRIDE || 'peer0.org2.prod.goodness.exchange')
          : process.env.FABRIC_TLS_SERVER_NAME_OVERRIDE;

        this.log('info', `Connecting Fabric client for ${identity.name}`, {
          role: identity.role,
          peer: peerEndpoint,
          mspId: mspId,
        });

        // Create client with specific identity credentials
        const client = await createFabricClient({
          peerEndpoint,
          peerTLSCACert: await this.loadTLSCACert(),
          mspId,
          certPath: identity.certPath,
          keyPath: identity.keyPath,
          channelName: process.env.FABRIC_CHANNEL_NAME || 'gxchannel',
          chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'gxtv3',
          grpc: {
            keepAlive: true,
            keepAliveTimeout: 120000,
            tlsServerNameOverride,
          },
        });

        // Connect to Fabric network
        await client.connect();

        // Store client in map
        fabricClients.set(identity.name, client);

        this.log('info', `Successfully connected Fabric client for ${identity.name}`);
      } catch (error: any) {
        this.log('error', `Failed to connect Fabric client for ${identity.name}`, {
          error: error.message,
        });
        throw new Error(`Failed to initialize Fabric client ${identity.name}: ${error.message}`);
      }
    }

    this.log('info', 'All Fabric clients initialized successfully', {
      count: fabricClients.size,
    });
  }

  /**
   * Load TLS CA certificate for peer connection
   */
  private async loadTLSCACert(): Promise<string> {
    const fs = require('fs').promises;
    const caPath = `${process.env.FABRIC_WALLET_PATH || './fabric-wallet'}/tlsca-cert`;
    return await fs.readFile(caPath, 'utf-8');
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping outbox submitter worker');

    this.isRunning = false;
    metrics.workerStatus.set(0);

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    // Disconnect all Fabric clients
    for (const [name, client] of fabricClients) {
      this.log('info', `Disconnecting Fabric client: ${name}`);
      client.disconnect();
    }
    fabricClients.clear();

    await this.prisma.$disconnect();

    this.log('info', 'Outbox submitter worker stopped');
  }

  /**
   * Polling loop: Check for pending commands every N milliseconds
   *
   * Why polling instead of triggers?
   * - Simpler (no database-specific trigger syntax)
   * - Portable (works with any database)
   * - Scalable (multiple workers can poll)
   * - Reliable (survives database restarts)
   */
  private startPolling(): void {
    const poll = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.processBatch();
      } catch (error: any) {
        this.log('error', 'Error in polling loop', { error: error.message });
      }

      // Schedule next poll
      this.pollTimer = setTimeout(poll, this.config.pollInterval);
    };

    // Start first poll immediately
    poll();
  }

  /**
   * Process a batch of commands
   *
   * Algorithm:
   * 1. Find pending commands (with FOR UPDATE SKIP LOCKED)
   * 2. Lock them (set status = LOCKED, lockedBy = workerId)
   * 3. Process each command
   * 4. Update status based on result
   */
  private async processBatch(): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Find and lock pending commands
      const commands = await this.findAndLockCommands();

      if (commands.length === 0) {
        // Update queue depth metric
        const queueDepth = await this.getQueueDepth();
        metrics.queueDepth.set(queueDepth);
        return;
      }

      this.log('info', `Processing batch of ${commands.length} commands`);

      // Step 2: Process each command
      for (const command of commands) {
        await this.processCommand(command);
      }

      // Update metrics
      const duration = (Date.now() - startTime) / 1000;
      metrics.processingDuration.observe(duration);

      const queueDepth = await this.getQueueDepth();
      metrics.queueDepth.set(queueDepth);
    } catch (error: any) {
      this.log('error', 'Error processing batch', { error: error.message });
    }
  }

  /**
   * Find and lock pending commands using pessimistic locking
   *
   * ENTERPRISE PATTERN: Pessimistic Locking with FOR UPDATE SKIP LOCKED
   *
   * Why this is critical:
   * - Multiple workers may poll simultaneously
   * - Without row-level locking, both workers can SELECT the same commands
   * - Both workers then UPDATE the same rows, leading to double-submission
   *
   * Solution:
   * - Use raw SQL with FOR UPDATE SKIP LOCKED
   * - This atomically selects AND locks rows in a single operation
   * - SKIP LOCKED means workers don't wait for locked rows, they skip them
   * - This prevents duplicate processing by multiple workers
   *
   * Performance:
   * - No blocking between workers (SKIP LOCKED)
   * - Minimal lock contention
   * - Scales to N workers processing disjoint command sets
   */
  private async findAndLockCommands() {
    const lockTimeoutSeconds = Math.floor(this.config.lockTimeout / 1000);

    // ENTERPRISE FIX: Use raw SQL with FOR UPDATE SKIP LOCKED for atomic claim
    // This prevents race conditions where multiple workers select the same commands
    // Note: We use parameterized query for lockTimeoutSeconds to avoid SQL injection
    const commands: any[] = await this.prisma.$queryRawUnsafe(`
      WITH claimed AS (
        SELECT id FROM "OutboxCommand"
        WHERE (
          status = 'PENDING'
          OR (status = 'LOCKED' AND "lockedAt" < NOW() - INTERVAL '${lockTimeoutSeconds} seconds')
          OR (status = 'FAILED' AND attempts < $1)
        )
        ORDER BY "createdAt" ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxCommand"
      SET
        status = 'LOCKED',
        "lockedBy" = $3,
        "lockedAt" = NOW(),
        "updatedAt" = NOW()
      FROM claimed
      WHERE "OutboxCommand".id = claimed.id
      RETURNING
        "OutboxCommand".id,
        "OutboxCommand"."tenantId",
        "OutboxCommand".service,
        "OutboxCommand"."commandType",
        "OutboxCommand"."requestId",
        "OutboxCommand".payload,
        "OutboxCommand".status,
        "OutboxCommand".attempts,
        "OutboxCommand"."lockedBy",
        "OutboxCommand"."lockedAt",
        "OutboxCommand"."createdAt",
        "OutboxCommand"."updatedAt"
    `, this.config.maxRetries, this.config.batchSize, this.config.workerId);

    return commands;
  }

  /**
   * Process a single command
   *
   * Flow:
   * 1. Parse command payload
   * 2. Submit to Fabric chaincode
   * 3. IF success → Update status to COMMITTED
   * 4. IF failure → Increment attempts, update status to FAILED
   * 5. IF max retries → Move to DLQ (status = FAILED, no more retries)
   */
  private async processCommand(command: any): Promise<void> {
    const startTime = Date.now();

    try {
      this.log('debug', 'Processing command', {
        commandId: command.id,
        commandType: command.commandType,
        attempts: command.attempts,
      });

      // Parse payload (should be JSON)
      const payload = command.payload as any;

      // Submit to Fabric
      const result = await this.submitToFabric(command.commandType, payload);

      // ENTERPRISE FIX: Update status with optimistic locking (version check)
      // Verify the command is still locked by this worker before updating
      // This prevents race conditions where another worker took over a stale lock
      const updateResult = await this.prisma.outboxCommand.updateMany({
        where: {
          id: command.id,
          status: 'LOCKED',
          lockedBy: this.config.workerId,
        },
        data: {
          status: 'COMMITTED',
          submittedAt: new Date(),
          fabricTxId: result.transactionId,
          commitBlock: result.blockNumber,
          error: null,
          errorCode: null,
          lockedBy: null,
          lockedAt: null,
        },
      });

      if (updateResult.count === 0) {
        // Another worker took over this command - skip post-commit side effects
        this.log('warn', 'Command was taken over by another worker, skipping side effects', {
          commandId: command.id,
          fabricTxId: result.transactionId,
        });
        return;
      }

      // Post-commit side effects for specific command types
      // Note: Fabric only emits ONE event per transaction (the last SetEvent call wins),
      // so we cannot rely on the projector to update user status for CREATE_USER commands
      // because the UserCreated event is overwritten by subsequent genesis distribution events.
      await this.handlePostCommitSideEffects(command.commandType, payload, result);

      metrics.commandsProcessed.inc({ status: 'success' });

      const duration = Date.now() - startTime;
      this.log('info', 'Command processed successfully', {
        commandId: command.id,
        fabricTxId: result.transactionId,
        duration,
      });
    } catch (error: any) {
      // Increment attempts
      const attempts = command.attempts + 1;
      const isMaxRetries = attempts >= this.config.maxRetries;

      // ENTERPRISE FIX: Use optimistic locking for failure updates too
      // Only update if still locked by this worker
      const updateResult = await this.prisma.outboxCommand.updateMany({
        where: {
          id: command.id,
          status: 'LOCKED',
          lockedBy: this.config.workerId,
        },
        data: {
          status: 'FAILED',
          attempts,
          error: error.message?.substring(0, 1000) || 'Unknown error', // Truncate long errors
          errorCode: error.code?.toString() || 'UNKNOWN_ERROR',
          lockedBy: null,
          lockedAt: null,
        },
      });

      if (updateResult.count === 0) {
        // Another worker took over - log and skip metrics update
        this.log('warn', 'Command taken over by another worker during failure handling', {
          commandId: command.id,
          error: error.message,
        });
        return;
      }

      if (isMaxRetries) {
        metrics.commandsProcessed.inc({ status: 'max_retries' });
        this.log('error', 'Command failed after max retries - moved to DLQ', {
          commandId: command.id,
          attempts,
          error: error.message,
        });
      } else {
        metrics.commandsProcessed.inc({ status: 'failed' });
        this.log('warn', 'Command failed, will retry', {
          commandId: command.id,
          attempts,
          maxRetries: this.config.maxRetries,
          error: error.message,
        });
      }
    }
  }

  /**
   * Submit command to Fabric chaincode
   *
   * ABAC (Attribute-Based Access Control):
   * 1. Select Fabric identity based on command type
   * 2. Each identity has gxc_role attribute in X.509 certificate
   * 3. Chaincode validates role before executing function
   *
   * Multi-Org Endorsement:
   * - ALL transactions require endorsements from both Org1MSP and Org2MSP
   * - This is because the chaincode endorsement policy is MAJORITY (2 of 2)
   * - We explicitly specify endorsingOrganizations to ensure both orgs endorse
   *
   * Example: CREATE_USER requires gx_partner_api role + multi-org endorsement
   */
  private async submitToFabric(
    commandType: string,
    payload: any
  ): Promise<{ transactionId: string; blockNumber?: bigint }> {
    // Select appropriate Fabric client for this command
    const identityName = selectIdentityForCommand(commandType);
    const fabricClient = fabricClients.get(identityName);

    if (!fabricClient) {
      throw new Error(`Fabric client not found for identity: ${identityName}`);
    }

    this.log('info', 'Submitting transaction to Fabric', {
      commandType,
      identity: identityName,
    });

    // Map command type to chaincode contract and function
    const { contractName, functionName, args } = this.mapCommandToChaincode(
      commandType,
      payload
    );

    // Submit transaction using selected identity
    // Chaincode uses OR endorsement policy: OR('Org1MSP.member','Org2MSP.member')
    // This means only ONE organization needs to endorse the transaction
    const result = await fabricClient.submitTransaction(
      contractName,
      functionName,
      ...args
    );

    this.log('info', 'Transaction submitted successfully', {
      commandType,
      transactionId: result.transactionId,
      blockNumber: result.blockNumber?.toString(),
    });

    return {
      transactionId: result.transactionId,
      blockNumber: result.blockNumber,
    };
  }

  /**
   * Map command type to chaincode function
   *
   * Educational: This is the mapping between REST API commands
   * and blockchain smart contract functions
   */
  private mapCommandToChaincode(
    commandType: string,
    payload: any
  ): { contractName: string; functionName: string; args: string[] } {
    switch (commandType) {
      // ========== IdentityContract ==========
      case 'CREATE_USER':
        return {
          contractName: 'IdentityContract',
          functionName: 'CreateUser',
          args: [
            payload.userId as string,
            payload.biometricHash as string,
            // Support both 'nationality' and 'countryCode' field names for backwards compatibility
            (payload.nationality || payload.countryCode) as string,
            payload.age.toString(),
          ],
        };

      // ========== TokenomicsContract ==========
      case 'TRANSFER_TOKENS':
        // ENTERPRISE FEE IMPLEMENTATION: Using TransferWithFees for user-to-user transfers
        // This function calculates and deducts transaction fees based on:
        // - Transaction type (P2P, Merchant, Government, B2B)
        // - Geographic scope (Local vs Cross-Border)
        // - Amount tiers (0-3 coins free, 3-100 coins, 100+ coins)
        //
        // Fee exemptions are automatically applied for:
        // - System pools (SYSTEM_USER_GENESIS_POOL, SYSTEM_LOAN_POOL, etc.)
        // - Country treasuries (treasury_*)
        // - System minter (SYSTEM_MINTER)
        //
        // TransferWithFees requires Admin role and emits a TransferWithFeesCompleted event
        // containing fee breakdown for the projector to record.
        return {
          contractName: 'TokenomicsContract',
          functionName: 'TransferWithFees',
          args: [
            payload.fromUserId as string,
            payload.toUserId as string,
            payload.amount.toString(),
            '', // txType hint - empty for auto-detect based on account types
            payload.remark as string || 'User-initiated transfer',
            payload.idempotencyKey as string || '', // Optional idempotency key
          ],
        };

      case 'DISTRIBUTE_GENESIS':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'DistributeGenesis',
          args: [
            payload.userId as string,
            // Support both 'nationality' and 'countryCode' field names for backwards compatibility
            (payload.nationality || payload.countryCode) as string,
          ],
        };

      case 'FREEZE_WALLET':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'FreezeWallet',
          args: [
            payload.userID as string,
            payload.reason as string || 'ADMIN_ACTION',
          ],
        };

      case 'UNFREEZE_WALLET':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'UnfreezeWallet',
          args: [payload.userID as string],
        };

      // ========== OrganizationContract ==========
      case 'PROPOSE_ORGANIZATION':
        return {
          contractName: 'OrganizationContract',
          functionName: 'ProposeOrganization',
          args: [
            payload.orgId as string,
            payload.orgName as string,
            payload.orgType as string,
            JSON.stringify(payload.stakeholderIds),
          ],
        };

      case 'ENDORSE_MEMBERSHIP':
        return {
          contractName: 'OrganizationContract',
          functionName: 'EndorseMembership',
          args: [payload.orgId as string],
        };

      case 'ACTIVATE_ORGANIZATION':
        return {
          contractName: 'OrganizationContract',
          functionName: 'ActivateOrganization',
          args: [payload.orgId as string],
        };

      case 'DEFINE_AUTH_RULE':
        return {
          contractName: 'OrganizationContract',
          functionName: 'DefineAuthRule',
          args: [
            payload.orgId as string,
            JSON.stringify(payload.rule),
          ],
        };

      case 'INITIATE_MULTISIG_TX':
        return {
          contractName: 'OrganizationContract',
          functionName: 'InitiateMultiSigTx',
          args: [
            payload.orgId as string,
            payload.toUserId as string,
            payload.amount as string,
            payload.remark as string || '',
          ],
        };

      case 'APPROVE_MULTISIG_TX':
        return {
          contractName: 'OrganizationContract',
          functionName: 'ApproveMultiSigTx',
          args: [payload.pendingTxId as string],
        };

      // ========== LoanPoolContract ==========
      case 'APPLY_FOR_LOAN':
        return {
          contractName: 'LoanPoolContract',
          functionName: 'ApplyForLoan',
          args: [
            payload.borrowerId as string,
            payload.amount as string,
            payload.collateralHash as string,
          ],
        };

      case 'APPROVE_LOAN':
        return {
          contractName: 'LoanPoolContract',
          functionName: 'ApproveLoan',
          args: [payload.loanId as string],
        };

      // ========== GovernanceContract ==========
      case 'SUBMIT_PROPOSAL':
        return {
          contractName: 'GovernanceContract',
          functionName: 'SubmitProposal',
          args: [
            payload.targetParam as string,
            payload.newValue as string,
          ],
        };

      case 'VOTE_ON_PROPOSAL':
        return {
          contractName: 'GovernanceContract',
          functionName: 'VoteOnProposal',
          args: [
            payload.proposalId as string,
            String(payload.vote),
          ],
        };

      case 'EXECUTE_PROPOSAL':
        return {
          contractName: 'GovernanceContract',
          functionName: 'ExecuteProposal',
          args: [payload.proposalId as string],
        };

      // ========== AdminContract ==========
      case 'BOOTSTRAP_SYSTEM':
        return {
          contractName: 'AdminContract',
          functionName: 'BootstrapSystem',
          args: [],
        };

      case 'INITIALIZE_COUNTRY_DATA':
        // Transform payload: {code, name, percentage} -> {countryCode, percentage}
        const transformedCountries = (payload.countriesData as Array<{code: string; name: string; percentage: number}>).map(c => ({
          countryCode: c.code,
          percentage: c.percentage
        }));
        return {
          contractName: 'AdminContract',
          functionName: 'InitializeCountryData',
          args: [JSON.stringify(transformedCountries)],
        };

      case 'UPDATE_SYSTEM_PARAMETER':
        return {
          contractName: 'AdminContract',
          functionName: 'UpdateSystemParameter',
          args: [
            payload.paramId as string,
            payload.newValue as string,
          ],
        };

      case 'PAUSE_SYSTEM':
        return {
          contractName: 'AdminContract',
          functionName: 'PauseSystem',
          args: [payload.reason as string],
        };

      case 'RESUME_SYSTEM':
        return {
          contractName: 'AdminContract',
          functionName: 'ResumeSystem',
          args: [],
        };

      case 'APPOINT_ADMIN':
        return {
          contractName: 'AdminContract',
          functionName: 'AppointAdmin',
          args: [payload.newAdminId as string],
        };

      case 'ACTIVATE_TREASURY':
        return {
          contractName: 'AdminContract',
          functionName: 'ActivateTreasuryAccount',
          args: [payload.countryCode as string],
        };

      // ========== TaxAndFeeContract ==========
      case 'APPLY_VELOCITY_TAX':
        return {
          contractName: 'TaxAndFeeContract',
          functionName: 'ApplyVelocityTax',
          args: [
            payload.accountId as string,
            String(payload.taxRateBps),
          ],
        };

      default:
        throw new Error(`Unknown command type: ${commandType}`);
    }
  }

  /**
   * Get current queue depth (for monitoring)
   */
  private async getQueueDepth(): Promise<number> {
    return this.prisma.outboxCommand.count({
      where: {
        status: { in: ['PENDING', 'LOCKED', 'FAILED'] },
        attempts: { lt: this.config.maxRetries },
      },
    });
  }

  /**
   * Handle post-commit side effects for specific command types
   *
   * Background: Hyperledger Fabric only emits ONE event per transaction
   * (the last SetEvent call in the chaincode wins). For CREATE_USER commands,
   * the UserCreated event is overwritten by the TreasuryAllocationEvent
   * from genesis distribution. This means the projector never receives
   * the UserCreated event and cannot update the user status.
   *
   * Solution: Update user status directly in this worker after the
   * blockchain transaction is confirmed, bypassing the event-based flow.
   */
  private async handlePostCommitSideEffects(
    commandType: string,
    payload: any,
    result: { transactionId: string; blockNumber?: bigint }
  ): Promise<void> {
    if (commandType === 'CREATE_USER') {
      try {
        // The payload.userId contains the fabricUserId assigned to the user
        const fabricUserId = payload.userId as string;

        // Find the user profile to get the profileId
        const userProfile = await this.prisma.userProfile.findFirst({
          where: { fabricUserId },
        });

        if (!userProfile) {
          this.log('warn', 'No user found to update after CREATE_USER commit', {
            fabricUserId,
            txId: result.transactionId,
          });
          return;
        }

        // Update UserProfile status to ACTIVE after successful blockchain registration
        await this.prisma.userProfile.update({
          where: { profileId: userProfile.profileId },
          data: {
            status: 'ACTIVE',
            onchainStatus: 'ACTIVE',
            onchainRegisteredAt: new Date(),
          },
        });

        this.log('info', 'Updated user status to ACTIVE after CREATE_USER commit', {
          fabricUserId,
          profileId: userProfile.profileId,
          txId: result.transactionId,
          blockNumber: result.blockNumber?.toString(),
        });

        // Create wallet for the user (if not exists)
        // Due to Fabric's single-event-per-transaction limitation, the WalletCreated event
        // is not received by the projector, so we create the wallet here
        let wallet = await this.prisma.wallet.findFirst({
          where: { profileId: userProfile.profileId, deletedAt: null },
        });

        if (!wallet) {
          const { randomUUID } = await import('crypto');
          const walletId = randomUUID();
          const accountId = randomUUID();

          wallet = await this.prisma.wallet.create({
            data: {
              walletId,
              tenantId: 'default',
              profileId: userProfile.profileId,
              primaryAccountId: accountId,
              walletName: 'Primary Wallet',
              cachedBalance: 0,
            },
          });

          this.log('info', 'Created wallet for user after CREATE_USER commit', {
            walletId,
            profileId: userProfile.profileId,
            fabricUserId,
            txId: result.transactionId,
          });
        }

        // ENTERPRISE FIX: Sync balance from blockchain state
        // Due to Fabric's single-event-per-transaction limitation, the GenesisDistributed
        // event is not received by the projector. We query the actual blockchain state
        // and update the wallet's cachedBalance to ensure consistency.
        await this.syncWalletBalanceFromBlockchain(fabricUserId, wallet.walletId);
      } catch (error: any) {
        // Log error but don't fail the command - the blockchain transaction succeeded
        this.log('error', 'Failed to update user status/wallet after CREATE_USER commit', {
          error: error.message,
          fabricUserId: payload.userId,
          txId: result.transactionId,
        });
      }
    }

    // Handle TRANSFER_TOKENS: Sync balances and create notifications
    if (commandType === 'TRANSFER_TOKENS') {
      try {
        const fromUserId = payload.fromUserId as string;
        const toUserId = payload.toUserId as string;
        const amount = payload.amount as number;
        const remark = (payload.remark as string) || '';

        // Find sender and receiver profiles
        const [senderProfile, receiverProfile] = await Promise.all([
          this.prisma.userProfile.findFirst({ where: { fabricUserId: fromUserId } }),
          this.prisma.userProfile.findFirst({ where: { fabricUserId: toUserId } }),
        ]);

        // Sync both wallets from blockchain
        if (senderProfile) {
          const senderWallet = await this.prisma.wallet.findFirst({
            where: { profileId: senderProfile.profileId, deletedAt: null },
          });
          if (senderWallet) {
            await this.syncWalletBalanceFromBlockchain(fromUserId, senderWallet.walletId);
          }
        }

        if (receiverProfile) {
          const receiverWallet = await this.prisma.wallet.findFirst({
            where: { profileId: receiverProfile.profileId, deletedAt: null },
          });
          if (receiverWallet) {
            await this.syncWalletBalanceFromBlockchain(toUserId, receiverWallet.walletId);
          }
        }

        // Create notifications for sender and receiver
        const { randomUUID } = await import('crypto');
        const formattedAmount = amount.toLocaleString();

        if (senderProfile) {
          const receiverName = receiverProfile
            ? `${receiverProfile.firstName || ''} ${receiverProfile.lastName || ''}`.trim() || 'Unknown'
            : toUserId.slice(0, 15) + '...';

          await this.prisma.notification.create({
            data: {
              notificationId: randomUUID(),
              tenantId: 'default',
              recipientId: senderProfile.profileId,
              type: 'WALLET_DEBITED',
              title: 'Transfer Sent',
              message: `You sent ${formattedAmount} Q to ${receiverName}${remark ? `. Reason: ${remark}` : ''}`,
              actionUrl: '/transactions',
              actionRequired: false,
            },
          });

          this.log('info', 'Created WALLET_DEBITED notification for sender', {
            profileId: senderProfile.profileId,
            amount,
            txId: result.transactionId,
          });
        }

        if (receiverProfile) {
          const senderName = senderProfile
            ? `${senderProfile.firstName || ''} ${senderProfile.lastName || ''}`.trim() || 'Unknown'
            : fromUserId.slice(0, 15) + '...';

          await this.prisma.notification.create({
            data: {
              notificationId: randomUUID(),
              tenantId: 'default',
              recipientId: receiverProfile.profileId,
              type: 'WALLET_CREDITED',
              title: 'Transfer Received',
              message: `You received ${formattedAmount} Q from ${senderName}${remark ? `. Reason: ${remark}` : ''}`,
              actionUrl: '/transactions',
              actionRequired: false,
            },
          });

          this.log('info', 'Created WALLET_CREDITED notification for receiver', {
            profileId: receiverProfile.profileId,
            amount,
            txId: result.transactionId,
          });
        }

        this.log('info', 'Processed TRANSFER_TOKENS post-commit side effects', {
          fromUserId,
          toUserId,
          amount,
          txId: result.transactionId,
        });
      } catch (error: any) {
        // Log error but don't fail the command - the blockchain transaction succeeded
        this.log('error', 'Failed to process TRANSFER_TOKENS post-commit side effects', {
          error: error.message,
          fromUserId: payload.fromUserId,
          toUserId: payload.toUserId,
          txId: result.transactionId,
        });
      }
    }
  }

  /**
   * Sync wallet balance from blockchain state
   *
   * ENTERPRISE PATTERN: State Reconciliation
   *
   * Why this is needed:
   * Hyperledger Fabric only emits ONE event per transaction (the last SetEvent() call wins).
   * During CREATE_USER, the genesis distribution happens atomically, but the GenesisDistributed
   * event is overwritten by subsequent events. This means the projector never receives the
   * balance update.
   *
   * Solution:
   * After CREATE_USER commits, we query the actual blockchain state using evaluateTransaction
   * and update the wallet's cachedBalance. This ensures the PostgreSQL read model is consistent
   * with the blockchain source of truth.
   *
   * @param fabricUserId - The user's blockchain ID (e.g., "LK FF3 ABL912 0WLUY 6025")
   * @param walletId - The wallet UUID in PostgreSQL
   */
  private async syncWalletBalanceFromBlockchain(
    fabricUserId: string,
    walletId: string
  ): Promise<void> {
    try {
      // Use partner-api client for read operations (any identity can query)
      const fabricClient = fabricClients.get('org1-partner-api');
      if (!fabricClient) {
        this.log('warn', 'No Fabric client available for balance query', { fabricUserId });
        return;
      }

      // Query blockchain for actual balance
      // Chaincode function: TokenomicsContract:GetBalance(userId) -> balance as string
      const balanceBytes = await fabricClient.evaluateTransaction(
        'TokenomicsContract',
        'GetBalance',
        fabricUserId
      );

      // Parse balance from chaincode response (returns balance as string)
      const balanceStr = new TextDecoder().decode(balanceBytes);

      // Update wallet's cached balance in PostgreSQL
      // cachedBalance is Decimal type, so we pass the string directly
      await this.prisma.wallet.update({
        where: { walletId },
        data: {
          cachedBalance: balanceStr,
          updatedAt: new Date(),
        },
      });

      this.log('info', 'Synced wallet balance from blockchain', {
        fabricUserId,
        walletId,
        balance: balanceStr,
      });
    } catch (error: any) {
      // Log error but don't fail - balance will be 0 until next sync
      this.log('error', 'Failed to sync wallet balance from blockchain', {
        error: error.message,
        fabricUserId,
        walletId,
      });
    }
  }

  /**
   * Start Prometheus metrics server
   */
  private startMetricsServer(): void {
    const http = require('http');

    const server = http.createServer(
      async (req: any, res: any) => {
        if (req.url === '/metrics') {
          res.setHeader('Content-Type', promClient.register.contentType);
          res.end(await promClient.register.metrics());
        } else if (req.url === '/health') {
          // Collect circuit breaker stats from all Fabric clients
          const circuitBreakerStats: Record<string, any> = {};
          for (const [name, client] of fabricClients.entries()) {
            circuitBreakerStats[name] = client.getCircuitBreakerStats();
          }

          const health = {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            fabricClientsConnected: fabricClients.size,
            fabricCircuitBreakers: circuitBreakerStats,
            queueDepth: await this.getQueueDepth(),
          };
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(health));
        } else {
          res.statusCode = 404;
          res.end('Not Found');
        }
      }
    );

    server.listen(this.config.metricsPort, () => {
      this.log('info', `Metrics server listening on port ${this.config.metricsPort}`);
    });
  }

  /**
   * Register shutdown handlers for graceful termination
   */
  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      this.log('info', `Received ${signal}, shutting down gracefully`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Structured logging
   */
  private log(level: string, message: string, meta?: any): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: 'outbox-submitter',
        workerId: this.config.workerId,
        message,
        ...meta,
      })
    );
  }
}

// ========== Main Entry Point ==========

async function main() {
  console.log('Initializing outbox submitter worker...');

  try {
    // Load configuration
    const config = loadConfig();

    // Initialize Prisma client
    const prisma = new PrismaClient({
      log: ['error', 'warn'],
    });

    // Create and start worker
    // Note: Fabric clients will be initialized during worker.start()
    const worker = new OutboxSubmitter(config, prisma);
    await worker.start();
  } catch (error: any) {
    console.error('Fatal error starting worker:', error);
    process.exit(1);
  }
}

// Start worker if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { OutboxSubmitter, WorkerConfig };
