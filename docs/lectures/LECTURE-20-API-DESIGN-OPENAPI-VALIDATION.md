# LECTURE 20: API Design & OpenAPI Validation

## Overview

This lecture covers API design principles and validation strategies for the GX Protocol backend services. We explore RESTful API patterns, OpenAPI specification, request/response validation with `express-openapi-validator`, and event schema validation for the CQRS projector using JSON Schema and Ajv.

**Prerequisites:**
- LECTURE-04: CQRS Pattern Deep Dive
- LECTURE-05: Transactional Outbox Pattern
- Basic understanding of HTTP and REST principles
- Familiarity with TypeScript and Express.js

---

## Learning Objectives

By the end of this lecture, you will be able to:
1. Design consistent RESTful APIs following industry best practices
2. Write OpenAPI specifications for API documentation and validation
3. Implement request/response validation using `express-openapi-validator`
4. Validate blockchain events using JSON Schema and Ajv
5. Create reusable schema components for pagination, errors, and common patterns
6. Handle validation errors gracefully with proper error responses

---

## Section 1: API Design Principles

### 1.1 RESTful Resource Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    REST RESOURCE HIERARCHY                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /api/v1                                                        │
│  │                                                              │
│  ├── /users                       # User management             │
│  │   ├── POST /                   # Create user                 │
│  │   ├── GET /:id                 # Get user by ID             │
│  │   ├── PATCH /:id               # Update user                │
│  │   ├── POST /:id/kyc            # Submit KYC                 │
│  │   └── GET /:id/kyc             # Get KYC status             │
│  │                                                              │
│  ├── /auth                        # Authentication             │
│  │   ├── POST /register           # Register                   │
│  │   ├── POST /login              # Login                      │
│  │   ├── POST /refresh            # Refresh token              │
│  │   └── POST /logout             # Logout                     │
│  │                                                              │
│  ├── /tokenomics                  # Currency operations        │
│  │   ├── GET /balance/:id         # Get balance                │
│  │   ├── POST /transfer           # Transfer funds             │
│  │   └── GET /transactions        # List transactions          │
│  │                                                              │
│  ├── /organizations               # Multi-sig organizations    │
│  │   ├── POST /                   # Propose organization       │
│  │   ├── GET /:id                 # Get organization           │
│  │   ├── POST /:id/endorse        # Endorse membership        │
│  │   └── POST /:id/transactions   # Initiate multi-sig tx     │
│  │                                                              │
│  ├── /governance                  # On-chain governance        │
│  │   ├── POST /proposals          # Submit proposal            │
│  │   ├── GET /proposals           # List proposals             │
│  │   ├── POST /proposals/:id/vote # Vote on proposal           │
│  │   └── POST /proposals/:id/execute # Execute proposal        │
│  │                                                              │
│  └── /loans                       # Loan pool                  │
│      ├── POST /apply              # Apply for loan             │
│      ├── GET /my-loans            # List my loans              │
│      └── POST /:id/approve        # Approve loan (admin)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 HTTP Method Semantics

| Method | Purpose | Idempotent | Safe | Request Body |
|--------|---------|------------|------|--------------|
| GET | Read resources | Yes | Yes | No |
| POST | Create resources | No | No | Yes |
| PUT | Replace resources | Yes | No | Yes |
| PATCH | Partial update | No | No | Yes |
| DELETE | Remove resources | Yes | No | No |

**GX Protocol Convention:**
- POST for writes that go to the outbox (CQRS pattern)
- GET for reads from the read model (projections)
- PATCH for partial updates
- DELETE rarely used (soft delete via PATCH preferred)

### 1.3 Idempotency in Financial APIs

For financial operations, idempotency is critical:

```typescript
// From users.routes.ts

/**
 * POST /api/v1/users
 * Register a new user
 * Rate limited: 5 requests per minute per IP (prevent spam registration)
 *
 * @header X-Idempotency-Key - Required for all POST requests
 * @body {email: string, password: string, fullName: string, phone?: string}
 * @returns {user: UserProfile}
 */
router.post('/', strictRateLimiter, usersController.register);
```

