# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **GX Coin Protocol Off-Chain Backend System** - a microservices architecture implementing CQRS (Command Query Responsibility Segregation) and Event-Driven Architecture patterns for the GX Coin Protocol, a permissioned blockchain built on Hyperledger Fabric.

**Parent Repository Structure:**
```
/home/sugxcoin/prod-blockchain/
├── gx-coin-fabric/          # Hyperledger Fabric 2.5 blockchain network
│   ├── chaincode/           # Go smart contracts (38 functions, 7 contracts)
│   ├── k8s/                 # Production Kubernetes manifests
│   ├── scripts/             # Operational scripts (upgrade, reset, test)
│   ├── docs/                # Complete blockchain documentation
│   │   ├── technical/       # CHAINCODE_API_REFERENCE.md, EVENTS.md
│   │   ├── operations/      # BACKEND_INTEGRATION.md, TESTING_GUIDE.md
│   │   ├── protocol/        # WHITEPAPER.md, GREENPAPER.md
│   │   └── production/      # Migration phases 1-10
│   └── CLAUDE.md            # Fabric-specific guidance
│
├── gx-protocol-backend/     # This directory - Node.js backend
│   └── CLAUDE.md            # This file
│
├── CLAUDE.md                # Root-level guidance (entire system)
├── GX_COIN_WHITEPAPER.md    # Protocol vision and economics
└── INFRASTRUCTURE-GUIDE.md  # Infrastructure documentation
```

**Critical Fabric Network Documentation:**
- `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/technical/CHAINCODE_API_REFERENCE.md` - All 38 functions with examples
- `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/operations/BACKEND_INTEGRATION.md` - Node.js SDK integration guide
- `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/technical/EVENTS.md` - Complete event catalog
- `/home/sugxcoin/prod-blockchain/gx-coin-fabric/CLAUDE.md` - Fabric development guidance

**Key Technologies:**
- Runtime: Node.js 20+ with TypeScript
- Framework: Express.js
- Database: PostgreSQL 15 with Prisma ORM
- Cache: Redis 7
- Blockchain: Hyperledger Fabric
- Monorepo: Turborepo + NPM Workspaces
- Observability: Prometheus, Pino Logger

## Repository Structure

```
gx-protocol-backend/
├── apps/               # Deployable HTTP microservices
│   └── svc-identity/   # User authentication & profile management
├── workers/            # Background workers
│   ├── outbox-submitter/  # Submits commands to Fabric chaincode
│   └── projector/      # Builds read models from Fabric events
├── packages/           # Shared libraries
│   ├── core-config/    # Environment configuration with Zod
│   ├── core-logger/    # Pino structured logging
│   ├── core-db/        # Prisma ORM client + utilities
│   ├── core-http/      # Express middlewares
│   ├── core-fabric/    # Hyperledger Fabric SDK integration
│   ├── core-events/    # Event schema registry with JSON Schema
│   └── core-openapi/   # OpenAPI validation
├── db/                 # Database schema & migrations
│   └── prisma/
│       └── schema.prisma  # Single source of truth (1133 lines)
├── infra/              # Infrastructure configuration
│   ├── docker/         # Docker Compose for local dev
│   └── fabric/         # Fabric connection profiles
├── docs/               # Documentation
│   ├── adr/            # Architecture Decision Records
│   └── sequences/      # Sequence diagrams
└── openapi/            # API specifications
```

## Common Commands

### Development

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start PostgreSQL and Redis via Docker
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Run database migrations
npm run migrate:dev

# Start all services in watch mode
npm run dev

# Run a specific service
npm run dev --filter=svc-identity
npm run dev --filter=outbox-submitter
npm run dev --filter=projector
```

### Testing

```bash
# Run all tests
npm run test

# Run tests for a specific package
npm run test --filter=core-fabric
npm run test --filter=svc-identity

