/**
 * Schema Registry
 * 
 * Central repository for all event JSON schemas. Provides version management,
 * schema lookup, and metadata tracking for event validation.
 * 
 * @module @gx/core-events/registry
 */

import { JSONSchemaType } from 'ajv';
import { SchemaMetadata } from '../types/base';

// Import JSON schemas
import userCreatedV1 from '../schemas/user-created.v1.json';
import walletCreatedV1 from '../schemas/wallet-created.v1.json';
import transferCompletedV1 from '../schemas/transfer-completed.v1.json';
import relationshipRequestedV1 from '../schemas/relationship-requested.v1.json';
import relationshipConfirmedV1 from '../schemas/relationship-confirmed.v1.json';
import genesisDistributionEventV1 from '../schemas/genesis-distribution-event.v1.json';
import treasuryAllocationEventV1 from '../schemas/treasury-allocation-event.v1.json';
import transferEventV1 from '../schemas/transfer-event.v1.json';
import orgTransferEventV1 from '../schemas/org-transfer-event.v1.json';
import internalTransferEventV1 from '../schemas/internal-transfer-event.v1.json';
import velocityTaxAppliedV1 from '../schemas/velocity-tax-applied.v1.json';
import orgTxApprovedV1 from '../schemas/org-tx-approved.v1.json';
import orgTxExecutedV1 from '../schemas/org-tx-executed.v1.json';
import orgTxExecutionFailedV1 from '../schemas/org-tx-execution-failed.v1.json';
import systemPausedV1 from '../schemas/system-paused.v1.json';
import systemResumedV1 from '../schemas/system-resumed.v1.json';
import treasuryAccountActivatedV1 from '../schemas/treasury-account-activated.v1.json';

/**
 * Schema registry key format: {eventName}@{version}
 * 
 * @example "UserCreated@1.0"
 */
type SchemaKey = string;

/**
 * Schema entry stored in the registry.
 * Contains the JSON schema and associated metadata.
 */
interface SchemaEntry {
  /** The JSON Schema object */
  schema: JSONSchemaType<any>;
  /** Metadata about this schema version */
  metadata: SchemaMetadata;
}

/**
 * SchemaRegistry manages all event schemas and provides lookup functionality.
 * 
 * This is a singleton that preloads all available schemas at initialization.
 * Supports multiple versions of the same event type for backward compatibility.
 * 
 * @example
 * ```typescript
 * const registry = SchemaRegistry.getInstance();
 * 
 * // Get schema for a specific event version
 * const schema = registry.getSchema('UserCreated', '1.0');
 * 
 * // Get latest schema version
 * const latestSchema = registry.getLatestSchema('UserCreated');
 * 
 * // Check if event/version exists
 * if (registry.hasSchema('UserCreated', '2.0')) {
 *   // Handle v2.0
 * }
 * ```
 */
export class SchemaRegistry {
  /** Singleton instance */
  private static instance: SchemaRegistry;

  /** 
   * Internal storage for schemas
   * Map key format: "EventName@Version" (e.g., "UserCreated@1.0")
   */
  private schemas: Map<SchemaKey, SchemaEntry> = new Map();

  /**
   * Private constructor to enforce singleton pattern.
   * Call getInstance() instead.
   */
  private constructor() {
    this.initializeSchemas();
  }

