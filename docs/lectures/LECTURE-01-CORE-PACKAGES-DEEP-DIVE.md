# 📚 Lecture 01: Core Packages Architecture Deep Dive

**Topic**: Task 0.2 - Core Packages Implementation  
**Date**: October 15, 2025  
**Lecture Type**: Implementation Analysis & Architectural Reflection

---

## 🎯 What We Built

We implemented **5 foundational packages** that provide shared infrastructure for all microservices:

```
packages/
├── core-config/       # Environment configuration with runtime validation
├── core-logger/       # Structured logging with Pino
├── core-db/           # Prisma ORM client with singleton pattern
├── core-http/         # Express middleware suite
└── core-openapi/      # API validation and documentation
```

**Key Achievement**: These packages establish **horizontal infrastructure** - code that EVERY service will depend on.

---

## 🧠 Architectural Patterns & Decisions

### Pattern 1: The Singleton Pattern

**Where Used**: `core-logger`, `core-db`

**Implementation**:
```typescript
// core-db/src/index.ts
declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
```

**Why This Approach?**

1. **Problem**: In development with hot-reloading, creating new `PrismaClient` instances on every reload exhausts database connections
2. **Solution**: Store instance in `globalThis` (survives hot-reloads in Node.js)
3. **Gotcha**: Only in dev/test - production creates fresh instance per process

**Alternative Approaches**:

| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| **Singleton (Our Choice)** | - No connection exhaustion<br>- Single source of truth | - Global state (harder to test)<br>- Not thread-safe (but Node.js is single-threaded) | Node.js apps with hot-reload |
| **Factory Pattern** | - Testable (inject dependencies)<br>- Multiple instances if needed | - Manual lifecycle management<br>- Complexity | Libraries, SDKs |
| **Instance per Request** | - Clean separation<br>- Easy to test | - Connection pool exhaustion<br>- Slower | Short-lived processes |

**Key Insight**: The `globalThis` trick is Node.js-specific and solves a very real problem in development. Production doesn't need it because there's no hot-reload.

---

### Pattern 2: Fail-Fast Configuration

**Where Used**: `core-config`

**Implementation**:
```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

export const config = envSchema.parse(process.env);
//                             ^^^^^ Throws if invalid!
```

**Why This Approach?**

1. **Problem**: App starts with missing/invalid config → crashes later in production with cryptic errors
2. **Solution**: Validate ALL config at startup → crash immediately with clear error message
3. **Philosophy**: "Fail fast, fail loud"

**What Happens on Startup**:

```
✅ Good Config:
  DATABASE_URL=postgresql://localhost:5432/db
  JWT_SECRET=supersecretkeythatisverylongandcomplex
  → App starts successfully

❌ Bad Config:
  DATABASE_URL=invalid-url
  JWT_SECRET=short
  → ZodError: [
      {
        "path": ["DATABASE_URL"],
        "message": "Invalid url"
      },
      {
        "path": ["JWT_SECRET"],
        "message": "String must contain at least 32 character(s)"
      }
    ]
  → App CRASHES (good! Don't want half-configured app in prod)
```

**Alternative Approaches**:

| Approach | Validation Time | Error Discovery | Best For |
|----------|----------------|-----------------|----------|
| **Runtime Validation (Zod)** ✅ | Startup | Immediate | Production apps |
| **TypeScript Only** | Compile time | Only type errors | Type safety, not value validation |
| **Manual Checks** | On first use | Delayed | Quick prototypes |
| **Environment-specific configs** | Build time | CI/CD | Static configs |

**Design Decision**: We chose **Zod over TypeScript-only** because:
- TypeScript validates types: `DATABASE_URL: string` ✅
- But can't validate VALUES: `DATABASE_URL = "not-a-url"` ❌ (TypeScript says OK, Zod catches it)

---

### Pattern 3: Environment-Aware Behavior

**Where Used**: `core-logger`, `core-db`, `core-openapi`

**Implementation**:
```typescript
// core-logger/src/index.ts
if (config.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',  // Human-readable colors
  };
}
// Production: JSON output for machine parsing
```

**The Two Modes**:

```
DEVELOPMENT:
  ┌─────────────────────────────────────┐
  │ [10:30:00] INFO: User created       │
  │   userId: "123"                     │
  │   email: "alice@example.com"        │
  └─────────────────────────────────────┘
  (Pretty, colored, human-readable)

PRODUCTION:
  {"level":30,"time":1697376600000,"msg":"User created","userId":"123","email":"alice@example.com"}
  (JSON, parseable by log aggregators like ELK/Datadog)
```

