# @gx/core-openapi

OpenAPI validation utilities and schema builders for the GX Coin Protocol backend services.

## Features

- ✅ **OpenAPI 3.0 Validation** - Automatic request/response validation
- ✅ **Swagger UI Integration** - Interactive API documentation
- ✅ **Schema Builders** - Reusable schema definitions for common patterns
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Production Ready** - Configurable validation with performance options

## Installation

This package is part of the monorepo and installed automatically via workspace dependencies.

## Usage

### Basic Setup

```typescript
import express from 'express';
import path from 'path';
import { applyOpenApiMiddleware } from '@gx/core-openapi';

const app = express();

// Path to your OpenAPI spec file
const specPath = path.join(__dirname, 'openapi.yaml');

// Apply OpenAPI middleware
applyOpenApiMiddleware(app, {
  apiSpecPath: specPath,
  validateRequests: true,
  validateResponses: process.env.NODE_ENV === 'development',
});

// Your routes here
app.use('/api/v1', routes);

app.listen(3000);
```

### Advanced Configuration

```typescript
import { applyOpenApiMiddleware, OpenApiMiddlewareOptions } from '@gx/core-openapi';

const options: OpenApiMiddlewareOptions = {
  // Required: Path to OpenAPI spec
  apiSpecPath: path.join(__dirname, 'openapi.yaml'),
  
  // Optional: Swagger UI path (default: /api-docs)
  docsPath: '/api-docs',
  
  // Optional: Validate requests (default: true)
  validateRequests: true,
  
  // Optional: Validate responses (default: false)
  // Enable in development to catch schema drift
  validateResponses: process.env.NODE_ENV === 'development',
  
  // Optional: Enable Swagger UI (default: true)
  // Disable in production if you don't want to expose docs
  enableSwaggerUI: process.env.NODE_ENV !== 'production',
};

applyOpenApiMiddleware(app, options);
```

## OpenAPI Spec Example

Create an `openapi.yaml` file in your service:

```yaml
openapi: 3.0.0
info:
  title: GX Coin Identity Service API
  version: 1.0.0
  description: User identity and KYC management

servers:
  - url: http://localhost:3001/api/v1
    description: Development server

paths:
  /users:
    post:
      summary: Create a new user
      operationId: createUser
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - firstName
                - lastName
                - email
              properties:
                firstName:
                  type: string
                  minLength: 1
                lastName:
                  type: string
                  minLength: 1
                email:
                  type: string
                  format: email
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    format: uuid
                  firstName:
                    type: string
                  lastName:
                    type: string
                  email:
                    type: string
        '400':
          $ref: '#/components/responses/BadRequest'

components:
  responses:
    BadRequest:
      description: Bad Request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
  
  schemas:
    Error:
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
            statusCode:
              type: integer
```

## Using Schema Builders

The package provides reusable schema definitions:

```typescript
import {
  errorResponseSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  commonResponses,
  uuidParamSchema,
  idempotencyKeyHeaderSchema,
  timestampSchema,
  securitySchemes,
} from '@gx/core-openapi';

// In your OpenAPI spec (or when building specs programmatically):

// 1. Error responses
const spec = {
  components: {
    schemas: {
      Error: errorResponseSchema,
    },
    responses: commonResponses, // 400, 401, 403, 404, 409, 422, 500, 503
    securitySchemes: securitySchemes, // bearerAuth, apiKey
  },
};

// 2. Pagination
const usersListPath = {
  get: {
    parameters: [
      {
        in: 'query',
        name: 'page',
        schema: paginationQuerySchema.properties.page,
      },
      {
        in: 'query',
        name: 'limit',
        schema: paginationQuerySchema.properties.limit,
      },
    ],
    responses: {
      '200': {
        description: 'List of users',
        content: {
          'application/json': {
            schema: paginatedResponseSchema({
              type: 'object',
              properties: {
                id: uuidParamSchema,
                name: { type: 'string' },
                createdAt: timestampSchema,
              },
            }),
          },
        },
      },
    },
  },
};

// 3. UUID parameters
const userByIdPath = {
  parameters: [
    {
      in: 'path',
      name: 'id',
      required: true,
      schema: uuidParamSchema,
    },
  ],
};

// 4. Idempotency headers for write operations
const createUserPath = {
  post: {
    parameters: [
      {
        in: 'header',
        name: 'X-Idempotency-Key',
        required: true,
        schema: idempotencyKeyHeaderSchema,
      },
    ],
  },
};
```

