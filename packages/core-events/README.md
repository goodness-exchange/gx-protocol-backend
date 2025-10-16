# @gx/core-events

> Event Schema Registry & Validation for GX Protocol

**Central package for managing and validating all events emitted by Hyperledger Fabric chaincode.**

This package provides JSON Schema-based runtime validation, type safety, and version management for events in the GX Protocol system. It ensures data integrity between the blockchain (on-chain) and off-chain systems.

---

## 📚 Table of Contents

- [Why This Package Exists](#why-this-package-exists)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Usage](#usage)
  - [Validating Events](#validating-events)
  - [Working with the Schema Registry](#working-with-the-schema-registry)
  - [Error Handling](#error-handling)
- [Event Versioning](#event-versioning)
- [Adding New Events](#adding-new-events)
- [Schema Structure](#schema-structure)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Best Practices](#best-practices)

---

## Why This Package Exists

### The Problem

In our CQRS/Event-Driven architecture:

```
Fabric Chaincode → Emits Events → Projector Worker → Updates Read Models
```

**Without schema validation:**
- ❌ Runtime errors from malformed events
- ❌ Silent data corruption
- ❌ Difficult chaincode upgrades
- ❌ No type safety at runtime

**With @gx/core-events:**
- ✅ **Runtime validation** - Catch bad data before it corrupts your database
- ✅ **Type safety** - TypeScript knows event structure
- ✅ **Versioning** - Support multiple chaincode versions simultaneously
- ✅ **Self-documentation** - Schemas document event structure
- ✅ **Evolution** - Upgrade chaincode safely

---

## Features

- 🛡️ **Runtime Validation** - Validate events against JSON Schemas using Ajv
- 📦 **Schema Registry** - Centralized schema management with version control
- 🔄 **Multi-Version Support** - Handle multiple schema versions simultaneously
- 📝 **TypeScript Integration** - Full type safety with auto-generated types
- ⚡ **Performance** - Compiled validators with caching
- 🎯 **Format Validation** - UUID, email, date-time, phone numbers, etc.
- 📊 **Detailed Errors** - Clear validation error messages
- 🔌 **Easy Integration** - Simple API, singleton instances

---

## Installation

This package is part of the GX Protocol monorepo and managed via NPM workspaces.

```bash
# Install dependencies (from monorepo root)
npm install

# Build the package
npm run build --filter=@gx/core-events
```

**Dependencies:**
- `ajv` - JSON Schema validator
- `ajv-formats` - Format validators (email, uuid, date-time)

---

## Quick Start

### 1. Import and Use

```typescript
import { eventValidator } from '@gx/core-events';

// Event received from Fabric
const fabricEvent = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventName: 'UserCreated',
  eventVersion: '1.0',
  timestamp: '2025-10-16T05:30:00.000Z',
  blockNumber: 12345,
  txId: 'a1b2c3d4e5f6...',
  chaincodeName: 'gxcoin',
  channelName: 'gxchannel',
  payload: {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    tenantId: 'tenant-001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    status: 'PENDING_VERIFICATION',
    createdAt: '2025-10-16T05:30:00.000Z'
  }
};

// Validate the event
const result = eventValidator.validate(fabricEvent);

if (result.success) {
  // ✅ Event is valid - safe to process
  console.log('Valid event:', result.data);
  await updateReadModel(result.data);
} else {
  // ❌ Event is invalid - send to DLQ
  console.error('Validation failed:', result.errors);
  await sendToDeadLetterQueue(fabricEvent, result.errors);
}
```

---

## Core Concepts

### Event Envelope

Every event has a standard envelope structure:

```typescript
{
  // Metadata (same for all events)
  eventId: string;           // UUID for deduplication
  eventName: string;         // Event type (e.g., "UserCreated")
  eventVersion: string;      // Schema version (e.g., "1.0")
  timestamp: string;         // ISO 8601 datetime
  blockNumber: number;       // Fabric block number
  txId: string;              // Fabric transaction ID
  chaincodeName: string;     // Source chaincode
  channelName: string;       // Fabric channel
  
  // Event-specific data
  payload: {
    // Structure varies by event type
  }
}
```

### Schema Registry

The `SchemaRegistry` is a singleton that:
1. Loads all JSON schemas at initialization
2. Provides lookup by event name and version
3. Supports multiple versions of the same event
4. Tracks schema metadata (deprecation, migration paths)

### Validator

The `EventValidator` uses Ajv to:
1. Validate events against their schemas
2. Cache compiled validators for performance
3. Return type-safe results
4. Provide detailed error messages

---

## Usage

### Validating Events

#### Basic Validation

```typescript
import { eventValidator } from '@gx/core-events';

const result = eventValidator.validate(event);

if (result.success) {
  // result.data is typed as BaseEvent<T>
  console.log(result.data.payload);
} else {
  // result.errors contains ValidationError[]
  result.errors.forEach(error => {
    console.log(`${error.instancePath}: ${error.message}`);
  });
}
```

#### Validate or Throw

```typescript
try {
  const validEvent = eventValidator.validateOrThrow(event);
  await processEvent(validEvent);
} catch (error) {
  if (error instanceof EventValidationError) {
    console.error(error.getFormattedErrors());
  }
}
```

#### Type-Safe Validation

```typescript
import { eventValidator, BaseEvent } from '@gx/core-events';

// Define your payload type
interface UserCreatedPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Validate with type parameter
const result = eventValidator.validate<UserCreatedPayload>(event);

if (result.success) {
  // TypeScript knows payload structure
  const email = result.data.payload.email; // ✅ Type-safe
}
```

### Working with the Schema Registry

#### Get Schema by Version

```typescript
import { schemaRegistry } from '@gx/core-events';

const schema = schemaRegistry.getSchema('UserCreated', '1.0');

if (schema) {
  console.log('Schema:', schema.schema);
  console.log('Metadata:', schema.metadata);
}
```

#### Get Latest Version

```typescript
const latestSchema = schemaRegistry.getLatestSchema('UserCreated');
```

#### Check if Schema Exists

```typescript
if (schemaRegistry.hasSchema('UserCreated', '2.0')) {
  // Handle v2.0
}
```

#### List All Events

```typescript
const allEvents = schemaRegistry.getAllEventNames();
console.log(allEvents); // ['UserCreated', 'WalletCreated', ...]
```

#### Get All Versions

```typescript
const versions = schemaRegistry.getVersionsForEvent('UserCreated');
console.log(versions); // ['1.0', '1.1', '2.0']
```

### Error Handling

#### Validation Errors

```typescript
const result = eventValidator.validate(event);

if (!result.success) {
  result.errors.forEach(error => {
    console.log(`Field: ${error.instancePath}`);
    console.log(`Rule: ${error.keyword}`);
    console.log(`Message: ${error.message}`);
    console.log(`Params:`, error.params);
  });
}
```

**Example error:**

```json
{
  "instancePath": "/payload/email",
  "keyword": "format",
  "message": "must match format \"email\"",
  "params": { "format": "email" },
  "schemaPath": "#/properties/payload/properties/email/format"
}
```

#### Using EventValidationError

```typescript
try {
  eventValidator.validateOrThrow(event);
} catch (error) {
  if (error instanceof EventValidationError) {
    console.log(error.toString());
    // Output:
    // EventValidationError: Event validation failed for UserCreated
    //   - /payload/email: must match format "email"
    //   - /payload/userId: must match format "uuid"
  }
}
```

---

## Event Versioning

### Version Format

We use **major.minor** versioning (e.g., `1.0`, `1.1`, `2.0`):

- **Major version** (`X.0`) - Breaking changes (remove/rename fields)
- **Minor version** (`1.X`) - Backward-compatible changes (add optional fields)

### Handling Multiple Versions

```typescript
const eventName = event.eventName;
const version = event.eventVersion;

// Route to version-specific handler
if (version === '1.0') {
  await handleUserCreatedV1(event);
} else if (version === '2.0') {
  await handleUserCreatedV2(event);
} else {
  throw new Error(`Unsupported version: ${eventName}@${version}`);
}
```

### Deprecation

Mark schemas as deprecated in the registry:

```typescript
{
  eventName: 'UserCreated',
  version: '1.0',
  deprecated: true,
  migrateToVersion: '2.0',
  // ...
}
```

The validator will emit warnings when deprecated schemas are used.

---

## Adding New Events

### Step 1: Create JSON Schema

Create `src/schemas/{event-name}.v{version}.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://gx-protocol.com/schemas/beneficiary-added.v1.json",
  "title": "BeneficiaryAdded Event v1.0",
  "description": "Emitted when a user adds a beneficiary",
  "type": "object",
  
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventName": { "type": "string", "const": "BeneficiaryAdded" },
    "eventVersion": { "type": "string", "const": "1.0" },
    "timestamp": { "type": "string", "format": "date-time" },
    "blockNumber": { "type": "integer", "minimum": 0 },
    "txId": { "type": "string" },
    "chaincodeName": { "type": "string" },
    "channelName": { "type": "string" },
    
    "payload": {
      "type": "object",
      "properties": {
        "beneficiaryId": { "type": "string", "format": "uuid" },
        "ownerUserId": { "type": "string", "format": "uuid" },
        "beneficiaryUserId": { "type": "string", "format": "uuid" },
        "nickname": { "type": "string", "maxLength": 100 },
        "createdAt": { "type": "string", "format": "date-time" }
      },
      "required": ["beneficiaryId", "ownerUserId", "beneficiaryUserId", "createdAt"],
      "additionalProperties": false
    }
  },
  
  "required": [
    "eventId", "eventName", "eventVersion", "timestamp",
    "blockNumber", "txId", "chaincodeName", "channelName", "payload"
  ],
  "additionalProperties": false
}
```

### Step 2: Register Schema

Add to `src/registry/schema-registry.ts`:

```typescript
import beneficiaryAddedV1 from '../schemas/beneficiary-added.v1.json';

// In initializeSchemas()
this.registerSchema('BeneficiaryAdded', '1.0', beneficiaryAddedV1 as JSONSchemaType<any>, {
  eventName: 'BeneficiaryAdded',
  version: '1.0',
  schemaPath: 'schemas/beneficiary-added.v1.json',
  registeredAt: new Date(),
  deprecated: false,
});
```

### Step 3: Add to EventName Enum

In `src/types/base.ts`:

```typescript
export enum EventName {
  // ... existing events
  BENEFICIARY_ADDED = 'BeneficiaryAdded',
}
```

### Step 4: Rebuild

```bash
npm run build --filter=@gx/core-events
```

---

## Schema Structure

### Required Properties (All Events)

```json
{
  "eventId": "string (uuid)",
  "eventName": "string (const)",
  "eventVersion": "string (const, pattern: ^\\d+\\.\\d+$)",
  "timestamp": "string (date-time)",
  "blockNumber": "integer (minimum: 0)",
  "txId": "string",
  "chaincodeName": "string",
  "channelName": "string",
  "payload": "object"
}
```

### Payload Schema Best Practices

1. **Use `additionalProperties: false`** - Reject unknown fields
2. **Mark required fields explicitly** - Use `required` array
3. **Add descriptions** - Document each field's purpose
4. **Use format validators** - `uuid`, `email`, `date-time`, `pattern`
5. **Set constraints** - `minLength`, `maxLength`, `minimum`, `maximum`
6. **Use enums for fixed values** - Ensures consistency

**Example:**

```json
{
  "email": {
    "type": "string",
    "format": "email",
    "description": "User's email address (must be unique)"
  },
  "age": {
    "type": "integer",
    "minimum": 18,
    "maximum": 120,
    "description": "User's age in years (must be 18+)"
  },
  "status": {
    "type": "string",
    "enum": ["ACTIVE", "SUSPENDED", "CLOSED"],
    "description": "Account status"
  }
}
```

---

## API Reference

### EventValidator

#### `validate<T>(event: unknown): ValidationResult<BaseEvent<T>>`

Validate an event against its schema.

**Returns:** `{ success: true, data: BaseEvent<T> } | { success: false, errors: ValidationError[] }`

#### `validateOrThrow<T>(event: unknown): BaseEvent<T>`

Validate and throw on error.

**Throws:** `EventValidationError`

#### `clearCache(): void`

Clear the validator cache (use for testing).

#### `getStats(): { cachedValidators: number; registeredSchemas: number }`

Get validator statistics.

### SchemaRegistry

#### `getSchema(eventName: string, version: string): SchemaEntry | undefined`

Get a specific schema by name and version.

#### `getLatestSchema(eventName: string): SchemaEntry | undefined`

Get the latest version of a schema.

#### `hasSchema(eventName: string, version: string): boolean`

Check if a schema exists.

#### `getVersionsForEvent(eventName: string): string[]`

Get all versions for an event.

#### `getAllEventNames(): string[]`

Get all registered event names.

#### `getSchemaCount(): number`

Get total number of schemas.

#### `getAllMetadata(): SchemaMetadata[]`

Get metadata for all schemas.

---

## Testing

### Unit Tests

```typescript
import { eventValidator, EventValidationError } from '@gx/core-events';

describe('EventValidator', () => {
  it('should validate a valid UserCreated event', () => {
    const event = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventName: 'UserCreated',
      eventVersion: '1.0',
      // ... other fields
    };

    const result = eventValidator.validate(event);
    expect(result.success).toBe(true);
  });

  it('should reject an event with invalid email', () => {
    const event = {
      eventName: 'UserCreated',
      eventVersion: '1.0',
      payload: {
        email: 'not-an-email', // Invalid
        // ...
      },
      // ...
    };

    const result = eventValidator.validate(event);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].keyword).toBe('format');
  });
});
```

---

## Best Practices

### 1. Always Validate Events Before Processing

```typescript
// ✅ Good
const result = eventValidator.validate(event);
if (result.success) {
  await processEvent(result.data);
}

// ❌ Bad
await processEvent(event); // No validation!
```

### 2. Send Invalid Events to DLQ

```typescript
if (!result.success) {
  await db.eventDLQ.create({
    data: {
      tenantId,
      reason: 'VALIDATION_FAILED',
      rawPayload: event,
      fabricTxId: event.txId,
      createdAt: new Date(),
    },
  });
}
```

### 3. Use Type Parameters

```typescript
// ✅ Good - Type-safe
const result = eventValidator.validate<UserCreatedPayload>(event);

// ❌ Bad - Loses type information
const result = eventValidator.validate(event);
```

### 4. Handle Deprecated Schemas

Monitor logs for deprecation warnings and plan migrations.

### 5. Version Schemas Carefully

- **Minor versions** - Add optional fields only
- **Major versions** - Breaking changes require migration plan

---

## Package Info

- **Name:** `@gx/core-events`
- **Version:** 1.0.0
- **License:** Private
- **Dependencies:**
  - `ajv` ^8.12.0
  - `ajv-formats` ^2.1.1

---

## Support

For questions or issues:
- Check existing schemas in `src/schemas/`
- Review tests in `src/__tests__/`
- Consult the main project documentation

---

**Built with ❤️ for the GX Protocol**