**Idempotency Key Header:**
```
X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

---

## Section 2: OpenAPI Specification

### 2.1 OpenAPI Document Structure

```yaml
# openapi.yaml

openapi: "3.0.3"
info:
  title: GX Protocol Identity Service API
  description: |
    API for user identity management, authentication, and KYC verification.
    Part of the GX Protocol Productivity-Based Currency system.
  version: "1.0.0"
  contact:
    name: GX Protocol Team
    email: api@gxcoin.money
  license:
    name: Proprietary

servers:
  - url: https://api.gxcoin.money/identity
    description: Production (Global Load Balanced)
  - url: https://testnet-api.gxcoin.money/identity
    description: Testnet

tags:
  - name: Authentication
    description: User authentication and session management
  - name: Users
    description: User profile and identity management
  - name: KYC
    description: Know Your Customer verification

paths:
  /api/v1/auth/register:
    post:
      summary: Register a new user
      operationId: registerUser
      tags: [Authentication]
      security: []  # Public endpoint
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '201':
          description: User successfully registered
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '409':
          $ref: '#/components/responses/Conflict'
        '429':
          $ref: '#/components/responses/RateLimited'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    RegisterRequest:
      type: object
      required:
        - email
        - password
        - fname
        - lname
        - dateOfBirth
        - gender
      properties:
        fname:
          type: string
          minLength: 1
          maxLength: 100
          description: User's first name
        lname:
          type: string
          minLength: 1
          maxLength: 100
          description: User's last name
        email:
          type: string
          format: email
          description: User's email address (used for login)
        password:
          type: string
          format: password
          minLength: 8
          maxLength: 128
          description: Password (min 8 chars, must contain uppercase, lowercase, number)
        dateOfBirth:
          type: string
          format: date
          description: Date of birth (YYYY-MM-DD)
        gender:
          type: string
          enum: [male, female, other]
        phone:
          type: string
          pattern: '^\+[1-9]\d{1,14}$'
          description: Phone number in E.164 format
        country:
          type: string
          minLength: 2
          maxLength: 2
          description: ISO 3166-1 alpha-2 country code

    AuthResponse:
      type: object
      required:
        - user
        - accessToken
        - refreshToken
      properties:
        user:
          $ref: '#/components/schemas/UserProfile'
        accessToken:
          type: string
          description: JWT access token (expires in 15 minutes)
        refreshToken:
          type: string
          description: Refresh token (expires in 7 days)
```

### 2.2 Common Response Schemas

```yaml
# components/schemas/common.yaml

components:
  schemas:
    # Standard error response
    ErrorResponse:
      type: object
      required:
        - error
      properties:
        error:
          type: object
          required:
            - message
            - statusCode
          properties:
            message:
              type: string
              description: Human-readable error message
            statusCode:
              type: integer
              description: HTTP status code
            code:
              type: string
              description: Machine-readable error code
            details:
              type: object
              description: Additional error details

    # Pagination wrapper
    PaginatedResponse:
      type: object
      required:
        - data
        - pagination
      properties:
        data:
          type: array
          items: {}
        pagination:
          type: object
          required:
            - page
            - limit
            - total
            - totalPages
          properties:
            page:
              type: integer
              minimum: 1
            limit:
              type: integer
              minimum: 1
              maximum: 100
            total:
              type: integer
              minimum: 0
            totalPages:
              type: integer
              minimum: 0
            hasNext:
              type: boolean
            hasPrev:
              type: boolean

  responses:
    BadRequest:
      description: Bad Request - Invalid input
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Validation failed
              statusCode: 400
              code: VALIDATION_ERROR

    Unauthorized:
      description: Unauthorized - Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Authentication required
              statusCode: 401
              code: UNAUTHORIZED

    Forbidden:
      description: Forbidden - Insufficient permissions
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Insufficient permissions
              statusCode: 403
              code: FORBIDDEN

    NotFound:
      description: Not Found - Resource does not exist
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Resource not found
              statusCode: 404
              code: NOT_FOUND

    Conflict:
      description: Conflict - Resource already exists
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Resource already exists
              statusCode: 409
              code: CONFLICT

    RateLimited:
      description: Too Many Requests - Rate limit exceeded
      headers:
        Retry-After:
          schema:
            type: integer
          description: Seconds to wait before retrying
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error:
              message: Rate limit exceeded
              statusCode: 429
              code: RATE_LIMITED
