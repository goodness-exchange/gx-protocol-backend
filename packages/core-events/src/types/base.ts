/**
 * Base Event Types
 * 
 * This file defines the foundational type structures for all events in the GX Protocol system.
 * All events emitted by Hyperledger Fabric chaincode must conform to these base types.
 * 
 * @module @gx/core-events/types/base
 */

/**
 * Standard metadata included in every event emitted by the Fabric chaincode.
 * This envelope provides traceability, ordering, and validation context.
 * 
 * @example
 * ```typescript
 * const metadata: EventMetadata = {
 *   eventId: "550e8400-e29b-41d4-a716-446655440000",
 *   eventName: "UserCreated",
 *   eventVersion: "1.0",
 *   timestamp: "2025-10-16T05:30:00.000Z",
 *   blockNumber: 12345,
 *   txId: "a1b2c3d4e5f6...",
 *   chaincodeName: "gxcoin",
 *   channelName: "gxchannel"
 * };
 * ```
 */
export interface EventMetadata {
  /**
   * Unique identifier for this specific event instance.
   * Used for deduplication to prevent processing the same event twice.
   * 
   * @format uuid
   */
  eventId: string;

  /**
   * The name/type of the event (e.g., "UserCreated", "TransferCompleted").
   * Used to route events to appropriate handlers and select validation schemas.
   */
  eventName: string;

  /**
   * Schema version of this event (e.g., "1.0", "2.0").
   * Allows the system to handle multiple versions of the same event type
   * as the chaincode evolves over time.
   * 
   * @pattern ^\d+\.\d+$
   */
  eventVersion: string;

  /**
   * ISO 8601 timestamp when the event occurred in the chaincode.
   * Used for event ordering and time-based queries.
   * 
   * @format date-time
   */
  timestamp: string;

  /**
   * Hyperledger Fabric block number where this transaction was committed.
   * Provides traceability back to the blockchain ledger.
   */
  blockNumber: number;

  /**
   * Hyperledger Fabric transaction ID that generated this event.
   * Unique identifier for the blockchain transaction.
   */
  txId: string;

  /**
   * Name of the chaincode that emitted this event.
   * Useful when multiple chaincodes share the same event bus.
   */
  chaincodeName: string;

  /**
   * Hyperledger Fabric channel name.
   * Useful in multi-channel deployments.
   */
  channelName: string;
}

/**
 * Generic event envelope that wraps all events.
 * The payload is generic and will be typed based on the specific event.
 * 
 * @template T - The type of the event payload (event-specific data)
 * 
 * @example
 * ```typescript
 * interface UserCreatedPayload {
 *   userId: string;
 *   email: string;
 * }
 * 
 * const event: BaseEvent<UserCreatedPayload> = {
 *   eventId: "...",
 *   eventName: "UserCreated",
 *   eventVersion: "1.0",
 *   timestamp: "...",
 *   blockNumber: 12345,
 *   txId: "...",
 *   chaincodeName: "gxcoin",
 *   channelName: "gxchannel",
 *   payload: {
 *     userId: "550e8400-...",
 *     email: "user@example.com"
 *   }
 * };
 * ```
 */
export interface BaseEvent<T = unknown> extends EventMetadata {
  /**
   * The event-specific data payload.
   * Structure varies based on eventName and eventVersion.
   * Must conform to the JSON schema for this event type.
   */
  payload: T;
}

/**
 * Supported event names in the system.
 * This enum provides type safety when working with event names.
 * 
 * @remarks
 * Add new event types here as they are implemented in the chaincode.
 */
export enum EventName {
  // Identity & User Management Events
  USER_CREATED = 'UserCreated',
  USER_UPDATED = 'UserUpdated',
  USER_KYC_VERIFIED = 'UserKYCVerified',
  USER_KYC_REJECTED = 'UserKYCRejected',

  // Wallet Events
  WALLET_CREATED = 'WalletCreated',
  WALLET_CREDITED = 'WalletCredited',
  WALLET_DEBITED = 'WalletDebited',

  // Transaction Events
  TRANSFER_INITIATED = 'TransferInitiated',
  TRANSFER_COMPLETED = 'TransferCompleted',
  TRANSFER_FAILED = 'TransferFailed',

  // Beneficiary Events
  BENEFICIARY_ADDED = 'BeneficiaryAdded',
  BENEFICIARY_REMOVED = 'BeneficiaryRemoved',

  // Trust Score & Relationship Events
  RELATIONSHIP_INVITED = 'RelationshipInvited',
  RELATIONSHIP_CONFIRMED = 'RelationshipConfirmed',
  RELATIONSHIP_REJECTED = 'RelationshipRejected',
  TRUST_SCORE_CALCULATED = 'TrustScoreCalculated',

  // Business Account Events
  BUSINESS_ACCOUNT_CREATED = 'BusinessAccountCreated',
  SIGNATORY_ADDED = 'SignatoryAdded',
  SIGNATORY_REVOKED = 'SignatoryRevoked',
  TRANSACTION_APPROVAL_REQUESTED = 'TransactionApprovalRequested',
  TRANSACTION_APPROVAL_GRANTED = 'TransactionApprovalGranted',
}

/**
 * Result of event validation.
 * Discriminated union type for type-safe error handling.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Detailed information about a validation error.
 * Follows JSON Schema validation error format.
 */
export interface ValidationError {
  /**
   * JSON path to the property that failed validation (e.g., "/payload/email")
   */
  instancePath: string;

  /**
   * The validation rule that failed (e.g., "format", "required", "type")
   */
  keyword: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Additional parameters about the error
   */
  params?: Record<string, unknown>;

  /**
   * JSON Schema path that was violated
   */
  schemaPath?: string;
}

/**
 * Schema registry entry metadata.
 * Tracks information about each registered schema.
 */
export interface SchemaMetadata {
  /**
   * Event name this schema validates
   */
  eventName: string;

  /**
   * Version of the schema
   */
  version: string;

  /**
   * Path to the JSON schema file (for reference)
   */
  schemaPath: string;

  /**
   * When this schema was added to the registry
   */
  registeredAt: Date;

  /**
   * Whether this version is deprecated (should emit warnings when used)
   */
  deprecated?: boolean;

  /**
   * If deprecated, which version to migrate to
   */
  migrateToVersion?: string;
}
