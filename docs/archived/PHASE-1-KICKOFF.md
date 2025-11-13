# Phase 1: Identity & Fabric Bridge - Kickoff Document

**Phase Start Date:** October 16, 2025  
**Expected Duration:** 4 weeks (Weeks 3-6)  
**Status:** 🚀 Starting Now  
**Dependencies:** Phase 0 Complete ✅

---

## 🎯 Phase Objectives

Phase 1 establishes the **core CQRS/Event-Driven Architecture** by implementing:

1. **Identity Service** - User authentication and management
2. **Fabric Integration** - Hyperledger Fabric SDK connectivity
3. **CQRS Write Path** - Outbox pattern for reliable writes
4. **CQRS Read Path** - Event projection for read models
5. **Production Hardening** - Idempotency and health checks

### Success Criteria

By the end of Phase 1, we should be able to:
- ✅ Register a user via API → Command written to outbox
- ✅ Outbox-submitter picks up command → Submits to Fabric
- ✅ Fabric emits UserCreated event
- ✅ Projector receives event → Updates UserProfile table
- ✅ Query user profile via API → Returns projected data
- ✅ All services pass health checks
- ✅ Idempotency prevents duplicate requests

---

## 📋 Task Breakdown

### Task 1.1: Build svc-identity Service (Week 3)
**Priority:** 🔥 CRITICAL  
**Estimated Effort:** 12-16 hours  
**Dependencies:** None (all Phase 0 complete)

#### Deliverables
- [ ] Express app with TypeScript
- [ ] User registration endpoint (POST /api/v1/users)
- [ ] User login endpoint (POST /api/v1/auth/login)
- [ ] JWT token generation and validation
- [ ] Profile endpoints (GET/PATCH /api/v1/users/:id)
- [ ] KYC workflow endpoints
- [ ] OpenAPI spec for all endpoints
- [ ] Integration with @gx/core-* packages

#### API Endpoints to Implement
```typescript
POST   /api/v1/users              // Register new user
POST   /api/v1/auth/login         // Login (JWT)
POST   /api/v1/auth/refresh       // Refresh token
GET    /api/v1/users/:id          // Get user profile
PATCH  /api/v1/users/:id          // Update profile
POST   /api/v1/users/:id/kyc      // Submit KYC
GET    /api/v1/users/:id/kyc      // Get KYC status
GET    /health                     // Basic health
GET    /readyz                     // Readiness probe
GET    /livez                      // Liveness probe
```

#### Architecture Pattern
```
src/
├── index.ts                 # Entry point
├── app.ts                   # Express setup
├── config.ts                # Environment config
├── routes/
│   ├── index.ts            # Route registry
│   ├── auth.routes.ts      # Auth endpoints
│   ├── users.routes.ts     # User endpoints
│   └── health.routes.ts    # Health endpoints
├── controllers/
│   ├── auth.controller.ts
│   ├── users.controller.ts
│   └── health.controller.ts
├── services/
│   ├── auth.service.ts     # Business logic
│   ├── users.service.ts
│   └── kyc.service.ts
├── repositories/
│   └── outbox.repository.ts  # Write to outbox
└── middlewares/
    ├── auth.middleware.ts    # JWT validation
    └── validate.middleware.ts # Request validation
```

---

### Task 1.2: Implement @gx/core-fabric Package (Week 3-4)
**Priority:** 🔥 CRITICAL  
**Estimated Effort:** 16-20 hours  
**Dependencies:** Task 1.1 (can start in parallel)

#### Deliverables
- [ ] FabricClient class for connection management
- [ ] Transaction submission methods
- [ ] Event listener with reconnection logic
- [ ] Connection profile loader
- [ ] Error handling and retry logic
- [ ] Type definitions for chaincode interactions
- [ ] Comprehensive tests
- [ ] Documentation with examples