# Run with coverage
npm run test:coverage
```

### Building & Linting

```bash
# Build all packages
npm run build

# Build specific package
npm run build --filter=core-db

# Type checking
npm run type-check

# Lint all code
npm run lint

# Format code
npm run format
```

### Database Operations

```bash
# Run migrations (production)
npm run migrate

# Create a new migration
npm run migrate:create --workspace=@gx/core-db

# Open Prisma Studio
npm run studio --workspace=@gx/core-db

# Regenerate Prisma client
npm run generate --workspace=@gx/core-db
```

### Fabric Network Operations (Production Kubernetes)

**Important:** These commands interact with the production Fabric network in `/home/sugxcoin/prod-blockchain/gx-coin-fabric/`

```bash
# Check Fabric network status
kubectl get pods -n fabric

# Test chaincode (query system status)
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
./test_chaincode_k8s.sh

# View chaincode logs
kubectl logs -n fabric -l chaincode=gxtv3 --tail=50

# Upgrade chaincode after changes
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
./scripts/k8s-upgrade-chaincode.sh <version> <sequence>

# Run chaincode unit tests
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric/chaincode
go test -v

# View peer logs
kubectl logs -n fabric peer0-org1-0 --tail=100

# View orderer logs
kubectl logs -n fabric orderer0-0 --tail=100
```

## Architecture Patterns

### CQRS Flow (Critical)

**Write Path (Commands):**
```
API Request → Outbox Table → Outbox-Submitter Worker → Fabric Chaincode → Event Emitted
```

1. API endpoints write commands to `outbox_commands` table
2. HTTP request returns immediately (202 Accepted)
3. `outbox-submitter` worker polls and submits to Fabric
4. Worker updates outbox status (COMMITTED/FAILED)

**Read Path (Queries):**
```
Fabric Event → Projector Worker → Read Model (PostgreSQL) → API Response
```

1. `projector` worker listens to Fabric chaincode events
2. Events are validated against JSON schemas in `@gx/core-events`
3. Projector updates read model tables (user_profiles, wallets, etc.)
4. API queries read models directly (fast reads from PostgreSQL)

### Key Architectural Rules

1. **NEVER bypass the outbox pattern** for Fabric writes
   ```typescript
   // CORRECT: Write to outbox
   await prisma.outboxCommand.create({
     data: {
       aggregateId: userId,
       commandType: 'CREATE_USER',
       payload: userPayload
     }
   });

   // WRONG: Direct chaincode invocation in API handler
   await fabric.submitTransaction('CreateUser', userId); // DON'T DO THIS
   ```

2. **NEVER read from chaincode in API endpoints** - always use read models
   ```typescript
   // CORRECT: Query read model
   const user = await prisma.userProfile.findUnique({ where: { id: userId } });

   // WRONG: Query chaincode
   const user = await fabric.evaluateTransaction('GetUser', userId); // DON'T DO THIS
   ```

3. **Always validate events** against schemas from `@gx/core-events`
   ```typescript
   import { EventValidator } from '@gx/core-events';

   const isValid = EventValidator.validate('UserCreated', eventData);
   if (!isValid) {
     // Send to Dead-Letter Queue
   }
   ```

4. **Implement idempotency** for all write endpoints
   ```typescript
   // Use X-Idempotency-Key header
   app.post('/api/v1/users', idempotencyMiddleware, async (req, res) => {
     // Handler logic
   });
   ```

5. **Health checks must monitor projection lag**
   ```typescript
   app.get('/readyz', async (req, res) => {
     const lagMs = await getProjectionLag();
     if (lagMs > PROJECTION_LAG_THRESHOLD_MS) {
       return res.status(503).json({ ready: false, lagMs });
     }
     return res.status(200).json({ ready: true, lagMs });
   });
   ```

## Service File Organization

Each service follows this standard structure:

```
src/
├── app.ts              # Express setup
├── index.ts            # Entry point
├── config.ts           # Environment config (Zod validation)
├── routes/             # Route definitions
├── controllers/        # Request handlers
├── services/           # Business logic
├── repositories/       # Database access
├── fabric/             # Fabric interactions (via outbox)
└── middlewares/        # Custom middleware
```

## Database Schema Patterns

The Prisma schema (`db/prisma/schema.prisma`) contains 1133 lines with these key tables:

**CQRS/Event-Driven Infrastructure:**
- `outbox_commands` - Pending chaincode transactions (outbox pattern)
- `projector_state` - Event processing checkpoints (tracks last processed block/tx)
- `http_idempotency` - Idempotency key store (exactly-once semantics)

**Read Models:**
- `user_profile` - User information projected from Fabric
- `wallet` - Wallet balances projected from Fabric
- `transaction_history` - Transaction records projected from Fabric
- Plus ~35 other domain tables for multi-tenancy, KYC, organizations, governance, etc.

## Important Technical Details

### Environment Configuration

All services use Zod schemas in their `config.ts` for type-safe environment validation:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  PROJECTION_LAG_THRESHOLD_MS: z.coerce.number().default(10000),
});

export const config = ConfigSchema.parse(process.env);
```