  /**
   * Get the singleton instance of SchemaRegistry.
   * Creates the instance on first call.
   * 
   * @returns The SchemaRegistry singleton
   */
  public static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry();
    }
    return SchemaRegistry.instance;
  }

  /**
   * Initialize and register all schemas.
   * 
   * This method is called once during construction.
   * Add new schema registrations here as they are created.
   * 
   * @private
   */
  private initializeSchemas(): void {
    // Register UserCreated v1.0
    this.registerSchema('UserCreated', '1.0', userCreatedV1 as JSONSchemaType<any>, {
      eventName: 'UserCreated',
      version: '1.0',
      schemaPath: 'schemas/user-created.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register WalletCreated v1.0
    this.registerSchema('WalletCreated', '1.0', walletCreatedV1 as JSONSchemaType<any>, {
      eventName: 'WalletCreated',
      version: '1.0',
      schemaPath: 'schemas/wallet-created.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register TransferCompleted v1.0
    this.registerSchema('TransferCompleted', '1.0', transferCompletedV1 as JSONSchemaType<any>, {
      eventName: 'TransferCompleted',
      version: '1.0',
      schemaPath: 'schemas/transfer-completed.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register RelationshipRequested v1.0
    this.registerSchema('RelationshipRequested', '1.0', relationshipRequestedV1 as JSONSchemaType<any>, {
      eventName: 'RelationshipRequested',
      version: '1.0',
      schemaPath: 'schemas/relationship-requested.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register RelationshipConfirmed v1.0
    this.registerSchema('RelationshipConfirmed', '1.0', relationshipConfirmedV1 as JSONSchemaType<any>, {
      eventName: 'RelationshipConfirmed',
      version: '1.0',
      schemaPath: 'schemas/relationship-confirmed.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register GenesisDistributionEvent v1.0
    this.registerSchema('GenesisDistributionEvent', '1.0', genesisDistributionEventV1 as JSONSchemaType<any>, {
      eventName: 'GenesisDistributionEvent',
      version: '1.0',
      schemaPath: 'schemas/genesis-distribution-event.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register TreasuryAllocationEvent v1.0
    this.registerSchema('TreasuryAllocationEvent', '1.0', treasuryAllocationEventV1 as JSONSchemaType<any>, {
      eventName: 'TreasuryAllocationEvent',
      version: '1.0',
      schemaPath: 'schemas/treasury-allocation-event.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register TransferEvent v1.0
    this.registerSchema('TransferEvent', '1.0', transferEventV1 as JSONSchemaType<any>, {
      eventName: 'TransferEvent',
      version: '1.0',
      schemaPath: 'schemas/transfer-event.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register OrgTransferEvent v1.0
    this.registerSchema('OrgTransferEvent', '1.0', orgTransferEventV1 as JSONSchemaType<any>, {
      eventName: 'OrgTransferEvent',
      version: '1.0',
      schemaPath: 'schemas/org-transfer-event.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register InternalTransferEvent v1.0
    this.registerSchema('InternalTransferEvent', '1.0', internalTransferEventV1 as JSONSchemaType<any>, {
      eventName: 'InternalTransferEvent',
      version: '1.0',
      schemaPath: 'schemas/internal-transfer-event.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register VelocityTaxApplied v1.0
    this.registerSchema('VelocityTaxApplied', '1.0', velocityTaxAppliedV1 as JSONSchemaType<any>, {
      eventName: 'VelocityTaxApplied',
      version: '1.0',
      schemaPath: 'schemas/velocity-tax-applied.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register OrgTxApproved v1.0
    this.registerSchema('OrgTxApproved', '1.0', orgTxApprovedV1 as JSONSchemaType<any>, {
      eventName: 'OrgTxApproved',
      version: '1.0',
      schemaPath: 'schemas/org-tx-approved.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register OrgTxExecuted v1.0
    this.registerSchema('OrgTxExecuted', '1.0', orgTxExecutedV1 as JSONSchemaType<any>, {
      eventName: 'OrgTxExecuted',
      version: '1.0',
      schemaPath: 'schemas/org-tx-executed.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register OrgTxExecutionFailed v1.0
    this.registerSchema('OrgTxExecutionFailed', '1.0', orgTxExecutionFailedV1 as JSONSchemaType<any>, {
      eventName: 'OrgTxExecutionFailed',
      version: '1.0',
      schemaPath: 'schemas/org-tx-execution-failed.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register SystemPaused v1.0
    this.registerSchema('SystemPaused', '1.0', systemPausedV1 as JSONSchemaType<any>, {
      eventName: 'SystemPaused',
      version: '1.0',
      schemaPath: 'schemas/system-paused.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register SystemResumed v1.0
    this.registerSchema('SystemResumed', '1.0', systemResumedV1 as JSONSchemaType<any>, {
      eventName: 'SystemResumed',
      version: '1.0',
      schemaPath: 'schemas/system-resumed.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });

    // Register TreasuryAccountActivated v1.0
    this.registerSchema('TreasuryAccountActivated', '1.0', treasuryAccountActivatedV1 as JSONSchemaType<any>, {
      eventName: 'TreasuryAccountActivated',
      version: '1.0',
      schemaPath: 'schemas/treasury-account-activated.v1.json',
      registeredAt: new Date(),
      deprecated: false,
    });
  }

  /**
   * Register a new schema in the registry.
   * 
   * @param eventName - Name of the event (e.g., "UserCreated")
   * @param version - Schema version (e.g., "1.0")
   * @param schema - JSON Schema object
   * @param metadata - Schema metadata
   * 
   * @throws {Error} If schema with same event name and version already exists
   * 
   * @private
   */
  private registerSchema(
    eventName: string,
    version: string,
    schema: JSONSchemaType<any>,
    metadata: SchemaMetadata
  ): void {
    const key = this.createKey(eventName, version);

    if (this.schemas.has(key)) {
      throw new Error(
        `Schema already registered: ${eventName}@${version}. ` +
        `Each event name + version combination must be unique.`
      );
    }

    this.schemas.set(key, { schema, metadata });
  }

  /**
   * Get a specific schema by event name and version.
   * 
   * @param eventName - Name of the event
   * @param version - Schema version
   * @returns The JSON Schema and metadata, or undefined if not found
   * 
   * @example
   * ```typescript
   * const entry = registry.getSchema('UserCreated', '1.0');
   * if (entry) {
   *   const { schema, metadata } = entry;
   *   // Use schema for validation
   * }
   * ```
   */
  public getSchema(eventName: string, version: string): SchemaEntry | undefined {
    const key = this.createKey(eventName, version);
    return this.schemas.get(key);
  }

  /**
   * Get the latest version of a schema for a given event name.
   * 
   * @param eventName - Name of the event
   * @returns The latest schema entry, or undefined if event has no schemas
   * 
   * @remarks
   * "Latest" is determined by semantic version sorting (e.g., 2.1 > 2.0 > 1.5 > 1.0)
   * 
   * @example
   * ```typescript
   * // If UserCreated has versions 1.0, 1.1, 2.0
   * const latest = registry.getLatestSchema('UserCreated');
   * // Returns v2.0
   * ```
   */
  public getLatestSchema(eventName: string): SchemaEntry | undefined {
    const versions = this.getVersionsForEvent(eventName);
    
    if (versions.length === 0) {
      return undefined;
    }

    // Sort versions in descending order (latest first)
    const latestVersion = versions.sort((a, b) => {
      return this.compareVersions(b, a); // Reverse for descending
    })[0];

    return this.getSchema(eventName, latestVersion);
  }

  /**
   * Check if a schema exists for a given event name and version.
   * 
   * @param eventName - Name of the event
   * @param version - Schema version
   * @returns true if schema exists, false otherwise
   * 
   * @example
   * ```typescript
   * if (registry.hasSchema('UserCreated', '1.0')) {
   *   console.log('Schema exists!');
   * }
   * ```
   */
  public hasSchema(eventName: string, version: string): boolean {
    const key = this.createKey(eventName, version);
    return this.schemas.has(key);
  }

  /**
   * Get all registered versions for a specific event name.
   * 
   * @param eventName - Name of the event
   * @returns Array of version strings (e.g., ["1.0", "1.1", "2.0"])
   * 
   * @example
   * ```typescript
   * const versions = registry.getVersionsForEvent('UserCreated');
   * console.log(versions); // ["1.0", "2.0"]
   * ```
   */
  public getVersionsForEvent(eventName: string): string[] {
    const versions: string[] = [];

    for (const [_key, entry] of this.schemas.entries()) {
      if (entry.metadata.eventName === eventName) {
        versions.push(entry.metadata.version);
      }
    }

    return versions;
  }

  /**
   * Get all registered event names.
   * 
   * @returns Array of unique event names
   * 
   * @example
   * ```typescript
   * const events = registry.getAllEventNames();
   * console.log(events); // ["UserCreated", "WalletCreated", "TransferCompleted"]
   * ```
   */
  public getAllEventNames(): string[] {
    const eventNames = new Set<string>();

    for (const entry of this.schemas.values()) {
      eventNames.add(entry.metadata.eventName);
    }

    return Array.from(eventNames);
  }

  /**
   * Get total count of registered schemas.
   * 
   * @returns Number of schemas in the registry
   */
  public getSchemaCount(): number {
    return this.schemas.size;
  }

  /**
   * Get all schema metadata entries.
   * Useful for listing available schemas and their properties.
   * 
   * @returns Array of schema metadata
   * 
   * @example
   * ```typescript
   * const allMetadata = registry.getAllMetadata();
   * allMetadata.forEach(meta => {
   *   console.log(`${meta.eventName} v${meta.version}`);
   *   if (meta.deprecated) {
   *     console.log(`  ⚠️  Deprecated - migrate to ${meta.migrateToVersion}`);
   *   }
   * });
   * ```
   */
  public getAllMetadata(): SchemaMetadata[] {
    return Array.from(this.schemas.values()).map(entry => entry.metadata);
  }

  /**
   * Create a registry key from event name and version.
   * 
   * @param eventName - Name of the event
   * @param version - Schema version
   * @returns Key in format "EventName@Version"
   * 
   * @private
   */
  private createKey(eventName: string, version: string): SchemaKey {
    return `${eventName}@${version}`;
  }

  /**
   * Compare two semantic version strings.
   * 
   * @param versionA - First version (e.g., "1.0")
   * @param versionB - Second version (e.g., "2.0")
   * @returns -1 if A < B, 0 if A === B, 1 if A > B
   * 
   * @remarks
   * Supports simple major.minor format (e.g., "1.0", "2.5")
   * Does not support full semver (no patch version or pre-release tags)
   * 
   * @private
   */
  private compareVersions(versionA: string, versionB: string): number {
    const [majorA, minorA] = versionA.split('.').map(Number);
    const [majorB, minorB] = versionB.split('.').map(Number);

    if (majorA !== majorB) {
      return majorA > majorB ? 1 : -1;
    }

    if (minorA !== minorB) {
      return minorA > minorB ? 1 : -1;
    }

    return 0;
  }
}

/**
 * Export singleton instance for convenience.
 * 
 * @example
 * ```typescript
 * import { schemaRegistry } from '@gx/core-events';
 * 
 * const schema = schemaRegistry.getSchema('UserCreated', '1.0');
 * ```
 */
export const schemaRegistry = SchemaRegistry.getInstance();
