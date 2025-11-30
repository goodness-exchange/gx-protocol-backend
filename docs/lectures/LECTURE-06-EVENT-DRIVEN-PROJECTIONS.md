# Lecture 06: Event-Driven Projections & Read Models

**Course:** GX Protocol Backend Architecture
**Module:** CQRS Pattern Implementation (Part 3 of 3)
**Duration:** 120 minutes
**Level:** Intermediate to Advanced
**Prerequisites:** LECTURE-04 (CQRS Pattern), LECTURE-05 (Transactional Outbox Pattern)

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Prerequisites](#prerequisites)
3. [Part I: Introduction to Event-Driven Projections](#part-i-introduction-to-event-driven-projections)
4. [Part II: The Projector Worker Architecture](#part-ii-the-projector-worker-architecture)
5. [Part III: Checkpoint Management](#part-iii-checkpoint-management)
6. [Part IV: Event Validation with JSON Schemas](#part-iv-event-validation-with-json-schemas)
7. [Part V: Read Model Updates](#part-v-read-model-updates)
8. [Part VI: Transaction Atomicity in Projections](#part-vi-transaction-atomicity-in-projections)
9. [Part VII: Observability & Metrics](#part-vii-observability--metrics)
10. [Part VIII: Production Considerations](#part-viii-production-considerations)
11. [Exercises](#exercises)
12. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Explain the role of projections in CQRS architecture
2. Design and implement event-driven read models
3. Implement checkpoint-based crash recovery
4. Validate blockchain events using JSON Schema
5. Handle eventual consistency in distributed systems
6. Monitor projection lag and health
7. Apply database transactions for atomic read model updates

---

## Prerequisites

### Required Knowledge

- **LECTURE-04:** CQRS Pattern Deep Dive
- **LECTURE-05:** Transactional Outbox Pattern
- TypeScript/JavaScript proficiency
- PostgreSQL and Prisma ORM basics
- Understanding of blockchain event concepts

### Required Reading

Before this lecture, review:
- Martin Fowler's "Event Sourcing" pattern
- Greg Young's "CQRS Documents"
- The GX Protocol architecture documentation

---

## Part I: Introduction to Event-Driven Projections

### 1.1 The Problem: Blockchain Data is Hard to Query

Hyperledger Fabric stores data in a key-value state database (CouchDB or LevelDB). While this is optimized for blockchain operations, it has significant limitations for application queries:

```
Blockchain State Database Limitations:
┌─────────────────────────────────────────────────────────┐
│ ❌ No complex joins across entities                      │
│ ❌ Limited query patterns (key-based lookups)            │
│ ❌ No aggregations (SUM, COUNT, AVG)                     │
│ ❌ No full-text search                                   │
│ ❌ Slow for paginated listings                           │
│ ❌ No materialized views for dashboards                  │
└─────────────────────────────────────────────────────────┘
```

**Example:** To show a user's transaction history with sender/receiver names:

```sql
-- What we WANT to do (but can't on blockchain):
SELECT t.*,
       sender.firstName AS senderName,
       receiver.firstName AS receiverName
FROM transactions t
JOIN users sender ON t.fromUserId = sender.userId
JOIN users receiver ON t.toUserId = receiver.userId
WHERE t.walletId = ?
ORDER BY t.timestamp DESC
LIMIT 20;
```

On the blockchain, this would require:
1. Fetch all transactions for user
2. For each transaction, fetch sender user
3. For each transaction, fetch receiver user
4. Sort and paginate in memory

This is **O(n * 2)** blockchain calls vs **O(1)** SQL query.

### 1.2 The Solution: Event-Driven Projections

A **projection** is a read-optimized database built by replaying blockchain events:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EVENT-DRIVEN PROJECTION FLOW                         │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐    Events     ┌─────────────────────┐
│   Hyperledger        │──────────────▶│    Projector        │
│   Fabric Blockchain  │   (gRPC)      │    Worker           │
│                      │               │                     │
│  - Immutable ledger  │               │  - Listens to       │
│  - Events emitted    │               │    event stream     │
│    on each tx        │               │  - Validates events │
└──────────────────────┘               │  - Updates read DB  │
                                       └──────────┬──────────┘
                                                  │
                                                  │ SQL
                                                  ▼
                                       ┌─────────────────────┐
                                       │    PostgreSQL       │
                                       │    Read Models      │
                                       │                     │
                                       │  - Users table      │
                                       │  - Wallets table    │
                                       │  - Transactions     │
                                       │  - Denormalized     │
                                       └──────────┬──────────┘
                                                  │
                                                  │ SELECT
                                                  ▼
                                       ┌─────────────────────┐
                                       │    API Services     │
                                       │                     │
                                       │  - Fast queries     │
                                       │  - Complex joins    │
                                       │  - Aggregations     │
                                       └─────────────────────┘
```

### 1.3 Key Terminology

| Term | Definition |
|------|------------|
| **Projection** | A read model built from events |
| **Projector** | Worker that processes events and updates read models |
| **Checkpoint** | Last processed event position (for crash recovery) |
| **Event Stream** | Ordered sequence of blockchain events |
| **Read Model** | Query-optimized database table |
| **Eventual Consistency** | Read models eventually match blockchain state |
| **Projection Lag** | Time between blockchain commit and read model update |

### 1.4 Benefits of Event-Driven Projections

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BENEFITS OF PROJECTIONS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. QUERY PERFORMANCE                                                   │
│     ├─ Complex joins: O(1) SQL vs O(n) blockchain calls                │
│     ├─ Indexes optimized for specific query patterns                   │
│     └─ Aggregations computed in real-time                              │
│                                                                         │
│  2. SEPARATION OF CONCERNS                                              │
│     ├─ Blockchain: Source of truth (immutable)                         │
│     ├─ Read DB: Optimized for queries (mutable, rebuildable)           │
│     └─ Different teams can optimize independently                      │
│                                                                         │
│  3. RESILIENCE                                                          │
│     ├─ Read models can be rebuilt from events                          │
│     ├─ Checkpoints enable crash recovery                               │
│     └─ Multiple projectors can run in parallel                         │
│                                                                         │
│  4. FLEXIBILITY                                                         │
│     ├─ Add new read models without changing blockchain                 │
│     ├─ Denormalize data for specific use cases                         │
│     └─ Create specialized views (admin, reporting, analytics)          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part II: The Projector Worker Architecture

### 2.1 High-Level Architecture

The projector worker in GX Protocol follows a clean, modular design:

```typescript
/**
 * Projector Worker Architecture
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
 */
```

### 2.2 Worker Configuration

Configuration is loaded from environment variables with sensible defaults:

```typescript
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
```

**Configuration Options Explained:**

| Variable | Purpose | Default |
|----------|---------|---------|
| `WORKER_ID` | Unique identifier for distributed deployments | `projector-<pid>` |
| `TENANT_ID` | Multi-tenant data isolation | `default` |
| `FABRIC_CHANNEL_NAME` | Blockchain channel to listen to | `gxchannel` |
| `START_BLOCK` | Starting block for new projectors | `0` (genesis) |
| `ENABLE_METRICS` | Enable Prometheus metrics | `true` |
| `METRICS_PORT` | Port for metrics HTTP server | `9091` |
| `CHECKPOINT_INTERVAL` | Save checkpoint every N events | `10` |

### 2.3 Worker Lifecycle

```typescript
class Projector {
  private isRunning = false;
  private eventCounter = 0;
  private lastProcessedBlock: bigint = 0n;
  private lastEventIndex = 0;

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
    this.log('info', 'Starting projector worker');

    try {
      // Step 1: Connect to Fabric network
      await this.fabricClient.connect();

      // Step 2: Load last checkpoint (crash recovery)
      const checkpoint = await this.loadCheckpoint();
      this.lastProcessedBlock = checkpoint.lastBlock;
      this.lastEventIndex = checkpoint.lastEventIndex;

      // Step 3: Start listening to events
      this.isRunning = true;
      metrics.workerStatus.set(1);
      this.startEventListener();

      // Step 4: Start metrics server
      if (this.config.enableMetrics) {
        this.startMetricsServer();
      }

      // Step 5: Register shutdown handlers
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

    // Save final checkpoint before stopping
    await this.saveCheckpoint();

    this.fabricClient.disconnect();
    await this.prisma.$disconnect();

    this.log('info', 'Projector worker stopped');
  }
}
```

### 2.4 Event Listening Loop

The core event processing loop:

```typescript
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
      // In production, restart mechanism is handled by Kubernetes
      process.exit(1);
    });
}
```

---

## Part III: Checkpoint Management

### 3.1 Why Checkpoints Matter

Without checkpoints, a worker restart would require replaying ALL blockchain events from genesis. For a blockchain with millions of events, this could take hours.

```
WITHOUT CHECKPOINTS:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Block 0 ──▶ Block 1 ──▶ ... ──▶ Block 999,999 ──▶ Block 1,000,000     │
│     │           │                    │                   │              │
│     ▼           ▼                    ▼                   ▼              │
│  Process    Process              Process            Process            │
│  (10ms)     (10ms)               (10ms)             (10ms)             │
│                                                                         │
│  Total restart time: 1,000,000 × 10ms = 2.7 hours                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

WITH CHECKPOINTS:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Block 0 ──▶ ... ──▶ Block 999,990 ──▶ Block 999,991 ──▶ Block 1M     │
│                           │                  │               │          │
│                       [Checkpoint]       Process         Process        │
│                       (Saved at:)        (10ms)          (10ms)         │
│                       lastBlock=999,990                                 │
│                                                                         │
│  Restart time: 10 × 10ms = 100ms (start from checkpoint)               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Checkpoint Data Structure

The checkpoint contains minimal but sufficient information:

```typescript
interface Checkpoint {
  tenantId: string;         // Multi-tenant isolation
  projectorName: string;    // Which projector (allows multiple)
  channel: string;          // Which Fabric channel
  lastBlock: bigint;        // Last processed block number
  lastEventIndex: number;   // Event index within that block
  updatedAt: Date;          // When checkpoint was saved
}
```

**Database Schema (Prisma):**

```prisma
model ProjectorState {
  tenantId       String
  projectorName  String
  channel        String
  lastBlock      BigInt
  lastEventIndex Int
  updatedAt      DateTime @updatedAt

  @@id([tenantId, projectorName, channel])
}
```

### 3.3 Loading Checkpoints

```typescript
/**
 * Load checkpoint from database
 *
 * Why checkpoints?
 * - Crash recovery: Worker can resume from last processed event
 * - No duplicate processing: Events before checkpoint already applied
 * - Fast restart: Don't replay entire blockchain history
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
```

### 3.4 Saving Checkpoints

Checkpoints are saved:
- Every N events (configurable via `CHECKPOINT_INTERVAL`)
- On graceful shutdown
- After recovering from errors

```typescript
/**
 * Save checkpoint to database
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
```

### 3.5 Checkpoint Strategy Trade-offs

| Strategy | Checkpoint Interval | Trade-off |
|----------|---------------------|-----------|
| **Aggressive** | Every 1 event | Slowest processing, fastest recovery |
| **Balanced** | Every 10 events | Good balance (GX Protocol default) |
| **Lazy** | Every 100 events | Fastest processing, slower recovery |

**Calculating Recovery Time:**

```
Recovery Time = (Events since last checkpoint) × (Avg processing time per event)

Example with interval = 10, processing time = 10ms:
- Worst case: 10 events × 10ms = 100ms recovery
- Average case: 5 events × 10ms = 50ms recovery
```

---

## Part IV: Event Validation with JSON Schemas

### 4.1 Why Validate Events?

Blockchain events can come from:
- Current chaincode version
- Previous chaincode versions (backward compatibility)
- Malformed events (bugs in chaincode)
- Third-party integrations

Validation protects the read model from corrupt data:

```typescript
// Validate event against schema
const validationResult = eventValidator.validate({
  eventName: event.eventName,
  version: '1.0',
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
```

### 4.2 JSON Schema Example

```json
// UserCreated event schema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "description": "Fabric User ID",
      "pattern": "^[A-Z]{2}\\s\\d{3}\\s[A-Z0-9]{6}\\s[A-Z0-9]{5}\\s\\d{4}$"
    },
    "countryCode": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2
    },
    "userType": {
      "type": "string",
      "enum": ["individual", "organization"]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": ["userId", "countryCode", "userType", "createdAt"],
  "additionalProperties": false
}
```

### 4.3 Event Validator Implementation

```typescript
// packages/core-events/src/validator.ts

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { schemas } from './schemas';

class EventValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);

    // Pre-compile all schemas for performance
    for (const [eventName, schema] of Object.entries(schemas)) {
      this.validators.set(eventName, this.ajv.compile(schema));
    }
  }

  validate(event: {
    eventName: string;
    version: string;
    payload: any;
  }): { success: boolean; errors?: string[] } {
    const validator = this.validators.get(event.eventName);

    if (!validator) {
      return {
        success: false,
        errors: [`Unknown event type: ${event.eventName}`],
      };
    }

    const valid = validator(event.payload);

    if (!valid) {
      return {
        success: false,
        errors: validator.errors?.map(e => `${e.instancePath} ${e.message}`) || [],
      };
    }

    return { success: true };
  }
}

export const eventValidator = new EventValidator();
```

---

## Part V: Read Model Updates

### 5.1 Event Routing

Events are routed to specialized handlers based on event name:

```typescript
/**
 * Route event to appropriate handler based on event name
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

    case 'GenesisDistributed':
      await this.handleGenesisDistributed(payload, event);
      break;

    // OrganizationContract events
    case 'OrganizationProposed':
      await this.handleOrganizationProposed(payload, event);
      break;

    // GovernanceContract events
    case 'ProposalSubmitted':
      await this.handleProposalSubmitted(payload, event);
      break;

    case 'VoteCast':
      await this.handleVoteCast(payload, event);
      break;

    // AdminContract events
    case 'SystemBootstrapped':
      await this.handleSystemBootstrapped(payload, event);
      break;

    default:
      this.log('warn', 'Unknown event type', { eventName });
      // Don't fail - just skip unknown events
  }
}
```

### 5.2 Handler Pattern: UserCreated

```typescript
/**
 * Handle UserCreated event
 *
 * Event Structure:
 * {
 *   "userId": "user123",
 *   "countryCode": "US",
 *   "userType": "individual",
 *   "createdAt": "2025-11-13T10:30:00Z"
 * }
 *
 * Read Model Update:
 * - Update UserProfile status to ACTIVE (user registered on blockchain)
 * - Set onchainRegisteredAt timestamp
 */
private async handleUserCreated(
  payload: any,
  event: BlockchainEvent
): Promise<void> {
  // Find user by fabricUserId (userId in event is the Fabric User ID)
  const existingUser = await this.prisma.userProfile.findFirst({
    where: { fabricUserId: payload.userId },
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
      fabricUserId: payload.userId,
    });
  } else {
    // Fallback: Create new user profile if not found
    await this.prisma.userProfile.create({
      data: {
        profileId: payload.userId,
        tenantId: this.config.tenantId,
        fabricUserId: payload.userId,
        status: 'ACTIVE',
        onchainStatus: 'ACTIVE',
        onchainRegisteredAt: event.timestamp,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        // ... other fields with defaults
      },
    });

    this.log('warn', 'Created new UserProfile from event (unexpected)', {
      fabricUserId: payload.userId,
    });
  }
}
```

### 5.3 Handler Pattern: TransferCompleted (Complex)

This handler demonstrates updating multiple tables atomically:

```typescript
/**
 * Handle TransferCompleted event
 *
 * Event Structure:
 * {
 *   "transactionId": "tx123",
 *   "fromUserId": "user123",
 *   "toUserId": "user456",
 *   "amount": "1000.000000000",
 *   "fee": "1.000000000",
 *   "timestamp": "2025-11-13T10:30:00Z"
 * }
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
        cachedBalance: { decrement: senderDeduction },
        updatedAt: event.timestamp,
      },
    });

    // Update receiver balance (add amount)
    await tx.wallet.update({
      where: { walletId: receiverWallet.walletId },
      data: {
        cachedBalance: { increment: parseFloat(payload.amount) },
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
```

---

## Part VI: Transaction Atomicity in Projections

### 6.1 The Problem: Partial Updates

Without transactions, a crash mid-processing could leave the read model in an inconsistent state:

```
DANGEROUS - Without Transaction:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. UPDATE sender_wallet SET balance = balance - 1000  ✅ Committed     │
│  2. UPDATE receiver_wallet SET balance = balance + 1000                │
│     ↑                                                                   │
│     └── CRASH HERE!                                                     │
│                                                                         │
│  Result: 1000 coins disappeared from the system!                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 The Solution: Prisma Transactions

```typescript
// All operations in a single transaction - all or nothing
await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  // Step 1: Debit sender
  await tx.wallet.update({
    where: { walletId: senderWallet.walletId },
    data: { cachedBalance: { decrement: amount } },
  });

  // Step 2: Credit receiver
  await tx.wallet.update({
    where: { walletId: receiverWallet.walletId },
    data: { cachedBalance: { increment: amount } },
  });

  // Step 3: Create transaction records
  await tx.transaction.createMany({
    data: [senderTx, receiverTx],
  });
});

// If ANY step fails, ALL steps are rolled back
```

### 6.3 Transaction Isolation Levels

```typescript
await this.prisma.$transaction(
  async (tx) => {
    // Operations here
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,  // Max time to acquire lock
    timeout: 10000, // Max time for transaction
  }
);
```

| Isolation Level | Phantom Reads | Non-Repeatable Reads | Dirty Reads | Use Case |
|-----------------|---------------|----------------------|-------------|----------|
| ReadUncommitted | Yes | Yes | Yes | Never use |
| ReadCommitted | Yes | Yes | No | Default PostgreSQL |
| RepeatableRead | Yes | No | No | Most projections |
| Serializable | No | No | No | Financial transactions |

---

## Part VII: Observability & Metrics

### 7.1 Prometheus Metrics

The projector exposes metrics for monitoring:

```typescript
const metrics = {
  // Counter: Total events processed
  eventsProcessed: new promClient.Counter({
    name: 'projector_events_processed_total',
    help: 'Total number of blockchain events processed',
    labelNames: ['event_name', 'status'],
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
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
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
```

### 7.2 Key Metrics to Monitor

| Metric | Alert Threshold | Meaning |
|--------|-----------------|---------|
| `projector_lag_blocks` | > 10 blocks | Projector is falling behind |
| `projector_events_processed_total{status="validation_failed"}` | > 0 (sudden increase) | Schema mismatch |
| `projector_processing_duration_seconds` (p99) | > 1s | Slow processing |
| `projector_worker_status` | = 0 | Worker crashed |
| `projector_checkpoints_saved_total` | No increase in 5m | Checkpoint failure |

### 7.3 Health Check Endpoint

```typescript
private startMetricsServer(): void {
  const server = http.createServer(async (req, res) => {
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
  });

  server.listen(this.config.metricsPort);
}
```

### 7.4 Structured Logging

```typescript
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

// Example output:
// {"timestamp":"2025-11-24T10:30:00.000Z","level":"info","service":"projector",
//  "workerId":"projector-12345","message":"Event processed successfully",
//  "eventName":"TransferCompleted","blockNumber":"42","duration":0.015}
```

---

## Part VIII: Production Considerations

### 8.1 Graceful Shutdown

```typescript
private registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    this.log('info', `Received ${signal}, shutting down gracefully`);

    // Save checkpoint before stopping
    await this.stop();

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Why SIGTERM Matters:**

```
Kubernetes Pod Termination:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. kubectl delete pod projector-0                                      │
│  2. Kubernetes sends SIGTERM                                            │
│  3. Worker receives SIGTERM                                             │
│  4. Worker saves checkpoint ← CRITICAL!                                 │
│  5. Worker closes connections                                           │
│  6. Worker exits with code 0                                            │
│  7. (If no exit in 30s, SIGKILL is sent)                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Kubernetes Deployment

```yaml
# k8s/workers/projector.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: projector
  namespace: backend-mainnet
spec:
  serviceName: projector
  replicas: 1  # Single projector for ordered processing
  selector:
    matchLabels:
      app: projector
  template:
    metadata:
      labels:
        app: projector
    spec:
      containers:
      - name: projector
        image: gx-protocol/projector:2.0.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: DATABASE_URL
        - name: FABRIC_CHANNEL_NAME
          value: "gxchannel"
        - name: CHECKPOINT_INTERVAL
          value: "10"
        - name: METRICS_PORT
          value: "9091"
        ports:
        - containerPort: 9091
          name: metrics
        livenessProbe:
          httpGet:
            path: /health
            port: 9091
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 9091
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      terminationGracePeriodSeconds: 60  # Allow time for checkpoint
```

### 8.3 Scaling Considerations

```
SINGLE PROJECTOR (Current GX Protocol Approach):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Pros:                                                                  │
│  ├─ Simple: No coordination needed                                      │
│  ├─ Ordered: Events processed in block order                           │
│  └─ Consistent: No race conditions                                      │
│                                                                         │
│  Cons:                                                                  │
│  └─ Throughput limited by single worker                                │
│                                                                         │
│  Best for: < 100 events/second (GX Protocol's current load)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

MULTIPLE PROJECTORS (Future Scaling):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Approach 1: Partition by User ID                                       │
│  ├─ Projector A: Users A-M                                              │
│  └─ Projector B: Users N-Z                                              │
│                                                                         │
│  Approach 2: Partition by Event Type                                    │
│  ├─ Projector A: Identity events                                        │
│  ├─ Projector B: Tokenomics events                                      │
│  └─ Projector C: Governance events                                      │
│                                                                         │
│  Approach 3: Competing Consumers (with locking)                         │
│  ├─ Any projector can process any event                                 │
│  └─ Distributed lock prevents duplicates                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Error Recovery Strategies

```typescript
// Strategy 1: Skip and Log (for non-critical events)
try {
  await this.handleEvent(event);
} catch (error) {
  this.log('error', 'Event processing failed, skipping', {
    eventName: event.eventName,
    error: error.message,
  });
  metrics.eventsProcessed.inc({ status: 'skipped' });
  // Continue to next event
}

// Strategy 2: Retry with Backoff (for transient errors)
const MAX_RETRIES = 3;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    await this.handleEvent(event);
    break; // Success
  } catch (error) {
    if (attempt === MAX_RETRIES) {
      throw error; // Give up after max retries
    }
    await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
  }
}

// Strategy 3: Dead Letter Queue (for persistent failures)
try {
  await this.handleEvent(event);
} catch (error) {
  await this.prisma.deadLetterEvent.create({
    data: {
      eventName: event.eventName,
      payload: event.payload,
      error: error.message,
      blockNumber: event.blockNumber,
      createdAt: new Date(),
    },
  });
  this.log('error', 'Event moved to DLQ', { eventName: event.eventName });
}
```

---

## Exercises

### Exercise 1: Basic Event Handler

Implement a handler for the `WalletFrozen` event:

```typescript
/**
 * Handle WalletFrozen event
 *
 * Event Structure:
 * {
 *   "userId": "US 234 A12345 0ABCD 5678",
 *   "reason": "SUSPICIOUS_ACTIVITY",
 *   "frozenAt": "2025-11-24T10:30:00Z"
 * }
 *
 * Read Model Updates:
 * - Update Wallet.isFrozen to true
 * - Update UserProfile.status to FROZEN
 */
private async handleWalletFrozen(
  payload: any,
  event: BlockchainEvent
): Promise<void> {
  // TODO: Implement this handler
}
```

### Exercise 2: Checkpoint Interval Analysis

Given the following scenario:
- 1000 events/minute on blockchain
- 10ms average processing time per event
- Checkpoint saved every 100 events

Calculate:
1. Maximum recovery time after crash
2. Average recovery time after crash
3. Checkpoint I/O overhead per minute

### Exercise 3: Schema Validation

Create a JSON Schema for the `ProposalSubmitted` event:

```json
{
  "proposalId": "prop-001",
  "title": "Increase transaction limit",
  "description": "Proposal to increase daily transaction limit from 10,000 to 50,000 GX",
  "proposerId": "US 123 A12345 0ABCD 1234",
  "proposalType": "PARAMETER_CHANGE",
  "createdAt": "2025-11-24T10:30:00Z"
}
```

### Exercise 4: Metrics Dashboard

Design a Grafana dashboard with the following panels:
1. Events processed per minute (by event type)
2. Projection lag in blocks
3. Processing duration histogram
4. Error rate
5. Checkpoint frequency

---

## Further Reading

### Academic Papers

1. **Fowler, Martin.** "CQRS" (2011)
   - https://martinfowler.com/bliki/CQRS.html

2. **Young, Greg.** "CQRS Documents" (2010)
   - http://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf

3. **Kleppmann, Martin.** "Designing Data-Intensive Applications" (2017)
   - Chapter 11: Stream Processing
   - Chapter 12: The Future of Data Systems

### Related GX Protocol Documentation

- **LECTURE-04:** CQRS Pattern Deep Dive
- **LECTURE-05:** Transactional Outbox Pattern
- **docs/architecture/DEPLOYMENT_ARCHITECTURE.md**
- **workers/projector/README.md**

### Tools and Libraries

- **Prisma ORM:** https://www.prisma.io/docs
- **Prometheus Client:** https://github.com/siimon/prom-client
- **AJV (JSON Schema):** https://ajv.js.org/
- **Hyperledger Fabric Gateway SDK:** https://hyperledger.github.io/fabric-gateway/

---

## Summary

In this lecture, we covered:

1. **Event-Driven Projections:** Building query-optimized read models from blockchain events
2. **Projector Architecture:** Worker lifecycle, configuration, and event loop
3. **Checkpoint Management:** Crash recovery and exactly-once processing
4. **Event Validation:** JSON Schema validation for data integrity
5. **Read Model Updates:** Handler patterns for different event types
6. **Transaction Atomicity:** Ensuring consistent read model state
7. **Observability:** Prometheus metrics and structured logging
8. **Production Considerations:** Graceful shutdown, Kubernetes deployment, scaling

**Key Takeaways:**

- Projections enable fast queries while keeping blockchain as source of truth
- Checkpoints are critical for crash recovery - save frequently
- Always validate events before processing
- Use database transactions for multi-table updates
- Monitor projection lag to ensure read models are fresh
- Design for graceful shutdown to prevent data loss

**Next Lecture:** LECTURE-07 - Fabric SDK Integration & Circuit Breakers

---

**End of Lecture 06**
