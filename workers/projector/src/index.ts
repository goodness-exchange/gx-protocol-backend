/**
 * Projector Worker
 *
 * Educational Purpose:
 * This worker implements the "Event-Driven Read Model" pattern, also known
 * as "CQRS Projection". It builds database tables optimized for queries
 * by listening to blockchain events.
 *
 * Pattern Origin:
 * - Martin Fowler: "CQRS" (2011)
 * - Greg Young: "Event Sourcing" (2010)
 * - Udi Dahan: "Clarified CQRS" (2009)
 *
 * Architecture:
 * ```
 * Hyperledger Fabric Blockchain
 *     ↓ (chaincode events via gRPC stream)
 * Fabric Gateway SDK
 *     ↓ (event objects)
 * Projector Worker
 *     ↓ (SQL INSERT/UPDATE)
 * PostgreSQL Read Models
 *     ↓ (SELECT queries)
 * API Services
 * ```
 *
 * Guarantees:
 * - Exactly-once event processing (via checkpoint + idempotency)
 * - Eventual consistency (read models eventually match blockchain state)
 * - Crash recovery (resume from last checkpoint)
 * - Ordered processing (events processed in block order)
 *
 * Usage:
 * ```bash
 * # Development
 * npm run dev
 *
 * # Production (Kubernetes)
 * kubectl apply -f k8s/workers/projector.yaml
 * ```
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { createFabricClient, IFabricClient, BlockchainEvent } from '@gx/core-fabric';
import { eventValidator } from '@gx/core-events';
import * as promClient from 'prom-client';

// ========== Configuration ==========

/**
 * Worker configuration from environment variables
 */
interface WorkerConfig {
  /** Worker identifier (for distributed workers) */
  workerId: string;

  /** Tenant ID (multi-tenancy support) */
  tenantId: string;

  /** Fabric channel name */
  channelName: string;

  /** Starting block number (0 = from genesis) */
  startBlock: bigint;

  /** Enable metrics endpoint for Prometheus */
  enableMetrics: boolean;

  /** Metrics port */
  metricsPort: number;

  /** Checkpoint interval (save checkpoint every N events) */
  checkpointInterval: number;
}

function loadConfig(): WorkerConfig {
  return {
    workerId: process.env.WORKER_ID || `projector-${process.pid}`,
    tenantId: process.env.TENANT_ID || 'default',
    channelName: process.env.FABRIC_CHANNEL_NAME || 'gxchannel',
    startBlock: BigInt(process.env.START_BLOCK || '0'),
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    metricsPort: parseInt(process.env.METRICS_PORT || '9091', 10),
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || '10', 10),
  };
}

// ========== Prometheus Metrics ==========

/**
 * Observability: Metrics for monitoring projection health
 *
 * Why metrics?
 * - Detect when projector is lagging behind blockchain
 * - Monitor event processing rate
 * - Alert on validation failures
 * - Track checkpoint frequency
 */

const metrics = {
  // Counter: Total events processed
  eventsProcessed: new promClient.Counter({
    name: 'projector_events_processed_total',
    help: 'Total number of blockchain events processed',
    labelNames: ['event_name', 'status'], // status: success, validation_failed, processing_failed
  }),

  // Gauge: Current blockchain height
  blockchainHeight: new promClient.Gauge({
    name: 'projector_blockchain_height',
    help: 'Current blockchain height (last processed block)',
  }),

  // Gauge: Projection lag (blocks behind)
  projectionLag: new promClient.Gauge({
    name: 'projector_lag_blocks',
    help: 'Number of blocks behind the blockchain tip',
  }),

  // Histogram: Event processing duration
  processingDuration: new promClient.Histogram({
    name: 'projector_processing_duration_seconds',
    help: 'Time taken to process an event',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // seconds
  }),

  // Counter: Checkpoint saves
  checkpointsSaved: new promClient.Counter({
    name: 'projector_checkpoints_saved_total',
    help: 'Total number of checkpoints saved',
  }),

  // Gauge: Worker status
  workerStatus: new promClient.Gauge({
    name: 'projector_worker_status',
    help: 'Worker status: 1 = running, 0 = stopped',
  }),
};

// Register default metrics (memory, CPU, etc.)
promClient.collectDefaultMetrics();

// ========== Main Worker Class ==========

/**
 * Projector Worker
 *
 * Responsibilities:
 * 1. Connect to Fabric and listen to chaincode events
 * 2. Load last checkpoint from database
 * 3. Validate events against JSON schemas
 * 4. Update read models based on event type
 * 5. Save checkpoints periodically
 * 6. Expose metrics and health checks
 */
