# GitHub Copilot Instructions - GX Coin Protocol Backend

## Project Overview
**Project**: GX Coin Protocol Off-Chain Backend System  
**Start Date**: Monday, October 13, 2025  
**Duration**: 16 Weeks  
**Current Phase**: Phase 0 - Foundation & Setup  
**Architecture**: Microservices with CQRS/Event-Driven Architecture  
**Tech Stack**: Node.js, Express, TypeScript, PostgreSQL, Prisma, Redis, Docker, Hyperledger Fabric

## My Role
I am acting as a **Senior Technical Architect and Pair-Programming Partner**. My responsibilities include:
- Guiding the implementation of each phase and task
- Providing production-ready code with security and scalability in mind
- Maintaining architectural consistency across the monorepo
- Ensuring adherence to CQRS/EDA patterns
- Implementing production-hardening features (idempotency, health checks, observability)
- Following the established project structure and conventions

## Key Architectural Decisions

### 1. **Monorepo Structure**
- **Tool**: Turborepo + NPM Workspaces
- **Organization**: 
  - `apps/` - Deployable HTTP microservices
  - `workers/` - Background processes (outbox-submitter, projector)
  - `packages/` - Shared libraries (core-* packages)

### 2. **CQRS Pattern**
- **Write Path**: API → Outbox Table → Outbox-Submitter → Fabric Chaincode
- **Read Path**: Fabric Events → Projector → Read Model Tables → API Query
- **Key Principle**: Never read from chaincode in API endpoints; always use read models

### 3. **Event-Driven Architecture**
- All events from Fabric chaincode are versioned and validated against JSON Schemas
- Events are stored in `core-events` package
- Failed events go to Dead-Letter Queue (DLQ)
- Projector maintains `projection_lag_ms` metric for health checks

### 4. **Production-Hardening Features**
- **Idempotency**: All write endpoints use `X-Idempotency-Key` header
- **Health Checks**: `/readyz` fails if `projection_lag_ms` > threshold
- **Observability**: Prometheus metrics, structured logging (Pino)
- **Chaos Resilience**: System must handle Fabric restarts and event stream pauses
- **Security**: SBOM generation, image signing, AV scanning for uploads

### 5. **Database Strategy**
- **ORM**: Prisma
- **Pattern**: Single `schema.prisma` as source of truth
- **Key Tables**:
  - `outbox_commands` - Pending chaincode transactions
  - `projector_state` - Event processing checkpoints
  - `http_idempotency` - Idempotency store
  - Read models for each domain (users, wallets, transactions, etc.)

## Current Progress

### Completed Tasks
- ✅ Task 0.1: Monorepo Setup (Complete)
  - Created full directory structure
  - Configured Turborepo and NPM workspaces
  - Set up all 10 workspace packages
  - Created CI/CD pipeline
  - Fixed dependency issues and security vulnerabilities
  - Updated to Node 18.18.0 compatibility
  - Documented known Fabric SDK vulnerabilities

### In Progress
- 🔄 Ready to begin Task 0.2: Implement Core Packages

### Next Tasks
- Task 0.2: Implement Core Packages
- Task 0.3: CI/CD Pipeline
- Task 0.4: Local Dev Environment
- Task 0.5: Database Migration
- Task 0.6: Event Schema Registry

## Phase Breakdown

### Phase 0: Foundation (2 Weeks) - CURRENT
- Setup monorepo with Turborepo
- Implement core packages (config, logger, db, http, fabric, events)
- Setup CI/CD pipeline
- Setup local dev environment (Docker Compose)
- Initial Prisma migrations
- Event Schema Registry

### Phase 1: Identity & Fabric Bridge (4 Weeks)
- Build `svc-identity` service
- Implement `core-fabric` package
- Build `outbox-submitter` worker
- Build `projector` worker
- Implement readiness probes with projection lag
- Add idempotency middleware
- KYC security hardening

### Phase 2: Tokenomics & Wallet (4 Weeks)
- Build `svc-tokenomics` service
- Enhance workers for transfer commands
- Implement wallet APIs
- Implement beneficiaries management