**Why Different Behaviors?**

| Aspect | Development | Production |
|--------|-------------|------------|
| **Log Format** | Pretty print | JSON |
| **Query Logging** | Enabled | Disabled (performance) |
| **Response Validation** | Enabled | Disabled (trust our code) |
| **Swagger UI** | Enabled | Disabled (security) |
| **Error Details** | Full stack traces | Sanitized messages |

**Key Insight**: Production optimizes for **performance & security**. Development optimizes for **developer experience**.

---

### Pattern 4: Composite Key Generation

**Where Used**: `core-http/middlewares/idempotency.ts`

**Implementation**:
```typescript
const compositeKey = `${tenantId}:${req.method}:${req.path}:${bodyHash}:${idempotencyKey}`;
// Example: "tenant-1:POST:/api/v1/transfers:a3f2b8c9:550e8400-..."
```

**Why Composite Keys?**

**Naive Approach** (Just idempotency key):
```typescript
const key = idempotencyKey; // "abc-123"
```

**Problem Scenarios**:

| Scenario | User Input | Result | Issue |
|----------|-----------|--------|-------|
| Same user, same request | `key: "abc-123"`<br>`POST /transfers {amount: 100}` | ✅ Deduplicated | Good! |
| **Different tenant, same key** | Tenant A: `key: "abc-123"`<br>Tenant B: `key: "abc-123"` | ❌ Tenant B blocked! | Cross-tenant collision |
| **Same key, different endpoint** | `POST /transfers` with `key: "abc-123"`<br>`POST /users` with `key: "abc-123"` | ❌ Different requests conflated | Wrong deduplication |
| **Same key, different body** | `{amount: 100}` with `key: "abc-123"`<br>`{amount: 200}` with `key: "abc-123"` | ❌ Different requests treated same | Data loss risk |

**Our Composite Key Solves This**:

```typescript
Scenario 1: Same tenant, same request
  Key: "tenant-1:POST:/transfers:hash-A:abc-123"
  Key: "tenant-1:POST:/transfers:hash-A:abc-123"
  → Match! Return cached response ✅

Scenario 2: Different tenants
  Key: "tenant-1:POST:/transfers:hash-A:abc-123"
  Key: "tenant-2:POST:/transfers:hash-A:abc-123"
  → No match! Different tenants ✅

Scenario 3: Different endpoints
  Key: "tenant-1:POST:/transfers:hash-A:abc-123"
  Key: "tenant-1:POST:/users:hash-B:abc-123"
  → No match! Different paths ✅

Scenario 4: Different request bodies
  Key: "tenant-1:POST:/transfers:hash-A:abc-123"  (body: {amount: 100})
  Key: "tenant-1:POST:/transfers:hash-B:abc-123"  (body: {amount: 200})
  → No match! Different body hashes ✅
```

**Design Insight**: Idempotency keys MUST be scoped to the request context, not just the user-provided key.

---

### Pattern 5: Interface-Based Abstractions

**Where Used**: `core-http/middlewares/idempotency.ts`

**Implementation**:
```typescript
export interface IdempotencyStore {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, response: CachedResponse, ttlSeconds: number): Promise<void>;
}

// Implementations can vary:
class InMemoryIdempotencyStore implements IdempotencyStore { ... }
class RedisIdempotencyStore implements IdempotencyStore { ... }
class DatabaseIdempotencyStore implements IdempotencyStore { ... }
```

**Why Interfaces?**

**Without Interface** (Tight Coupling):
```typescript
import RedisClient from 'redis';

function idempotencyMiddleware() {
  const redis = new RedisClient();
  const cached = await redis.get(key); // Tightly coupled to Redis!
}
```

**Problems**:
- Can't test without Redis running
- Can't switch to different storage (database, in-memory) without rewriting
- Hard to mock in tests

**With Interface** (Loose Coupling):
```typescript
function idempotencyMiddleware(store: IdempotencyStore) {
  const cached = await store.get(key); // Don't care about implementation!
}

// Usage:
const prodStore = new RedisIdempotencyStore(redisClient);
const testStore = new InMemoryIdempotencyStore();
const dbStore = new DatabaseIdempotencyStore(prisma);
```