### Event Schema Registry

All Fabric events are defined as JSON Schemas in `packages/core-events/src/schemas/`:
- `user-created.schema.ts`
- `wallet-created.schema.ts`
- `transfer-completed.schema.ts`
- etc.

The `SchemaRegistry` singleton validates all events using Ajv before processing.

**Complete Fabric Event Types:**

System Events:
- SystemBootstrapped, SystemPaused, SystemResumed, CountryInitialized

Identity Events:
- UserCreated, RelationshipRequested, RelationshipConfirmed, ProfileUpdated

Tokenomics Events:
- GenesisDistributed, TokensMinted, TokensBurned, TransferCompleted, TransferFailed

Organization Events:
- OrganizationProposed, OrganizationActivated, MultiSigTxInitiated, MultiSigTxApproved, MultiSigTxExecuted

Loan Events:
- LoanApplied, LoanApproved, LoanRepaid, LoanDefaulted

Governance Events:
- ProposalSubmitted, VoteCast, ProposalExecuted, ProposalRejected

Tax/Fee Events:
- TransactionFeeCollected, HoardingTaxApplied

### Hyperledger Fabric Integration

**Multi-Network Support:**
The system supports three network environments:

1. **Development (dev)** - Local Docker Compose
   - Network ID: `dev`
   - Channel: `gxchannel`, Chaincode: `gxtv3`
   - Peers: 2, Orderers: 3
   - No Fabric CA (uses cryptogen), No ABAC support

2. **Testnet** - Kubernetes pre-production
   - Network ID: `testnet`
   - Channel: `gxchannel`, Chaincode: `gxtv3`
   - Peers: 4 (2 per org), Orderers: 5 (Raft)
   - Fabric CA: Yes (full ABAC), TLS: Enabled
   - Monitoring: Prometheus + Grafana

3. **Mainnet** - Production
   - Network ID: `mainnet`
   - Channel: `gxchannel`, Chaincode: `gxtv3`
   - Peers: 4+, Orderers: 5+ (Raft)
   - Fabric CA: HA cluster with PostgreSQL
   - TLS + mTLS, HSM for key storage
   - Full monitoring stack

**Configuration Strategy:**
```bash
# Primary network selector
GX_NETWORK=testnet  # Options: dev, testnet, mainnet

# Network-specific overrides
GX_FABRIC_CHANNEL=gxchannel
GX_FABRIC_CHAINCODE=gxtv3
GX_FABRIC_MSP_ID=Org1MSP
GX_FABRIC_PEER_ENDPOINT=peer0-org1.testnet.goodness.exchange:7051
GX_FABRIC_ORDERER_ENDPOINT=orderer0.testnet.goodness.exchange:7050

# TLS configuration
GX_FABRIC_TLS_ENABLED=true
GX_FABRIC_TLS_CERT_PATH=/etc/fabric/tls/server.crt
```