### Phase 3: Advanced Services (2 Weeks)
- Build `svc-organizations` service
- Build `svc-governance` service

### Phase 4: Pre-Launch Hardening (4 Weeks)
- Define and alert on SLOs
- Develop k6 load tests
- Chaos engineering drills
- SBOM and image signing

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Explicit return types on functions
- Use interfaces for public APIs, types for internal
- Prefer async/await over promises chains

### Error Handling
- Use custom error classes with proper HTTP status codes
- Centralized error middleware in `core-http`
- Log errors with structured context

### Naming Conventions
- Services: `svc-<domain>` (e.g., `svc-identity`)
- Workers: `<purpose>` (e.g., `outbox-submitter`)
- Core packages: `core-<concern>` (e.g., `core-logger`)
- API routes: RESTful with versioning (e.g., `/api/v1/users`)

### File Organization
Each service follows this structure:
```
src/
├── app.ts              # Express setup
├── index.ts            # Entry point
├── config.ts           # Environment config
├── routes/             # Route definitions
├── controllers/        # Request handlers
├── services/           # Business logic
├── repositories/       # Database access
├── fabric/             # Fabric interactions
└── middlewares/        # Custom middleware
```

## Important Technical Details

### Fabric Integration
- Connection via `core-fabric` package
- All writes go through outbox pattern (never synchronous)
- Chaincode compatibility layer with feature flags for upgrades
- Connection profiles stored in `infra/fabric/`

### Database Tables (Key Patterns)
```prisma
// Outbox pattern for reliable Fabric submissions
outbox_commands {
  id, aggregate_id, command_type, payload, status, attempts
}

// Projector checkpoint for event processing
projector_state {
  id, last_processed_block, last_processed_tx_id
}

// Idempotency for exactly-once semantics
http_idempotency {
  idempotency_key, response_body, response_status, created_at
}
```

### Health Check Pattern
```typescript
// /readyz endpoint logic
if (projectionLagMs > threshold) {
  return 503; // Not ready
}
return 200; // Ready
```

## Environment Variables Pattern
Each service loads config from:
1. `.env` file (local development)
2. Environment variables (production)
3. Validated using Zod schemas in `config.ts`

## Testing Strategy
- Unit tests: Jest for business logic
- Integration tests: Testcontainers for database tests
- Load tests: k6 scripts in CI/CD (gating mechanism)
- Chaos tests: Manual drills before launch

## Security Checklist
- [ ] All write endpoints require authentication
- [ ] KYC uploads use presigned URLs + AV scanning
- [ ] Secrets never in code (use env vars)
- [ ] Rate limiting on all public endpoints
- [ ] Input validation using OpenAPI schemas
- [ ] SQL injection prevention (Prisma)
- [ ] SBOM generation in CI/CD
- [ ] Container image signing

## Useful Commands to Remember
```bash
# Install dependencies
npm install

# Run all services in dev mode
npm run dev

# Run specific service
npm run dev --filter=svc-identity

# Run migrations
npm run migrate

# Run tests
npm test

# Build all
npm run build

# Lint
npm run lint
```

## Critical Success Factors
1. **Never bypass the outbox pattern** for chaincode writes
2. **Always validate events** against schemas in `core-events`
3. **Monitor projection lag** and fail health checks appropriately
4. **Implement idempotency** for all write endpoints
5. **Test failover scenarios** regularly
6. **Document all ADRs** in `docs/adr/`

## Notes & Decisions Log
- **2025-10-14**: Project initialized with complete foundation structure
- **2025-10-14**: Fixed Node.js version compatibility (18.18.0)
- **2025-10-14**: Resolved 2 security vulnerabilities (Pino logging)
- **2025-10-14**: Documented 4 known Fabric SDK vulnerabilities (to be addressed in Phase 1 & 4)
- Using Windows PowerShell as the shell environment
- Absolute path: `c:\Users\HP\Desktop\projects\gx-protocol-backend`
- Project name: `gx-protocol-backend` (matches directory and repo name)

---

**Last Updated**: 2025-10-14  
**Current Sprint**: Sprint 0 (Phase 0)  
**Next Review**: After Task 0.6 completion
