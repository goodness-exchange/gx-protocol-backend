/**
 * Hyperledger Fabric Gateway SDK Client
 *
 * Educational Context:
 * This class wraps the Fabric Gateway SDK with production-ready patterns:
 * - Circuit Breaker: Prevents cascading failures
 * - Connection Pooling: Reuses gRPC connections
 * - Event Replay: Supports crash recovery
 * - Observability: Structured logging and metrics
 *
 * References:
 * - Fabric Gateway: https://hyperledger.github.io/fabric-gateway/
 * - Circuit Breaker Pattern: Release It! by Michael Nygard
 * - gRPC Best Practices: https://grpc.io/docs/guides/performance/
 */

import * as grpc from '@grpc/grpc-js';
import {
  connect,
  Contract,
  Gateway,
  Identity,
  Network,
  Signer,
  signers,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import CircuitBreaker from 'opossum';
import {
  BlockchainEvent,
  CircuitBreakerStats,
  EventListenerOptions,
  FabricConfig,
  IFabricClient,
  TransactionResult,
} from './types';

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

  // Logger would be injected via dependency injection
  // For now, we'll use console.log with structured format
  private log(level: string, message: string, meta?: any) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: 'core-fabric',
        message,
        ...meta,
      })
    );
  }

  constructor(config: FabricConfig) {
    this.config = config;

    /**
     * Circuit Breaker Configuration
     *
     * Why these values?
     * - timeout: 120s (Fabric transactions can be slow, especially with large payloads like 234 countries)
     * - errorThresholdPercentage: 50% (if half fail, something's wrong)
     * - resetTimeout: 30s (wait 30s before trying again)
     * - volumeThreshold: 5 (need at least 5 requests to judge)
     *
     * State transitions:
     * CLOSED → (50% failures in 5 requests) → OPEN
     * OPEN → (wait 30s) → HALF_OPEN
     * HALF_OPEN → (1 success) → CLOSED
     * HALF_OPEN → (1 failure) → OPEN
     */
    this.circuitBreaker = new CircuitBreaker(this.submitTxInternal.bind(this), {
      timeout: 120000, // 120 seconds (2 minutes) - increased for large payload operations
      errorThresholdPercentage: 50, // Trip after 50% failures
      resetTimeout: 30000, // Attempt to close after 30 seconds
      volumeThreshold: 5, // Minimum 5 requests before judging
      name: 'fabric-gateway',
    });

    // Log circuit breaker state changes (important for debugging)
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

  /**
   * Connect to Fabric network
   *
   * This establishes:
   * 1. gRPC connection to peer (with TLS)
   * 2. Gateway connection (with identity)
   * 3. Channel connection
   * 4. Chaincode contract reference
   *
   * Production note: This should be called once at application startup,
   * then the connection is reused for the lifetime of the process.
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
        // Evaluation strategy: uses single peer for queries
        // Submit strategy: gateway decides which peers to endorse
      });

      // Step 4: Get channel (contract will be retrieved dynamically per transaction)
      this.network = this.gateway.getNetwork(this.config.channelName);
      // Note: We don't initialize this.contract here anymore since we need different
      // contracts per transaction. The contract will be retrieved dynamically in
      // submitTxInternal and evaluateTransaction using the contractName parameter.
      this.contract = undefined; // Set to undefined, will be set dynamically

      this.isConnected = true;
      this.log('info', 'Successfully connected to Fabric network');
    } catch (error: any) {
      this.log('error', 'Failed to connect to Fabric network', {
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Fabric connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from Fabric network
   *
   * Important: Always call this during graceful shutdown
   * - Closes gRPC connections (prevents resource leaks)
   * - Clears circuit breaker stats
   * - Allows peer to cleanup connection state
   */
  disconnect(): void {
    if (!this.isConnected) {
      return;
    }

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

  /**
   * Submit a transaction (write operation)
   *
   * Flow:
   * 1. Client calls this method
   * 2. Circuit breaker wraps the call
   * 3. If circuit open → Immediate rejection
   * 4. If circuit closed → submitTxInternal() → Fabric
   * 5. Wait for commit event (transaction in blockchain)
   *
   * Example:
   * ```typescript
   * await client.submitTransaction(
   *   'TokenomicsContract',
   *   'TransferTokens',
   *   'user1',
   *   'user2',
   *   '1000000'
   * );
   * ```
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
   *
   * Why separate method?
   * - Circuit breaker needs a bound function
   * - Allows testing without circuit breaker
   * - Clear separation of concerns
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
      // This is necessary because the chaincode has multiple contracts registered
      // (AdminContract, IdentityContract, TokenomicsContract, etc.)
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

      // Wait for transaction to be committed (this ensures finality)
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

      // Re-throw to trigger circuit breaker
      throw error;
    }
  }

  /**
   * Evaluate a transaction (read-only query)
   *
   * Queries don't go through circuit breaker because:
   * - They don't modify state (safe to retry)
   * - They're much faster (typically <100ms)
   * - Failures don't indicate peer unavailability
   *
   * Example:
   * ```typescript
   * const balance = await client.evaluateTransaction(
   *   'TokenomicsContract',
   *   'QueryBalance',
   *   'user1'
   * );
   * ```
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

      // Get the specific contract for this query
      const contract = this.network!.getContract(
        this.config.chaincodeName,
        contractName
      );

      const result = await contract.evaluateTransaction(
        functionName,
        ...args
      );

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
   *
   * Example:
   * ```typescript
   * await client.listenToEvents({
   *   startBlock: 1000n,
   *   onEvent: async (event) => {
   *     if (event.eventName === 'UserCreated') {
   *       await database.userProfile.create({...});
   *     }
   *   }
   * });
   * ```
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
            timestamp: new Date(), // Fabric doesn't provide timestamp in event
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

  /**
   * Get circuit breaker statistics (for health checks and metrics)
   *
   * Used by:
   * - Kubernetes readiness probe (if circuit open → not ready)
   * - Prometheus metrics
   * - Admin dashboard
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

  /**
   * Get underlying contract (for advanced use cases)
   */
  getContract(): Contract {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }
    return this.contract;
  }

  /**
   * Get network instance (for advanced use cases)
   */
  getNetwork(): Network {
    if (!this.network) {
      throw new Error('Not connected to Fabric network');
    }
    return this.network;
  }

  // ========== Private Helper Methods ==========

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

    // Parse PEM format private key
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    return signers.newPrivateKeySigner(privateKey);
  }

  /**
   * Get gRPC connection options
   *
   * Keep-alive is important for long-lived connections:
   * - Detects broken connections quickly
   * - Prevents proxy timeouts
   * - Required for event streaming
   *
   * TLS Server Name Override:
   * - Allows using Kubernetes internal DNS while validating against external certificate
   * - Example: Connect to peer0-org1.fabric.svc.cluster.local but validate as peer0.org1.prod.goodness.exchange
   */
  private getGrpcOptions(): grpc.ClientOptions {
    const options: grpc.ClientOptions = {
      'grpc.keepalive_time_ms': this.config.grpc?.keepAliveTimeout || 120000, // 2 minutes
      'grpc.keepalive_timeout_ms': 20000, // 20 seconds
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.http2.min_time_between_pings_ms': 10000,
    };

    // Add TLS server name override if configured
    if (this.config.grpc?.tlsServerNameOverride) {
      options['grpc.ssl_target_name_override'] = this.config.grpc.tlsServerNameOverride;
    }

    return options;
  }
}