```

---

## Section 3: Request/Response Validation with express-openapi-validator

### 3.1 Core OpenAPI Middleware

```typescript
// From packages/core-openapi/src/index.ts

import { Express, RequestHandler } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import swaggerUi from 'swagger-ui-express';
import * as yaml from 'js-yaml';

/**
 * Configuration options for OpenAPI middleware
 */
export interface OpenApiMiddlewareOptions {
  /**
   * Absolute path to the OpenAPI YAML specification file
   */
  apiSpecPath: string;

  /**
   * Path to serve Swagger UI documentation (default: /api-docs)
   */
  docsPath?: string;

  /**
   * Whether to validate incoming requests (default: true)
   */
  validateRequests?: boolean;

  /**
   * Whether to validate outgoing responses (default: false in production)
   * Useful in development to catch schema drift
   */
  validateResponses?: boolean;

  /**
   * Whether to serve Swagger UI (default: true)
   */
  enableSwaggerUI?: boolean;
}

/**
 * Creates and configures OpenAPI middleware for an Express application.
 *
 * This function performs the following tasks:
 * 1. Loads and parses the OpenAPI YAML specification
 * 2. Sets up Swagger UI to serve interactive API documentation
 * 3. Configures request/response validation to enforce the API contract
 */
export const applyOpenApiMiddleware = (
  app: Express,
  options: OpenApiMiddlewareOptions
): void => {
  const {
    apiSpecPath,
    docsPath = '/api-docs',
    validateRequests = true,
    validateResponses = false,
    enableSwaggerUI = true,
  } = options;

  // 1. Load and parse the OpenAPI specification file
  const apiSpec = yaml.load(fs.readFileSync(apiSpecPath, 'utf8'));

  logger.info({
    specPath: apiSpecPath,
    docsPath,
    validateRequests,
    validateResponses,
  }, 'Loading OpenAPI specification');

  // 2. Serve the interactive Swagger UI documentation
  if (enableSwaggerUI) {
    app.use(
      docsPath,
      swaggerUi.serve,
      swaggerUi.setup(apiSpec as swaggerUi.JsonObject, {
        customSiteTitle: 'GX Coin Protocol API Documentation',
        customCss: '.swagger-ui .topbar { display: none }',
      })
    );
  }

  // 3. Apply the OpenAPI request validator middleware
  app.use(
    OpenApiValidator.middleware({
      apiSpec: apiSpecPath,
      validateRequests,
      validateResponses,
      // Validate security (authentication/authorization)
      validateSecurity: true,
      // Ignore undocumented paths (return 404 instead of validation error)
      ignorePaths: /.*\/health.*/,
    })
  );
};
```

### 3.2 Using the Middleware in Services

```typescript
// apps/svc-identity/src/app.ts

import express from 'express';
import path from 'path';
import { applyOpenApiMiddleware } from '@gx/core-openapi';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// JSON body parser
app.use(express.json());

// Apply OpenAPI validation middleware
applyOpenApiMiddleware(app, {
  apiSpecPath: path.join(__dirname, 'openapi.yaml'),
  docsPath: '/api-docs',
  validateRequests: true,
  validateResponses: process.env.NODE_ENV === 'development',
});

// Mount routes
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);

// Error handler for validation errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.status === 400 && err.errors) {
    // OpenAPI validation error
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
    });
  }
  next(err);
});