**Connection Profiles:** Stored in `config/connection-profiles/`
- `dev-connection.yaml`
- `testnet-connection.yaml`
- `mainnet-connection.yaml`

**Identity Wallets:** Stored in `config/wallets/{network-id}/`

**38 Chaincode Functions Across 7 Contracts:**
- **AdminContract** (6): BootstrapSystem, InitializeCountryData, ActivateTreasury, PauseSystem, ResumeSystem, GetSystemStatus
- **IdentityContract** (5): CreateUser, UserExists, RequestRelationship, ConfirmRelationship, GetMyProfile
- **TokenomicsContract** (11): DistributeGenesis, GetBalance, Transfer, TransferFromOrg, MintTokens, BurnTokens, QueryTxHistory, GetTotalSupply, GetCirculatingSupply, GetTreasuryBalance, CalculateAllocation
- **OrganizationContract** (7): ProposeOrganization, EndorseMembership, ActivateOrganization, DefineAuthRule, InitiateMultiSigTx, ApproveMultiSigTx, GetOrganization
- **LoanPoolContract** (3): ApplyForLoan, ApproveLoan, GetMyLoans
- **GovernanceContract** (6): SubmitProposal, VoteOnProposal, ExecuteProposal, GetProposalDetails, ListActiveProposals, GetMyVotes
- **TaxAndFeeContract** (2): CalculateTransactionFee, TriggerHoardingTaxCycle

**Function Invocation Format:**
```typescript
// All functions use ContractName:FunctionName pattern
await gateway.submitTransaction('Identity:CreateUser', userId, nationality);
await gateway.submitTransaction('Tokenomics:Transfer', recipientId, amount);
```

**Chaincode Files (Go Smart Contracts):**
The chaincode source is in `/home/sugxcoin/prod-blockchain/gx-coin-fabric/chaincode/`:
- `contract.go` - Main SmartContract (embeds all sub-contracts)
- `admin_contract.go` - System administration (25,497 bytes)
- `identity_contract.go` - User identity management (24,831 bytes)
- `tokenomics_contract.go` - Currency operations (31,327 bytes)
- `organization_contract.go` - Multi-sig accounts (18,521 bytes)
- `loan_pool_contract.go` - Lending system (9,370 bytes)
- `governance_contract.go` - Governance (8,930 bytes)
- `tax_and_fee_contract.go` - Fees and taxes (13,520 bytes)
- `access_control.go` - ABAC implementation (3,565 bytes)
- `*_types.go` - Data structures per domain
- `helpers.go` - Utility functions (3,059 bytes)

**Access Control (ABAC):**
The backend must authenticate with appropriate Fabric CA attributes:
- `gx_super_admin` - Full system control (bootstrap, pause)
- `gx_admin` - Organization management
- `gx_partner_api` - Transaction submission (backend API integration)

These attributes are assigned during Fabric CA enrollment and verified in chaincode via `access_control.go`.

### Health Check Pattern

Services expose three endpoints:
- `GET /health` - Basic health check (always returns 200)
- `GET /readyz` - Readiness probe (fails if projection lag > threshold)
- `GET /livez` - Liveness probe (checks critical dependencies)

### Metrics

Key Prometheus metrics to monitor:
- `fabric_submit_duration_ms` - Fabric submission latency
- `projection_lag_ms` - Event processing lag (CRITICAL)
- `http_request_duration_ms` - API response times
- `outbox_queue_size` - Pending commands

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Explicit return types on functions
- Use interfaces for public APIs, types for internal
- Prefer async/await over promise chains

### Naming Conventions
- Services: `svc-<domain>` (e.g., `svc-identity`)
- Workers: `<purpose>` (e.g., `outbox-submitter`, `projector`)
- Core packages: `core-<concern>` (e.g., `core-logger`)
- API routes: RESTful with versioning (e.g., `/api/v1/users`)

