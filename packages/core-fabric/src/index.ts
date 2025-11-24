/**
 * @gx/core-fabric - Hyperledger Fabric Gateway SDK Wrapper
 *
 * Educational Purpose:
 * This package provides a production-ready client for interacting with
 * Hyperledger Fabric blockchain. It abstracts complexity and provides:
 *
 * - Circuit Breaker: Prevents cascading failures
 * - Event Streaming: Powers the CQRS projector worker
 * - Type Safety: TypeScript interfaces for all operations
 * - Testability: Interface-based design allows mocking
 *
 * Usage Example:
 * ```typescript
 * const client = await createFabricClient({
 *   peerEndpoint: 'peer0-org1.fabric.svc.cluster.local:7051',
 *   channelName: 'gxchannel',
 *   chaincodeName: 'gxtv3',
 *   // ... other config
 * });
 *
 * await client.connect();
 *
 * // Submit transaction
 * const result = await client.submitTransaction(
 *   'TokenomicsContract',
 *   'TransferTokens',
 *   'sender123',
 *   'receiver456',
 *   '1000000'
 * );
 *
 * // Listen to events
 * await client.listenToEvents({
 *   startBlock: 0n,
 *   onEvent: async (event) => {
 *     console.log('Event received:', event.eventName);
 *   }
 * });
 * ```
 */

// Export types (public API contract)
export {
  FabricConfig,
  TransactionResult,
  BlockchainEvent,
  EventListenerOptions,
  CircuitBreakerStats,
  IFabricClient,
} from './types';

// Export client implementation
export { FabricClient } from './fabric-client';

// Export factory function
export { createFabricClient } from './factory';

// Export errors
export { FabricError, FabricConnectionError, FabricTimeoutError } from './errors';

// Export ID generator
export {
  generateFabricUserId,
  decodeFabricUserId,
  validateFabricUserId,
  ACCOUNT_TYPES,
  type DecodedFabricUserId,
} from './id-generator';