#### Core Classes to Implement
```typescript
// Connection management
class FabricClient {
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  async submitTransaction(chaincode, fn, args): Promise<string>
  async evaluateTransaction(chaincode, fn, args): Promise<any>
  getEventHub(): EventHub
}

// Event listening
class FabricEventListener {
  async start(): Promise<void>
  async stop(): Promise<void>
  on(eventName, callback): void
}

// Connection profile
interface ConnectionProfile {
  name: string
  version: string
  client: {...}
  organizations: {...}
  orderers: {...}
  peers: {...}
  certificateAuthorities: {...}
}
```

#### Fabric Network Configuration
- **Network:** Single organization, single peer (development)
- **Channel:** `gx-channel`
- **Chaincode:** `gx-chaincode` (identity, wallet, transfer functions)
- **MSP:** `GxMSP`

---

### Task 1.3: Build outbox-submitter Worker (Week 4)
**Priority:** 🔥 CRITICAL  
**Estimated Effort:** 10-12 hours  
**Dependencies:** Task 1.2 (needs @gx/core-fabric)

#### Deliverables
- [ ] Worker process with polling loop
- [ ] OutboxCommand table queries
- [ ] Transaction submission to Fabric
- [ ] Retry logic with exponential backoff
- [ ] Status updates (pending → processing → completed/failed)
- [ ] Dead-letter queue for permanent failures
- [ ] Prometheus metrics
- [ ] Health check endpoint

#### Processing Flow
```
1. Poll OutboxCommand table (status = 'pending')
2. Lock command for processing (status = 'processing')
3. Submit to Fabric via @gx/core-fabric
4. On success:
   - Update status to 'completed'
   - Record completion timestamp
5. On failure:
   - Increment attempts counter
   - If attempts < max_retries:
     - Update status back to 'pending'
     - Set next_retry_at timestamp
   - Else:
     - Move to DLQ (status = 'failed')
```

#### Key Features
- **Poll Interval:** 1 second (configurable)
- **Batch Size:** 10 commands per batch
- **Max Retries:** 5 attempts
- **Backoff:** Exponential (2^n seconds)
- **Concurrency:** Single-threaded (for simplicity)

---

### Task 1.4: Build projector Worker (Week 4)
**Priority:** 🔥 CRITICAL  
**Estimated Effort:** 14-18 hours  
**Dependencies:** Task 1.2 (needs @gx/core-fabric), Task 0.6 (needs @gx/core-events)

#### Deliverables
- [ ] Event stream listener
- [ ] Event validation with @gx/core-events
- [ ] Read model updaters (handlers)
- [ ] Checkpoint management (ProjectorState table)
- [ ] Error handling and DLQ
- [ ] Projection lag monitoring
- [ ] Health check endpoint
- [ ] Comprehensive tests

#### Event Handlers to Implement
```typescript
interface EventHandler {
  eventName: EventName
  handle(event: BaseEvent<any>): Promise<void>
}

// Handlers
- UserCreatedHandler     → Insert into UserProfile
- UserUpdatedHandler     → Update UserProfile
- UserKYCVerifiedHandler → Update UserProfile.kyc_status
- WalletCreatedHandler   → Insert into Wallet
- WalletCreditedHandler  → Update Wallet.balance
- WalletDebitedHandler   → Update Wallet.balance
- TransferCompletedHandler → Insert into Transaction
```

#### Processing Flow
```
1. Connect to Fabric event stream
2. For each block event:
   a. Extract transactions and events
   b. Validate event against schema (@gx/core-events)
   c. If valid:
      - Route to appropriate handler
      - Handler updates read model
      - Update ProjectorState checkpoint
   d. If invalid:
      - Log error
      - Send to DLQ
3. Calculate projection_lag_ms metric
4. Expose lag via health endpoint
```

#### Critical Metrics
- `projection_lag_ms` - Time between event emission and processing
- `events_processed_total` - Counter of successful events
- `events_failed_total` - Counter of validation failures
- `projector_checkpoint` - Last processed block number