export default app;
```

### 3.3 Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   REQUEST VALIDATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Incoming HTTP Request                                          │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │ Path Validation │ ─────► Does path match any spec route?    │
│  └─────────┬───────┘        No → 404 Not Found                 │
│            │ Yes                                                │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Method Check    │ ─────► Is HTTP method allowed?            │
│  └─────────┬───────┘        No → 405 Method Not Allowed        │
│            │ Yes                                                │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Security Check  │ ─────► JWT valid? API key present?        │
│  └─────────┬───────┘        No → 401 Unauthorized              │
│            │ Yes                                                │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Param Validation│ ─────► Path/query params match schema?    │
│  └─────────┬───────┘        No → 400 Bad Request               │
│            │ Yes                                                │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Body Validation │ ─────► Request body matches schema?       │
│  └─────────┬───────┘        No → 400 Bad Request               │
│            │ Yes                                                │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Route Handler   │ ─────► Process business logic             │
│  └─────────┬───────┘                                           │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Response Valid? │ ─────► (Optional) Response matches schema?│
│  └─────────┬───────┘        No → 500 Internal Error (dev only) │
│            │ Yes                                                │
│            ▼                                                    │
│  HTTP Response Sent                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 4: Reusable Schema Utilities

### 4.1 Schema Building Blocks

```typescript
// From packages/core-openapi/src/schemas.ts

/**
 * Standard error response schema
 */
export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['message', 'statusCode'],
      properties: {
        message: {
          type: 'string',
          description: 'Human-readable error message',
        },
        statusCode: {
          type: 'integer',
          description: 'HTTP status code',
        },
        code: {
          type: 'string',
          description: 'Machine-readable error code (optional)',
        },
        details: {
          type: 'object',
          description: 'Additional error details (optional)',
        },
      },
    },
  },
};

/**
 * Pagination query parameters schema
 */
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
      description: 'Page number (1-indexed)',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Number of items per page',
    },
    sort: {
      type: 'string',
      description: 'Sort field (e.g., "createdAt" or "-createdAt" for descending)',
    },
  },
};

/**
 * Paginated response schema builder
 */
export const paginatedResponseSchema = (itemSchema: any) => ({
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: {
      type: 'array',
      items: itemSchema,
    },
    pagination: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', description: 'Current page number' },
        limit: { type: 'integer', description: 'Items per page' },
        total: { type: 'integer', description: 'Total number of items' },
        totalPages: { type: 'integer', description: 'Total number of pages' },
        hasNext: { type: 'boolean', description: 'Whether there is a next page' },
        hasPrev: { type: 'boolean', description: 'Whether there is a previous page' },
      },
    },
  },
});

/**
 * UUID parameter schema
 */
export const uuidParamSchema = {
  type: 'string',
  format: 'uuid',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  description: 'UUID identifier',
};

/**
 * Idempotency key header schema
 */
export const idempotencyKeyHeaderSchema = {
  type: 'string',
  minLength: 16,
  maxLength: 128,
  description: 'Unique key for idempotent requests (UUID recommended)',
  example: '550e8400-e29b-41d4-a716-446655440000',
};

/**
 * Timestamp schema (ISO 8601)
 */
export const timestampSchema = {
  type: 'string',
  format: 'date-time',
  description: 'ISO 8601 timestamp',
  example: '2025-10-15T10:30:00.000Z',
};
```

### 4.2 Security Schemes

```typescript
/**
 * Security schemes for OpenAPI specs
 */
