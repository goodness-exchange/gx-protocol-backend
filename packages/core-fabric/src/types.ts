/**
 * Type definitions for Hyperledger Fabric Gateway SDK wrapper
 *
 * Architecture: These types define the contract between application code
 * and the Fabric blockchain network. By abstracting the SDK, we can:
 * - Mock for testing (inject fake Fabric client)
 * - Switch SDK versions without changing application code
 * - Add telemetry/logging at the boundary
 */

import { Contract, Network } from '@hyperledger/fabric-gateway';

/**
 * Configuration for connecting to Fabric network
 *
 * Production deployment: These values come from Kubernetes ConfigMap/Secrets
 * pointing to services like: peer0-org1.fabric.svc.cluster.local:7051
 */
export interface FabricConfig {
  /** Peer gRPC endpoint (e.g., localhost:7051 or peer0-org1.fabric.svc.cluster.local:7051) */
  peerEndpoint: string;

  /** Peer TLS CA certificate (PEM format) - Required for mTLS */
  peerTLSCACert: string;

  /** MSP ID (e.g., Org1MSP) - Identifies organization */
  mspId: string;

  /** Client certificate (PEM format) - Identity for signing */
  certPath: string;

  /** Client private key (PEM format) - For transaction signing */
  keyPath: string;

  /** Channel name (e.g., gxchannel) */
  channelName: string;

  /** Chaincode name (e.g., gxtv3) */
  chaincodeName: string;

  /** gRPC connection options */
  grpc?: {
    /** Enable keep-alive (recommended for long-lived connections) */
    keepAlive?: boolean;
    /** Keep-alive timeout in milliseconds */
    keepAliveTimeout?: number;
  };
}

/**
 * Result from transaction submission
 *
 * Contains both the blockchain transaction ID and any response payload
 * from the chaincode (e.g., newly created user ID, balance updates)
 */
export interface TransactionResult {
  /** Fabric transaction ID (unique identifier in blockchain) */
  transactionId: string;

  /** Block number where transaction was committed */
  blockNumber?: bigint;

  /** Response payload from chaincode (JSON string or bytes) */
  payload?: Uint8Array;

  /** Whether transaction was committed successfully */
  status: 'SUCCESS' | 'FAILED';
}

/**
 * Blockchain event emitted by chaincode
 *
 * Events are emitted during transaction execution via ctx.GetStub().SetEvent()
 * They drive the projector worker to update read models
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
 *
 * Supports resuming from checkpoint (e.g., block 1000) for crash recovery
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

/**
 * Circuit breaker statistics for monitoring
 *
 * Used by Prometheus metrics and health checks
 */
export interface CircuitBreakerStats {
  /** Current state: CLOSED (normal), OPEN (failing), HALF_OPEN (testing) */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

  /** Total successful requests */
  successes: number;

  /** Total failed requests */
  failures: number;

  /** Number of times circuit opened */
  openCount: number;

  /** Last failure timestamp */
  lastFailure?: Date;
}

/**
 * Main Fabric client interface
 *
 * This is what application code depends on. Enables:
 * - Dependency injection (pass mock in tests)
 * - Single responsibility (client only handles Fabric, not business logic)
 */
export interface IFabricClient {
  /** Connect to Fabric network */
  connect(): Promise<void>;

  /** Disconnect and cleanup resources */
  disconnect(): void;

  /** Submit a transaction (write operation) */
  submitTransaction(
    contractName: string,
    functionName: string,
    ...args: string[]
  ): Promise<TransactionResult>;

  /** Evaluate a transaction (read-only query) */
  evaluateTransaction(
    contractName: string,
    functionName: string,
    ...args: string[]
  ): Promise<Uint8Array>;

  /** Listen to blockchain events (for projector worker) */
  listenToEvents(options: EventListenerOptions): Promise<void>;

  /** Get circuit breaker stats (for health checks) */
  getCircuitBreakerStats(): CircuitBreakerStats;

  /** Get underlying contract (for advanced use cases) */
  getContract(): Contract;

  /** Get network instance (for advanced use cases) */
  getNetwork(): Network;
}