---

### Task 1.5: Add Idempotency Middleware (Week 5)
**Priority:** 🟡 HIGH  
**Estimated Effort:** 6-8 hours  
**Dependencies:** Task 1.1 (needs svc-identity)

#### Deliverables
- [ ] Idempotency middleware in @gx/core-http
- [ ] X-Idempotency-Key header validation
- [ ] HttpIdempotency table lookup
- [ ] Response caching and replay
- [ ] TTL cleanup job
- [ ] Integration tests
- [ ] Documentation

#### Middleware Logic
```typescript
async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['x-idempotency-key']
  
  if (!key) {
    // Idempotency key required for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return res.status(400).json({ error: 'X-Idempotency-Key required' })
    }
    return next()
  }
  
  // Check if we've seen this key before
  const cached = await db.httpIdempotency.findUnique({ 
    where: { idempotencyKey: key }
  })
  
  if (cached) {
    // Replay cached response
    return res.status(cached.responseStatus).json(cached.responseBody)
  }
  
  // Proceed with request, but capture response
  const originalJson = res.json.bind(res)
  res.json = async (body) => {
    // Cache response
    await db.httpIdempotency.create({
      data: {
        idempotencyKey: key,
        responseBody: body,
        responseStatus: res.statusCode,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
      }
    })
    return originalJson(body)
  }
  
  next()
}
```

---

### Task 1.6: Implement Readiness Probes (Week 5)
**Priority:** 🟡 HIGH  
**Estimated Effort:** 4-6 hours  
**Dependencies:** Tasks 1.1, 1.3, 1.4

#### Deliverables
- [ ] /readyz endpoints for all services
- [ ] /livez endpoints for all services
- [ ] Projection lag checks
- [ ] Database connection checks
- [ ] Fabric connection checks
- [ ] Redis connection checks
- [ ] Health check utilities in @gx/core-http

#### Health Check Logic

**For svc-identity:**
```typescript
GET /readyz
- Check database connection (SELECT 1)
- Check Redis connection (PING)
- Check projection lag < threshold (5 seconds)
- Return 200 if all pass, 503 otherwise
```

**For outbox-submitter:**
```typescript
GET /readyz
- Check database connection
- Check Fabric connection
- Check outbox queue size < threshold (1000 commands)
- Return 200 if all pass, 503 otherwise
```

**For projector:**
```typescript
GET /readyz
- Check database connection
- Check Fabric event stream connected
- Check projection_lag_ms < threshold (5000ms)
- Return 200 if all pass, 503 otherwise
```

---

## 🏗️ Infrastructure Requirements

### Hyperledger Fabric Test Network

We need to set up a minimal Fabric network for development:

```yaml
# Components needed:
- 1 Orderer (Solo consensus for dev)
- 1 Organization (GxOrg)
- 1 Peer (peer0.gxorg.example.com)
- 1 CA (Certificate Authority)
- 1 Channel (gx-channel)
- 1 Chaincode (gx-chaincode)

# Files to create:
infra/fabric/
├── docker-compose-fabric.yml    # Fabric network containers
├── configtx.yaml                # Channel configuration
├── crypto-config.yaml           # Crypto material config
├── connection-profile.json      # For SDK connection
└── chaincode/
    └── gx-chaincode/            # Chaincode source
        ├── user.go              # User functions
        ├── wallet.go            # Wallet functions
        └── transfer.go          # Transfer functions
```

### Environment Variables