export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'JWT token authentication',
  },
  apiKey: {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
    description: 'API key for service-to-service authentication',
  },
};
```

---

## Section 5: Event Schema Validation (Projector)

### 5.1 Event Validation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  EVENT VALIDATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Hyperledger Fabric                                             │
│         │                                                       │
│         │ Blockchain Event                                      │
│         │ {eventName, eventVersion, payload, txId, ...}        │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │  Event Stream   │  (Fabric SDK EventListener)               │
│  └─────────┬───────┘                                           │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ Event Validator │  (Ajv JSON Schema validation)             │
│  └─────────┬───────┘                                           │
│            │                                                    │
│       ┌────┴────┐                                               │
│       │         │                                               │
│  Valid?   No ───► Dead Letter Queue (for investigation)        │
│       │                                                         │
│       │ Yes                                                     │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │   Projector     │  Process and update read model            │
│  └─────────┬───────┘                                           │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │  Read Database  │  PostgreSQL (user_profile, wallet, etc.)  │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Event Validator Implementation

```typescript
// From packages/core-events/src/validators/event-validator.ts

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/**
 * EventValidator validates incoming events from Hyperledger Fabric against their schemas.
 *
 * Uses Ajv (Another JSON Validator) for fast, standards-compliant JSON Schema validation.
 * Supports format validation (email, uuid, date-time) and custom error messages.
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
      coerceTypes: false,     // Don't auto-convert types
      useDefaults: false,     // Don't apply default values
      removeAdditional: false, // Don't remove additional properties
      verbose: true,          // Include schema and data in error output
    });

    // Add format validators (email, uuid, date-time, etc.)
    addFormats(this.ajv);
  }

  /**
   * Validate an event against its registered schema.
   */
  public validate<T = unknown>(event: unknown): ValidationResult<BaseEvent<T>> {
    // Type guard: Ensure event is an object
    if (!this.isRecord(event)) {
      return {
        success: false,
        errors: [{
          instancePath: '',
          keyword: 'type',
          message: 'Event must be an object',
        }],
      };
    }

    // Extract event metadata
    const eventName = event.eventName as string;
    const eventVersion = event.eventVersion as string;

    // Validate metadata exists
    if (!eventName || typeof eventName !== 'string') {
      return {
        success: false,
        errors: [{
          instancePath: '/eventName',
          keyword: 'required',
          message: 'Event must have an "eventName" field',
        }],
      };
    }

    // Lookup schema from registry
    const schemaEntry = schemaRegistry.getSchema(eventName, eventVersion);

    if (!schemaEntry) {
      return {
        success: false,
        errors: [{
          instancePath: '',
          keyword: 'schema',
          message: `No schema registered for event: ${eventName}@${eventVersion}`,
        }],
      };
    }

    // Get or compile validator
    const validateFn = this.getValidatorFunction(eventName, eventVersion, schemaEntry.schema);

    // Validate event
    const isValid = validateFn(event);

    if (isValid) {
      return { success: true, data: event as unknown as BaseEvent<T> };
    } else {
      return { success: false, errors: this.formatErrors(validateFn.errors || []) };
    }
  }

  /**
   * Validate an event and throw if validation fails.
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
}

/**
 * Custom error class for validation failures.
 */
export class EventValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'EventValidationError';
    this.errors = errors;
  }

  public getFormattedErrors(): string {
    return this.errors
      .map((err) => `  - ${err.instancePath || 'root'}: ${err.message}`)
      .join('\n');
  }
}

// Export singleton instance
export const eventValidator = new EventValidator();
```

### 5.3 Schema Registry Pattern

```typescript
// packages/core-events/src/registry/schema-registry.ts

interface SchemaEntry {
  schema: JSONSchema;
  metadata: {
    version: string;
    deprecated?: boolean;
    migrateToVersion?: string;
    addedAt: Date;
  };
}

/**
 * SchemaRegistry maintains all event schemas for the GX Protocol.
 *
 * Schemas are registered at startup and used to validate events
 * received from the Hyperledger Fabric blockchain.
 */
export class SchemaRegistry {
  private schemas: Map<string, Map<string, SchemaEntry>> = new Map();

  /**
   * Register a new event schema.
   */
  register(eventName: string, version: string, schema: JSONSchema, options: SchemaOptions = {}): void {
    if (!this.schemas.has(eventName)) {
      this.schemas.set(eventName, new Map());
    }

    this.schemas.get(eventName)!.set(version, {
      schema,
      metadata: {
        version,
        deprecated: options.deprecated || false,
        migrateToVersion: options.migrateToVersion,
        addedAt: new Date(),
      },
    });
  }

