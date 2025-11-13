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

import { PrismaClient, Prisma } from '@prisma/client';
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
    lockTimeout: parseInt(process.env.LOCK_TIMEOUT || '30000', 10),
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
  private fabricClient: IFabricClient;
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    config: WorkerConfig,
    prisma: PrismaClient,
    fabricClient: IFabricClient
  ) {
    this.config = config;
    this.prisma = prisma;
    this.fabricClient = fabricClient;
  }

  /**
   * Start the worker
   *
   * Lifecycle:
   * 1. Connect to Fabric
   * 2. Start polling loop
   * 3. Start metrics server
   * 4. Register graceful shutdown handlers
   */
  async start(): Promise<void> {
    this.log('info', 'Starting outbox submitter worker', {
      workerId: this.config.workerId,
      pollInterval: this.config.pollInterval,
      batchSize: this.config.batchSize,
    });

    try {
      // Connect to Fabric network
      await this.fabricClient.connect();
      this.log('info', 'Connected to Fabric network');

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
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping outbox submitter worker');

    this.isRunning = false;
    metrics.workerStatus.set(0);

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    this.fabricClient.disconnect();
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
   * Find and lock pending commands
   *
   * SQL: SELECT * FROM OutboxCommand
   *      WHERE status IN ('PENDING', 'FAILED')
   *      AND (lockedAt IS NULL OR lockedAt < now() - lockTimeout)
   *      AND attempts < maxRetries
   *      ORDER BY createdAt ASC
   *      LIMIT batchSize
   *      FOR UPDATE SKIP LOCKED
   *
   * FOR UPDATE SKIP LOCKED:
   * - Locks rows for update
   * - Skips locked rows (no waiting)
   * - Prevents duplicate processing by multiple workers
   */
  private async findAndLockCommands() {
    const lockTimeout = new Date(Date.now() - this.config.lockTimeout);

    return this.prisma.$transaction(async (tx) => {
      // Find commands to process
      const commands = await tx.outboxCommand.findMany({
        where: {
          OR: [
            { status: 'PENDING' },
            {
              AND: [
                { status: 'LOCKED' },
                { lockedAt: { lt: lockTimeout } }, // Stale lock
              ],
            },
            {
              AND: [
                { status: 'FAILED' },
                { attempts: { lt: this.config.maxRetries } },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.batchSize,
      });

      if (commands.length === 0) {
        return [];
      }

      // Lock commands
      await tx.outboxCommand.updateMany({
        where: {
          id: { in: commands.map((c) => c.id) },
        },
        data: {
          status: 'LOCKED',
          lockedBy: this.config.workerId,
          lockedAt: new Date(),
        },
      });

      return commands;
    });
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
      const payload = command.payload as Prisma.JsonObject;

      // Submit to Fabric
      const result = await this.submitToFabric(command.commandType, payload);

      // Update status to COMMITTED
      await this.prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          status: 'COMMITTED',
          submittedAt: new Date(),
          fabricTxId: result.transactionId,
          commitBlock: result.blockNumber,
          error: null,
          errorCode: null,
        },
      });

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

      await this.prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          status: 'FAILED',
          attempts,
          error: error.message,
          errorCode: error.code || 'UNKNOWN_ERROR',
          lockedBy: null,
          lockedAt: null,
        },
      });

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
   * Maps CommandType to Fabric chaincode function
   */
  private async submitToFabric(
    commandType: string,
    payload: Prisma.JsonObject
  ): Promise<{ transactionId: string; blockNumber?: bigint }> {
    // Map command type to chaincode contract and function
    const { contractName, functionName, args } = this.mapCommandToChaincode(
      commandType,
      payload
    );

    // Submit transaction
    const result = await this.fabricClient.submitTransaction(
      contractName,
      functionName,
      ...args
    );

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
    payload: Prisma.JsonObject
  ): { contractName: string; functionName: string; args: string[] } {
    switch (commandType) {
      // ========== IdentityContract ==========
      case 'CREATE_USER':
        return {
          contractName: 'IdentityContract',
          functionName: 'CreateUser',
          args: [
            payload.userId as string,
            payload.countryCode as string,
            payload.userType as string,
          ],
        };

      // ========== TokenomicsContract ==========
      case 'TRANSFER_TOKENS':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'TransferTokens',
          args: [
            payload.fromUserId as string,
            payload.toUserId as string,
            payload.amount as string,
            payload.remark as string || '',
          ],
        };

      case 'DISTRIBUTE_GENESIS':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'DistributeGenesis',
          args: [
            payload.userId as string,
            payload.userType as string,
            payload.countryCode as string,
          ],
        };

      case 'FREEZE_WALLET':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'FreezeWallet',
          args: [
            payload.userId as string,
            payload.reason as string,
          ],
        };

      case 'UNFREEZE_WALLET':
        return {
          contractName: 'TokenomicsContract',
          functionName: 'UnfreezeWallet',
          args: [payload.userId as string],
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
        return {
          contractName: 'AdminContract',
          functionName: 'InitializeCountryData',
          args: [JSON.stringify(payload.countriesData)],
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
          const health = {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            fabricCircuitBreaker: this.fabricClient.getCircuitBreakerStats(),
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

    // Initialize Fabric client
    const fabricClient = await createFabricClient();

    // Create and start worker
    const worker = new OutboxSubmitter(config, prisma, fabricClient);
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
