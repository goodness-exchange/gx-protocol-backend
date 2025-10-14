# @gx/core-http

Shared HTTP middlewares and utilities for the GX Coin Protocol backend services.

## Installation

This package is part of the monorepo and installed automatically via workspace dependencies.

## Features

- ✅ **Error Handling** - Centralized error handling with proper status codes
- ✅ **Request Logging** - Structured logging with pino-http
- ✅ **Idempotency** - Exactly-once semantics for write operations
- ✅ **Health Checks** - Liveness and readiness probes for Kubernetes
- ✅ **Metrics** - Prometheus metrics for observability

## Usage

### Basic Express Server Setup

```typescript
import express from 'express';
import {
  requestLogger,
  errorHandler,
  healthzHandler,
  readyzHandler,
  metricsMiddleware,
} from '@gx/core-http';

const app = express();

// 1. Metrics (should be first to track all requests)
app.use(metricsMiddleware);

// 2. Request logging
app.use(requestLogger);

// 3. Health checks
app.get('/healthz', healthzHandler());
app.get('/readyz', readyzHandler({
  maxProjectionLagMs: 5000,
  checks: {
    database: async () => ({
      status: 'healthy',
      message: 'Database connection ok',
    }),
  },
}));

// 4. Body parser
app.use(express.json());

// 5. Your routes here
app.use('/api', apiRoutes);

// 6. Error handler (must be last)
app.use(errorHandler);

app.listen(3000);
```

### Error Handling

Throw errors with custom status codes:

```typescript
import { Request, Response, NextFunction } from 'express';

class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json(user);
  } catch (error) {
    next(error); // Will be caught by errorHandler
  }
});
```

### Idempotency Middleware

For write operations (POST, PUT, PATCH, DELETE):

```typescript
import {
  idempotencyMiddleware,
  InMemoryIdempotencyStore,
} from '@gx/core-http';

// For development (in-memory store)
const idempotencyStore = new InMemoryIdempotencyStore();

app.use('/api', idempotencyMiddleware({
  store: idempotencyStore,
  ttl: 86400, // 24 hours
  required: true, // Reject requests without X-Idempotency-Key header
}));

// Client usage:
// POST /api/users
// Headers:
//   X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
//   Content-Type: application/json
// Body: { "name": "John Doe" }
```

For production, implement a database-backed store:

```typescript
import { IdempotencyStore, CachedResponse } from '@gx/core-http';
import { prisma } from '@gx/core-db';

class DatabaseIdempotencyStore implements IdempotencyStore {
  async get(key: string): Promise<CachedResponse | null> {
    const entry = await prisma.httpIdempotency.findUnique({
      where: { 
        tenantId_method_path_bodyHash: {
          tenantId: 'default',
          method: 'POST',
          path: '/api/users',
          bodyHash: key,
        }
      },
    });

    if (!entry) return null;

    // Check TTL expiration
    if (entry.ttlExpiresAt && entry.ttlExpiresAt < new Date()) {
      await prisma.httpIdempotency.delete({ where: { id: entry.id } });
      return null;
    }

    return {
      statusCode: entry.statusCode,
      headers: entry.responseHeaders as Record<string, string>,
      body: entry.responseBody,
    };
  }

  async set(
    key: string,
    response: CachedResponse,
    ttlSeconds: number
  ): Promise<void> {
    const ttlExpiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await prisma.httpIdempotency.create({
      data: {
        tenantId: 'default',
        method: 'POST',
        path: '/api/users',
        bodyHash: key,
        statusCode: response.statusCode,
        responseHeaders: response.headers,
        responseBody: response.body,
        ttlExpiresAt,
      },
    });
  }
}
```

### Health Checks with Projection Lag

For CQRS systems, readiness should check projection lag:

```typescript
import { readyzHandler, createDatabaseHealthCheck } from '@gx/core-http';
import { prisma } from '@gx/core-db';

// Function to get current projection lag
async function getProjectionLag(): Promise<number> {
  const projectorState = await prisma.projectorState.findFirst({
    where: { projectorName: 'main' },
  });

  if (!projectorState) return 0;

  // Calculate lag based on last processed block timestamp
  const now = Date.now();
  const lastProcessedTime = projectorState.updatedAt.getTime();
  return now - lastProcessedTime;
}

app.get('/readyz', readyzHandler({
  maxProjectionLagMs: 5000, // Fail if lag > 5 seconds
  getProjectionLag,
  checks: {
    database: createDatabaseHealthCheck(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    }),
  },
}));
```