  /**
   * Get schema for an event.
   */
  getSchema(eventName: string, version: string): SchemaEntry | undefined {
    return this.schemas.get(eventName)?.get(version);
  }

  /**
   * Get all versions for an event (useful for error messages).
   */
  getVersionsForEvent(eventName: string): string[] {
    return Array.from(this.schemas.get(eventName)?.keys() || []);
  }

  /**
   * Get total count of registered schemas.
   */
  getSchemaCount(): number {
    let count = 0;
    for (const versions of this.schemas.values()) {
      count += versions.size;
    }
    return count;
  }
}

export const schemaRegistry = new SchemaRegistry();
```

### 5.4 Example Event Schema Registration

```typescript
// packages/core-events/src/schemas/user-created.ts

import { schemaRegistry } from '../registry/schema-registry';

const userCreatedSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['eventName', 'eventVersion', 'txId', 'timestamp', 'payload'],
  properties: {
    eventName: { const: 'UserCreated' },
    eventVersion: { const: '1.0' },
    txId: { type: 'string', minLength: 64, maxLength: 64 },
    timestamp: { type: 'string', format: 'date-time' },
    payload: {
      type: 'object',
      required: ['userId', 'nationality', 'age', 'biometricHash'],
      properties: {
        userId: {
          type: 'string',
          format: 'uuid',
          description: 'Unique user identifier',
        },
        nationality: {
          type: 'string',
          minLength: 2,
          maxLength: 2,
          description: 'ISO 3166-1 alpha-2 country code',
        },
        age: {
          type: 'integer',
          minimum: 18,
          maximum: 150,
          description: 'User age at registration',
        },
        biometricHash: {
          type: 'string',
          minLength: 64,
          maxLength: 64,
          description: 'SHA-256 hash of biometric data',
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

// Register schema at module load
schemaRegistry.register('UserCreated', '1.0', userCreatedSchema);

export { userCreatedSchema };
```

---

## Section 6: Error Handling Best Practices

### 6.1 Validation Error Format

```typescript
// Standard validation error response
{
  "error": {
    "message": "Validation failed",
    "statusCode": 400,
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "instancePath": "/email",
        "keyword": "format",
        "message": "must match format \"email\"",
        "params": { "format": "email" }
      },
      {
        "instancePath": "/password",
        "keyword": "minLength",
        "message": "must NOT have fewer than 8 characters",
        "params": { "limit": 8 }
      }
    ]
  }
}
```

### 6.2 Error Handler Middleware

```typescript
// packages/core-http/src/middlewares/error-handler.ts

export const validationErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // OpenAPI validation error
  if (err.status === 400 && err.errors) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: err.errors.map((e: any) => ({
          instancePath: e.path,
          keyword: e.errorCode,
          message: e.message,
          params: e.params,
        })),
      },
    });
  }

  // Authentication error
  if (err.status === 401) {
    return res.status(401).json({
      error: {
        message: err.message || 'Authentication required',
        statusCode: 401,
        code: 'UNAUTHORIZED',
      },
    });
  }

  // Unknown error
  logger.error({ err, path: req.path }, 'Unhandled error');
  return res.status(500).json({
    error: {
      message: 'Internal Server Error',
      statusCode: 500,
    },
  });
};
```

---

## Section 7: API Documentation

### 7.1 Swagger UI Integration

```typescript
// Swagger UI is served at /api-docs by default

// Access interactive documentation:
// - Development: http://localhost:3001/api-docs
// - Production: https://api.gxcoin.money/identity/api-docs

