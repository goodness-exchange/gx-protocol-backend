/**
 * Custom error classes for Fabric operations
 *
 * Why custom errors?
 * - Type-safe error handling (instanceof checks)
 * - Structured error information (code, context)
 * - Better logging and monitoring
 *
 * Example:
 * ```typescript
 * try {
 *   await client.submitTransaction(...);
 * } catch (error) {
 *   if (error instanceof FabricTimeoutError) {
 *     // Retry logic
 *   } else if (error instanceof FabricConnectionError) {
 *     // Alert ops team
 *   }
 * }
 * ```
 */

/**
 * Base Fabric error
 */
export class FabricError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;

  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message);
    this.name = 'FabricError';
    this.code = code;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when connection to Fabric network fails
 *
 * Possible causes:
 * - Peer is down
 * - Network partition
 * - TLS certificate expired
 * - Invalid credentials
 */
export class FabricConnectionError extends FabricError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'FABRIC_CONNECTION_ERROR', context);
    this.name = 'FabricConnectionError';
  }
}

/**
 * Thrown when transaction submission times out
 *
 * Note: Timeout doesn't mean transaction failed!
 * It might still commit. Always check transaction ID on blockchain.
 */
export class FabricTimeoutError extends FabricError {
  public readonly transactionId?: string;

  constructor(message: string, transactionId?: string, context?: Record<string, any>) {
    super(message, 'FABRIC_TIMEOUT', context);
    this.name = 'FabricTimeoutError';
    this.transactionId = transactionId;
  }
}

/**
 * Thrown when chaincode returns an error
 *
 * Example: "Insufficient balance" when trying to transfer more than available
 */
export class FabricChaincodeError extends FabricError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'FABRIC_CHAINCODE_ERROR', context);
    this.name = 'FabricChaincodeError';
  }
}

/**
 * Thrown when endorsement fails
 *
 * Endorsement = Peers execute transaction and sign result
 * Failure means: Chaincode error OR peer unavailable
 */
export class FabricEndorsementError extends FabricError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'FABRIC_ENDORSEMENT_ERROR', context);
    this.name = 'FabricEndorsementError';
  }
}