**Benefits**:

| Benefit | Example |
|---------|---------|
| **Testability** | Use `InMemoryIdempotencyStore` in tests (fast, no dependencies) |
| **Flexibility** | Start with in-memory, upgrade to Redis later (no code changes) |
| **Mocking** | Easy to create mock store for unit tests |
| **Swappable** | Switch storage backend per environment |

**Key Insight**: Program to interfaces, not implementations. The middleware doesn't care HOW you store data, just THAT you can store and retrieve it.

---

## 🔬 Code Quality Analysis

### Good Practices We Followed

#### 1. **Explicit Type Annotations**
```typescript
// ❌ Implicit (TypeScript infers, but less clear)
const loggerOptions = {
  level: config.LOG_LEVEL,
};

// ✅ Explicit (Self-documenting)
const loggerOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
};
```

**Why**: Makes code self-documenting. Future developers (and you in 6 months) know exactly what type this is.

#### 2. **Exporting Types for Consumers**
```typescript
// core-config/src/index.ts
export type AppConfig = z.infer<typeof envSchema>;

// Usage in other packages:
import { config, AppConfig } from '@gx/core-config';
function doSomething(cfg: AppConfig) { ... }
```

**Why**: Consumers can type their code based on our config shape without duplicating type definitions.

#### 3. **JSDoc Comments for Public APIs**
```typescript
/**
 * A centralized Express error handler middleware.
 * It catches all errors, logs them, and sends a standardized
 * JSON error response to the client.
 */
export const errorHandler = (err, req, res, next) => { ... }
```

**Why**: IDE autocomplete shows documentation. Future team members understand purpose without reading implementation.

#### 4. **Defensive Validation**
```typescript
// core-openapi/src/index.ts
if (!fs.existsSync(apiSpecPath)) {
  throw new Error(`OpenAPI spec file not found at: ${apiSpecPath}`);
}
```

**Why**: Fail with clear error message instead of cryptic "file not found" later.

---

### Potential Improvements (Debatable Trade-offs)

#### 1. **Error Handling in Idempotency Middleware**

**Current Approach**:
```typescript
try {
  await store.set(compositeKey, cacheEntry, ttl);
} catch (error) {
  logger.error({ error }, 'Failed to cache idempotent response');
  // Don't fail the request if caching fails
}
```

**Trade-off**:
- ✅ **Resilient**: If Redis is down, requests still work (cached or not)
- ❌ **Silent Failure**: Idempotency temporarily broken, user might not notice

**Alternative** (Fail Fast):
```typescript
try {
  await store.set(compositeKey, cacheEntry, ttl);
} catch (error) {
  logger.error({ error }, 'Failed to cache - aborting request');
  throw new Error('Idempotency storage unavailable');
}
```

**Trade-off**:
- ✅ **Loud Failure**: Alerts team immediately that idempotency is broken
- ❌ **Service Degradation**: All write requests fail if cache is down

**Our Choice**: Resilience over correctness (in this case). 

**When to Choose Differently**: Financial transactions where duplicate is worse than unavailability.

#### 2. **Singleton in Tests**

**Current Issue**:
```typescript
// core-db/src/index.ts
const prisma = globalThis.prisma ?? new PrismaClient();
// Problem: All tests share same Prisma instance!
```

**Implication**: Tests can't run in parallel (database state shared).

**Better Approach for Tests**:
```typescript
// test-utils.ts
export function createTestPrisma() {
  return new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL } }
  });
}

// In tests:
let prisma: PrismaClient;
beforeEach(() => { prisma = createTestPrisma(); });
afterEach(() => { await prisma.$disconnect(); });
```

**Trade-off**: More test setup code, but tests are isolated and parallelizable.

---

## 🎓 Lessons & Takeaways

### 1. **Runtime Validation is Not Optional**

**Lesson**: TypeScript types disappear at runtime. Zod ensures values match expectations.

**Real-World Impact**:
```typescript
// .env file
JWT_SECRET=weak

// Without Zod:
App starts, user tries to login, JWT library throws cryptic error about key length

// With Zod:
App refuses to start: "JWT_SECRET must be at least 32 characters long"
```

**Cost**: ~50 lines of validation code  
**Benefit**: Hours saved debugging production issues

---

### 2. **Composite Keys Prevent Subtle Bugs**

**Lesson**: Idempotency keys are NOT unique enough on their own in multi-tenant systems.