// Features:
// - Try out endpoints directly from the browser
// - View request/response schemas
// - Authentication support (JWT bearer token)
// - Download OpenAPI spec (YAML/JSON)
```

### 7.2 Documentation Best Practices

```yaml
# Good documentation example
paths:
  /api/v1/users/{id}/kyc:
    post:
      summary: Submit KYC verification request
      description: |
        Submits a Know Your Customer (KYC) verification request for a user.

        **Process:**
        1. User uploads identity documents
        2. System validates document format and completeness
        3. Request is queued for manual review
        4. User receives notification of verification status

        **Supported Document Types:**
        - `PASSPORT` - International passport
        - `NATIONAL_ID` - Government-issued national ID
        - `DRIVERS_LICENSE` - Driver's license

        **Rate Limiting:** 60 requests per minute per IP
      operationId: submitKYC
      tags: [KYC]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
          description: User ID
        - name: X-Idempotency-Key
          in: header
          required: true
          schema:
            type: string
            minLength: 16
          description: Idempotency key to prevent duplicate submissions
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/KYCSubmissionRequest'
            example:
              documentType: PASSPORT
              documentNumber: AB123456
              documentImages:
                - https://storage.gxcoin.money/kyc/front-abc123.jpg
                - https://storage.gxcoin.money/kyc/back-abc123.jpg
              expiryDate: "2030-12-31"
      responses:
        '202':
          description: KYC submission accepted for processing
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KYCSubmissionResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '409':
          description: KYC already submitted and pending
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          $ref: '#/components/responses/RateLimited'
```

---

## Section 8: Exercises

### Exercise 1: Create OpenAPI Specification

Write an OpenAPI specification for the `/api/v1/loans` endpoint:
- POST /api/v1/loans/apply - Apply for a loan
- GET /api/v1/loans/my-loans - List current user's loans
- GET /api/v1/loans/:id - Get loan details

Include:
- Request/response schemas
- Authentication requirements
- Error responses
- Examples

### Exercise 2: Implement Event Schema

Create a JSON Schema for the `LoanApplied` event with:
- Required fields: eventName, eventVersion, txId, timestamp
- Payload: loanId, applicantId, amount, purpose, trustScore

### Exercise 3: Add Response Validation

Configure the svc-governance service to validate responses in development mode:
- Enable validateResponses: true
- Handle validation errors gracefully
- Log schema mismatches for debugging

### Exercise 4: Create Custom Schema Validator

Extend the EventValidator to support:
- Custom format validators (e.g., `biometric-hash`)
- Schema deprecation warnings
- Automatic schema version migration

---

## Section 9: Production Checklist

### API Design

- [ ] All endpoints follow REST conventions
- [ ] Consistent naming (plural nouns for collections)
- [ ] Versioned API paths (/api/v1/...)
- [ ] Idempotency keys for all write operations
- [ ] Rate limiting on public endpoints
- [ ] Authentication on protected endpoints

### OpenAPI Specification

- [ ] Complete OpenAPI 3.0+ specification
- [ ] All paths documented with examples
- [ ] Error responses defined for all status codes
- [ ] Security schemes configured
- [ ] Swagger UI accessible in development

### Validation

- [ ] Request validation enabled
- [ ] Response validation in development
- [ ] Event schemas for all blockchain events
- [ ] Schema versioning implemented
- [ ] Validation errors include details

### Documentation

- [ ] Interactive API documentation (Swagger UI)
- [ ] Authentication guide
- [ ] Error code reference
- [ ] Rate limiting documentation
- [ ] Changelog for API changes

---

## Summary

In this lecture, we covered:

1. **RESTful API Design**: Resource hierarchy, HTTP methods, idempotency
2. **OpenAPI Specification**: Document structure, schemas, security
3. **Request Validation**: express-openapi-validator middleware
4. **Reusable Schemas**: Error responses, pagination, common patterns
5. **Event Validation**: JSON Schema with Ajv for blockchain events
6. **Error Handling**: Consistent error format, validation details
7. **Documentation**: Swagger UI, best practices

---

## References

- [OpenAPI Specification 3.0](https://spec.openapis.org/oas/v3.0.3)
- [express-openapi-validator](https://github.com/cdimascio/express-openapi-validator)
- [Ajv JSON Schema Validator](https://ajv.js.org/)
- [JSON Schema Draft-07](https://json-schema.org/specification-links.html#draft-7)
- LECTURE-04: CQRS Pattern Deep Dive
- LECTURE-05: Transactional Outbox Pattern
- LECTURE-06: Event-Driven Projections