### Error Handling
- Use custom error classes with proper HTTP status codes
- Centralized error middleware in `@gx/core-http`
- Always log errors with structured context using Pino

## Testing Strategy

- **Unit tests**: Jest for business logic
- **Integration tests**: Testcontainers for database tests
- **Load tests**: k6 scripts (run in CI/CD)
- No mocks for database - use test database

## User Registration Flow (Example)

The CQRS pattern in action - user registration demonstrates the complete write and read path:

**Write Path (Command):**
1. Client sends `POST /register` to `svc-identity`
2. API writes command to `outbox_commands` table
3. API returns `202 Accepted` with command ID (fast response)
4. `outbox-submitter` worker polls outbox
5. Worker submits `CreateUser` transaction to Fabric chaincode
6. Chaincode processes and emits `UserCreated` event

**Read Path (Query):**
1. `projector` worker listens to Fabric events
2. Receives `UserCreated` event from chaincode
3. Validates event against JSON schema in `@gx/core-events`
4. Updates `user_profiles` read model table
5. Updates `projector_state` checkpoint
6. Client queries `GET /me` - reads from `user_profiles` (fast)

See `docs/sequences/user-registration-flow.md` for detailed Mermaid diagram.

## Known Issues & Risks

### Technical Debt
1. **No Unit Tests Yet** - Tests configured but not written
   - Impact: Medium
   - Mitigation: Implement in Phase 1 tasks

2. **Fabric SDK Vulnerabilities** - 4 known CVEs in dependencies
   - Impact: Low (dev dependencies only)
   - Mitigation: Upgrade in Phase 1 & 4
   - Status: Documented in `docs/TASK-0.1-COMPLETION.md`

### Risks
1. **Fabric Network Complexity** 🔴 HIGH - Setup more complex than expected
2. **Event Processing Lag** 🟡 MEDIUM - Projector may struggle with high volume
3. **Third-party Dependencies** 🟡 MEDIUM - Breaking changes in Fabric/Prisma
4. **Timeline Pressure** 🟢 LOW - 16 weeks is aggressive but achievable

## Critical Success Factors

1. **Never bypass the outbox pattern** for chaincode writes
2. **Always validate events** against schemas in `@gx/core-events`
3. **Monitor projection lag** and fail health checks appropriately
4. **Implement idempotency** for all write endpoints
5. **Never query chaincode directly** from API endpoints - use read models
6. **Document all ADRs** in `docs/adr/`
7. **Keep project in WSL2 file system** (`~/projects/`) not Windows (`/mnt/c/`) for 10-50x performance

## Documentation

### Architecture Decision Records (ADRs)
- `docs/adr/001-monorepo-structure.md` - Why Turborepo + NPM Workspaces
- `docs/adr/002-cqrs-outbox-pattern.md` - Why CQRS with outbox pattern

### Key Documentation Files
- `docs/from-fabric-network.md` - **CRITICAL** - Complete Fabric integration guide
  - Multi-network configuration (dev/testnet/mainnet)
  - All 38 chaincode functions with contract mappings
  - Complete event catalog
  - Connection profile structure
  - Gateway manager implementation patterns
- `docs/PROJECT-STATUS.md` - Current project status, progress tracking
- `docs/LOCAL-DEVELOPMENT.md` - Complete local dev environment setup
- `docs/sequences/user-registration-flow.md` - Mermaid diagram of CQRS flow
- `docs/VISUAL-ARCHITECTURE-GUIDE.md` - Diagrams and visual explanations
- `docs/SECURITY-AUDIT-PHASE0.md` - Known security issues and mitigations

