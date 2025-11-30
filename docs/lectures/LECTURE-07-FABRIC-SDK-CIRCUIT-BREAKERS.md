# Lecture 07: Fabric SDK Integration & Circuit Breakers

**Course:** GX Protocol Backend Architecture
**Module:** Blockchain Integration Patterns
**Duration:** 120 minutes
**Level:** Intermediate to Advanced
**Prerequisites:** LECTURE-03 (Hyperledger Fabric Blockchain), LECTURE-05 (Transactional Outbox Pattern)

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Prerequisites](#prerequisites)
3. [Part I: Introduction to Fabric Gateway SDK](#part-i-introduction-to-fabric-gateway-sdk)
4. [Part II: Client Architecture & Connection Management](#part-ii-client-architecture--connection-management)
5. [Part III: Transaction Lifecycle](#part-iii-transaction-lifecycle)
6. [Part IV: Circuit Breaker Pattern](#part-iv-circuit-breaker-pattern)
7. [Part V: Event Streaming & Crash Recovery](#part-v-event-streaming--crash-recovery)
8. [Part VI: gRPC & TLS Configuration](#part-vi-grpc--tls-configuration)
9. [Part VII: Error Handling Strategies](#part-vii-error-handling-strategies)
10. [Part VIII: Production Deployment](#part-viii-production-deployment)
11. [Exercises](#exercises)
12. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Understand the Hyperledger Fabric Gateway SDK architecture
2. Implement resilient blockchain clients with circuit breakers
3. Configure gRPC connections with TLS and keep-alive
4. Handle transaction submission and event streaming
5. Design for fault tolerance in distributed blockchain systems
6. Monitor circuit breaker health and metrics

---

## Prerequisites

### Required Knowledge

- **LECTURE-03:** Hyperledger Fabric Blockchain fundamentals
- **LECTURE-05:** Transactional Outbox Pattern
- TypeScript/JavaScript proficiency
- Basic understanding of gRPC protocol
- Familiarity with TLS/mTLS concepts

### Required Reading

- Hyperledger Fabric Gateway SDK documentation
- "Release It!" by Michael Nygard (Chapter 5: Stability Patterns)

---

## Part I: Introduction to Fabric Gateway SDK

### 1.1 What is the Gateway SDK?

The **Fabric Gateway SDK** is the official client library for interacting with Hyperledger Fabric networks. It was introduced in Fabric 2.4 to replace the older Fabric SDK Node.

```
EVOLUTION OF FABRIC CLIENT LIBRARIES:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Fabric SDK Node (Legacy)          Fabric Gateway SDK (Current)         │
│  ─────────────────────────         ────────────────────────────         │
│  - Client-side endorsement         - Server-side endorsement            │
│  - Complex configuration           - Simple configuration               │
│  - Service discovery client        - Gateway service handles discovery  │
│  - Connection per peer             - Single gateway connection          │
│  - 100+ npm dependencies           - ~10 npm dependencies               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Gateway Architecture

The Gateway SDK uses a **server-side gateway** pattern:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FABRIC GATEWAY ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     gRPC      ┌──────────────┐
│  Application │──────────────▶│   Gateway    │
│              │               │   (Peer)     │
│  FabricClient│               │              │
└──────────────┘               └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   Peer 1     │  │   Peer 2     │  │   Peer 3     │
            │   (Org1)     │  │   (Org1)     │  │   (Org2)     │
            └──────────────┘  └──────────────┘  └──────────────┘
                    │                 │                 │
                    └─────────────────┴─────────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │   Orderer    │
                              │   Cluster    │
                              └──────────────┘

Benefits:
- Gateway handles peer selection and endorsement collection
- Gateway handles retry logic for transient failures
- Application only needs one gRPC connection
- Service discovery happens server-side
```

### 1.3 Key Components

| Component | Purpose |
|-----------|---------|
| **Gateway** | Entry point for network access |
| **Network** | Represents a Fabric channel |
| **Contract** | Represents a deployed chaincode |
| **Identity** | User's X.509 certificate |
| **Signer** | Private key for signing transactions |

---

## Part II: Client Architecture & Connection Management

### 2.1 GX Protocol Fabric Client

The `FabricClient` class wraps the Gateway SDK with production patterns:

```typescript
/**
 * Production-grade Fabric client with resilience patterns
 *
 * Architecture:
 * ```
 * Application → FabricClient → CircuitBreaker → Gateway SDK → Peer → Blockchain
 * ```
 *
 * Failure Handling:
 * - Connection failures → Exponential backoff retry
 * - Timeout → Circuit breaker opens (fail fast)
 * - Network partition → Event listener reconnects
 */
export class FabricClient implements IFabricClient {
  private config: FabricConfig;
  private gateway?: Gateway;
  private network?: Network;
  private contract?: Contract;
  private grpcClient?: grpc.Client;
  private circuitBreaker: CircuitBreaker<[string, string, ...string[]], TransactionResult>;
  private isConnected = false;

  constructor(config: FabricConfig) {
    this.config = config;

    // Initialize circuit breaker (detailed in Part IV)
    this.circuitBreaker = new CircuitBreaker(this.submitTxInternal.bind(this), {
      timeout: 120000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
      name: 'fabric-gateway',
    });

    // Log circuit breaker state changes
    this.circuitBreaker.on('open', () => {
      this.log('warn', 'Circuit breaker OPENED - Fabric may be unavailable');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.log('info', 'Circuit breaker HALF_OPEN - Testing Fabric connectivity');
    });

    this.circuitBreaker.on('close', () => {
      this.log('info', 'Circuit breaker CLOSED - Fabric connectivity restored');
    });
  }
}
```

### 2.2 Configuration Interface

```typescript
/**
 * Configuration for connecting to Fabric network
 *
 * Production deployment: These values come from Kubernetes ConfigMap/Secrets
 */
export interface FabricConfig {
  /** Peer gRPC endpoint (e.g., peer0-org1.fabric.svc.cluster.local:7051) */
  peerEndpoint: string;

  /** Peer TLS CA certificate (PEM format) */
  peerTLSCACert: string;

  /** MSP ID (e.g., Org1MSP) */
  mspId: string;

  /** Client certificate path (PEM format) */
  certPath: string;

  /** Client private key path (PEM format) */
  keyPath: string;

  /** Channel name (e.g., gxchannel) */
  channelName: string;

  /** Chaincode name (e.g., gxtv3) */
  chaincodeName: string;

  /** gRPC connection options */
  grpc?: {
    keepAlive?: boolean;
    keepAliveTimeout?: number;
    tlsServerNameOverride?: string;
  };
}
```

### 2.3 Connection Lifecycle

```typescript
/**
 * Connect to Fabric network
 *
 * This establishes:
 * 1. gRPC connection to peer (with TLS)
 * 2. Gateway connection (with identity)
 * 3. Channel connection
 * 4. Chaincode contract reference
 */
async connect(): Promise<void> {
  if (this.isConnected) {
    this.log('warn', 'Already connected to Fabric network');
    return;
  }

  try {
    this.log('info', 'Connecting to Fabric network', {
      peer: this.config.peerEndpoint,
      mspId: this.config.mspId,
      channel: this.config.channelName,
      chaincode: this.config.chaincodeName,
    });

    // Step 1: Create gRPC client with TLS
    const tlsCredentials = await this.createTLSCredentials();
    this.grpcClient = new grpc.Client(
      this.config.peerEndpoint,
      tlsCredentials,
      this.getGrpcOptions()
    );

    // Step 2: Load identity (certificate) and signer (private key)
    const identity = await this.createIdentity();
    const signer = await this.createSigner();

    // Step 3: Connect to gateway
    this.gateway = connect({
      client: this.grpcClient,
      identity,
      signer,
    });

    // Step 4: Get channel reference
    this.network = this.gateway.getNetwork(this.config.channelName);

    this.isConnected = true;
    this.log('info', 'Successfully connected to Fabric network');
  } catch (error: any) {
    this.log('error', 'Failed to connect to Fabric network', {
      error: error.message,
    });
    throw new Error(`Fabric connection failed: ${error.message}`);
  }
}

/**
 * Disconnect from Fabric network
 *
 * Important: Always call this during graceful shutdown
 */
disconnect(): void {
  if (!this.isConnected) return;

  this.log('info', 'Disconnecting from Fabric network');

  try {
    this.gateway?.close();
    this.grpcClient?.close();
    this.isConnected = false;
    this.log('info', 'Successfully disconnected from Fabric network');
  } catch (error: any) {
    this.log('error', 'Error during disconnect', { error: error.message });
  }
}
```

### 2.4 Identity and Signer Creation

```typescript
/**
 * Create identity from certificate
 *
 * Identity = MSP ID + Certificate
 * MSP ID identifies which organization (e.g., Org1MSP)
 * Certificate contains user ID (e.g., CN=gx_partner_api)
 */
private async createIdentity(): Promise<Identity> {
  const certPem = await fs.readFile(this.config.certPath, 'utf-8');

  return {
    mspId: this.config.mspId,
    credentials: Buffer.from(certPem),
  };
}

/**
 * Create signer from private key
 *
 * Signer is used to:
 * - Sign transaction proposals (proves we authorized the transaction)
 * - Sign identities (proves we are who we claim to be)
 *
 * Uses ECDSA with SHA256 (same as Bitcoin)
 */
private async createSigner(): Promise<Signer> {
  const privateKeyPem = await fs.readFile(this.config.keyPath, 'utf-8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  return signers.newPrivateKeySigner(privateKey);
}
```

---

## Part III: Transaction Lifecycle

### 3.1 Submit vs Evaluate

Fabric has two types of transaction invocations:

| Operation | Purpose | Modifies State | Goes to Orderer | Speed |
|-----------|---------|----------------|-----------------|-------|
| **Submit** | Write data | Yes | Yes | 1-3 seconds |
| **Evaluate** | Read data | No | No | 10-100 ms |

```typescript
// Submit (write): Transfer tokens between users
const result = await client.submitTransaction(
  'TokenomicsContract',
  'TransferTokens',
  'user1', 'user2', '1000000'
);

// Evaluate (read): Query user balance
const balance = await client.evaluateTransaction(
  'TokenomicsContract',
  'QueryBalance',
  'user1'
);
```

### 3.2 Transaction Submission Flow

```
TRANSACTION SUBMISSION FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. Application                                                         │
│     └─ client.submitTransaction('TokenomicsContract', 'Transfer', ...)  │
│                                                                         │
│  2. Circuit Breaker                                                     │
│     └─ Check if circuit is open (fail fast if so)                       │
│                                                                         │
│  3. Create Proposal                                                     │
│     └─ contract.newProposal('Transfer', { arguments: [...] })           │
│                                                                         │
│  4. Endorse (Collect Signatures)                                        │
│     └─ proposal.endorse() → Gateway collects peer endorsements          │
│                                                                         │
│  5. Submit to Orderer                                                   │
│     └─ transaction.submit() → Orderer orders into block                 │
│                                                                         │
│  6. Wait for Commit                                                     │
│     └─ commit.getStatus() → Wait for block commit confirmation          │
│                                                                         │
│  7. Return Result                                                       │
│     └─ { transactionId, blockNumber, payload, status }                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Implementation

```typescript
/**
 * Submit a transaction (write operation)
 *
 * Flow:
 * 1. Client calls this method
 * 2. Circuit breaker wraps the call
 * 3. If circuit open → Immediate rejection
 * 4. If circuit closed → submitTxInternal() → Fabric
 * 5. Wait for commit event (transaction in blockchain)
 */
async submitTransaction(
  contractName: string,
  functionName: string,
  ...args: string[]
): Promise<TransactionResult> {
  if (!this.isConnected) {
    throw new Error('Not connected to Fabric network');
  }

  // Pass through circuit breaker
  return this.circuitBreaker.fire(contractName, functionName, ...args);
}

/**
 * Internal transaction submission (wrapped by circuit breaker)
 */
private async submitTxInternal(
  contractName: string,
  functionName: string,
  ...args: string[]
): Promise<TransactionResult> {
  const startTime = Date.now();

  try {
    this.log('debug', 'Submitting transaction', {
      contract: contractName,
      function: functionName,
      argCount: args.length,
    });

    // Get the specific contract for this transaction
    const contract = this.network!.getContract(
      this.config.chaincodeName,
      contractName
    );

    // Submit transaction and wait for commit
    const proposal = contract.newProposal(functionName, {
      arguments: args,
    });

    const transaction = await proposal.endorse();
    const commit = await transaction.submit();
    const status = await commit.getStatus();

    if (!status.successful) {
      throw new Error(`Transaction failed with code: ${status.code}`);
    }

    const duration = Date.now() - startTime;
    this.log('info', 'Transaction committed successfully', {
      contract: contractName,
      function: functionName,
      transactionId: transaction.getTransactionId(),
      blockNumber: status.blockNumber?.toString(),
      duration,
    });

    return {
      transactionId: transaction.getTransactionId(),
      blockNumber: status.blockNumber,
      payload: transaction.getResult(),
      status: 'SUCCESS',
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    this.log('error', 'Transaction submission failed', {
      contract: contractName,
      function: functionName,
      error: error.message,
      duration,
    });

    throw error; // Re-throw to trigger circuit breaker
  }
}
```

### 3.4 Read-Only Queries

```typescript
/**
 * Evaluate a transaction (read-only query)
 *
 * Queries don't go through circuit breaker because:
 * - They don't modify state (safe to retry)
 * - They're much faster (typically <100ms)
 * - Failures don't indicate peer unavailability
 */
async evaluateTransaction(
  contractName: string,
  functionName: string,
  ...args: string[]
): Promise<Uint8Array> {
  if (!this.isConnected) {
    throw new Error('Not connected to Fabric network');
  }

  try {
    this.log('debug', 'Evaluating transaction', {
      contract: contractName,
      function: functionName,
      argCount: args.length,
    });

    const contract = this.network!.getContract(
      this.config.chaincodeName,
      contractName
    );

    const result = await contract.evaluateTransaction(functionName, ...args);

    return result;
  } catch (error: any) {
    this.log('error', 'Transaction evaluation failed', {
      contract: contractName,
      function: functionName,
      error: error.message,
    });
    throw error;
  }
}
```

---

## Part IV: Circuit Breaker Pattern

### 4.1 Why Circuit Breakers?

Without circuit breakers, a failing Fabric peer can cause cascading failures:

```
WITHOUT CIRCUIT BREAKER:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Request 1 → Fabric (timeout 30s) → FAIL → Retry → FAIL → ...          │
│  Request 2 → Fabric (timeout 30s) → FAIL → Retry → FAIL → ...          │
│  Request 3 → Fabric (timeout 30s) → FAIL → Retry → FAIL → ...          │
│  ...                                                                    │
│  Request 1000 → Fabric (waiting...)                                     │
│                                                                         │
│  Result:                                                                │
│  - 1000 threads blocked waiting for timeouts                            │
│  - Memory exhaustion                                                    │
│  - All requests fail (even after Fabric recovers)                       │
│  - Application becomes unresponsive                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

WITH CIRCUIT BREAKER:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Request 1 → Fabric → FAIL                                              │
│  Request 2 → Fabric → FAIL                                              │
│  Request 3 → Fabric → FAIL                                              │
│  Request 4 → Fabric → FAIL                                              │
│  Request 5 → Fabric → FAIL ← Circuit OPENS (50% failure rate)           │
│                                                                         │
│  Request 6 → REJECTED IMMEDIATELY (circuit open)                        │
│  Request 7 → REJECTED IMMEDIATELY (circuit open)                        │
│  ...                                                                    │
│                                                                         │
│  [30 seconds later - circuit goes HALF_OPEN]                            │
│                                                                         │
│  Request 100 → Fabric → SUCCESS ← Circuit CLOSES                        │
│  Request 101 → Fabric → SUCCESS                                         │
│                                                                         │
│  Result:                                                                │
│  - Fast failure (no waiting for timeouts)                               │
│  - Resources preserved                                                  │
│  - Quick recovery when Fabric comes back                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Circuit Breaker States

```
CIRCUIT BREAKER STATE MACHINE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         ┌─────────────┐                                 │
│                         │             │                                 │
│            ┌────────────│   CLOSED    │◀────────────┐                   │
│            │            │  (Normal)   │             │                   │
│            │            │             │             │                   │
│            │            └──────┬──────┘             │                   │
│            │                   │                    │                   │
│            │         50% failures in                │                   │
│            │         5 requests                     │                   │
│            │                   │                    │                   │
│            │                   ▼                    │                   │
│            │            ┌─────────────┐             │                   │
│            │            │             │             │                   │
│            │            │    OPEN     │             │                   │
│            │            │ (Fail Fast) │             │                   │
│            │            │             │             │                   │
│            │            └──────┬──────┘             │                   │
│            │                   │                    │                   │
│         1 failure              │ 30 seconds        1 success            │
│                                │ timeout                                │
│            │                   ▼                    │                   │
│            │            ┌─────────────┐             │                   │
│            │            │             │             │                   │
│            └────────────│  HALF_OPEN  │─────────────┘                   │
│                         │  (Testing)  │                                 │
│                         │             │                                 │
│                         └─────────────┘                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Configuration

```typescript
/**
 * Circuit Breaker Configuration
 *
 * Why these values?
 * - timeout: 120s (Fabric transactions can be slow with large payloads)
 * - errorThresholdPercentage: 50% (if half fail, something's wrong)
 * - resetTimeout: 30s (wait 30s before testing recovery)
 * - volumeThreshold: 5 (need at least 5 requests to make a judgment)
 */
this.circuitBreaker = new CircuitBreaker(this.submitTxInternal.bind(this), {
  timeout: 120000,            // 2 minutes max per request
  errorThresholdPercentage: 50,  // Open after 50% failures
  resetTimeout: 30000,         // Try again after 30 seconds
  volumeThreshold: 5,          // Minimum requests before opening
  name: 'fabric-gateway',
});
```

### 4.4 Configuration Trade-offs

| Parameter | Low Value | High Value | GX Protocol Choice |
|-----------|-----------|------------|-------------------|
| `timeout` | Quick failure, may timeout valid requests | Slow failure detection | 120s (large payloads) |
| `errorThresholdPercentage` | Opens too easily | Opens too slowly | 50% (balanced) |
| `resetTimeout` | Hammers recovering service | Slow recovery | 30s (standard) |
| `volumeThreshold` | Noisy (opens on few failures) | Slow to react | 5 (small traffic) |

### 4.5 Event Handlers

```typescript
// Log circuit breaker state changes (important for debugging)
this.circuitBreaker.on('open', () => {
  this.log('warn', 'Circuit breaker OPENED - Fabric may be unavailable');
  // Could also: send alert, update metrics, notify ops team
});

this.circuitBreaker.on('halfOpen', () => {
  this.log('info', 'Circuit breaker HALF_OPEN - Testing Fabric connectivity');
});

this.circuitBreaker.on('close', () => {
  this.log('info', 'Circuit breaker CLOSED - Fabric connectivity restored');
});

// Additional events
this.circuitBreaker.on('timeout', () => {
  this.log('warn', 'Transaction timed out');
});

this.circuitBreaker.on('reject', () => {
  this.log('debug', 'Request rejected (circuit open)');
});

this.circuitBreaker.on('fallback', (result) => {
  this.log('info', 'Fallback executed', { result });
});
```

### 4.6 Fallback Strategies

```typescript
// Strategy 1: Return cached value
const circuitBreaker = new CircuitBreaker(fetchBalance, {
  ...options,
});
circuitBreaker.fallback(() => {
  return { balance: cachedBalance, source: 'cache' };
});

// Strategy 2: Return default value
circuitBreaker.fallback(() => {
  return { error: 'SERVICE_UNAVAILABLE', retryAfter: 30 };
});

// Strategy 3: Queue for retry
circuitBreaker.fallback((contractName, functionName, ...args) => {
  queue.add({ contractName, functionName, args });
  return { status: 'QUEUED' };
});
```

### 4.7 Health Check Integration

```typescript
/**
 * Get circuit breaker statistics (for health checks and metrics)
 */
getCircuitBreakerStats(): CircuitBreakerStats {
  const stats = this.circuitBreaker.stats as any;

  return {
    state: this.circuitBreaker.opened
      ? 'OPEN'
      : this.circuitBreaker.halfOpen
      ? 'HALF_OPEN'
      : 'CLOSED',
    successes: stats.successes || 0,
    failures: stats.failures || 0,
    openCount: stats.opens || 0,
    lastFailure: stats.lastFailure ? new Date(stats.lastFailure) : undefined,
  };
}

// Usage in health check endpoint
app.get('/health', (req, res) => {
  const stats = fabricClient.getCircuitBreakerStats();

  if (stats.state === 'OPEN') {
    return res.status(503).json({
      status: 'unhealthy',
      fabric: stats,
    });
  }

  return res.status(200).json({
    status: 'healthy',
    fabric: stats,
  });
});
```

---

## Part V: Event Streaming & Crash Recovery

### 5.1 Event Listening Architecture

```
EVENT STREAMING ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌──────────────┐     gRPC Stream     ┌──────────────┐                  │
│  │   Fabric     │────────────────────▶│   Projector  │                  │
│  │   Peer       │                     │   Worker     │                  │
│  │              │                     │              │                  │
│  │  Block 100   │  Event: UserCreated │  handleEvent │                  │
│  │  Block 101   │  Event: Transfer    │  saveCheck-  │                  │
│  │  Block 102   │  Event: Proposal    │   point      │                  │
│  │  ...         │                     │              │                  │
│  └──────────────┘                     └──────────────┘                  │
│                                              │                          │
│                                              ▼                          │
│                                       ┌──────────────┐                  │
│                                       │  PostgreSQL  │                  │
│                                       │              │                  │
│                                       │ UserProfile  │                  │
│                                       │ Wallet       │                  │
│                                       │ Checkpoint   │                  │
│                                       └──────────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Event Listener Implementation

```typescript
/**
 * Listen to blockchain events (for projector worker)
 *
 * Events are emitted when:
 * - Chaincode calls ctx.GetStub().SetEvent("UserCreated", payload)
 * - Transaction is committed to a block
 *
 * Supports crash recovery:
 * - startBlock: 1000 → Replay from block 1000
 * - Projector stores last processed block in ProjectorState table
 * - On restart, resume from checkpoint
 */
async listenToEvents(options: EventListenerOptions): Promise<void> {
  if (!this.isConnected) {
    throw new Error('Not connected to Fabric network');
  }

  this.log('info', 'Starting event listener', {
    startBlock: options.startBlock?.toString(),
  });

  try {
    const events = await this.network!.getChaincodeEvents(
      this.config.chaincodeName,
      {
        startBlock: options.startBlock,
      }
    );

    // Process events in streaming fashion
    for await (const event of events) {
      try {
        const blockchainEvent: BlockchainEvent = {
          eventName: event.eventName,
          payload: event.payload,
          transactionId: event.transactionId,
          blockNumber: event.blockNumber,
          timestamp: new Date(),
        };

        await options.onEvent(blockchainEvent);

        this.log('debug', 'Processed event', {
          eventName: event.eventName,
          blockNumber: event.blockNumber.toString(),
          txId: event.transactionId,
        });
      } catch (error: any) {
        // Don't stop listening if one event fails
        this.log('error', 'Error processing event', {
          eventName: event.eventName,
          error: error.message,
        });

        if (options.onError) {
          options.onError(error);
        }
      }
    }
  } catch (error: any) {
    this.log('error', 'Event listener error', { error: error.message });

    if (options.onError) {
      options.onError(error);
    }

    // Auto-reconnect after 5 seconds
    this.log('info', 'Reconnecting event listener in 5 seconds');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (options.onReconnect) {
      options.onReconnect();
    }

    // Recursive call to restart listening
    return this.listenToEvents(options);
  }
}
```

### 5.3 Event Types

```typescript
/**
 * Blockchain event emitted by chaincode
 */
export interface BlockchainEvent {
  /** Event name (e.g., 'UserCreated', 'TokensTransferred') */
  eventName: string;

  /** Event payload (typically JSON) */
  payload: Uint8Array;

  /** Transaction ID that emitted this event */
  transactionId: string;

  /** Block number */
  blockNumber: bigint;

  /** Timestamp when block was created */
  timestamp: Date;
}

/**
 * Options for event listening
 */
export interface EventListenerOptions {
  /** Start listening from this block number (for replay/recovery) */
  startBlock?: bigint;

  /** Callback function invoked for each event */
  onEvent: (event: BlockchainEvent) => Promise<void>;

  /** Callback for errors (e.g., connection lost) */
  onError?: (error: Error) => void;

  /** Callback when connection is reestablished */
  onReconnect?: () => void;
}
```

### 5.4 Crash Recovery Flow

```
CRASH RECOVERY FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Normal Operation:                                                      │
│  ─────────────────                                                      │
│  Block 100 → Process → Checkpoint (100, 0)                              │
│  Block 101 → Process → Checkpoint (101, 0)                              │
│  Block 102 → Process ← CRASH!                                           │
│                                                                         │
│  Restart:                                                               │
│  ────────                                                               │
│  1. Load checkpoint from database → (101, 0)                            │
│  2. Start listening from block 102                                      │
│  3. Block 102 → Process → Checkpoint (102, 0)                           │
│  4. Continue normally...                                                │
│                                                                         │
│  No data loss because:                                                  │
│  - Events are replayed from blockchain                                  │
│  - Checkpoint ensures we don't reprocess old events                     │
│  - Event handlers must be idempotent                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part VI: gRPC & TLS Configuration

### 6.1 TLS Credentials

```typescript
/**
 * Create TLS credentials for gRPC connection
 *
 * Mutual TLS (mTLS):
 * - Server proves identity with certificate (prevents man-in-the-middle)
 * - Client proves identity with certificate (prevents unauthorized access)
 */
private async createTLSCredentials(): Promise<grpc.ChannelCredentials> {
  const rootCert = Buffer.from(this.config.peerTLSCACert, 'utf-8');

  return grpc.credentials.createSsl(rootCert);
}
```

### 6.2 gRPC Options

```typescript
/**
 * Get gRPC connection options
 *
 * Keep-alive is important for long-lived connections:
 * - Detects broken connections quickly
 * - Prevents proxy timeouts
 * - Required for event streaming
 */
private getGrpcOptions(): grpc.ClientOptions {
  const options: grpc.ClientOptions = {
    // Send keep-alive ping every 2 minutes
    'grpc.keepalive_time_ms': this.config.grpc?.keepAliveTimeout || 120000,

    // Wait 20 seconds for ping response
    'grpc.keepalive_timeout_ms': 20000,

    // Send keep-alive even without active calls
    'grpc.keepalive_permit_without_calls': 1,

    // Allow unlimited pings without data
    'grpc.http2.max_pings_without_data': 0,

    // Minimum 10 seconds between pings
    'grpc.http2.min_time_between_pings_ms': 10000,
  };

  // TLS Server Name Override for Kubernetes
  if (this.config.grpc?.tlsServerNameOverride) {
    options['grpc.ssl_target_name_override'] = this.config.grpc.tlsServerNameOverride;
  }

  return options;
}
```

### 6.3 TLS Server Name Override

```
TLS SERVER NAME OVERRIDE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Problem:                                                               │
│  - Certificate is issued for: peer0.org1.prod.goodness.exchange         │
│  - Kubernetes DNS uses: peer0-org1.fabric.svc.cluster.local             │
│  - TLS handshake fails (hostname mismatch)                              │
│                                                                         │
│  Solution: TLS Server Name Override                                     │
│  - Connect to: peer0-org1.fabric.svc.cluster.local:7051                 │
│  - Validate certificate as: peer0.org1.prod.goodness.exchange           │
│                                                                         │
│  Configuration:                                                         │
│  ```typescript                                                          │
│  grpc: {                                                                │
│    tlsServerNameOverride: 'peer0.org1.prod.goodness.exchange'           │
│  }                                                                      │
│  ```                                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Keep-Alive Explained

```
WHY KEEP-ALIVE MATTERS:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Without Keep-Alive:                                                    │
│  ───────────────────                                                    │
│  Client ─────────────────────────────────────────────── Server          │
│          [Connection established]                                       │
│                                                                         │
│          ... 5 minutes of no traffic ...                                │
│                                                                         │
│          [Load balancer/NAT closes connection silently]                 │
│                                                                         │
│  Client ─────────────────────────────────────────────── X (broken)      │
│          [Client thinks connection is open]                             │
│          [Next request hangs forever]                                   │
│                                                                         │
│  With Keep-Alive:                                                       │
│  ────────────────                                                       │
│  Client ─────────────────────────────────────────────── Server          │
│          [Connection established]                                       │
│          PING (every 2 min) ──────────────────────────▶                 │
│          ◀────────────────────────────────────── PONG                   │
│          PING (every 2 min) ──────────────────────────▶                 │
│          ◀────────────────────────────────────── PONG                   │
│          [Connection stays alive]                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part VII: Error Handling Strategies

### 7.1 Error Types

| Error Type | Cause | Retry? | Circuit Breaker? |
|------------|-------|--------|------------------|
| **Connection Error** | Network unreachable | Yes | Yes |
| **Timeout** | Peer overloaded | Yes | Yes |
| **Endorsement Error** | Chaincode rejected | No | No |
| **MVCC Conflict** | Concurrent write | Yes (cautiously) | No |
| **Commit Error** | Block validation failed | No | No |

### 7.2 Error Classification

```typescript
function classifyError(error: Error): 'transient' | 'permanent' {
  const message = error.message.toLowerCase();

  // Transient errors (safe to retry)
  if (
    message.includes('timeout') ||
    message.includes('unavailable') ||
    message.includes('connection') ||
    message.includes('network')
  ) {
    return 'transient';
  }

  // Permanent errors (don't retry)
  if (
    message.includes('endorsement failure') ||
    message.includes('chaincode error') ||
    message.includes('mvcc read conflict') ||
    message.includes('invalid')
  ) {
    return 'permanent';
  }

  // Default to transient for unknown errors
  return 'transient';
}
```

### 7.3 Retry with Exponential Backoff

```typescript
async function submitWithRetry(
  client: IFabricClient,
  contractName: string,
  functionName: string,
  args: string[],
  maxRetries: number = 3
): Promise<TransactionResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.submitTransaction(contractName, functionName, ...args);
    } catch (error: any) {
      lastError = error;

      if (classifyError(error) === 'permanent') {
        throw error; // Don't retry permanent errors
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`Retry ${attempt}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

---

## Part VIII: Production Deployment

### 8.1 Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fabric-config
  namespace: backend-mainnet
data:
  FABRIC_PEER_ENDPOINT: "peer0-org1.fabric.svc.cluster.local:7051"
  FABRIC_CHANNEL_NAME: "gxchannel"
  FABRIC_CHAINCODE_NAME: "gxtv3"
  FABRIC_MSP_ID: "Org1MSP"
  FABRIC_TLS_SERVER_NAME_OVERRIDE: "peer0.org1.prod.goodness.exchange"
```

### 8.2 Kubernetes Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: fabric-credentials
  namespace: backend-mainnet
type: Opaque
data:
  # Base64 encoded PEM files
  cert.pem: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...
  key.pem: LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...
  tls-ca.pem: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...
```

### 8.3 Worker Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: outbox-submitter
  namespace: backend-mainnet
spec:
  replicas: 1
  selector:
    matchLabels:
      app: outbox-submitter
  template:
    spec:
      containers:
      - name: outbox-submitter
        image: gx-protocol/outbox-submitter:2.0.0
        envFrom:
        - configMapRef:
            name: fabric-config
        volumeMounts:
        - name: fabric-credentials
          mountPath: /app/fabric-credentials
          readOnly: true
        env:
        - name: FABRIC_CERT_PATH
          value: "/app/fabric-credentials/cert.pem"
        - name: FABRIC_KEY_PATH
          value: "/app/fabric-credentials/key.pem"
        - name: FABRIC_TLS_CA_CERT_PATH
          value: "/app/fabric-credentials/tls-ca.pem"
      volumes:
      - name: fabric-credentials
        secret:
          secretName: fabric-credentials
```

### 8.4 Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 9090
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 9090
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

---

## Exercises

### Exercise 1: Circuit Breaker Configuration

Configure a circuit breaker for the following scenario:
- Expected traffic: 10 requests/minute
- Acceptable failure rate: 10%
- Recovery time should be under 1 minute

What values would you choose for:
- `timeout`
- `errorThresholdPercentage`
- `resetTimeout`
- `volumeThreshold`

### Exercise 2: Error Handling

Implement a function that:
1. Submits a transaction
2. Retries on transient errors with exponential backoff
3. Moves to dead-letter queue after max retries
4. Logs all attempts

### Exercise 3: TLS Configuration

Your Fabric peer has a certificate for `peer0.org1.example.com` but you need to connect via Kubernetes internal DNS `peer0-org1.fabric.svc.cluster.local`.

Write the FabricConfig that would work in this scenario.

### Exercise 4: Event Listener Resilience

Design an event listener that:
1. Reconnects automatically on network failures
2. Saves checkpoints every 10 events
3. Resumes from checkpoint on restart
4. Logs metrics for monitoring

---

## Further Reading

### Official Documentation

- **Fabric Gateway SDK:** https://hyperledger.github.io/fabric-gateway/
- **gRPC Node.js:** https://grpc.io/docs/languages/node/
- **Opossum Circuit Breaker:** https://nodeshift.dev/opossum/

### Books

- **Release It!** by Michael Nygard - Chapter 5: Stability Patterns
- **Designing Data-Intensive Applications** by Martin Kleppmann - Chapter 8: Distributed Systems

### Related GX Protocol Documentation

- **LECTURE-03:** Hyperledger Fabric Blockchain
- **LECTURE-05:** Transactional Outbox Pattern
- **LECTURE-06:** Event-Driven Projections

---

## Summary

In this lecture, we covered:

1. **Fabric Gateway SDK:** Modern client library for Hyperledger Fabric
2. **Client Architecture:** Connection management, identity, and signing
3. **Transaction Lifecycle:** Submit vs evaluate, proposal-endorse-submit flow
4. **Circuit Breaker Pattern:** Preventing cascading failures with fail-fast
5. **Event Streaming:** Crash recovery with checkpoints
6. **gRPC & TLS:** Keep-alive, mTLS, server name override
7. **Error Handling:** Classification, retry strategies, dead-letter queues
8. **Production Deployment:** Kubernetes ConfigMaps, Secrets, health checks

**Key Takeaways:**

- Always use circuit breakers for external service calls
- Configure gRPC keep-alive for long-lived connections
- Use TLS server name override in Kubernetes environments
- Implement idempotent event handlers for crash recovery
- Monitor circuit breaker state for operational visibility
- Classify errors to determine retry strategy

**Next Lecture:** LECTURE-08 - Prisma ORM & Database Schema Design

---

**End of Lecture 07**