## Validation Error Handling

OpenAPI validation errors are automatically caught by your error handler:

```typescript
import { errorHandler } from '@gx/core-http';

// OpenAPI middleware
applyOpenApiMiddleware(app, options);

// Your routes
app.use('/api/v1', routes);

// Error handler (MUST be last)
app.use(errorHandler);
```

Example validation error response:

```json
{
  "error": {
    "message": "request.body.email should match format \"email\"",
    "statusCode": 400,
    "errors": [
      {
        "path": ".body.email",
        "message": "should match format \"email\"",
        "errorCode": "format.openapi.validation"
      }
    ]
  }
}
```

## Accessing Swagger UI

Once configured, Swagger UI is available at the specified path (default: `/api-docs`):

```
http://localhost:3001/api-docs
```

This provides:
- Interactive API documentation
- Try-it-out functionality
- Request/response examples
- Schema documentation

## Schema Builder Reference

### `errorResponseSchema`
Standard error response format used across all services.

### `paginatedResponseSchema(itemSchema)`
Creates a paginated response with metadata.

**Parameters:**
- `itemSchema` - Schema for individual items in the results array

**Returns:**
```typescript
{
  data: Array<itemSchema>,
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean,
  }
}
```

### `paginationQuerySchema`
Query parameters for paginated endpoints:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sort` - Sort field with optional `-` prefix for descending

### `commonResponses`
Pre-built response objects for common HTTP status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `500` - Internal Server Error
- `503` - Service Unavailable

### `securitySchemes`
Authentication schemes:
- `bearerAuth` - JWT Bearer token authentication
- `apiKey` - API key in `X-API-Key` header

### `uuidParamSchema`
UUID format validation for path/query parameters.

### `idempotencyKeyHeaderSchema`
Validation for idempotency keys (16-128 characters).

### `timestampSchema`
ISO 8601 date-time format.

## Production Considerations

### Performance

```typescript
// Disable response validation in production
applyOpenApiMiddleware(app, {
  apiSpecPath: specPath,
  validateRequests: true,
  validateResponses: false, // Disable in production
});
```

### Security

```typescript
// Disable Swagger UI in production
applyOpenApiMiddleware(app, {
  apiSpecPath: specPath,
  enableSwaggerUI: process.env.NODE_ENV !== 'production',
});
```

### Error Messages

Validation errors include detailed information about what failed. In production, you may want to sanitize these messages in your error handler.

## Testing

```typescript
import request from 'supertest';
import express from 'express';
import { applyOpenApiMiddleware } from '@gx/core-openapi';

describe('OpenAPI Validation', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    applyOpenApiMiddleware(app, {
      apiSpecPath: path.join(__dirname, 'test-spec.yaml'),
    });

    app.post('/api/v1/users', (req, res) => {
      res.status(201).json({ id: '123', ...req.body });
    });
  });

  it('should validate request body', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ firstName: 'John' }); // Missing required 'lastName'

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('lastName');
  });

  it('should accept valid request', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe('John');
  });
});
```

## Best Practices

1. **✅ Keep specs in sync** - Update OpenAPI spec when changing APIs
2. **✅ Use schema references** - Reuse common schemas via `$ref`
3. **✅ Validate in development** - Enable response validation to catch bugs
4. **✅ Document examples** - Include request/response examples in spec
5. **✅ Version your APIs** - Use `/api/v1` prefix for versioning
6. **✅ Use standard errors** - Leverage `commonResponses` for consistency
7. **✅ Secure endpoints** - Define security requirements in spec
8. **✅ Test against spec** - Write integration tests using the OpenAPI spec

## Troubleshooting

### Spec file not found
```
Error: OpenAPI spec file not found at: /path/to/spec.yaml
```
**Solution:** Ensure the path is absolute and the file exists.

### Validation not working
**Solution:** Make sure OpenAPI middleware is applied BEFORE your routes but AFTER body parser.

### Swagger UI not showing
**Solution:** Check that `enableSwaggerUI` is `true` and visit the correct path (default: `/api-docs`).

## License

Private - GX Coin Protocol
