/**
 * @gx/core-events - Event Schema Registry & Validation
 * 
 * Central package for event schema management and validation in the GX Protocol system.
 * Provides JSON Schema-based validation for all events emitted by Hyperledger Fabric chaincode.
 * 
 * @module @gx/core-events
 * 
 * @example
 * ```typescript
 * import { eventValidator, EventName } from '@gx/core-events';
 * 
 * // Validate an event from Fabric
 * const result = eventValidator.validate(fabricEvent);
 * 
 * if (result.success) {
 *   console.log('Valid event:', result.data);
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */

// Export base types
export * from './types/base';

// Export registry
export { SchemaRegistry, schemaRegistry } from './registry/schema-registry';

// Export validator
export {
  EventValidator,
  EventValidationError,
  eventValidator,
} from './validators/event-validator';

// Re-export for convenience
export { ValidationResult, ValidationError, BaseEvent, EventMetadata } from './types/base';
