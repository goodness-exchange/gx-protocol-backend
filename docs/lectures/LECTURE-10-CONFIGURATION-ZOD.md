# Lecture 10: Configuration Management with Zod

**Course:** GX Protocol Backend Architecture
**Module:** Application Configuration Patterns
**Duration:** 60 minutes
**Level:** Beginner to Intermediate
**Prerequisites:** TypeScript basics, environment variables understanding

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Part I: Introduction to Configuration Management](#part-i-introduction-to-configuration-management)
3. [Part II: Zod Schema Validation](#part-ii-zod-schema-validation)
4. [Part III: The core-config Package](#part-iii-the-core-config-package)
5. [Part IV: Service-Specific Configuration](#part-iv-service-specific-configuration)
6. [Part V: Type Coercion & Defaults](#part-v-type-coercion--defaults)
7. [Part VI: Validation Patterns](#part-vi-validation-patterns)
8. [Part VII: Production Best Practices](#part-vii-production-best-practices)
9. [Exercises](#exercises)
10. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Explain why runtime configuration validation is critical
2. Use Zod to define type-safe configuration schemas
3. Implement environment variable loading with fallbacks
4. Design service-specific configuration patterns
5. Handle type coercion for process.env values
6. Apply production best practices for secrets management

---

## Part I: Introduction to Configuration Management

### 1.1 The Configuration Problem

Applications need configuration for:
- Database connection strings
- API keys and secrets
- Service ports
- Feature flags
- Logging levels

```
WITHOUT VALIDATION:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  .env:                                                                  │
│  DATABASE_URL=postgre://...  ← Typo! Should be "postgresql://"         │
│  JWT_SECRET=secret123        ← Too short! Security risk                 │
│  PORT=abc                    ← Not a number!                            │
│                                                                         │
│  Runtime:                                                               │
│  const db = new PrismaClient({ url: process.env.DATABASE_URL })         │
│  // Error: Invalid database URL (cryptic Prisma error)                  │
│                                                                         │
│  const port = process.env.PORT                                          │
│  app.listen(port)  // Error: "abc" is not a valid port                  │
│                                                                         │
│  jwt.sign({ }, process.env.JWT_SECRET)                                  │
│  // Works but insecure - no validation of secret strength               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

WITH ZOD VALIDATION:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Application startup:                                                   │
│                                                                         │
│  const configSchema = z.object({                                        │
│    DATABASE_URL: z.string().url().startsWith('postgresql://'),          │
│    JWT_SECRET: z.string().min(32),                                      │
│    PORT: z.coerce.number().int().positive(),                            │
│  });                                                                    │
│                                                                         │
│  const config = configSchema.parse(process.env);                        │
│  // ✅ Throws immediately with clear error:                             │
│  // "DATABASE_URL: Invalid url"                                         │
│  // "JWT_SECRET: String must contain at least 32 character(s)"          │
│  // "PORT: Expected number, received nan"                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Benefits of Schema Validation

| Benefit | Description |
|---------|-------------|
| **Fail Fast** | Invalid config crashes at startup, not at runtime |
| **Type Safety** | TypeScript types derived from schema |
| **Clear Errors** | Human-readable validation messages |
| **Documentation** | Schema serves as config documentation |
| **Defaults** | Centralized default value management |
| **Coercion** | Automatic string-to-number conversion |

### 1.3 Why Zod?

Zod is the best choice for configuration validation because:

```typescript
// 1. Schema-first: Define once, get types for free
const schema = z.object({
  port: z.number(),
  secret: z.string().min(32),
});
type Config = z.infer<typeof schema>; // { port: number; secret: string }

// 2. Runtime validation: Catches errors at startup
const config = schema.parse(process.env); // Throws if invalid

// 3. Great error messages
// "port: Expected number, received string"

// 4. Composable: Combine schemas
const fullConfig = baseSchema.merge(serviceSchema);

// 5. Type coercion: Handle process.env strings
z.coerce.number().parse("3001"); // Returns 3001 (number)
```

---

## Part II: Zod Schema Validation

### 2.1 Basic Types

```typescript
import { z } from 'zod';

// Primitives
z.string()           // Validates string
z.number()           // Validates number
z.boolean()          // Validates boolean
z.bigint()           // Validates BigInt
z.date()             // Validates Date

// Strings with constraints
z.string().min(1)                    // Non-empty string
z.string().min(32)                   // Minimum length
z.string().max(100)                  // Maximum length
z.string().email()                   // Email format
z.string().url()                     // URL format
z.string().uuid()                    // UUID format
z.string().startsWith('postgresql://') // Starts with

// Numbers with constraints
z.number().int()                     // Integer only
z.number().positive()                // > 0
z.number().min(1000).max(65535)      // Port range

// Enums
z.enum(['development', 'production', 'test'])
```

### 2.2 Type Coercion

`process.env` values are **always strings**. Zod's `coerce` handles conversion:

```typescript
// Without coercion (fails)
z.number().parse("3001");  // Error: Expected number, received string

// With coercion (works)
z.coerce.number().parse("3001");  // Returns 3001 (number)

// Boolean coercion
z.coerce.boolean().parse("true");   // true
z.coerce.boolean().parse("false");  // true (non-empty string is truthy!)

// Better boolean handling
z.string().transform(val => val === 'true').parse("true");  // true
z.string().transform(val => val === 'true').parse("false"); // false
```

### 2.3 Default Values

```typescript
const schema = z.object({
  // Default applied if undefined
  PORT: z.coerce.number().default(3001),

  // Default with type
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Optional (allows undefined)
  DEBUG: z.string().optional(),

  // Nullable (allows null)
  DEPRECATED_FLAG: z.string().nullable(),
});
```

### 2.4 Object Schemas

```typescript
const configSchema = z.object({
  // Required fields (will throw if missing)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Optional with default
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Parse and validate
const config = configSchema.parse(process.env);
// config.DATABASE_URL: string
// config.JWT_SECRET: string
// config.PORT: number
// config.LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'
```

### 2.5 Error Handling

```typescript
try {
  const config = configSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Configuration validation failed:');
    for (const issue of error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
}

// Output:
// Configuration validation failed:
//   DATABASE_URL: DATABASE_URL is required
//   JWT_SECRET: JWT_SECRET must be at least 32 characters
```

---

## Part III: The core-config Package

### 3.1 Package Purpose

The `@gx/core-config` package provides:
- Environment file loading (`.env`)
- Base configuration schema
- Type-safe exports
- Shared across all services

### 3.2 Implementation

```typescript
// packages/core-config/src/index.ts

import dotenv from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Try to load .env from multiple possible locations
const possibleEnvPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
];

for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`[core-config] Loaded environment from: ${envPath}`);
      break;
    }
  }
}

/**
 * Base environment schema shared across all services
 */
const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Infrastructure URLs
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Service Ports (coerce string to number)
  IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(3001),
  TOKENOMICS_SERVICE_PORT: z.coerce.number().int().positive().default(3002),

  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
});

/**
 * Type-safe, validated configuration object
 *
 * Throws at startup if environment variables are invalid
 */
export const config = envSchema.parse(process.env);

// Export inferred type for use in services
export type AppConfig = z.infer<typeof envSchema>;
```

### 3.3 Multi-Path Loading

The package tries multiple paths for `.env` to handle:

```
MONOREPO STRUCTURE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  gx-protocol-backend/                                                   │
│  ├── .env                    ← Root .env file                           │
│  ├── apps/                                                              │
│  │   └── svc-identity/                                                  │
│  │       └── src/            ← process.cwd() when running dev           │
│  └── packages/                                                          │
│      └── core-config/                                                   │
│          └── src/            ← __dirname location                       │
│                                                                         │
│  Path resolution:                                                       │
│  1. process.cwd()/.env       → /gx-protocol-backend/apps/svc-identity/.env
│  2. process.cwd()/../../.env → /gx-protocol-backend/.env ✅             │
│  3. __dirname/../../../.env  → /gx-protocol-backend/.env (fallback)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part IV: Service-Specific Configuration

### 4.1 Pattern: Extend Base Config

Each service extends the base config with service-specific fields:

```typescript
// apps/svc-identity/src/config.ts

import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

/**
 * Identity Service configuration schema
 */
const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().min(1000).max(65535).default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration (from core-config)
  databaseUrl: z.string().url().startsWith('postgresql://'),

  // Redis Configuration (from core-config)
  redisUrl: z.string().url().startsWith('redis://'),

  // JWT Authentication (service-specific)
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('24h'),
  jwtRefreshExpiresIn: z.string().default('7d'),

  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Idempotency (service-specific feature)
  enableIdempotency: z.coerce.boolean().default(true),
  idempotencyTtlHours: z.coerce.number().default(24),

  // Projection Lag (CQRS health check)
  projectionLagThresholdMs: z.coerce.number().default(5000),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000),
  rateLimitMaxRequests: z.coerce.number().default(100),
});

/**
 * Type-safe configuration type
 */
export type IdentityConfig = z.infer<typeof configSchema>;

/**
 * Validated configuration object
 *
 * Merges values from:
 * 1. core-config (shared environment loading)
 * 2. process.env (direct access)
 * 3. defaults (from schema)
 */
export const identityConfig: IdentityConfig = configSchema.parse({
  port: process.env.IDENTITY_SERVICE_PORT || process.env.PORT || 3001,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRY || '24h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  enableIdempotency: process.env.ENABLE_IDEMPOTENCY !== 'false',
  idempotencyTtlHours: Number(process.env.IDEMPOTENCY_TTL_HOURS) || 24,
  projectionLagThresholdMs: Number(process.env.PROJECTION_LAG_THRESHOLD_MS) || 5000,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
});
```

### 4.2 Usage in Service

```typescript
// apps/svc-identity/src/index.ts

import express from 'express';
import { identityConfig } from './config';

const app = express();

// Type-safe access to configuration
app.listen(identityConfig.port, () => {
  console.log(`Identity service running on port ${identityConfig.port}`);
  console.log(`Environment: ${identityConfig.nodeEnv}`);
  console.log(`Log level: ${identityConfig.logLevel}`);
  console.log(`Idempotency: ${identityConfig.enableIdempotency ? 'enabled' : 'disabled'}`);
});
```

---

## Part V: Type Coercion & Defaults

### 5.1 The process.env Problem

All `process.env` values are strings:

```typescript
process.env.PORT;          // "3001" (string)
process.env.ENABLE_CACHE;  // "true" (string, not boolean!)
process.env.TIMEOUT;       // "5000" (string, not number!)
```

### 5.2 Coercion Patterns

```typescript
// Numbers
z.coerce.number().parse("3001");         // 3001
z.coerce.number().int().parse("3001.5"); // 3001 (truncated)
z.coerce.number().parse("abc");          // NaN (then fails validation)

// Better number handling with fallback
const portSchema = z.coerce.number()
  .int()
  .min(1000)
  .max(65535)
  .default(3001);

portSchema.parse("8080");     // 8080
portSchema.parse(undefined);  // 3001 (default)
portSchema.parse("");         // Error: Expected number
```

### 5.3 Boolean Coercion

```typescript
// DANGER: z.coerce.boolean() has unexpected behavior!
z.coerce.boolean().parse("false");  // true! (non-empty string is truthy)
z.coerce.boolean().parse("");        // false

// Better approach: explicit comparison
const booleanFromString = z.string()
  .transform(val => val.toLowerCase() === 'true')
  .default('false');

// Or use environment variable patterns
const enableIdempotency = process.env.ENABLE_IDEMPOTENCY !== 'false';
// - If undefined: !== 'false' → true (default enabled)
// - If "true": !== 'false' → true
// - If "false": !== 'false' → false
```

### 5.4 Duration Strings

```typescript
// Parse duration strings like "24h", "7d", "30m"
const durationSchema = z.string().regex(
  /^\d+[smhd]$/,
  'Duration must be in format: 30s, 15m, 24h, or 7d'
);

durationSchema.parse("24h");  // Valid
durationSchema.parse("7d");   // Valid
durationSchema.parse("30");   // Error: Invalid format
```

---

## Part VI: Validation Patterns

### 6.1 URL Validation

```typescript
// Basic URL
z.string().url();

// PostgreSQL connection string
z.string()
  .url()
  .startsWith('postgresql://')
  .describe('PostgreSQL connection URL');

// Redis connection string
z.string()
  .url()
  .startsWith('redis://');

// Allow non-standard URLs (connection strings with special chars)
z.string().min(1, 'DATABASE_URL is required');
```

### 6.2 Secret Validation

```typescript
// Minimum length for security
const jwtSecretSchema = z.string()
  .min(32, 'JWT_SECRET must be at least 32 characters for security');

// API key format
const apiKeySchema = z.string()
  .regex(/^gx_[a-zA-Z0-9]{32}$/, 'Invalid API key format');

// Password complexity (for admin passwords)
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase letter')
  .regex(/[a-z]/, 'Password must contain lowercase letter')
  .regex(/[0-9]/, 'Password must contain number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain special character');
```

### 6.3 Conditional Validation

```typescript
// Feature flag dependencies
const configSchema = z.object({
  enableCache: z.coerce.boolean().default(false),
  cacheUrl: z.string().optional(),
}).refine(
  (data) => !data.enableCache || data.cacheUrl,
  {
    message: 'cacheUrl is required when enableCache is true',
    path: ['cacheUrl'],
  }
);

// Environment-specific validation
const config = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']),
  sslEnabled: z.coerce.boolean(),
}).refine(
  (data) => data.nodeEnv !== 'production' || data.sslEnabled,
  {
    message: 'SSL must be enabled in production',
    path: ['sslEnabled'],
  }
);
```

### 6.4 Custom Error Messages

```typescript
const configSchema = z.object({
  DATABASE_URL: z.string({
    required_error: 'DATABASE_URL environment variable is required',
    invalid_type_error: 'DATABASE_URL must be a string',
  }).min(1, 'DATABASE_URL cannot be empty'),

  PORT: z.coerce.number({
    invalid_type_error: 'PORT must be a valid number',
  }).int('PORT must be an integer')
    .min(1000, 'PORT must be >= 1000')
    .max(65535, 'PORT must be <= 65535'),
});
```

---

## Part VII: Production Best Practices

### 7.1 Never Commit Secrets

```gitignore
# .gitignore
.env
.env.local
.env.*.local
*.pem
*.key
```

### 7.2 Use Environment Templates

```bash
# .env.example (committed to git)
# GX Protocol Backend Environment Variables
# Copy to .env and fill in values

# Environment
NODE_ENV=development
LOG_LEVEL=info

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/gx_protocol

# Redis
REDIS_URL=redis://localhost:6379

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=your-32-character-minimum-secret-here
```

### 7.3 Kubernetes ConfigMaps and Secrets

```yaml
# k8s/config/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  IDENTITY_SERVICE_PORT: "3001"

---
# k8s/config/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: backend-secrets
type: Opaque
data:
  # Base64 encoded values
  DATABASE_URL: cG9zdGdyZXNxbDovLy4uLg==
  JWT_SECRET: eW91ci0zMi1jaGFyYWN0ZXItc2VjcmV0
```

### 7.4 Startup Validation

```typescript
// Validate configuration at startup before anything else
try {
  const config = configSchema.parse(process.env);
  console.log('[config] Configuration validated successfully');
  console.log(`[config] Environment: ${config.nodeEnv}`);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('[config] Configuration validation failed:');
    console.error(error.format());
    process.exit(1);  // Fail fast with non-zero exit code
  }
  throw error;
}
```

### 7.5 Sensitive Value Logging

```typescript
// Never log secrets!
function logConfig(config: AppConfig) {
  const safeConfig = {
    ...config,
    jwtSecret: '[REDACTED]',
    databaseUrl: config.databaseUrl.replace(/:([^@]+)@/, ':***@'),
  };
  console.log('[config] Loaded configuration:', safeConfig);
}
```

---

## Exercises

### Exercise 1: Basic Schema

Create a Zod schema for a notification service with:
- `SMTP_HOST`: Required string
- `SMTP_PORT`: Number, default 587
- `SMTP_USER`: Required string
- `SMTP_PASS`: Required string, minimum 8 characters
- `SMTP_SECURE`: Boolean, default true in production

### Exercise 2: Validation Refinement

Add validation to ensure:
- `SMTP_PORT` is either 25, 465, or 587
- `SMTP_SECURE` is true when `SMTP_PORT` is 465

### Exercise 3: Error Handling

Implement a configuration loader that:
1. Attempts to parse configuration
2. On failure, logs each error with helpful context
3. Exits with status code 1
4. Never exposes secrets in error messages

### Exercise 4: Testing Configuration

Write unit tests that verify:
1. Valid configuration passes
2. Missing required fields fail with clear messages
3. Invalid types fail with clear messages
4. Defaults are applied correctly

---

## Further Reading

### Official Documentation

- **Zod:** https://zod.dev/
- **dotenv:** https://www.npmjs.com/package/dotenv

### Articles

- **12-Factor App Config:** https://12factor.net/config
- **Configuration Best Practices:** https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/

### Related GX Protocol Documentation

- **LECTURE-09:** Monorepo Architecture with Turborepo
- **packages/core-config/src/index.ts** (source code)

---

## Summary

In this lecture, we covered:

1. **Configuration Problems:** Silent failures, type mismatches, security risks
2. **Zod Basics:** Types, coercion, defaults, objects
3. **core-config Package:** Shared environment loading
4. **Service Configuration:** Extending base config with service-specific fields
5. **Type Coercion:** Handling process.env string values
6. **Validation Patterns:** URLs, secrets, conditional validation
7. **Production Practices:** Secrets management, Kubernetes, logging

**Key Takeaways:**

- Always validate configuration at startup
- Use `z.coerce` for process.env values
- Be careful with boolean coercion
- Never commit secrets to git
- Fail fast with clear error messages
- Type-safe config prevents runtime errors

---

**End of Lecture 10**

---

## What's Next?

This completes the foundational lecture series (01-10). Future lectures will cover:

- **LECTURE-11:** Smart Contract Architecture (7 Contracts, 38 Functions)
- **LECTURE-12:** Attribute-Based Access Control (ABAC)
- **LECTURE-13:** Genesis Distribution & Tokenomics
- **LECTURE-14:** Multi-Signature Transaction Approval
- **LECTURE-15:** On-Chain Governance & Voting
- **LECTURE-16:** Progressive Registration Flow
- **LECTURE-17:** KYC/KYR Identity Management
- ...and more

These advanced topics will build on the foundation established in lectures 01-10.