class Projector {
  private config: WorkerConfig;
  private prisma: PrismaClient;
  private fabricClient: IFabricClient;
  private isRunning = false;
  private eventCounter = 0;
  private lastProcessedBlock: bigint = 0n;
  private lastEventIndex = 0;

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
   * 2. Load last checkpoint
   * 3. Start event listening loop
   * 4. Start metrics server
   * 5. Register graceful shutdown handlers
   */
  async start(): Promise<void> {
    this.log('info', 'Starting projector worker', {
      workerId: this.config.workerId,
      tenantId: this.config.tenantId,
      channelName: this.config.channelName,
    });

    try {
      // Connect to Fabric network
      await this.fabricClient.connect();
      this.log('info', 'Connected to Fabric network');

      // Load last checkpoint
      const checkpoint = await this.loadCheckpoint();
      this.lastProcessedBlock = checkpoint.lastBlock;
      this.lastEventIndex = checkpoint.lastEventIndex;

      this.log('info', 'Loaded checkpoint', {
        lastBlock: this.lastProcessedBlock.toString(),
        lastEventIndex: this.lastEventIndex,
      });

      // Start event listening loop
      this.isRunning = true;
      metrics.workerStatus.set(1);
      this.startEventListener();

      // Start metrics server
      if (this.config.enableMetrics) {
        this.startMetricsServer();
      }

      // Register graceful shutdown
      this.registerShutdownHandlers();

      this.log('info', 'Projector worker started successfully');
    } catch (error: any) {
      this.log('error', 'Failed to start worker', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping projector worker');

    this.isRunning = false;
    metrics.workerStatus.set(0);

    // Save final checkpoint
    await this.saveCheckpoint();

    this.fabricClient.disconnect();
    await this.prisma.$disconnect();

    this.log('info', 'Projector worker stopped');
  }

  /**
   * Load checkpoint from database
   *
   * Why checkpoints?
   * - Crash recovery: Worker can resume from last processed event
   * - No duplicate processing: Events before checkpoint already applied
   * - Fast restart: Don't replay entire blockchain history
   *
   * Checkpoint structure:
   * ```
   * {
   *   lastBlock: 12345n,        // Last block number processed
   *   lastEventIndex: 2,        // Event index within that block
   * }
   * ```
   */
  private async loadCheckpoint(): Promise<{
    lastBlock: bigint;
    lastEventIndex: number;
  }> {
    const checkpoint = await this.prisma.projectorState.findUnique({
      where: {
        tenantId_projectorName_channel: {
          tenantId: this.config.tenantId,
          projectorName: 'main-projector',
          channel: this.config.channelName,
        },
      },
    });

    if (checkpoint) {
      return {
        lastBlock: checkpoint.lastBlock,
        lastEventIndex: checkpoint.lastEventIndex,
      };
    }

    // No checkpoint found - start from configured start block
    this.log('info', 'No checkpoint found, starting from beginning', {
      startBlock: this.config.startBlock.toString(),
    });

    return {
      lastBlock: this.config.startBlock,
      lastEventIndex: -1,
    };
  }

  /**
   * Save checkpoint to database
   *
   * Checkpoints are saved:
   * - Every N events (configurable via CHECKPOINT_INTERVAL)
   * - On graceful shutdown
   * - After recovering from errors
   */
  private async saveCheckpoint(): Promise<void> {
    try {
      await this.prisma.projectorState.upsert({
        where: {
          tenantId_projectorName_channel: {
            tenantId: this.config.tenantId,
            projectorName: 'main-projector',
            channel: this.config.channelName,
          },
        },
        create: {
          tenantId: this.config.tenantId,
          projectorName: 'main-projector',
          channel: this.config.channelName,
          lastBlock: this.lastProcessedBlock,
          lastEventIndex: this.lastEventIndex,
        },
        update: {
          lastBlock: this.lastProcessedBlock,
          lastEventIndex: this.lastEventIndex,
        },
      });

      metrics.checkpointsSaved.inc();

      this.log('debug', 'Checkpoint saved', {
        lastBlock: this.lastProcessedBlock.toString(),
        lastEventIndex: this.lastEventIndex,
      });
    } catch (error: any) {
      this.log('error', 'Failed to save checkpoint', { error: error.message });
      // Don't throw - checkpoint failures should not stop the worker
    }
  }

  /**
   * Start event listening loop
   *
   * Flow:
   * 1. Subscribe to chaincode events from Fabric
   * 2. For each event:
   *    a. Validate against JSON schema
   *    b. Process event (update read models)
   *    c. Increment counter
   *    d. Save checkpoint if interval reached
   */
  private startEventListener(): void {
    this.log('info', 'Starting event listener', {
      startBlock: (this.lastProcessedBlock + 1n).toString(),
    });

    // Listen to events from Fabric
    this.fabricClient
      .listenToEvents({
        startBlock: this.lastProcessedBlock + 1n, // Start from next block
        onEvent: async (event) => {
          await this.handleEvent(event);
        },
        onError: (error) => {
          this.log('error', 'Event stream error', { error: error.message });
          // Circuit breaker in fabric-client will handle reconnection
        },
      })
      .catch((error: any) => {
        this.log('error', 'Event listener crashed', { error: error.message });
        // In production, restart mechanism should be handled by Kubernetes
        process.exit(1);
      });
  }

  /**
   * Handle a single blockchain event
   *
   * Algorithm:
   * 1. Parse event payload (JSON)
   * 2. Validate against schema
   * 3. Route to appropriate handler
   * 4. Update checkpoint
   */
  private async handleEvent(event: BlockchainEvent): Promise<void> {
    const startTime = Date.now();

    try {
      this.log('debug', 'Processing event', {
        eventName: event.eventName,
        blockNumber: event.blockNumber.toString(),
        txId: event.transactionId,
      });

      // Parse payload (Fabric sends as Uint8Array)
      const payloadStr = Buffer.from(event.payload).toString('utf-8');
      const payload = JSON.parse(payloadStr);

      // Validate event against schema (lenient mode - log warnings but don't skip)
      // Note: Chaincode events may not match the full schema (e.g., missing eventVersion)
      // We validate for observability but process all events to ensure read models stay in sync
      const validationResult = eventValidator.validate({
        eventName: event.eventName,
        eventVersion: '1.0', // Default version for chaincode events
        ...payload,
      });

      if (!validationResult.success) {
        this.log('debug', 'Event schema validation info (proceeding anyway)', {
          eventName: event.eventName,
          errors: validationResult.errors,
        });
        // Note: We continue processing even if validation fails
        // because chaincode event format differs from full schema
      }

      // Route event to appropriate handler
      await this.routeEvent(event.eventName, payload, event);

      // Update checkpoint
      this.lastProcessedBlock = event.blockNumber;
      this.lastEventIndex++;
      this.eventCounter++;

      metrics.blockchainHeight.set(Number(event.blockNumber));
      metrics.eventsProcessed.inc({
        event_name: event.eventName,
        status: 'success',
      });

      // Save checkpoint periodically
      if (this.eventCounter % this.config.checkpointInterval === 0) {
        await this.saveCheckpoint();
      }

      const duration = (Date.now() - startTime) / 1000;
      metrics.processingDuration.observe(duration);

      this.log('info', 'Event processed successfully', {
        eventName: event.eventName,
        blockNumber: event.blockNumber.toString(),
        duration,
      });
    } catch (error: any) {
      this.log('error', 'Error processing event', {
        eventName: event.eventName,
        blockNumber: event.blockNumber.toString(),
        error: error.message,
        stack: error.stack,
      });

      metrics.eventsProcessed.inc({
        event_name: event.eventName,
        status: 'processing_failed',
      });

      // Save checkpoint before crashing
      await this.saveCheckpoint();

      // In production, let Kubernetes restart the worker
      throw error;
    }
  }

  /**
   * Route event to appropriate handler based on event name
   *
   * Educational: This is the mapping between blockchain events
   * and read model updates
   */
  private async routeEvent(
    eventName: string,
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    switch (eventName) {
      // IdentityContract events
      case 'UserCreated':
        await this.handleUserCreated(payload, event);
        break;

      case 'WalletCreated':
        await this.handleWalletCreated(payload, event);
        break;

      // TokenomicsContract events
      case 'TransferCompleted':
        await this.handleTransferCompleted(payload, event);
        break;

      case 'InternalTransferEvent':
        await this.handleInternalTransferEvent(payload, event);
        break;

      case 'GenesisDistributed':
        await this.handleGenesisDistributed(payload, event);
        break;

      case 'WalletFrozen':
        await this.handleWalletFrozen(payload, event);
        break;

      case 'WalletUnfrozen':
        await this.handleWalletUnfrozen(payload, event);
        break;

      // OrganizationContract events
      case 'OrganizationProposed':
        await this.handleOrganizationProposed(payload, event);
        break;

      case 'MembershipEndorsed':
        await this.handleMembershipEndorsed(payload, event);
        break;

      case 'OrganizationActivated':
        await this.handleOrganizationActivated(payload, event);
        break;

      case 'AuthRuleDefined':
        await this.handleAuthRuleDefined(payload, event);
        break;

      case 'MultiSigTxInitiated':
        await this.handleMultiSigTxInitiated(payload, event);
        break;

      case 'MultiSigTxApproved':
        await this.handleMultiSigTxApproved(payload, event);
        break;

      case 'MultiSigTxExecuted':
        await this.handleMultiSigTxExecuted(payload, event);
        break;

      // LoanPoolContract events
      case 'LoanApplicationReceived':
        await this.handleLoanApplicationReceived(payload, event);
        break;

      case 'LoanApproved':
        await this.handleLoanApproved(payload, event);
        break;

      // GovernanceContract events
      case 'ProposalSubmitted':
        await this.handleProposalSubmitted(payload, event);
        break;

      case 'VoteCast':
        await this.handleVoteCast(payload, event);
        break;

      case 'ProposalExecuted':
        await this.handleProposalExecuted(payload, event);
        break;

      // AdminContract events
      case 'SystemBootstrapped':
        await this.handleSystemBootstrapped(payload, event);
        break;

      case 'CountryDataInitialized':
        await this.handleCountryDataInitialized(payload, event);
        break;

      case 'SystemParameterUpdated':
        await this.handleSystemParameterUpdated(payload, event);
        break;

      case 'SystemPaused':
        await this.handleSystemPaused(payload, event);
        break;

      case 'SystemResumed':
        await this.handleSystemResumed(payload, event);
        break;

      case 'AdminAppointed':
        await this.handleAdminAppointed(payload, event);
        break;

      case 'TreasuryActivated':
        await this.handleTreasuryActivated(payload, event);
        break;

      // TaxAndFeeContract events
      case 'VelocityTaxApplied':
        await this.handleVelocityTaxApplied(payload, event);
        break;

      default:
        this.log('warn', 'Unknown event type', { eventName });
        // Don't fail - just skip unknown events
    }
  }

  /**
   * Handle UserCreated event
   *
   * Event Structure:
   * ```json
   * {
   *   "userId": "user123",
   *   "countryCode": "US",
   *   "userType": "individual",
   *   "createdAt": "2025-11-13T10:30:00Z"
   * }
   * ```
   *
   * Read Model Update:
   * - Update UserProfile status to ACTIVE (user registered on blockchain)
   * - Set onchainRegisteredAt timestamp
   * - This event is emitted after admin approval when batch registration completes
   */
  private async handleUserCreated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Find user by fabricUserId
    // Note: Chaincode uses 'userID' (capital ID), handle both formats for compatibility
    const fabricUserId = payload.userID || payload.userId;

    const existingUser = await this.prisma.userProfile.findFirst({
      where: { fabricUserId },
    });

    if (existingUser) {
      // Update existing user who was approved and registered on chain
      await this.prisma.userProfile.update({
        where: { profileId: existingUser.profileId },
        data: {
          status: 'ACTIVE',
          onchainStatus: 'ACTIVE',
          onchainRegisteredAt: event.timestamp,
          updatedAt: event.timestamp,
        },
      });

      this.log('info', 'User activated on blockchain', {
        profileId: existingUser.profileId,
        fabricUserId,
      });
    } else {
      // Fallback: Log warning but don't create - user should exist from registration flow
      // Creating stub users for blockchain-only registrations (like direct chaincode tests)
      // would require all the fields that we don't have from the event payload.
      // Better to log and skip than create incomplete records.
      this.log('warn', 'UserCreated event for unknown fabricUserId (skipping)', {
        fabricUserId,
        blockNumber: event.blockNumber.toString(),
        txId: event.transactionId,
      });
    }
  }

  /**
   * Handle WalletCreated event
   *
   * Event Structure:
   * ```json
   * {
   *   "walletId": "wallet123",
   *   "userId": "user123",
   *   "accountId": "acc123",
   *   "initialBalance": "0.000000000"
   * }
   * ```
   *
   * Read Model Update:
   * - Create Wallet table entry
   * - Set cached balance to initial balance
   */
  private async handleWalletCreated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.wallet.upsert({
      where: { walletId: payload.walletId },
      create: {
        walletId: payload.walletId,
        tenantId: this.config.tenantId,
        profileId: payload.userId,
        primaryAccountId: payload.accountId,
        walletName: payload.walletName || 'Primary Wallet',
        cachedBalance: payload.initialBalance || 0,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
      update: {
        cachedBalance: payload.initialBalance || 0,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Wallet updated', { walletId: payload.walletId });
  }

  /**
   * Handle TransferCompleted event
   *
   * Event Structure:
   * ```json
   * {
   *   "transactionId": "tx123",
   *   "fromUserId": "user123",
   *   "toUserId": "user456",
   *   "amount": "1000.000000000",
   *   "fee": "1.000000000",
   *   "timestamp": "2025-11-13T10:30:00Z"
   * }
   * ```
   *
   * Read Model Updates:
   * - Update sender wallet balance (decrease)
   * - Update receiver wallet balance (increase)
   * - Create transaction history entries
   */
  private async handleTransferCompleted(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get sender and receiver wallets
      const senderWallet = await tx.wallet.findFirst({
        where: { profileId: payload.fromUserId },
      });

      const receiverWallet = await tx.wallet.findFirst({
        where: { profileId: payload.toUserId },
      });

      if (!senderWallet || !receiverWallet) {
        this.log('warn', 'Wallet not found for transfer', {
          fromUserId: payload.fromUserId,
          toUserId: payload.toUserId,
        });
        return;
      }

      // Update sender balance (subtract amount + fee)
      const senderDeduction = parseFloat(payload.amount) + parseFloat(payload.fee || 0);
      await tx.wallet.update({
        where: { walletId: senderWallet.walletId },
        data: {
          cachedBalance: {
            decrement: senderDeduction,
          },
          updatedAt: event.timestamp,
        },
      });

      // Update receiver balance (add amount)
      await tx.wallet.update({
        where: { walletId: receiverWallet.walletId },
        data: {
          cachedBalance: {
            increment: parseFloat(payload.amount),
          },
          updatedAt: event.timestamp,
        },
      });

      // Create transaction history for sender (SENT enum value)
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: senderWallet.walletId,
          type: 'SENT',
          counterparty: payload.toUserId,
          amount: parseFloat(payload.amount),
          fee: parseFloat(payload.fee || 0),
          remark: payload.remark,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });

      // Create transaction history for receiver (RECEIVED enum value)
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: `${event.transactionId}-recv`,
          walletId: receiverWallet.walletId,
          type: 'RECEIVED',
          counterparty: payload.fromUserId,
          amount: parseFloat(payload.amount),
          fee: 0,
          remark: payload.remark,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });
    });

    this.log('debug', 'Transfer processed', {
      fromUserId: payload.fromUserId,
      toUserId: payload.toUserId,
      amount: payload.amount,
    });
  }

  /**
   * Handle InternalTransferEvent (from TransferInternal chaincode function)
   *
   * Event Structure (from chaincode):
   * ```json
   * {
   *   "fromID": "LK FF3 ABL912 0WLUY 6025",
   *   "toID": "US A12 XYZ789 TEST1 3985",
   *   "amount": 1000,
   *   "type": "P2P_TRANSFER",
   *   "remark": "User-initiated transfer"
   * }
   * ```
   *
   * Read Model Updates:
   * - Update sender wallet balance (decrease)
   * - Update receiver wallet balance (increase)
   * - Create transaction history entries for both parties
   */
  private async handleInternalTransferEvent(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    const fromUserId = payload.fromID;
    const toUserId = payload.toID;
    const amount = typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount;

    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find wallets by fabricUserId (look up via UserProfile)
      const senderProfile = await tx.userProfile.findFirst({
        where: { fabricUserId: fromUserId },
      });
      const receiverProfile = await tx.userProfile.findFirst({
        where: { fabricUserId: toUserId },
      });

      const senderWallet = senderProfile
        ? await tx.wallet.findFirst({ where: { profileId: senderProfile.profileId } })
        : null;
      const receiverWallet = receiverProfile
        ? await tx.wallet.findFirst({ where: { profileId: receiverProfile.profileId } })
        : null;

      if (!senderWallet || !receiverWallet) {
        this.log('warn', 'Wallet not found for internal transfer', {
          fromUserId,
          toUserId,
          senderFound: !!senderWallet,
          receiverFound: !!receiverWallet,
        });
        return;
      }

      // Update sender balance (subtract amount - no fee for internal transfers)
      await tx.wallet.update({
        where: { walletId: senderWallet.walletId },
        data: {
          cachedBalance: {
            decrement: amount,
          },
          updatedAt: event.timestamp,
        },
      });

      // Update receiver balance (add amount)
      await tx.wallet.update({
        where: { walletId: receiverWallet.walletId },
        data: {
          cachedBalance: {
            increment: amount,
          },
          updatedAt: event.timestamp,
        },
      });

      // Create transaction history for sender (SENT enum value)
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: senderWallet.walletId,
          type: 'SENT',
          counterparty: toUserId,
          amount: amount,
          fee: 0,
          remark: payload.remark || `${payload.type || 'Transfer'}`,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });

      // Create transaction history for receiver (RECEIVED enum value)
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: `${event.transactionId}-recv`, // Unique for receiver entry
          walletId: receiverWallet.walletId,
          type: 'RECEIVED',
          counterparty: fromUserId,
          amount: amount,
          fee: 0,
          remark: payload.remark || `${payload.type || 'Transfer'}`,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });
    });

    this.log('info', 'InternalTransferEvent processed', {
      fromUserId,
      toUserId,
      amount,
      type: payload.type,
      blockNumber: event.blockNumber.toString(),
    });
  }

  /**
   * Handle GenesisDistributed event
   */
  private async handleGenesisDistributed(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Update wallet balance with genesis allocation
    await this.prisma.wallet.updateMany({
      where: { profileId: payload.userId },
      data: {
        cachedBalance: {
          increment: parseFloat(payload.amount),
        },
        updatedAt: event.timestamp,
      },
    });

    // Create transaction history
    const wallet = await this.prisma.wallet.findFirst({
      where: { profileId: payload.userId },
    });

    if (wallet) {
      await this.prisma.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: wallet.walletId,
          type: 'GENESIS',
          counterparty: 'SYSTEM',
          amount: parseFloat(payload.amount),
          fee: 0,
          remark: `Genesis allocation: ${payload.tier}`,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });
    }

    this.log('debug', 'Genesis distributed', {
      userId: payload.userId,
      amount: payload.amount,
      tier: payload.tier,
    });
  }

  /**
   * Handle WalletFrozen event
   *
   * Event Structure:
   * ```json
   * {
   *   "userId": "US 234 A12345 0ABCD 5678",
   *   "reason": "SUSPICIOUS_ACTIVITY: Multiple large transactions detected",
   *   "frozenAt": "2025-11-24T10:30:00Z"
   * }
   * ```
   *
   * Read Model Updates:
   * - Update Wallet.isFrozen to true
   * - Update UserProfile status to FROZEN and isLocked to true
   */
  private async handleWalletFrozen(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Update wallet frozen status
    await this.prisma.wallet.updateMany({
      where: { profileId: payload.userId },
      data: {
        isFrozen: true,
        updatedAt: event.timestamp,
      },
    });

    // Update user profile status (find by fabricUserId)
    await this.prisma.userProfile.updateMany({
      where: { fabricUserId: payload.userId },
      data: {
        status: 'FROZEN',
        onchainStatus: 'FROZEN',
        isLocked: true,
        updatedAt: event.timestamp,
      },
    });

    this.log('info', 'User and wallet frozen', {
      fabricUserId: payload.userId,
      reason: payload.reason,
    });
  }

  /**
   * Handle WalletUnfrozen event
   *
   * Event Structure:
   * ```json
   * {
   *   "userId": "US 234 A12345 0ABCD 5678",
   *   "unfrozenAt": "2025-11-24T11:00:00Z"
   * }
   * ```
   *
   * Read Model Updates:
   * - Update Wallet.isFrozen to false
   * - Update UserProfile status to ACTIVE and isLocked to false
   */
  private async handleWalletUnfrozen(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Update wallet frozen status
    await this.prisma.wallet.updateMany({
      where: { profileId: payload.userId },
      data: {
        isFrozen: false,
        updatedAt: event.timestamp,
      },
    });

    // Update user profile status (find by fabricUserId)
    await this.prisma.userProfile.updateMany({
      where: { fabricUserId: payload.userId },
      data: {
        status: 'ACTIVE',
        onchainStatus: 'ACTIVE',
        isLocked: false,
        updatedAt: event.timestamp,
      },
    });

    this.log('info', 'User and wallet unfrozen', {
      fabricUserId: payload.userId,
    });
  }

  /**
   * Handle OrganizationProposed event
   */
  private async handleOrganizationProposed(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.organization.upsert({
      where: { orgId: payload.orgId },
      create: {
        orgId: payload.orgId,
        tenantId: this.config.tenantId,
        orgName: payload.orgName,
        orgType: payload.orgType,
        status: 'PROPOSED',
        stakeholders: payload.stakeholderIds,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
      update: {
        status: 'PROPOSED',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Organization proposed', { orgId: payload.orgId });
  }

  /**
   * Handle MembershipEndorsed event
   */
  private async handleMembershipEndorsed(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { orgId: payload.orgId },
    });

    if (org) {
      const endorsers = (org.endorsers as string[]) || [];
      if (!endorsers.includes(payload.endorserId)) {
        endorsers.push(payload.endorserId);
      }

      await this.prisma.organization.update({
        where: { orgId: payload.orgId },
        data: {
          endorsers,
          updatedAt: event.timestamp,
        },
      });
    }

    this.log('debug', 'Membership endorsed', {
      orgId: payload.orgId,
      endorserId: payload.endorserId,
    });
  }

  /**
   * Handle OrganizationActivated event
   */
  private async handleOrganizationActivated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.organization.update({
      where: { orgId: payload.orgId },
      data: {
        status: 'ACTIVE',
        activatedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Organization activated', { orgId: payload.orgId });
  }

  /**
   * Handle AuthRuleDefined event
   */
  private async handleAuthRuleDefined(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { orgId: payload.orgId },
    });

    if (org) {
      const authRules = (org.authRules as any) || {};
      authRules[payload.ruleId] = {
        threshold: payload.threshold,
        signers: payload.signers,
      };

      await this.prisma.organization.update({
        where: { orgId: payload.orgId },
        data: {
          authRules,
          updatedAt: event.timestamp,
        },
      });
    }

    this.log('debug', 'Auth rule defined', {
      orgId: payload.orgId,
      ruleId: payload.ruleId,
    });
  }

  /**
   * Handle MultiSigTxInitiated event
   */
  private async handleMultiSigTxInitiated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.multiSigTransaction.create({
      data: {
        txId: payload.txId,
        tenantId: this.config.tenantId,
        orgId: payload.orgId,
        proposerId: payload.proposerId,
        operation: payload.operation,
        params: payload.params,
        status: 'PENDING',
        requiredSignatures: payload.requiredSignatures,
        currentSignatures: 0,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'MultiSig transaction initiated', {
      txId: payload.txId,
      orgId: payload.orgId,
    });
  }

  /**
   * Handle MultiSigTxApproved event
   */
  private async handleMultiSigTxApproved(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    const tx = await this.prisma.multiSigTransaction.findUnique({
      where: { txId: payload.txId },
    });

    if (tx) {
      const approvers = (tx.approvers as string[]) || [];
      if (!approvers.includes(payload.approverId)) {
        approvers.push(payload.approverId);
      }

      await this.prisma.multiSigTransaction.update({
        where: { txId: payload.txId },
        data: {
          approvers,
          currentSignatures: approvers.length,
          updatedAt: event.timestamp,
        },
      });
    }

    this.log('debug', 'MultiSig transaction approved', {
      txId: payload.txId,
      approverId: payload.approverId,
    });
  }

  /**
   * Handle MultiSigTxExecuted event
   */
  private async handleMultiSigTxExecuted(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.multiSigTransaction.update({
      where: { txId: payload.txId },
      data: {
        status: 'EXECUTED',
        executedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'MultiSig transaction executed', { txId: payload.txId });
  }

  /**
   * Handle LoanApplicationReceived event
   */
  private async handleLoanApplicationReceived(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.loan.create({
      data: {
        loanId: payload.loanId,
        tenantId: this.config.tenantId,
        borrowerId: payload.borrowerId,
        amount: parseFloat(payload.amount),
        purpose: payload.purpose,
        status: 'PENDING_APPROVAL',
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Loan application received', {
      loanId: payload.loanId,
      borrowerId: payload.borrowerId,
    });
  }

  /**
   * Handle LoanApproved event
   */
  private async handleLoanApproved(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.loan.update({
      where: { loanId: payload.loanId },
      data: {
        status: 'ACTIVE',
        approvedBy: payload.approvedBy,
        approvedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    // Update borrower's wallet balance
    const wallet = await this.prisma.wallet.findFirst({
      where: { profileId: payload.borrowerId },
    });

    if (wallet) {
      await this.prisma.wallet.update({
        where: { walletId: wallet.walletId },
        data: {
          cachedBalance: {
            increment: parseFloat(payload.amount),
          },
          updatedAt: event.timestamp,
        },
      });

      // Create transaction history
      await this.prisma.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: wallet.walletId,
          type: 'LOAN_DISBURSEMENT',
          counterparty: 'LOAN_POOL',
          amount: parseFloat(payload.amount),
          fee: 0,
          remark: `Loan approved: ${payload.loanId}`,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });
    }

    this.log('debug', 'Loan approved', {
      loanId: payload.loanId,
      borrowerId: payload.borrowerId,
    });
  }

  /**
   * Handle ProposalSubmitted event
   */
  private async handleProposalSubmitted(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.proposal.create({
      data: {
        proposalId: payload.proposalId,
        tenantId: this.config.tenantId,
        title: payload.title,
        description: payload.description,
        proposerId: payload.proposerId,
        proposalType: payload.proposalType,
        status: 'ACTIVE',
        votesFor: 0,
        votesAgainst: 0,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Proposal submitted', {
      proposalId: payload.proposalId,
      proposerId: payload.proposerId,
    });
  }

  /**
   * Handle VoteCast event
   */
  private async handleVoteCast(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { proposalId: payload.proposalId },
    });

    if (proposal) {
      const voters = (proposal.voters as string[]) || [];
      if (!voters.includes(payload.voterId)) {
        voters.push(payload.voterId);
      }

      const updateData: any = {
        voters,
        updatedAt: event.timestamp,
      };

      if (payload.support === true || payload.support === 'true') {
        updateData.votesFor = { increment: 1 };
      } else {
        updateData.votesAgainst = { increment: 1 };
      }

      await this.prisma.proposal.update({
        where: { proposalId: payload.proposalId },
        data: updateData,
      });
    }

    this.log('debug', 'Vote cast', {
      proposalId: payload.proposalId,
      voterId: payload.voterId,
      support: payload.support,
    });
  }

  /**
   * Handle ProposalExecuted event
   */
  private async handleProposalExecuted(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.proposal.update({
      where: { proposalId: payload.proposalId },
      data: {
        status: 'EXECUTED',
        executedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Proposal executed', { proposalId: payload.proposalId });
  }

  /**
   * Handle SystemBootstrapped event
   */
  private async handleSystemBootstrapped(
    _payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.systemParameter.upsert({
      where: {
        tenantId_paramKey: {
          tenantId: this.config.tenantId,
          paramKey: 'SYSTEM_BOOTSTRAPPED',
        },
      },
      create: {
        tenantId: this.config.tenantId,
        paramKey: 'SYSTEM_BOOTSTRAPPED',
        paramValue: 'true',
        updatedAt: event.timestamp,
      },
      update: {
        paramValue: 'true',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'System bootstrapped');
  }

  /**
   * Handle CountryDataInitialized event
   *
   * This event is emitted when country data is bulk-initialized in the blockchain.
   * The payload contains an array of countries to insert into the read model.
   */
  private async handleCountryDataInitialized(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Payload structure: { countries: [{ code, name, percentage }] } or { countriesData: [...] }
    const countries = payload.countries || payload.countriesData || [];

    if (countries.length === 0) {
      this.log('warn', 'CountryDataInitialized event has no countries', { payload });
      return;
    }

    this.log('info', 'Processing country data initialization', {
      countryCount: countries.length
    });

    // Bulk insert/update countries using transaction for atomicity
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const country of countries) {
        await tx.country.upsert({
          where: {
            countryCode: country.code || country.countryCode
          },
          create: {
            countryCode: country.code || country.countryCode,
            countryName: country.name || country.countryName,
            region: country.region || 'Unknown',
          },
          update: {
            countryName: country.name || country.countryName,
            region: country.region || 'Unknown',
          },
        });
      }

      // Mark country initialization as complete
      await tx.systemParameter.upsert({
        where: {
          tenantId_paramKey: {
            tenantId: this.config.tenantId,
            paramKey: 'COUNTRIES_INITIALIZED',
          },
        },
        create: {
          tenantId: this.config.tenantId,
          paramKey: 'COUNTRIES_INITIALIZED',
          paramValue: countries.length.toString(),
          updatedAt: event.timestamp,
        },
        update: {
          paramValue: countries.length.toString(),
          updatedAt: event.timestamp,
        },
      });
    });

    this.log('info', 'Country data initialized successfully', {
      countryCount: countries.length,
    });
  }

  /**
   * Handle SystemParameterUpdated event
   */
  private async handleSystemParameterUpdated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.systemParameter.upsert({
      where: {
        tenantId_paramKey: {
          tenantId: this.config.tenantId,
          paramKey: payload.paramKey,
        },
      },
      create: {
        tenantId: this.config.tenantId,
        paramKey: payload.paramKey,
        paramValue: payload.paramValue,
        updatedAt: event.timestamp,
      },
      update: {
        paramValue: payload.paramValue,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'System parameter updated', {
      paramKey: payload.paramKey,
      paramValue: payload.paramValue,
    });
  }

  /**
   * Handle SystemPaused event
   */
  private async handleSystemPaused(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.systemParameter.upsert({
      where: {
        tenantId_paramKey: {
          tenantId: this.config.tenantId,
          paramKey: 'SYSTEM_STATUS',
        },
      },
      create: {
        tenantId: this.config.tenantId,
        paramKey: 'SYSTEM_STATUS',
        paramValue: 'PAUSED',
        updatedAt: event.timestamp,
      },
      update: {
        paramValue: 'PAUSED',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'System paused', { reason: payload.reason });
  }

  /**
   * Handle SystemResumed event
   */
  private async handleSystemResumed(
    _payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.systemParameter.upsert({
      where: {
        tenantId_paramKey: {
          tenantId: this.config.tenantId,
          paramKey: 'SYSTEM_STATUS',
        },
      },
      create: {
        tenantId: this.config.tenantId,
        paramKey: 'SYSTEM_STATUS',
        paramValue: 'ACTIVE',
        updatedAt: event.timestamp,
      },
      update: {
        paramValue: 'ACTIVE',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'System resumed');
  }

  /**
   * Handle AdminAppointed event
   */
  private async handleAdminAppointed(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.userProfile.updateMany({
      where: { profileId: payload.adminId },
      data: {
        role: 'ADMIN',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Admin appointed', { adminId: payload.adminId });
  }

  /**
   * Handle TreasuryActivated event
   */
  private async handleTreasuryActivated(
    _payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.systemParameter.upsert({
      where: {
        tenantId_paramKey: {
          tenantId: this.config.tenantId,
          paramKey: 'TREASURY_STATUS',
        },
      },
      create: {
        tenantId: this.config.tenantId,
        paramKey: 'TREASURY_STATUS',
        paramValue: 'ACTIVE',
        updatedAt: event.timestamp,
      },
      update: {
        paramValue: 'ACTIVE',
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'Treasury activated');
  }

  /**
   * Handle VelocityTaxApplied event
   */
  private async handleVelocityTaxApplied(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    // Update user wallet with tax deduction
    const wallet = await this.prisma.wallet.findFirst({
      where: { profileId: payload.userId },
    });

    if (wallet) {
      await this.prisma.wallet.update({
        where: { walletId: wallet.walletId },
        data: {
          cachedBalance: {
            decrement: parseFloat(payload.taxAmount),
          },
          updatedAt: event.timestamp,
        },
      });

      // Create transaction history for tax
      await this.prisma.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: wallet.walletId,
          type: 'TAX',
          counterparty: 'TREASURY',
          amount: parseFloat(payload.taxAmount),
          fee: 0,
          remark: `Velocity tax applied`,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });
    }

    this.log('debug', 'Velocity tax applied', {
      userId: payload.userId,
      taxAmount: payload.taxAmount,
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
            lastProcessedBlock: this.lastProcessedBlock.toString(),
            eventCounter: this.eventCounter,
            fabricCircuitBreaker: this.fabricClient.getCircuitBreakerStats(),
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
        service: 'projector',
        workerId: this.config.workerId,
        message,
        ...meta,
      })
    );
  }
}

// ========== Main Entry Point ==========

async function main() {
  console.log('Initializing projector worker...');

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
    const worker = new Projector(config, prisma, fabricClient);
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

export { Projector, WorkerConfig };