### Learning Resources
- `docs/README.md` - Complete learning resources index
- `docs/INTERNSHIP-LEARNING-GUIDE.md` - Week-by-week learning path
- `docs/HANDS-ON-EXERCISES.md` - Practical coding exercises
- `docs/lectures/` - Deep dive technical analysis
- **OpenAPI**: `openapi/` - API specifications (when implemented)

## Local Development Setup

### Docker Services Required

```bash
# Start PostgreSQL and Redis via Docker Compose
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Verify services are running
docker compose -f infra/docker/docker-compose.dev.yml ps

# Expected services:
# - gx_postgres_dev (postgres:15-alpine) on port 5432
# - gx_redis_dev (redis:7-alpine) on port 6379
```

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Key environment variables:
   ```bash
   DATABASE_URL="postgresql://gxuser:gxpass@localhost:5432/gxprotocol_dev?schema=public"
   REDIS_URL="redis://localhost:6379"
   NODE_ENV="development"
   LOG_LEVEL="debug"
   PROJECTION_LAG_THRESHOLD_MS=10000
   ```

3. Generate Prisma client and run migrations:
   ```bash
   npx prisma generate --schema=./db/prisma/schema.prisma
   npm run migrate:dev
   ```

### Prisma Studio (Database GUI)

```bash
# Open Prisma Studio to view and edit database
npx prisma studio --schema=./db/prisma/schema.prisma
```

## CI/CD Pipeline

The project uses GitHub Actions with 7 jobs:

1. **🔒 Security Scan** - npm audit, dependency checks, SBOM generation
2. **🔍 Lint & Type Check** - ESLint, TypeScript strict mode, Prettier
3. **🧪 Run Tests** - Jest with PostgreSQL/Redis service containers, coverage reports
4. **🏗️ Build** - Build all packages, analyze bundle sizes
5. **⚡ Performance Check** - Bundle size comparison (PRs only)
6. **🐳 Docker Build** - Validate Dockerfiles (main/dev only)
7. **📊 Pipeline Summary** - Generate comprehensive status report

**Important**: Tests run against PostgreSQL/Redis containers in CI, not mocks.

## Troubleshooting Common Issues

### Docker Issues
1. **Port conflicts (5432, 6379)** - Change port mappings in `docker-compose.dev.yml`
2. **Docker not running** - Start Docker Desktop, wait for green icon
3. **Permission denied** - Fix with `sudo chown -R $USER:$USER ~/projects/gx-protocol-backend`

### Database Issues
1. **Migration fails** - Reset with `npx prisma migrate reset --schema=./db/prisma/schema.prisma`
2. **ECONNREFUSED** - Check container health with `docker compose ps`
3. **Slow performance** - Ensure project is in WSL2 (`~/projects/`), not Windows (`/mnt/c/`)

### Fabric Integration Issues
1. **Connection fails** - Verify network ID matches connection profile
2. **TLS errors** - Check certificate paths in environment variables
3. **Identity not found** - Verify wallet exists in `config/wallets/{network-id}/`
4. **Discovery errors** - Set `asLocalhost: true` for dev network

### Build/Test Issues
1. **Type errors** - Run `npm run type-check` to identify issues
2. **Lint errors** - Run `npm run lint` to see violations
3. **Test fails** - Ensure PostgreSQL/Redis containers are running
4. **Module not found** - Run `npm install` and rebuild with `npm run build`

## Project Status

- **Current Phase**: Phase 1 - Identity & Fabric Bridge (Not Started)
- **Completed**: Phase 0 - Foundation & Setup (6/6 tasks, 100%)
- **Overall Progress**: 27.3% complete (Week 3 of 16)
- **Timeline**: 16-week project (Oct 13, 2025 - Feb 2026)
- **Team**: 1 developer with AI assistance
- **Environment**: WSL2 Ubuntu + Docker Desktop
- **Last Updated**: October 16, 2025

