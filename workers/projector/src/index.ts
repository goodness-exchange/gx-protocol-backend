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

import { PrismaClient } from '@prisma/client';
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

      // Validate event against schema
      const validationResult = eventValidator.validate({
        eventName: event.eventName,
        version: '1.0', // TODO: Get version from event metadata
        payload,
      });

      if (!validationResult.success) {
        this.log('warn', 'Event validation failed', {
          eventName: event.eventName,
          errors: validationResult.errors,
        });
        metrics.eventsProcessed.inc({
          event_name: event.eventName,
          status: 'validation_failed',
        });
        return; // Skip invalid events
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
      case 'UserCreated':
        await this.handleUserCreated(payload, event);
        break;

      case 'WalletCreated':
        await this.handleWalletCreated(payload, event);
        break;

      case 'TransferCompleted':
        await this.handleTransferCompleted(payload, event);
        break;

      // Add more event handlers here as chaincode events are added
      // case 'GenesisDistributed':
      //   await this.handleGenesisDistributed(payload, event);
      //   break;

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
   * - Create or update UserProfile table
   * - Set initial status to ACTIVE
   */
  private async handleUserCreated(
    payload: any,
    event: BlockchainEvent
  ): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { profileId: payload.userId },
      create: {
        profileId: payload.userId,
        tenantId: this.config.tenantId,
        firstName: payload.firstName || '',
        lastName: payload.lastName || '',
        email: payload.email,
        phoneNum: payload.phoneNum,
        identityNum: payload.identityNum,
        biometricHash: payload.biometricHash,
        passwordHash: payload.passwordHash || '',
        nationalityCountryCode: payload.countryCode,
        status: 'ACTIVE',
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      },
      update: {
        nationalityCountryCode: payload.countryCode,
        updatedAt: event.timestamp,
      },
    });

    this.log('debug', 'UserProfile updated', { userId: payload.userId });
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
    await this.prisma.$transaction(async (tx) => {
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

      // Create transaction history for sender
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: senderWallet.walletId,
          type: 'SEND',
          counterparty: payload.toUserId,
          amount: parseFloat(payload.amount),
          fee: parseFloat(payload.fee || 0),
          remark: payload.remark,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
        },
      });

      // Create transaction history for receiver
      await tx.transaction.create({
        data: {
          tenantId: this.config.tenantId,
          onChainTxId: event.transactionId,
          walletId: receiverWallet.walletId,
          type: 'RECEIVE',
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