**Real-World Scenario**:
```
10:00:00 - Tenant A posts transfer with key "abc-123"
10:00:01 - Tenant B posts transfer with key "abc-123" (coincidence!)
10:00:02 - Tenant B gets Tenant A's response! 😱
```

**Without composite key**: Data leak across tenants (CRITICAL security bug)  
**With composite key**: Different tenants, different cache keys (SAFE)

---

### 3. **Interfaces Enable Evolution**

**Lesson**: Start with simple implementation (in-memory), upgrade later (Redis) without breaking changes.

**Evolution Path**:
```
Week 1: InMemoryIdempotencyStore (quick to implement)
  ↓
Month 3: RedisIdempotencyStore (when traffic increases)
  ↓
Year 1: DatabaseIdempotencyStore (when need audit trail)
```

**Code Changes Required**: Zero in middleware, just swap store implementation.

---

### 4. **Environment-Specific Behavior Reduces Friction**

**Lesson**: Developers and ops teams have different needs.

**Developer Needs**:
- Readable logs (colored, formatted)
- See all SQL queries (debug performance)
- Validate responses (catch schema drift)

**Ops Needs**:
- Machine-parseable logs (JSON for ELK)
- No query logging (performance)
- Trust code (skip response validation)

**Implementation**: One codebase, different behavior based on `NODE_ENV`.

---

## 🤔 Design Questions & Answers

### Q1: Why separate packages instead of one big "utils" package?

**Answer**: 
- **Dependency Management**: `core-config` has ZERO dependencies on other core packages. `core-logger` only depends on `core-config`.
- **Bundle Size**: Services only import what they need. A worker might not need `core-openapi`.
- **Clear Boundaries**: Each package has ONE responsibility.

**Dependency Graph**:
```
core-config (no deps)
    ↑
core-logger (depends on core-config)
    ↑
core-db (depends on core-config, core-logger)
    ↑
core-http (depends on core-logger)
    ↑
Services (depend on what they need)
```

---

### Q2: Why use `globalThis` instead of a module-level variable?

**Answer**: Module-level variables reset on hot-reload in Node.js development.

```typescript
// ❌ Module-level (resets on hot-reload)
let prisma = new PrismaClient();
// Every hot-reload creates new instance → connection exhaustion

// ✅ globalThis (survives hot-reload)
const prisma = globalThis.prisma ?? new PrismaClient();
// Reuses instance across hot-reloads
```

**Note**: Only matters in development. Production doesn't hot-reload.

---

### Q3: Why hash the request body in idempotency key?

**Answer**: Same idempotency key with different bodies should be treated as different requests.

**Scenario**:
```javascript
// User's frontend has a bug - reuses same idempotency key

Request 1:
  Idempotency-Key: "abc-123"
  Body: { amount: 100, to: "alice" }

Request 2 (bug - same key, different amount):
  Idempotency-Key: "abc-123"
  Body: { amount: 500, to: "bob" }
```

**Without body hash**: Request 2 returns cached response from Request 1 (wrong!)  
**With body hash**: Different hashes → recognized as different requests → both processed

**Trade-off**: Intentional retries with same body are deduplicated (good), but retries with modified body are not (also good, because the request IS different).

---

### Q4: Why not just use a database for idempotency instead of an interface?

**Answer**: Flexibility and performance.

**Database-only approach**:
```typescript
// Tightly coupled to Prisma
await prisma.httpIdempotency.findUnique({ where: { key } });
```

**Problems**:
- Every request hits database (slower than Redis)
- Can't easily switch to distributed cache
- Harder to test (need test database)

**Interface approach**:
```typescript
// Flexible implementation
await store.get(key);

// Can be:
// - InMemory (tests, dev)
// - Redis (prod, fast)
// - Database (if need persistence)
// - Hybrid (Redis + DB fallback)
```

**Best of Both Worlds**: Use `DatabaseIdempotencyStore` in production if you want, but keep the interface for flexibility.

---

## 📊 Metrics & Impact

### Lines of Code by Package

```
core-config:    ~40 lines (small, focused)
core-logger:    ~30 lines (minimal wrapper)
core-db:        ~60 lines (singleton + logging)
core-http:      ~450 lines (5 middleware × ~90 lines each)
core-openapi:   ~280 lines (middleware + schema builders)

Total:          ~860 lines of foundational infrastructure
```

