/**
 * Event Validator
 * 
 * Validates events against their JSON schemas using Ajv.
 * Provides type-safe validation results and detailed error reporting.
 * 
 * @module @gx/core-events/validators
 */

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { BaseEvent, ValidationResult, ValidationError } from '../types/base';
import { schemaRegistry } from '../registry/schema-registry';

/**
 * EventValidator validates incoming events from Hyperledger Fabric against their schemas.
 * 
 * Uses Ajv (Another JSON Validator) for fast, standards-compliant JSON Schema validation.
 * Supports format validation (email, uuid, date-time) and custom error messages.
 * 
 * @example
 * ```typescript
 * const validator = new EventValidator();
 * 
 * // Validate an event
 * const result = validator.validate(fabricEvent);
 * 
 * if (result.success) {
 *   // Type-safe access to validated data
 *   console.log('Valid event:', result.data);
 *   processEvent(result.data);
 * } else {
 *   // Detailed validation errors
 *   console.error('Validation failed:', result.errors);
 *   sendToDeadLetterQueue(fabricEvent, result.errors);
 * }
 * ```
 */
export class EventValidator {
  /** Ajv instance for validation */
  private ajv: Ajv;

  /** Cache of compiled validation functions for performance */
  private validatorCache: Map<string, ValidateFunction> = new Map();

  /**
   * Create a new EventValidator.
   * 
   * Initializes Ajv with strict validation settings:
   * - Strict mode: Rejects unknown keywords and formats
   * - All errors: Returns all validation errors, not just the first one
   * - Coerce types: Disabled - data must match schema exactly
   * - Format validation: Enabled for email, uuid, date-time, etc.
   */
  constructor() {
    this.ajv = new Ajv({
      strict: true,           // Strict schema validation
      allErrors: true,        // Collect all errors, not just first one
      coerceTypes: false,     // Don't auto-convert types (maintain data integrity)
      useDefaults: false,     // Don't apply default values
      removeAdditional: false, // Don't remove additional properties (fail instead)
      verbose: true,          // Include schema and data in error output
    });

    // Add format validators (email, uuid, date-time, etc.)
    addFormats(this.ajv);
  }

  /**
   * Validate an event against its registered schema.
   * 
   * This is the main validation method. It:
   * 1. Extracts eventName and eventVersion from the event
   * 2. Looks up the corresponding schema from the registry
   * 3. Validates the event data against the schema
   * 4. Returns a type-safe result with data or errors
   * 
   * @param event - The event object to validate (from Fabric)
   * @returns Validation result with success flag and data or errors
   * 
   * @example
   * ```typescript
   * const event = {
   *   eventName: 'UserCreated',
   *   eventVersion: '1.0',
   *   payload: { userId: '...', email: '...' },
   *   // ... other fields
   * };
   * 
   * const result = validator.validate(event);
   * if (!result.success) {
   *   console.error('Errors:', result.errors);
   * }
   * ```
   */
  public validate<T = unknown>(event: unknown): ValidationResult<BaseEvent<T>> {
    // Type guard: Ensure event is an object
    if (!this.isRecord(event)) {
      return {
        success: false,
        errors: [
          {
            instancePath: '',
            keyword: 'type',
            message: 'Event must be an object',
          },
        ],
      };
    }

    // Extract event metadata
    const eventName = event.eventName as string;
    // eventVersion is optional - default to '1.0' for backward compatibility
    // with chaincode events that don't include version field
    const eventVersion = (event.eventVersion as string) || '1.0';

    // Validate metadata exists
    if (!eventName || typeof eventName !== 'string') {
      return {
        success: false,
        errors: [
          {
            instancePath: '/eventName',
            keyword: 'required',
            message: 'Event must have an "eventName" field',
          },
        ],
      };
    }

    // Lookup schema from registry
    const schemaEntry = schemaRegistry.getSchema(eventName, eventVersion);

    if (!schemaEntry) {
      return {
        success: false,
        errors: [
          {
            instancePath: '',
            keyword: 'schema',
            message: `No schema registered for event: ${eventName}@${eventVersion}. ` +
                    `Available versions: ${schemaRegistry.getVersionsForEvent(eventName).join(', ') || 'none'}`,
          },
        ],
      };
    }

    // Check if schema is deprecated (emit warning but continue validation)
    if (schemaEntry.metadata.deprecated) {
      console.warn(
        `⚠️  Schema ${eventName}@${eventVersion} is deprecated. ` +
        `Please migrate to version ${schemaEntry.metadata.migrateToVersion || 'latest'}.`
      );
    }

    // Get or compile validator
    const validateFn = this.getValidatorFunction(eventName, eventVersion, schemaEntry.schema);

    // Validate event
    const isValid = validateFn(event);

    if (isValid) {
      // Validation succeeded - return typed data
      return {
        success: true,
        data: event as unknown as BaseEvent<T>,
      };
    } else {
      // Validation failed - return formatted errors
      const errors = this.formatErrors(validateFn.errors || []);
      return {
        success: false,
        errors,
      };
    }
  }

