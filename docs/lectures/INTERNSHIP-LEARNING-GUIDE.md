# 🎓 Internship Learning Guide: GX Protocol Backend

**Welcome to Your Learning Journey!** 🚀

This guide will help you understand every aspect of this backend project from the ground up. By the end, you'll be able to build this entire system yourself and understand all the "why" and "how" behind each decision.

---

## 📚 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Concepts You Need to Know](#2-core-concepts-you-need-to-know)
3. [The Big Picture: Architecture](#3-the-big-picture-architecture)
4. [Deep Dive: Each Component](#4-deep-dive-each-component)
5. [How Everything Works Together](#5-how-everything-works-together)
6. [Why We Made These Choices](#6-why-we-made-these-choices)
7. [Alternative Approaches](#7-alternative-approaches)
8. [Hands-On Learning Path](#8-hands-on-learning-path)
9. [Common Questions & Answers](#9-common-questions--answers)
10. [Further Reading & Resources](#10-further-reading--resources)

---

## 1. Project Overview

### What Are We Building?

The **GX Coin Protocol Backend** is the off-chain system (not on blockchain) that supports a digital currency called GX Coin. Think of it like the backend for a banking app, but for a cryptocurrency that runs on Hyperledger Fabric (a private blockchain).

### What Does "Off-Chain" Mean?

- **On-Chain**: Data stored directly on the blockchain (slow, expensive, immutable)
- **Off-Chain**: Data stored in our database (fast, cheap, can be updated)

We use the blockchain for important transactions (transfers, balances) and our database for everything else (user profiles, transaction history, search features).

### The Main Goals

1. **Fast User Experience**: Users shouldn't wait for blockchain confirmation
2. **Reliable**: No transactions should be lost
3. **Scalable**: Handle thousands of users
4. **Secure**: Protect user data and money
5. **Observable**: Know what's happening in the system at all times

---

## 2. Core Concepts You Need to Know

### 2.1 What is a Monorepo?

**Simple Explanation**: Instead of having separate Git repositories for each service, we keep everything in ONE repository.

```
Traditional Approach:
- repo-1: identity-service
- repo-2: wallet-service
- repo-3: shared-utils

Monorepo Approach:
- gx-protocol-backend/
  ├── apps/svc-identity/
  ├── apps/svc-wallet/
  └── packages/core-utils/
```

**Why?**
- ✅ Share code easily between services
- ✅ Make changes across multiple services in one commit
- ✅ Easier to run all services locally
- ❌ Larger repository size
- ❌ Need special tools (Turborepo) to manage it

### 2.2 What is Microservices Architecture?

**Simple Explanation**: Instead of one big application, we have multiple small applications that talk to each other.

```
Monolith (Old Way):
┌─────────────────────────┐
│   One Big Application   │
│  - User Management      │
│  - Wallet Management    │
│  - Transactions         │
│  - Everything Else      │
└─────────────────────────┘

Microservices (Our Way):
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Identity   │  │  Tokenomics │  │ Governance  │
│  Service    │  │   Service   │  │   Service   │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Why?**
- ✅ Teams can work independently
- ✅ Scale specific services (e.g., more wallet servers during high traffic)
- ✅ Deploy services separately
- ❌ More complex to manage
- ❌ Need to handle communication between services

### 2.3 What is CQRS?

**CQRS = Command Query Responsibility Segregation**

**Simple Explanation**: Separate how you WRITE data from how you READ data.

```
Traditional (Simple but Slow):
User Request → API → Database ←→ Blockchain
                      (one path for read/write)

CQRS (Faster):
Write: User Request → API → Database → Worker → Blockchain
Read:  User Request → API → Database (optimized for reading)
                              ↑
                     Blockchain Events
```

**Why?**
- **Reads** (checking balance): Need to be VERY fast → Read from database
- **Writes** (transferring money): Need to be RELIABLE → Write to blockchain

### 2.4 What is Event-Driven Architecture?

**Simple Explanation**: Services communicate by sending "events" (notifications) instead of calling each other directly.

```
Direct Calls (Coupled):
Service A → calls → Service B

Event-Driven (Decoupled):
Service A → publishes event → Event Bus
                               ↓
            Service B ← subscribes to events
```

**Example in Our System**:
1. User registers → API saves to database → Publishes "UserCreated" event
2. Blockchain writes it → Publishes "UserCreatedOnChain" event
3. Projector hears event → Updates user profile with blockchain ID

### 2.5 What is the Outbox Pattern?

**Problem**: What if we save to database but fail to send to blockchain? We lose data!

**Solution**: Write to a special "outbox" table, then a worker processes it.

```
Without Outbox (Dangerous):
1. API saves user to database ✅
2. API sends to blockchain ❌ (network error)
3. User is in database but not on blockchain! 😱

With Outbox (Safe):
1. API saves user to database ✅
2. API saves "CreateUser command" to outbox table ✅
3. API responds to user immediately ✅
4. Worker picks up command from outbox
5. Worker sends to blockchain (retries if failed)
6. Worker marks as SUCCESS in outbox
```

### 2.6 What is TypeScript?

**Simple Explanation**: JavaScript with types. It catches errors before you run the code.

```javascript
// JavaScript (no types)
function addNumbers(a, b) {
  return a + b;
}
addNumbers(5, "10"); // Returns "510" (string concatenation!) 😱

// TypeScript (with types)
function addNumbers(a: number, b: number): number {
  return a + b;
}
addNumbers(5, "10"); // ❌ Compiler error! Can't pass string to number parameter
```

### 2.7 What is Docker?

**Simple Explanation**: Package your application with everything it needs (Node.js, libraries, etc.) so it runs the same everywhere.

```
Without Docker:
"It works on my machine!" 😅
→ Different Node versions, missing libraries, OS differences

With Docker:
"Here's a container with everything inside!"
→ Runs the same on your laptop, teammate's laptop, production server
```

---

## 3. The Big Picture: Architecture

### 3.1 The 10,000 Foot View

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Mobile/Web)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (Future)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ↓                   ↓                   ↓
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Identity   │     │ Tokenomics  │     │ Governance  │
│  Service    │     │  Service    │     │  Service    │
│  (HTTP API) │     │  (HTTP API) │     │  (HTTP API) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ↓
            ┌──────────────────────────┐
            │   PostgreSQL Database    │
            │  - outbox_commands       │
            │  - user_profiles         │
            │  - wallets               │
            │  - transactions          │
            └────────┬────────┬────────┘
                     │        │
         ┌───────────┘        └───────────┐
         ↓                                ↓
┌─────────────────┐            ┌──────────────────┐
│ Outbox-Submitter│            │    Projector     │
│    (Worker)     │            │    (Worker)      │
└────────┬────────┘            └────────┬─────────┘
         │                              ↑
         │ Submits                      │ Listens
         │ Commands                     │ to Events
         ↓                              │
┌─────────────────────────────────────────────────┐
│         Hyperledger Fabric (Blockchain)         │
│  - Stores balances, transactions (immutable)    │
└─────────────────────────────────────────────────┘
```

### 3.2 The Request Flow

#### Write Operation (Transfer Money)

```
Step 1: User initiates transfer
  POST /api/v1/transfers
  {
    "from": "alice",
    "to": "bob",
    "amount": 100
  }

Step 2: API validates and writes to outbox
  svc-tokenomics → INSERT into outbox_commands
  {
    commandType: "TRANSFER_TOKENS",
    payload: { from, to, amount },
    status: "PENDING"
  }

Step 3: API responds immediately
  HTTP 202 Accepted
  {
    "requestId": "abc-123",
    "status": "pending"
  }

Step 4: Outbox-Submitter picks up command (every 5 seconds)
  SELECT * FROM outbox_commands WHERE status = 'PENDING'
  → Submit to Fabric chaincode
  → UPDATE status = 'SUBMITTED'

Step 5: Fabric processes transaction
  → Executes smart contract
  → Updates balances
  → Emits "TransferCompleted" event

Step 6: Projector hears event
  → INSERT into transactions table
  → UPDATE wallet balances
  → UPDATE outbox_commands status = 'COMMITTED'

Step 7: User polls for status (or uses webhooks)
  GET /api/v1/transfers/abc-123
  → Returns "completed" after projector finishes
```

#### Read Operation (Check Balance)

```
Step 1: User requests balance
  GET /api/v1/wallets/alice/balance

Step 2: API reads from database (NOT blockchain!)
  SELECT cachedBalance FROM wallets WHERE profileId = 'alice'

Step 3: API responds instantly
  {
    "balance": 1000,
    "lastUpdated": "2025-10-15T10:30:00Z"
  }
```

**Why is this fast?** Because we're reading from PostgreSQL, not waiting for blockchain!

### 3.3 The Folder Structure Explained

```
gx-protocol-backend/
│
├── apps/                    # HTTP Microservices (User-facing APIs)
│   ├── svc-identity/        # User registration, login, KYC
│   ├── svc-tokenomics/      # Transfers, balances, beneficiaries
│   ├── svc-organizations/   # Company profiles, licenses
│   └── svc-governance/      # Voting, proposals
│
├── workers/                 # Background Processes (Not HTTP)
│   ├── outbox-submitter/    # Sends commands to blockchain
│   └── projector/           # Listens to blockchain events
│
├── packages/                # Shared Libraries (Reusable Code)
│   ├── core-config/         # Environment variable management
│   ├── core-logger/         # Logging to console/files
│   ├── core-db/             # Database connection (Prisma)
│   ├── core-http/           # Express middleware (error handling, logging)
│   ├── core-openapi/        # API validation
│   ├── core-events/         # Event schemas
│   └── core-fabric/         # Blockchain connection
│
├── db/                      # Database Definition
│   └── prisma/
│       └── schema.prisma    # Database tables definition
│
├── docs/                    # Documentation
│   ├── adr/                 # Architecture Decision Records
│   └── sequences/           # Flow diagrams
│
├── infra/                   # Infrastructure (Docker, Kubernetes)
│   ├── docker/              # Dockerfile for services
│   └── fabric/              # Blockchain network config
│
└── openapi/                 # API Specifications (Swagger)
    ├── identity.yaml
    └── tokenomics.yaml
```

---

## 4. Deep Dive: Each Component

### 4.1 Core Packages (Foundation)

#### A. @gx/core-config

**What**: Loads and validates environment variables

**Why**: All apps need configuration (database URL, ports, secrets). We validate them at startup to fail fast if something is wrong.

**How it Works**:

```typescript
// Step 1: Define schema with Zod
const envSchema = z.object({
  DATABASE_URL: z.string().url(),  // Must be valid URL
  PORT: z.coerce.number().int().positive(),  // Must be positive integer
  JWT_SECRET: z.string().min(32),  // Must be at least 32 chars
});

// Step 2: Parse environment variables
export const config = envSchema.parse(process.env);
// If invalid, throws error and crashes app!

// Step 3: Use in other services
import { config } from '@gx/core-config';
console.log(config.DATABASE_URL);  // Type-safe!
```

**Key Concepts**:
- **Runtime Validation**: Checks values when app starts, not just at compile time
- **Type Safety**: TypeScript knows the shape of `config` object
- **Fail Fast**: Better to crash at startup than fail mysteriously later

**Why Zod?**
- ✅ Runtime validation (TypeScript only checks at compile time)
- ✅ Easy to read schemas
- ✅ Great error messages
- **Alternative**: Joi, Yup (older libraries)

#### B. @gx/core-logger

**What**: Structured logging with Pino

**Why**: `console.log()` is not enough in production! We need:
- Different log levels (debug, info, warn, error)
- Structured data (JSON format for parsing)
- Performance (Pino is one of the fastest loggers)

**How it Works**:

```typescript
// Development: Pretty colored output
logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
// Output: [10:30:00] INFO: User logged in
//   userId: "123"
//   ip: "192.168.1.1"

// Production: JSON for log aggregation (e.g., Elasticsearch)
// Output: {"level":30,"time":1697376600000,"msg":"User logged in","userId":"123","ip":"192.168.1.1"}
```

**Key Concepts**:
- **Singleton Pattern**: One logger instance for entire app
- **Structured Logging**: Always log objects, not just strings
- **Log Levels**: trace < debug < info < warn < error < fatal

**Why Pino?**
- ✅ **Fast**: 5-10x faster than Winston
- ✅ **Low overhead**: Doesn't slow down your app
- ✅ **Child loggers**: Each service can add its own context
- **Alternative**: Winston (more features, slower), Bunyan

#### C. @gx/core-db

**What**: Prisma ORM for database access

**Why**: Writing raw SQL is error-prone. Prisma gives us:
- Type-safe queries (TypeScript knows your database schema!)
- Automatic migrations
- Query builder (no SQL injection)

**How it Works**:

```prisma
// Step 1: Define schema
model UserProfile {
  profileId  String   @id @default(uuid())
  email      String   @unique
  firstName  String
  createdAt  DateTime @default(now())
}

// Step 2: Prisma generates TypeScript types
prisma generate

// Step 3: Use in code (Type-safe!)
const user = await prisma.userProfile.create({
  data: {
    email: 'alice@example.com',
    firstName: 'Alice'
  }
});
// TypeScript knows: user.profileId is string, user.createdAt is Date
```

**Key Tables Explained**:

1. **outbox_commands**: Commands waiting to be sent to blockchain
   ```sql
   CREATE TABLE outbox_commands (
     id UUID PRIMARY KEY,
     command_type VARCHAR,  -- 'CREATE_USER', 'TRANSFER_TOKENS'
     payload JSONB,         -- Command data
     status VARCHAR,        -- 'PENDING', 'SUBMITTED', 'COMMITTED', 'FAILED'
     attempts INT,          -- Retry count
     created_at TIMESTAMP
   );
   ```

2. **projector_state**: Checkpoint for event processing
   ```sql
   CREATE TABLE projector_state (
     tenant_id VARCHAR,
     channel VARCHAR,       -- Fabric channel name
     last_block BIGINT,     -- Last processed block number
     last_event_index INT   -- Last processed event in that block
   );
   ```

3. **http_idempotency**: Prevent duplicate requests
   ```sql
   CREATE TABLE http_idempotency (
     tenant_id VARCHAR,
     method VARCHAR,        -- 'POST', 'PUT', etc.
     path VARCHAR,          -- '/api/v1/transfers'
     body_hash VARCHAR,     -- SHA256 of request body
     response_body JSONB,   -- Cached response
     created_at TIMESTAMP
   );
   ```

**Why Prisma?**
- ✅ Type safety (catches bugs at compile time)
- ✅ Auto-generated migrations
- ✅ Great developer experience
- **Alternative**: TypeORM, Sequelize (more mature, less type-safe)

#### D. @gx/core-http

**What**: Express middleware for common HTTP tasks

**Why**: Every API needs error handling, logging, metrics. Don't repeat yourself!

**Middlewares Included**:

1. **Error Handler**: Catches all errors and returns consistent JSON

```typescript
// Instead of this in every route:
app.post('/users', (req, res) => {
  try {
    // ... code
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Just use middleware:
app.use(errorHandler);
// Now ALL errors are caught and formatted!
```

2. **Request Logger**: Logs every HTTP request

```typescript
app.use(requestLogger);
// Logs: POST /users 201 - 45ms
```

3. **Idempotency Middleware**: Prevent duplicate requests

```typescript
// User clicks "Transfer" button twice by accident
// Without idempotency: Money transferred TWICE! 😱
// With idempotency: Second request returns cached response ✅

app.post('/transfers', idempotencyMiddleware, async (req, res) => {
  // This code only runs ONCE per idempotency key
});
```

4. **Health Checks**: Kubernetes liveness/readiness probes

```typescript
app.get('/healthz', healthCheckHandler);
// Returns 200 if app is running

app.get('/readyz', readinessCheckHandler);
// Returns 200 only if app is ready to serve traffic
// (e.g., database connected, projection lag < 5 seconds)
```

5. **Prometheus Metrics**: Track API performance

```typescript
app.use(metricsMiddleware);
// Exports metrics at /metrics:
// - http_request_duration_ms (response time)
// - http_requests_total (request count)
// - nodejs_memory_usage (memory usage)
```

**Key Concepts**:
- **Middleware**: Function that runs before/after route handler
- **Error Propagation**: Throw error anywhere, middleware catches it
- **Observability**: Know what's happening in production

#### E. @gx/core-openapi

**What**: Validate API requests against OpenAPI spec

**Why**: Users can send bad data! Validate before it reaches your code.

**How it Works**:

```yaml
# openapi/identity.yaml
paths:
  /users:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                age:
                  type: integer
                  minimum: 18
              required:
                - email
                - age
```

```typescript
// Apply middleware
applyOpenApiMiddleware(app, {
  apiSpecPath: './openapi/identity.yaml',
  validateRequests: true,
  validateResponses: true  // In dev only!
});

// Now requests are validated automatically!
// POST /users { "email": "invalid", "age": 16 }
// → 400 Bad Request: email must be valid, age must be >= 18
```

**Why OpenAPI?**
- ✅ API documentation for free (Swagger UI)
- ✅ Catches bad data before it reaches your code
- ✅ Contract between frontend and backend
- **Alternative**: Joi validation in route handlers (more code)

---

### 4.2 Workers (Background Processes)

#### A. Outbox-Submitter

**What**: Polls `outbox_commands` table and submits to blockchain

**Why**: Separate reliability from user-facing API. If blockchain is slow/down, user isn't waiting.

**How it Works**:

```typescript
// Every 5 seconds:
setInterval(async () => {
  // Step 1: Find pending commands
  const commands = await prisma.outboxCommand.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 10  // Process 10 at a time
  });

  // Step 2: Submit to Fabric
  for (const command of commands) {
    try {
      // Update status to LOCKED (prevent double processing)
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: { status: 'LOCKED', lockedBy: workerId }
      });

      // Submit to blockchain
      const txId = await fabricClient.submitTransaction(
        command.commandType,
        command.payload
      );

      // Update status to SUBMITTED
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: { status: 'SUBMITTED', fabricTxId: txId }
      });
    } catch (error) {
      // Increment retry count
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          attempts: command.attempts + 1,
          error: error.message,
          status: command.attempts >= 3 ? 'FAILED' : 'PENDING'
        }
      });
    }
  }
}, 5000);  // Run every 5 seconds
```

**Key Concepts**:
- **Polling**: Check database repeatedly for new work
- **Locking**: Prevent two workers from processing same command
- **Retry Logic**: Try failed commands up to 3 times
- **Dead-Letter Queue**: Move permanently failed commands to separate table

**Alternative Approaches**:
- **Message Queue** (RabbitMQ, Kafka): More complex but better for high throughput
- **Event-Driven** (PostgreSQL LISTEN/NOTIFY): More efficient than polling

#### B. Projector

**What**: Listens to blockchain events and updates read models

**Why**: Keep database in sync with blockchain state

**How it Works**:

```typescript
// Connect to Fabric event stream
const eventHub = fabricClient.getEventHub();

eventHub.on('TransferCompleted', async (event) => {
  // Step 1: Validate event against schema
  const validated = transferCompletedSchema.parse(event.payload);

  // Step 2: Update database
  await prisma.$transaction([
    // Update sender balance
    prisma.wallet.update({
      where: { primaryAccountId: validated.from },
      data: {
        cachedBalance: { decrement: validated.amount }
      }
    }),

    // Update receiver balance
    prisma.wallet.update({
      where: { primaryAccountId: validated.to },
      data: {
        cachedBalance: { increment: validated.amount }
      }
    }),

    // Insert transaction record
    prisma.transaction.create({
      data: {
        onChainTxId: event.txId,
        type: 'SENT',
        amount: validated.amount,
        counterparty: validated.to,
        timestamp: event.timestamp
      }
    }),

    // Update checkpoint
    prisma.projectorState.update({
      where: { projectorName: 'tokenomics' },
      data: {
        lastBlock: event.blockNumber,
        lastEventIndex: event.eventIndex
      }
    })
  ]);
});
```

**Key Concepts**:
- **Event Schema Validation**: Ensure event structure is correct
- **Transactions**: All database updates succeed or fail together
- **Checkpoint**: Remember last processed event (for recovery)
- **Idempotency**: Handle duplicate events gracefully

**What if Projector Crashes?**

```typescript
// On restart, resume from last checkpoint
const state = await prisma.projectorState.findUnique({
  where: { projectorName: 'tokenomics' }
});

// Replay events from last processed block
fabricClient.queryEvents({
  startBlock: state.lastBlock + 1,
  endBlock: 'latest'
});
```

---

### 4.3 Services (HTTP APIs)

#### A. svc-identity

**What**: User registration, authentication, KYC verification

**Endpoints**:
- `POST /api/v1/users` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/users/:id` - Get user profile
- `POST /api/v1/kyc` - Submit KYC documents

**Example: User Registration Flow**

```typescript
// 1. Route definition
app.post('/api/v1/users', registerUser);

// 2. Controller (handles HTTP)
async function registerUser(req, res) {
  // Validate input (OpenAPI middleware already did this!)
  const userData = req.body;

  // Call service layer
  const result = await userService.createUser(userData);

  // Return response
  res.status(202).json(result);
}

// 3. Service layer (business logic)
async function createUser(userData) {
  // Hash password
  const passwordHash = await bcrypt.hash(userData.password, 10);

  // Write to outbox (NOT directly to blockchain!)
  const outboxCommand = await prisma.outboxCommand.create({
    data: {
      commandType: 'CREATE_USER',
      payload: {
        email: userData.email,
        firstName: userData.firstName,
        passwordHash
      },
      status: 'PENDING',
      requestId: uuidv4()
    }
  });

  return {
    requestId: outboxCommand.requestId,
    status: 'pending'
  };
}
```

**Why 3 Layers?** (Controller, Service, Repository)

```
Controller → Service → Repository

Controller:
- Handles HTTP (req/res)
- Validation (input/output)
- Status codes

Service:
- Business logic
- Orchestration
- No HTTP knowledge

Repository:
- Database access
- No business logic
```

**Benefits**:
- ✅ Easy to test (mock repositories in service tests)
- ✅ Reusable (service can be called by HTTP, CLI, tests)
- ✅ Clear separation of concerns

---

## 5. How Everything Works Together

### 5.1 Complete User Registration Example

Let's trace a user registration from start to finish:

```
┌──────────┐
│  User    │
│  (Alice) │
└────┬─────┘
     │
     │ POST /api/v1/users
     │ {
     │   "email": "alice@example.com",
     │   "password": "secure123",
     │   "firstName": "Alice"
     │ }
     ↓
┌──────────────────────────────────────────────┐
│  svc-identity (API Service)                  │
│                                              │
│  1. OpenAPI Middleware validates request    │
│  2. Request Logger logs: POST /users         │
│  3. Idempotency check (first time? proceed)  │
│  4. Controller → Service → Repository        │
│  5. Write to outbox_commands table           │
│  6. Write to http_idempotency table          │
│  7. Return 202 Accepted                      │
└────┬─────────────────────────────────────────┘
     │
     │ Response:
     │ {
     │   "requestId": "abc-123",
     │   "status": "pending"
     │ }
     ↓
┌──────────┐
│  User    │
│  (Alice) │ ← "Your registration is being processed..."
└──────────┘


Meanwhile (5 seconds later)...

┌──────────────────────────────────────────────┐
│  outbox-submitter (Worker)                   │
│                                              │
│  1. Poll: SELECT * FROM outbox_commands      │
│     WHERE status = 'PENDING'                 │
│                                              │
│  2. Lock command (prevent double processing) │
│                                              │
│  3. Submit to Fabric:                        │
│     fabricClient.submitTransaction(          │
│       'createUser',                          │
│       { email, firstName, passwordHash }     │
│     )                                        │
│                                              │
│  4. Update outbox: status = 'SUBMITTED'      │
└────┬─────────────────────────────────────────┘
     │
     │ Transaction submitted!
     ↓
┌──────────────────────────────────────────────┐
│  Hyperledger Fabric (Blockchain)             │
│                                              │
│  1. Execute chaincode (smart contract)       │
│  2. Validate transaction                     │
│  3. Store user on ledger                     │
│  4. Emit event: "UserCreated"                │
│     {                                        │
│       "userId": "fabric-user-123",           │
│       "email": "alice@example.com",          │
│       "txId": "xyz-789"                      │
│     }                                        │
└────┬─────────────────────────────────────────┘
     │
     │ Event emitted!
     ↓
┌──────────────────────────────────────────────┐
│  projector (Worker)                          │
│                                              │
│  1. Receive "UserCreated" event              │
│                                              │
│  2. Validate against schema                  │
│                                              │
│  3. Update database:                         │
│     - INSERT into user_profiles              │
│     - UPDATE outbox status = 'COMMITTED'     │
│     - UPDATE projector_state checkpoint      │
│                                              │
│  4. Log: "User alice@... created on chain"   │
└──────────────────────────────────────────────┘


User polls for status:

┌──────────┐
│  User    │
│  (Alice) │
└────┬─────┘
     │
     │ GET /api/v1/requests/abc-123/status
     ↓
┌──────────────────────────────────────────────┐
│  svc-identity (API Service)                  │
│                                              │
│  1. Query outbox_commands table              │
│     WHERE requestId = 'abc-123'              │
│                                              │
│  2. Return status: "committed"               │
└────┬─────────────────────────────────────────┘
     │
     │ Response:
     │ {
     │   "requestId": "abc-123",
     │   "status": "committed",
     │   "userId": "fabric-user-123"
     │ }
     ↓
┌──────────┐
│  User    │
│  (Alice) │ ← "Registration successful! Welcome, Alice!"
└──────────┘
```

**Key Takeaways**:
1. User gets IMMEDIATE response (202 Accepted)
2. Processing happens in background (workers)
3. User can poll for status or receive webhook
4. Each component has ONE job (separation of concerns)
5. System is resilient (if worker crashes, it resumes from checkpoint)

---

## 6. Why We Made These Choices

### 6.1 Why TypeScript over JavaScript?

**JavaScript**:
```javascript
function transfer(from, to, amount) {
  // What type is amount? string? number?
  // No compiler to catch: transfer('alice', 'bob', '100') // string!
  return from.balance - amount;  // NaN if amount is string!
}
```

**TypeScript**:
```typescript
function transfer(from: Wallet, to: Wallet, amount: number): number {
  // Compiler ensures: amount is number, from/to are Wallets
  return from.balance - amount;  // Always correct!
}

transfer(alice, bob, '100');  // ❌ Compiler error!
```

**Why?**
- ✅ Catch bugs at compile time (before production!)
- ✅ Better IDE autocomplete
- ✅ Easier refactoring (rename variable, find all usages)
- ✅ Self-documenting code (types are documentation)

### 6.2 Why Monorepo over Multi-Repo?

**Multi-Repo** (Traditional):
```
Scenario: Change shared utility function

1. Update function in shared-utils repo
2. Publish new version to npm
3. Update package.json in service-1
4. Update package.json in service-2
5. Update package.json in service-3
6. Test each service separately
7. Deploy each service separately

Total: 7 steps, 3 repositories, 3 PRs
```

**Monorepo** (Our Approach):
```
Scenario: Change shared utility function

1. Update function in packages/core-utils
2. Test all services (Turbo runs tests automatically)
3. Commit to one repository
4. Deploy (all services use latest code)

Total: 1 step, 1 repository, 1 PR
```

**Why?**
- ✅ Atomic changes (one commit affects all services)
- ✅ No version hell (always use latest shared code)
- ✅ Easier refactoring (change affects all services immediately)
- ❌ Larger repository size (but Git handles it well)

### 6.3 Why CQRS over Simple CRUD?

**Simple CRUD** (Create, Read, Update, Delete):
```
User checks balance:
  API → Query Fabric → Return balance
  ⏱️ Slow! (Fabric query takes 100-500ms)

User transfers money:
  API → Submit to Fabric → Wait for confirmation → Return
  ⏱️ Very slow! (Fabric commit takes 2-5 seconds)
```

**CQRS** (Our Approach):
```
User checks balance:
  API → Query PostgreSQL → Return balance
  ⏱️ Fast! (Database query takes 1-5ms)

User transfers money:
  API → Write to outbox → Return 202 Accepted
  ⏱️ Fast! (Database write takes 5-10ms)
  (Blockchain happens in background)
```

**Why?**
- ✅ Fast user experience (no waiting for blockchain)
- ✅ Scalable (database reads are cheap, can add read replicas)
- ✅ Resilient (if blockchain is down, users can still check balances)
- ❌ More complex (need workers, eventual consistency)

### 6.4 Why Prisma over Raw SQL?

**Raw SQL**:
```javascript
const users = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]  // ⚠️ Easy to forget $ placeholders → SQL injection!
);

// ⚠️ No type safety: What fields does user have?
console.log(users[0].emailAddress);  // Typo! Should be 'email'
```

**Prisma**:
```typescript
const users = await prisma.user.findMany({
  where: { email }  // ✅ Safe by design (no SQL injection)
});

// ✅ TypeScript knows the shape
console.log(users[0].email);  // ✅ Autocomplete works!
console.log(users[0].emailAddress);  // ❌ Compiler error!
```

**Why?**
- ✅ Type safety (know your data structure)
- ✅ SQL injection protection (automatic escaping)
- ✅ Database migrations (easy schema changes)
- ✅ Great developer experience (autocomplete, error messages)

### 6.5 Why PostgreSQL over MongoDB?

**MongoDB** (Document database):
```javascript
{
  userId: '123',
  firstName: 'Alice',
  transactions: [  // ⚠️ Embedded array
    { amount: 100, to: 'bob' },
    { amount: 50, to: 'charlie' }
    // ... thousands of transactions
  ]
}
// Problem: Document size limit (16MB), slow queries on nested arrays
```

**PostgreSQL** (Relational database):
```sql
users:
  user_id | first_name
  123     | Alice

transactions:
  tx_id | user_id | amount | to
  1     | 123     | 100    | bob
  2     | 123     | 50     | charlie
```

**Why?**
- ✅ **ACID Transactions**: All-or-nothing updates (critical for money!)
- ✅ **Relational**: Complex queries with JOINs
- ✅ **Consistency**: Schema enforcement (can't insert wrong data types)
- ✅ **Mature**: 30+ years of production use
- ❌ Less flexible than MongoDB (need migrations for schema changes)

### 6.6 Why Turborepo over Lerna?

**Turborepo**:
- ✅ **Fast**: Caches build outputs (rebuild only changed packages)
- ✅ **Simple**: Minimal configuration
- ✅ **Modern**: Built for monorepos in 2024

**Lerna**:
- ❌ Slower (no caching by default)
- ❌ More complex configuration
- ✅ More mature (older, battle-tested)

**Example**:
```bash
# First build
turbo build
# ⏱️ 30 seconds (builds everything)

# Change one file in core-logger
turbo build
# ⏱️ 2 seconds (only rebuilds core-logger and dependents)
```

---

## 7. Alternative Approaches

### 7.1 Instead of Outbox Pattern

**Alternative 1: Direct Blockchain Calls**
```typescript
// ❌ Simple but unreliable
app.post('/users', async (req, res) => {
  await fabricClient.submitTransaction('createUser', req.body);
  res.json({ success: true });
});

// Problems:
// - User waits 2-5 seconds for blockchain
// - If network fails, user sees error (bad UX)
// - No retry logic
```

**Alternative 2: Message Queue (RabbitMQ/Kafka)**
```typescript
// ✅ More scalable but more complex
app.post('/users', async (req, res) => {
  await queue.publish('user.create', req.body);
  res.json({ success: true });
});

// Worker consumes from queue
queue.subscribe('user.create', async (message) => {
  await fabricClient.submitTransaction('createUser', message);
});

// Pros: Better for high throughput
// Cons: Extra infrastructure (RabbitMQ server)
```

**Why we chose Outbox**:
- ✅ Simple (just a database table)
- ✅ No extra infrastructure
- ✅ Good enough for our scale (thousands of TPS)
- ✅ Transactional (database write + outbox write in one transaction)

### 7.2 Instead of Microservices

**Alternative: Monolith**
```
One Big Application:
┌────────────────────────────┐
│  Single Node.js App        │
│  - User Management         │
│  - Wallet Management       │
│  - Transactions            │
│  - Everything Else         │
└────────────────────────────┘

Pros:
- ✅ Simpler to develop initially
- ✅ Easier to deploy (one server)
- ✅ No inter-service communication

Cons:
- ❌ Can't scale parts independently
- ❌ One bug can crash everything
- ❌ Hard to work on as team grows
```

**When to use Monolith?**
- Small team (< 5 developers)
- Simple domain (one main feature)
- Low traffic (< 1000 users)

**When to use Microservices?** (Our case)
- Growing team (need independent development)
- Complex domain (identity, wallets, governance are separate concerns)
- Need to scale parts independently (e.g., more wallet servers during high traffic)

### 7.3 Instead of CQRS

**Alternative: Event Sourcing**
```
Store ALL events, rebuild state from events

Event Store:
  1. UserCreated { email: 'alice@...' }
  2. PasswordChanged { newHash: '...' }
  3. EmailVerified { verifiedAt: '...' }

To get current state:
  Replay all events → Build UserProfile object

Pros:
- ✅ Full audit trail
- ✅ Time travel (see state at any point in time)
- ✅ Perfect consistency

Cons:
- ❌ Complex to implement
- ❌ Slow queries (need to replay events)
- ❌ Steep learning curve
```

**Why we chose CQRS instead**:
- ✅ Simpler (just read models + outbox)
- ✅ Fast reads (query database directly)
- ✅ Good enough audit trail (EventLog table)
- ❌ Not true event sourcing (but we don't need it)

---

## 8. Hands-On Learning Path

### Week 1: Foundations

**Day 1-2: TypeScript Basics**
1. Install Node.js and TypeScript
2. Create a simple TypeScript file:
   ```typescript
   function greet(name: string): string {
     return `Hello, ${name}!`;
   }
   console.log(greet('Alice'));
   ```
3. Compile and run: `npx tsc greet.ts && node greet.js`
4. Practice: Create types for User, Wallet, Transaction

**Day 3-4: Node.js & Express**
1. Create a simple Express server:
   ```typescript
   import express from 'express';
   const app = express();
   app.get('/hello', (req, res) => {
     res.json({ message: 'Hello World' });
   });
   app.listen(3000);
   ```
2. Add routes: GET, POST, PUT, DELETE
3. Practice: Build a simple TODO API

**Day 5-7: Prisma & PostgreSQL**
1. Install PostgreSQL (or use Docker)
2. Create a Prisma schema:
   ```prisma
   model Todo {
     id    Int    @id @default(autoincrement())
     title String
     done  Boolean @default(false)
   }
   ```
3. Generate client: `npx prisma generate`
4. Practice: CRUD operations with Prisma

### Week 2: Understanding Our Project

**Day 8-10: Explore the Codebase**
1. Read `README.md` thoroughly
2. Explore each package in `packages/`:
   - Read the code
   - Understand exports
   - See how they're used in services
3. Draw a diagram of how packages relate

**Day 11-12: Run the Project Locally**
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up `.env` file (copy from `.env.example`)
4. Start database: `docker-compose up -d postgres`
5. Run migrations: `npm run migrate:dev`
6. Start services: `npm run dev`
7. Test endpoints with Postman/curl

**Day 13-14: Trace a Request**
1. Pick one endpoint: `POST /api/v1/users`
2. Set breakpoints in VS Code
3. Step through the code:
   - Middleware execution
   - Controller → Service → Repository
   - Database writes
4. Understand the flow completely

### Week 3: Build Your Own Mini-Version

**Day 15-17: Build a Simplified Version**
1. Create a new project: `mkdir my-backend && cd my-backend`
2. Initialize: `npm init -y && npx tsc --init`
3. Install: `express`, `prisma`, `typescript`
4. Implement:
   - One service (e.g., Users API)
   - One table (e.g., users)
   - Basic CRUD operations
   - Error handling middleware

**Day 18-19: Add Complexity**
1. Add a second table (e.g., posts)
2. Add relationships (user has many posts)
3. Implement pagination
4. Add input validation

**Day 20-21: Add Workers**
1. Create a simple worker that polls a table
2. Implement retry logic
3. Use transactions for consistency
4. Test with database restarts (resilience)

### Week 4: Advanced Concepts

**Day 22-24: Implement Outbox Pattern**
1. Create `outbox_commands` table
2. Write commands to outbox instead of processing immediately
3. Create worker to process outbox
4. Add status tracking (PENDING, SUBMITTED, COMMITTED, FAILED)

**Day 25-26: Implement Idempotency**
1. Create `http_idempotency` table
2. Add middleware to check for duplicate requests
3. Test: Send same request twice, verify only processed once

**Day 27-28: Observability**
1. Add Pino logger to your project
2. Add request logging
3. Add Prometheus metrics
4. Visualize metrics (optional: Grafana)

### Ongoing: Deep Dives

- **Security**: Study JWT, bcrypt, input validation
- **Testing**: Write unit tests with Jest
- **Docker**: Containerize your services
- **Kubernetes**: Deploy to local k8s cluster (minikube)
- **Monitoring**: Set up Prometheus + Grafana
- **Distributed Systems**: Study CAP theorem, eventual consistency

---

## 9. Common Questions & Answers

### Q1: Why do we have so many folders and files?

**A**: Each file has ONE responsibility (Single Responsibility Principle). This makes code:
- Easier to find (know where to look)
- Easier to test (test one thing at a time)
- Easier to change (change doesn't affect everything)

Example:
```
Instead of:
  app.js (5000 lines of everything)

We have:
  routes/users.ts (route definitions)
  controllers/users.ts (HTTP handling)
  services/users.ts (business logic)
  repositories/users.ts (database access)
```

### Q2: Why use environment variables instead of hardcoding values?

**A**: Different environments need different values:

```typescript
// ❌ Hardcoded
const DATABASE_URL = 'postgresql://localhost:5432/dev';

// Problems:
// - Can't use in production (different database!)
// - Secrets in code (security risk)
// - Can't change without redeploying
```

```typescript
// ✅ Environment variables
const DATABASE_URL = process.env.DATABASE_URL;

// Benefits:
// - Different values per environment (dev/staging/prod)
// - Secrets not in code
// - Can change without redeploying (just restart app)
```

### Q3: What is "eventual consistency" and why is it OK?

**A**: With CQRS, there's a delay between write and read:

```
User transfers money:
  T+0s: User sends request → API writes to outbox → Returns 202
  T+5s: Worker submits to blockchain
  T+7s: Blockchain confirms transaction
  T+8s: Projector updates database
  T+8s: User sees updated balance
```

**Why it's OK**:
- User sees "pending" status (sets expectations)
- Most operations complete in < 10 seconds
- Critical operations (e.g., double-spend) prevented by blockchain
- Much better UX than waiting 7 seconds for every request!

**When it's NOT OK**:
- Stock trading (need immediate consistency)
- Inventory management (can oversell if eventual)
→ In these cases, use synchronous writes (slower but consistent)

### Q4: How do workers know which commands to process?

**A**: Each worker has a unique ID and uses database locking:

```sql
-- Worker 1 tries to claim commands
UPDATE outbox_commands
SET status = 'LOCKED', locked_by = 'worker-1'
WHERE id IN (
  SELECT id FROM outbox_commands
  WHERE status = 'PENDING'
  LIMIT 10
  FOR UPDATE SKIP LOCKED  -- Skip rows locked by other workers
)
RETURNING *;
```

**Key**: `FOR UPDATE SKIP LOCKED` ensures two workers don't process the same command.

### Q5: What happens if a worker crashes mid-processing?

**A**: Lock timeout + status reset:

```typescript
// Every minute, check for stale locks
setInterval(async () => {
  await prisma.outboxCommand.updateMany({
    where: {
      status: 'LOCKED',
      lockedAt: {
        lt: new Date(Date.now() - 60000)  // Locked > 1 minute ago
      }
    },
    data: {
      status: 'PENDING',
      lockedBy: null,
      lockedAt: null
    }
  });
}, 60000);
```

If worker crashes, lock expires after 1 minute and another worker can pick it up.

### Q6: Why JSON for outbox payload instead of separate columns?

**A**: Flexibility vs. Structure trade-off:

```sql
-- ❌ Separate columns (rigid)
CREATE TABLE outbox_commands (
  command_type VARCHAR,
  user_email VARCHAR,     -- Only for user commands
  transfer_amount DECIMAL, -- Only for transfer commands
  ...                      -- Many nullable columns!
);

-- ✅ JSON payload (flexible)
CREATE TABLE outbox_commands (
  command_type VARCHAR,
  payload JSONB  -- Can store ANY command data
);
```

**Benefits of JSON**:
- Add new command types without schema changes
- No nullable columns
- Can store complex nested data

**Downside**:
- Can't query inside payload easily (but we rarely need to)

### Q7: How do we prevent race conditions?

**A**: Database transactions + constraints:

```typescript
// ❌ Race condition possible
const balance = await getBalance(userId);
if (balance >= amount) {
  await updateBalance(userId, balance - amount);
}
// Problem: Two requests can pass the check simultaneously!

// ✅ Atomic update (safe)
await prisma.wallet.update({
  where: { userId },
  data: {
    balance: {
      decrement: amount  // Atomic operation!
    }
  }
});
// Database ensures atomicity (all-or-nothing)
```

Also use database constraints:
```sql
ALTER TABLE wallets
ADD CONSTRAINT balance_non_negative
CHECK (balance >= 0);
-- Prevents negative balances at database level!
```

### Q8: Why TypeScript if it compiles to JavaScript anyway?

**A**: TypeScript catches errors at **build time**, not **runtime**:

```typescript
// TypeScript compilation:
function add(a: number, b: number): number {
  return a + b;
}

add(1, '2');  // ❌ Compiler error BEFORE running!
```

```javascript
// JavaScript (no types):
function add(a, b) {
  return a + b;
}

add(1, '2');  // ✅ Runs, returns "12" (wrong!) 😱
```

**Value**: Find bugs before users do!

---

## 10. Further Reading & Resources

### Official Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Node.js Docs](https://nodejs.org/en/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Prisma Docs](https://www.prisma.io/docs/)
- [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html)

### Architecture Patterns
- [Martin Fowler - CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Microservices.io - Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Microsoft - CQRS Architecture](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)

### Books (Highly Recommended)
- **"Node.js Design Patterns"** by Mario Casciaro
- **"Designing Data-Intensive Applications"** by Martin Kleppmann
- **"Building Microservices"** by Sam Newman
- **"Clean Code"** by Robert C. Martin

### Video Courses
- [Fireship.io - 100 Seconds Series](https://www.youtube.com/c/Fireship) (Quick overviews)
- [Traversy Media - Node.js Crash Course](https://www.youtube.com/watch?v=fBNz5xF-Kx4)
- [FreeCodeCamp - Full Stack Course](https://www.freecodecamp.org/)

### Practice Projects
1. **Build a Blog API**: Users, posts, comments (CRUD operations)
2. **Build a URL Shortener**: Learn hashing, redirects
3. **Build a Chat App**: Learn WebSockets, real-time events
4. **Build a Simple E-commerce**: Learn transactions, inventory

### Community
- [r/node](https://www.reddit.com/r/node/) - Node.js subreddit
- [Stack Overflow](https://stackoverflow.com/questions/tagged/node.js)
- [Discord: Reactiflux](https://www.reactiflux.com/) (Has Node.js channels)

---

## 🎯 Your Learning Checklist

Track your progress through this guide:

### Fundamentals
- [ ] Understand TypeScript basics (types, interfaces, generics)
- [ ] Build a simple Express API
- [ ] Use Prisma for database operations
- [ ] Understand middleware pattern

### Architecture
- [ ] Explain CQRS in your own words
- [ ] Explain Outbox Pattern in your own words
- [ ] Draw the system architecture from memory
- [ ] Trace a request through the entire system

### Hands-On
- [ ] Run the project locally
- [ ] Make a change to one service
- [ ] Add a new endpoint
- [ ] Write a database migration
- [ ] Build your own simplified version

### Advanced
- [ ] Implement idempotency in your project
- [ ] Add Prometheus metrics
- [ ] Write unit tests
- [ ] Containerize with Docker
- [ ] Understand eventual consistency trade-offs

---

## 📞 Questions?

As you go through this guide, keep a notebook with:
- Concepts you don't understand
- Questions that arise
- "Aha!" moments

Then discuss with your mentor or team. Learning is a conversation! 💬

**Remember**: 
- It's OK to not understand everything immediately
- Everyone was a beginner once
- The best way to learn is by building
- Ask questions (there are no stupid questions!)

---

**Good luck on your learning journey! You've got this! 🚀**

**Last Updated**: October 15, 2025  
**Version**: 1.0