### Prometheus Metrics

Metrics are automatically exposed at `/metrics`:

```typescript
import { createMetricsMiddleware } from '@gx/core-http';

app.use(createMetricsMiddleware({
  metricsPath: '/metrics',
  prefix: 'gx_identity_',
  customLabels: {
    service: 'identity',
    version: '1.0.0',
  },
}));
```

Available metrics:
- `http_request_duration_seconds` - Request duration histogram
- `http_request_length_bytes` - Request size histogram
- `http_response_length_bytes` - Response size histogram
- `http_requests_total` - Total request counter
- `nodejs_*` - Default Node.js metrics (memory, CPU, etc.)

## API Reference

### Middlewares

#### `requestLogger`
Structured request/response logging using pino-http.

#### `errorHandler`
Centralized error handling with proper HTTP status codes.

#### `idempotencyMiddleware(options)`
Exactly-once semantics for write operations.

**Options:**
- `store: IdempotencyStore` - Storage backend (required)
- `ttl?: number` - TTL in seconds (default: 86400)
- `methods?: string[]` - HTTP methods to apply to (default: ['POST', 'PUT', 'PATCH', 'DELETE'])
- `required?: boolean` - Require idempotency key (default: true)
- `headerName?: string` - Custom header name (default: 'X-Idempotency-Key')

#### `healthzHandler()`
Liveness probe handler. Returns 200 if service is alive.

#### `readyzHandler(options)`
Readiness probe handler. Returns 200 if service is ready.

**Options:**
- `checks?: Record<string, HealthCheckFn>` - Custom health checks
- `maxProjectionLagMs?: number` - Max projection lag (default: 5000ms)
- `getProjectionLag?: () => Promise<number>` - Function to get current lag

#### `metricsMiddleware`
Prometheus metrics middleware (default configuration).

#### `createMetricsMiddleware(options)`
Create custom Prometheus metrics middleware.

**Options:**
- `metricsPath?: string` - Metrics endpoint (default: '/metrics')
- `collectDefaultMetrics?: boolean` - Collect Node.js metrics (default: true)
- `prefix?: string` - Metric name prefix (default: 'http_')
- `customLabels?: Record<string, string>` - Additional labels

### Interfaces

#### `IdempotencyStore`
```typescript
interface IdempotencyStore {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, response: CachedResponse, ttlSeconds: number): Promise<void>;
}
```

#### `HealthCheckFn`
```typescript
type HealthCheckFn = () => Promise<HealthCheckResult>;

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
}
```

## Production Considerations

### Idempotency
- ✅ Use database or Redis-backed store (not in-memory)
- ✅ Set appropriate TTL based on your use case
- ✅ Include tenant ID in composite key for multi-tenancy
- ✅ Hash request body to detect duplicate requests

### Health Checks
- ✅ Configure appropriate projection lag threshold
- ✅ Add checks for critical dependencies (database, Redis, Fabric)
- ✅ Use `/healthz` for liveness, `/readyz` for readiness
- ✅ Don't check external dependencies in liveness probe

### Metrics
- ✅ Use proper metric prefixes per service
- ✅ Normalize paths to avoid high cardinality
- ✅ Set appropriate bucket sizes for histograms
- ✅ Add custom labels for version, environment, etc.

### Error Handling
- ✅ Use custom error classes with `statusCode` property
- ✅ Never expose internal errors to clients (use 500)
- ✅ Log full error context for debugging
- ✅ Use proper HTTP status codes (400, 401, 403, 404, 409, 422, 500, 503)

## Testing

```typescript
import request from 'supertest';
import express from 'express';
import { errorHandler, healthzHandler } from '@gx/core-http';

describe('Health Checks', () => {
  const app = express();
  app.get('/healthz', healthzHandler());
  app.use(errorHandler);

  it('should return 200 for liveness', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

## License

Private - GX Coin Protocol