  /**
   * Validate an event and throw an error if validation fails.
   * Useful when you want to fail fast instead of handling errors manually.
   * 
   * @param event - The event to validate
   * @returns The validated, type-safe event
   * @throws {EventValidationError} If validation fails
   * 
   * @example
   * ```typescript
   * try {
   *   const validEvent = validator.validateOrThrow(fabricEvent);
   *   await processEvent(validEvent);
   * } catch (error) {
   *   if (error instanceof EventValidationError) {
   *     console.error('Validation errors:', error.errors);
   *   }
   * }
   * ```
   */
  public validateOrThrow<T = unknown>(event: unknown): BaseEvent<T> {
    const result = this.validate<T>(event);

    if (!result.success) {
      throw new EventValidationError(
        `Event validation failed for ${(event as any)?.eventName || 'unknown'}`,
        result.errors
      );
    }

    return result.data;
  }

  /**
   * Get or compile a validation function for a specific schema.
   * 
   * Validation functions are cached for performance.
   * First call compiles the schema, subsequent calls use cached validator.
   * 
   * @param eventName - Name of the event
   * @param version - Schema version
   * @param schema - JSON Schema object
   * @returns Compiled Ajv validation function
   * 
   * @private
   */
  private getValidatorFunction(eventName: string, version: string, schema: any): ValidateFunction {
    const key = `${eventName}@${version}`;

    // Check cache first
    let validator = this.validatorCache.get(key);

    if (!validator) {
      // Compile schema and cache it
      validator = this.ajv.compile(schema);
      this.validatorCache.set(key, validator);
    }

    return validator;
  }

  /**
   * Format Ajv validation errors into our standard ValidationError format.
   * 
   * @param ajvErrors - Raw errors from Ajv
   * @returns Formatted validation errors
   * 
   * @private
   */
  private formatErrors(ajvErrors: any[]): ValidationError[] {
    return ajvErrors.map((error) => ({
      instancePath: error.instancePath || '',
      keyword: error.keyword || 'unknown',
      message: error.message || 'Validation failed',
      params: error.params,
      schemaPath: error.schemaPath,
    }));
  }

  /**
   * Type guard to check if value is a record (object).
   * 
   * @param value - Value to check
   * @returns true if value is a non-null object
   * 
   * @private
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Clear the validator cache.
   * Useful for testing or after schema updates.
   * 
   * @remarks
   * In production, validators are cached indefinitely for performance.
   * Only call this method if schemas are modified at runtime (which should be rare).
   */
  public clearCache(): void {
    this.validatorCache.clear();
  }

  /**
   * Get statistics about the validator.
   * Useful for monitoring and debugging.
   * 
   * @returns Object with validator statistics
   */
  public getStats(): {
    cachedValidators: number;
    registeredSchemas: number;
  } {
    return {
      cachedValidators: this.validatorCache.size,
      registeredSchemas: schemaRegistry.getSchemaCount(),
    };
  }
}

/**
 * Custom error class for validation failures.
 * Includes detailed validation errors for debugging.
 */
export class EventValidationError extends Error {
  /**
   * Array of validation errors
   */
  public readonly errors: ValidationError[];

  /**
   * Create a new EventValidationError.
   * 
   * @param message - Error message
   * @param errors - Array of validation errors
   */
  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'EventValidationError';
    this.errors = errors;

    // Maintain proper stack trace (for V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventValidationError);
    }
  }

  /**
   * Get a formatted string representation of all errors.
   * Useful for logging.
   * 
   * @returns Formatted error string
   */
  public getFormattedErrors(): string {
    return this.errors
      .map((err) => `  - ${err.instancePath || 'root'}: ${err.message}`)
      .join('\n');
  }

  /**
   * Override toString for better error messages.
   */
  public toString(): string {
    return `${this.name}: ${this.message}\n${this.getFormattedErrors()}`;
  }
}

/**
 * Export singleton instance for convenience.
 * 
 * @example
 * ```typescript
 * import { eventValidator } from '@gx/core-events';
 * 
 * const result = eventValidator.validate(event);
 * ```
 */
export const eventValidator = new EventValidator();