Add to `.env`:
```bash
# Fabric Configuration
FABRIC_NETWORK_NAME=gx-network
FABRIC_CHANNEL_NAME=gx-channel
FABRIC_CHAINCODE_NAME=gx-chaincode
FABRIC_MSP_ID=GxMSP
FABRIC_CONNECTION_PROFILE_PATH=/app/infra/fabric/connection-profile.json
FABRIC_WALLET_PATH=/app/infra/fabric/wallet
FABRIC_USER_NAME=admin

# Worker Configuration
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=10
OUTBOX_MAX_RETRIES=5

PROJECTOR_CHECKPOINT_INTERVAL_MS=1000
PROJECTOR_LAG_THRESHOLD_MS=5000

# Idempotency
IDEMPOTENCY_TTL_HOURS=24
```

---

## 📊 Phase 1 Timeline

```
Week 3 (Oct 16-22):
  Task 1.1 ████████████ [svc-identity]
  Task 1.2 ████████░░░░ [core-fabric] (start)

Week 4 (Oct 23-29):
  Task 1.2 ░░░░████████ [core-fabric] (finish)
  Task 1.3 ████████████ [outbox-submitter]
  Task 1.4 ████████████ [projector]

Week 5 (Oct 30-Nov 5):
  Task 1.5 ████████████ [idempotency]
  Task 1.6 ████████████ [health checks]

Week 6 (Nov 6-12):
  Integration testing, bug fixes, documentation
```

---

## 🧪 Testing Strategy

### Unit Tests
- All services, workers, and packages should have unit tests
- Target: 80%+ code coverage
- Use Jest with mocking for external dependencies

### Integration Tests
- Test full CQRS flow (API → Outbox → Fabric → Projector → API)
- Use Testcontainers for PostgreSQL, Redis
- Use Fabric test network (single peer)

### End-to-End Test Scenario
```
1. POST /api/v1/users (create user)
   → Assert: OutboxCommand created
   
2. Wait for outbox-submitter
   → Assert: Command status = 'completed'
   
3. Wait for projector
   → Assert: UserProfile exists in database
   
4. GET /api/v1/users/:id
   → Assert: Returns projected user data
   
5. POST /api/v1/users (duplicate, same idempotency key)
   → Assert: Returns cached response (exact same)
```

---

## 📚 Documentation Deliverables

- [ ] **Task completion reports** (one per task)
- [ ] **API documentation** (OpenAPI specs)
- [ ] **Architecture Decision Records** (ADRs)
  - ADR-006: JWT Authentication Strategy
  - ADR-007: Fabric Network Topology
  - ADR-008: Event Processing Guarantees
- [ ] **Operational runbooks**
  - How to deploy Fabric network
  - How to restart projector
  - How to handle DLQ events
- [ ] **Sequence diagrams**
  - User registration flow
  - CQRS write/read flow
  - Event processing flow

---

## 🎯 Definition of Done

A task is considered complete when:

- ✅ Code implemented following established patterns
- ✅ All unit tests passing (80%+ coverage)
- ✅ Integration tests passing
- ✅ TypeScript type-check passing
- ✅ ESLint passing (no errors)
- ✅ Code reviewed and approved
- ✅ Documentation complete (README, inline comments)
- ✅ Task completion report created
- ✅ Git commit with descriptive message
- ✅ Changes merged to `dev` branch

---

## 🚨 Risk Mitigation

### Risk 1: Fabric Network Complexity
**Mitigation:**
- Start with simplest possible network (1 org, 1 peer)
- Use official Fabric samples as reference
- Document setup steps thoroughly

### Risk 2: Event Processing Reliability
**Mitigation:**
- Implement checkpoint persistence
- Add event replay capability
- Monitor projection lag continuously

### Risk 3: Concurrency Issues
**Mitigation:**
- Use database transactions
- Implement row-level locking for outbox
- Add distributed locking if needed (Redis)

---

## 🎉 Let's Get Started!

**First Task:** Task 1.1 - Build svc-identity Service

Ready to begin? Let me know and I'll start implementing the identity service! 🚀

---

**Document Created:** October 16, 2025  
**Phase Duration:** 4 weeks  
**Target Completion:** November 12, 2025  
**Status:** Ready to Start ✅
