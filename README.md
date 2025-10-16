# GX Coin Protocol - Off-Chain Backend

> A secure, scalable, and production-ready backend system for the GX Coin Protocol, built with Node.js, TypeScript, and Hyperledger Fabric.

## 🏗️ Architecture

This project implements a **microservices architecture** using **CQRS** (Command Query Responsibility Segregation) and **Event-Driven Architecture** patterns.

### Key Components

- **API Services** (`apps/`): HTTP microservices handling user requests
- **Workers** (`workers/`): Background processes for reliable Fabric integration
  - `outbox-submitter`: Submits commands to Fabric chaincode
  - `projector`: Builds read models from Fabric events
- **Core Packages** (`packages/`): Shared libraries and utilities

### Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Blockchain**: Hyperledger Fabric
- **Monorepo**: Turborepo + NPM Workspaces
- **Observability**: Prometheus, Pino Logger

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Setup database
npm run migrate:dev

# Start local Fabric network (devnet)
npm run devnet

# Start all services in development mode
npm run dev
```

## 📦 Monorepo Structure

```
gx-protocol-backend/
├── apps/               # Deployable HTTP microservices
│   ├── svc-identity/   # User authentication & profile management
│   ├── svc-tokenomics/ # Token transfers and balances
│   └── ...
├── workers/            # Background workers
│   ├── outbox-submitter/
│   └── projector/
├── packages/           # Shared libraries
│   ├── core-config/
│   ├── core-logger/
│   ├── core-db/
│   ├── core-http/
│   ├── core-fabric/
│   └── core-events/
├── db/                 # Database migrations & schema
├── openapi/            # API specifications
├── infra/              # Infrastructure configuration
└── docs/               # Documentation
```

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start all services in watch mode
npm run build        # Build all packages and services
npm run test         # Run all tests
npm run lint         # Lint all code
npm run type-check   # TypeScript type checking
npm run format       # Format code with Prettier
npm run migrate      # Run database migrations
```

### Working with Services

```bash
# Run a specific service
npm run dev --filter=svc-identity

# Build a specific service
npm run build --filter=svc-tokenomics

# Run tests for a specific package
npm run test --filter=core-fabric
```

## 🏛️ Architecture Patterns

### CQRS Flow

**Write Path (Commands)**:
```
API Request → Outbox Table → Outbox-Submitter → Fabric Chaincode → Event Emitted
```

**Read Path (Queries)**:
```
Fabric Event → Projector → Read Model (PostgreSQL) → API Response
```

### Key Design Principles

1. **Outbox Pattern**: All Fabric writes go through an outbox for reliability
2. **Event Sourcing**: Read models are built from Fabric events
3. **Idempotency**: All write endpoints support idempotency keys
4. **Health Checks**: Services monitor projection lag and fail if lagging
5. **Observability**: Structured logging and Prometheus metrics

## 🔒 Security

- JWT-based authentication
- Rate limiting on all public endpoints
- Input validation using OpenAPI schemas
- Idempotency for exactly-once semantics
- Secure file uploads with AV scanning
- SBOM generation and image signing

## 📊 Observability

### Health Endpoints

- `GET /health` - Basic health check
- `GET /readyz` - Readiness probe (checks projection lag)
- `GET /livez` - Liveness probe

### Metrics

- `fabric_submit_duration_ms` - Fabric submission latency
- `projection_lag_ms` - Event processing lag
- `http_request_duration_ms` - API response times
- `outbox_queue_size` - Pending commands

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Load tests
npm run test:load

# Coverage report
npm run test:coverage
```

## 📖 Documentation

- [Architecture Decision Records](./docs/adr/)
- [API Documentation](./openapi/)
- [Sequence Diagrams](./docs/sequences/)
- [Deployment Guide](./docs/deployment.md)

## 🗓️ Project Timeline

- **Phase 0**: Foundation & Setup (2 weeks) ✅ **COMPLETE**
- **Phase 1**: Identity & Fabric Bridge (4 weeks) ← **Current**
- **Phase 2**: Tokenomics & Wallet (4 weeks)
- **Phase 3**: Advanced Services (2 weeks)
- **Phase 4**: Pre-Launch Hardening (4 weeks)

**Progress:** 6/22 tasks complete (27.3%) - Ahead of schedule! 🚀

## 📝 License

Proprietary - GX Coin Protocol

## 👥 Team

Founding Organization: GX Coin Protocol
Lead Developer: [Manazir Ali](https://www.manazir.dev)

---

**Status**: ✅ Phase 0 Complete | 🚀 Phase 1 Starting  
**Last Updated**: October 16, 2025