### Reusability Impact

**Without core packages** (each service implements own):
```
Service 1: Implements logger, config, error handling (~200 lines)
Service 2: Implements logger, config, error handling (~200 lines)
Service 3: Implements logger, config, error handling (~200 lines)
...
10 services × 200 lines = 2,000 lines of duplicate code
```

**With core packages**:
```
Core packages: ~860 lines (written once)
Per service: import { logger, config, errorHandler } from '@gx/core-*'
10 services × ~10 lines = 100 lines of imports

Total: 860 + 100 = 960 lines (48% of duplicate approach)
```

**Maintenance Benefit**: Bug fix in error handler → fix once in `core-http`, all services benefit.

---

## 🔮 Future Enhancements

### 1. **Add Circuit Breaker to Idempotency Store**

**Problem**: If Redis is down, we retry every request → DDoS our cache

**Solution**:
```typescript
class CircuitBreakerIdempotencyStore implements IdempotencyStore {
  private failureCount = 0;
  private isOpen = false;

  async get(key: string) {
    if (this.isOpen) {
      throw new Error('Circuit breaker open');
    }
    try {
      return await this.innerStore.get(key);
    } catch (error) {
      this.failureCount++;
      if (this.failureCount > 5) {
        this.isOpen = true;
        setTimeout(() => { this.isOpen = false; }, 60000); // Reset after 1 min
      }
      throw error;
    }
  }
}
```

---

### 2. **Add Metrics to Core-HTTP**

**Current**: Middleware exists but no instrumentation of core packages

**Enhancement**:
```typescript
// core-http/src/middlewares/metrics.ts
const dbQueryDuration = new Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query duration'
});

// Wrap Prisma queries
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  dbQueryDuration.observe(Date.now() - start);
  return result;
});
```

---

### 3. **Add Schema Versioning to OpenAPI**

**Problem**: When API changes, old clients break

**Solution**:
```typescript
// Support multiple versions
app.use('/v1', applyOpenApiMiddleware(app, { apiSpecPath: './v1/openapi.yaml' }));
app.use('/v2', applyOpenApiMiddleware(app, { apiSpecPath: './v2/openapi.yaml' }));
```

---

## ✅ Checklist for Similar Implementations

When building foundational packages, consider:

- [ ] **Singleton Pattern**: Do you need to reuse instances? (Prisma, logger)
- [ ] **Runtime Validation**: Are you validating values or just types? (Zod vs TypeScript)
- [ ] **Environment Awareness**: Do dev and prod need different behavior? (Logging, validation)
- [ ] **Interface Abstractions**: Will you swap implementations later? (Storage, cache)
- [ ] **Composite Keys**: Are your unique identifiers truly unique in all contexts? (Multi-tenancy)
- [ ] **Error Handling**: Fail fast or fail gracefully? (Config vs caching)
- [ ] **Type Exports**: Are you exporting types for consumers? (Public APIs)
- [ ] **Documentation**: Do public APIs have JSDoc comments? (Developer experience)

---

## 📚 Further Reading

**Patterns Used**:
- Singleton Pattern: [Refactoring Guru](https://refactoring.guru/design-patterns/singleton)
- Fail-Fast Principle: [Martin Fowler](https://martinfowler.com/ieeeSoftware/failFast.pdf)
- Interface Segregation: [SOLID Principles](https://en.wikipedia.org/wiki/Interface_segregation_principle)

**Libraries Deep-Dives**:
- Zod Documentation: [zod.dev](https://zod.dev)
- Pino Logger: [getpino.io](https://getpino.io)
- Prisma Best Practices: [prisma.io/docs](https://www.prisma.io/docs)

---

## 🎤 Closing Thoughts

**What We Achieved**: Built a solid foundation that every service will depend on. These packages are **horizontal infrastructure** - they cut across all services.

**Key Insight**: **Invest time in foundations**. The 860 lines we wrote will save thousands of lines of duplicate code and prevent countless bugs.

**Next Steps**: Use these packages in `svc-identity` (Phase 1) and watch how they simplify service implementation.

---

**Lecture Status**: Complete ✅  
**Next Lecture**: Phase 1 - Building `svc-identity` with CQRS Pattern

**Questions for Reflection**:
1. When would you choose fail-fast vs fail-gracefully?
2. Could we use the same idempotency pattern for database-level deduplication?
3. What other abstractions would benefit from the interface pattern?