### Next Phase Tasks (Phase 1)
1. Task 1.1: Build `svc-identity` service
2. Task 1.2: Implement `@gx/core-fabric` package
3. Task 1.3: Build `outbox-submitter` worker
4. Task 1.4: Build `projector` worker
5. Task 1.5: Add idempotency middleware
6. Task 1.6: Implement readiness probes

## Cross-Repository Workflows

Since this backend integrates with the Fabric network in a sibling directory, here are common workflows:

### 1. Adding a New Chaincode Function

When a new chaincode function is added to the Fabric network:

```bash
# 1. Update chaincode in Fabric repo
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric/chaincode
# Edit the relevant contract file (e.g., tokenomics_contract.go)

# 2. Test chaincode locally
go test -v -run TestYourNewFunction

# 3. Upgrade chaincode on Kubernetes
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
./scripts/k8s-upgrade-chaincode.sh 2.2 7

# 4. Update backend event schema (if new event is emitted)
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend
# Add new schema in packages/core-events/src/schemas/

# 5. Update projector to handle new event
# Edit workers/projector/src/handlers/

# 6. Update core-fabric with new function mapping
# Edit packages/core-fabric/src/chaincode-functions.ts

# 7. Test end-to-end flow
npm run dev --filter=outbox-submitter &
npm run dev --filter=projector &
npm run dev --filter=svc-identity
```

### 2. Testing Backend Against Live Fabric Network

```bash
# Terminal 1: Ensure Fabric network is running
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
kubectl get pods -n fabric  # All should be Running

# Terminal 2: Start backend services
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend
docker compose -f infra/docker/docker-compose.dev.yml up -d
npm run migrate:dev
npm run dev

# Terminal 3: Monitor chaincode logs
kubectl logs -n fabric -l chaincode=gxtv3 -f

# Terminal 4: Monitor projector logs
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend
npm run dev --filter=projector
```

### 3. Debugging Fabric Integration Issues

```bash
# Check Fabric network health
kubectl get pods -n fabric
kubectl logs -n fabric peer0-org1-0 --tail=100

# Check chaincode deployment
kubectl exec -n fabric peer0-org1-0 -- peer lifecycle chaincode querycommitted -C gxchannel

# Test chaincode directly (bypass backend)
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
./test_chaincode_k8s.sh

# Check backend Fabric connection
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend
# Review logs in workers/outbox-submitter for connection errors

# Verify connection profile paths
ls -la config/connection-profiles/
ls -la config/wallets/testnet/
```

### 4. Event Schema Synchronization

Keep backend event schemas synchronized with chaincode events:

```bash
# 1. Check chaincode event definitions
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
grep -r "SetEvent" chaincode/*.go

# 2. Verify backend has matching schemas
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend
ls packages/core-events/src/schemas/

# 3. Generate TypeScript types from schemas
npm run generate-types --workspace=@gx/core-events

# 4. Validate all schemas
npm run test --filter=@gx/core-events
```

## Important Notes

1. **Never commit Fabric identities/wallets** - These are in `.gitignore`
2. **Connection profiles are environment-specific** - dev/testnet/mainnet
3. **Chaincode version must match** - Check `GX_FABRIC_CHAINCODE` env var
4. **Event processing order matters** - Projector must process events sequentially
5. **Testing requires both repositories** - Backend alone cannot function without Fabric network

## Quick Reference Links

**Fabric Network Docs:**
- Chaincode API: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/technical/CHAINCODE_API_REFERENCE.md`
- Events Catalog: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/technical/EVENTS.md`
- Backend Integration: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/operations/BACKEND_INTEGRATION.md`
- Testing Guide: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/docs/operations/TESTING_GUIDE.md`

**Backend Docs:**
- This file: `/home/sugxcoin/prod-blockchain/gx-protocol-backend/CLAUDE.md`
- Fabric Integration: `docs/from-fabric-network.md`
- Project Status: `docs/PROJECT-STATUS.md`
- Local Development: `docs/LOCAL-DEVELOPMENT.md`
