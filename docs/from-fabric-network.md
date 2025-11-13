# CLAUDE.md

This file provides guidance to Claude Code when working with the GX Protocol Backend.

## Project Overview

The **GX Protocol Backend** is a Node.js/TypeScript microservices architecture that integrates with the Hyperledger Fabric blockchain network. It implements CQRS (Command Query Responsibility Segregation) with Event-Driven Architecture to provide reliable, scalable API services for the GX Coin Protocol.

**Key Characteristics:**
- CQRS pattern with outbox/projector workers for reliable Fabric integration
- Event-driven architecture with PostgreSQL event sourcing
- Multi-network support (testnet/mainnet) with environment-based configuration
- Monorepo structure using Turborepo + NPM Workspaces
- Production-grade observability (Prometheus, Pino structured logging)
- Idempotent API design with distributed transaction support

## Architecture Overview

### System Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP API Layer                            │
│  (svc-identity, svc-wallet, svc-governance, etc.)                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Write Path (Commands)                        │
│                                                                   │
│  API Request → Outbox Table → Outbox-Submitter Worker →         │
│  Fabric Chaincode → Blockchain Event Emitted                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Read Path (Queries)                          │
│                                                                   │
│  Fabric Event → Projector Worker → Read Model (PostgreSQL) →    │
│  API Response                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Never write directly to Fabric** - Always use the outbox pattern
2. **Read models are eventually consistent** - Track projection lag
3. **All write endpoints are idempotent** - Use X-Idempotency-Key header
4. **Events are the source of truth** - Validate against schemas
5. **Multi-network aware** - Support testnet/mainnet via configuration

## Multi-Network Configuration Architecture

### Network Environments

The system supports multiple blockchain network environments:

1. **Development (Local)** - Docker Compose network for local testing
   - Network ID: `dev`
   - Channel: `gxchannel`
   - Chaincode: `gxtv3`
   - Peers: 2 (peer0.org1.dev, peer0.org2.dev)
   - Orderers: 3
   - Fabric CA: Not available (uses cryptogen)
   - ABAC Support: No (dev only)

2. **Testnet (Kubernetes)** - Pre-production testing environment
   - Network ID: `testnet`
   - Channel: `gxchannel`
   - Chaincode: `gxtv3`
   - Peers: 4 (2 per org)
   - Orderers: 5 (Raft consensus)
   - Fabric CA: Yes (full ABAC support)
   - TLS: Enabled
   - Monitoring: Prometheus + Grafana

3. **Mainnet (Kubernetes)** - Production environment
   - Network ID: `mainnet`
   - Channel: `gxchannel`
   - Chaincode: `gxtv3`
   - Peers: 4+ (2 per org, expandable)
   - Orderers: 5+ (Raft consensus)
   - Fabric CA: Yes (HA cluster with PostgreSQL backend)
   - TLS: Enabled + mTLS
   - HSM: SoftHSM/Hardware HSM for key storage
   - Monitoring: Full stack (Prometheus, Grafana, Loki, Jaeger)

### Configuration Strategy (Industry Best Practices)

**Environment-Based Configuration with Hierarchical Overrides:**

```
config/
├── base.yaml                    # Base configuration (shared)
├── networks/
│   ├── dev.yaml                 # Development network
│   ├── testnet.yaml             # Testnet network
│   └── mainnet.yaml             # Mainnet network
├── connection-profiles/
│   ├── dev-connection.yaml      # Fabric connection profile (dev)
│   ├── testnet-connection.yaml  # Fabric connection profile (testnet)
│   └── mainnet-connection.yaml  # Fabric connection profile (mainnet)
└── wallets/
    ├── dev/                     # Development identity wallets
    ├── testnet/                 # Testnet identity wallets
    └── mainnet/                 # Mainnet identity wallets
```

**Environment Variable Pattern:**

```bash
# Primary network selector
GX_NETWORK=testnet              # Options: dev, testnet, mainnet

# Network-specific overrides (optional)
GX_FABRIC_CHANNEL=gxchannel
GX_FABRIC_CHAINCODE=gxtv3
GX_FABRIC_MSP_ID=Org1MSP
GX_FABRIC_PEER_ENDPOINT=peer0-org1.testnet.goodness.exchange:7051
GX_FABRIC_ORDERER_ENDPOINT=orderer0.testnet.goodness.exchange:7050
GX_FABRIC_CA_ENDPOINT=ca.org1.testnet.goodness.exchange:7054

# TLS configuration
GX_FABRIC_TLS_ENABLED=true
GX_FABRIC_TLS_CERT_PATH=/etc/fabric/tls/server.crt
GX_FABRIC_TLS_KEY_PATH=/etc/fabric/tls/server.key
GX_FABRIC_TLS_CA_PATH=/etc/fabric/tls/ca.crt

# Database (per environment)
DATABASE_URL=postgresql://user:pass@postgres.testnet:5432/gx_protocol
REDIS_URL=redis://redis.testnet:6379

# API configuration
API_PORT=3000
LOG_LEVEL=info                  # dev: debug, testnet: info, mainnet: warn
```

### Fabric Connection Profile Structure

Each network environment requires a Fabric connection profile that defines:
- Peer endpoints (with gRPC/TLS configuration)
- Orderer endpoints (with gRPC/TLS configuration)
- Fabric CA endpoints (for identity management)
- Channel configuration
- Chaincode deployment details

**Example: testnet-connection.yaml**
```yaml
name: gx-protocol-testnet
version: 1.0.0
client:
  organization: Org1
  connection:
    timeout:
      peer:
        endorser: '300'
      orderer: '300'

channels:
  gxchannel:
    orderers:
      - orderer0.testnet.goodness.exchange
      - orderer1.testnet.goodness.exchange
      - orderer2.testnet.goodness.exchange
    peers:
      peer0-org1.testnet.goodness.exchange:
        endorsingPeer: true
        chaincodeQuery: true
        ledgerQuery: true
        eventSource: true
      peer1-org1.testnet.goodness.exchange:
        endorsingPeer: true
        chaincodeQuery: true
        ledgerQuery: true
        eventSource: true

organizations:
  Org1:
    mspid: Org1MSP
    peers:
      - peer0-org1.testnet.goodness.exchange
      - peer1-org1.testnet.goodness.exchange
    certificateAuthorities:
      - ca.org1.testnet.goodness.exchange

peers:
  peer0-org1.testnet.goodness.exchange:
    url: grpcs://peer0-org1.testnet.goodness.exchange:7051
    tlsCACerts:
      path: /etc/fabric/crypto/peerOrganizations/org1/peers/peer0/tls/ca.crt
    grpcOptions:
      ssl-target-name-override: peer0-org1.testnet.goodness.exchange
      hostnameOverride: peer0-org1.testnet.goodness.exchange

orderers:
  orderer0.testnet.goodness.exchange:
    url: grpcs://orderer0.testnet.goodness.exchange:7050
    tlsCACerts:
      path: /etc/fabric/crypto/ordererOrganizations/orderer/orderers/orderer0/tls/ca.crt
    grpcOptions:
      ssl-target-name-override: orderer0.testnet.goodness.exchange

certificateAuthorities:
  ca.org1.testnet.goodness.exchange:
    url: https://ca.org1.testnet.goodness.exchange:7054
    tlsCACerts:
      path: /etc/fabric/crypto/peerOrganizations/org1/ca/ca.org1-cert.pem
    registrar:
      enrollId: admin
      enrollSecret: adminpw
```

## Repository Structure

```
gx-protocol-backend/
├── apps/                        # HTTP microservices
│   ├── svc-identity/            # User identity, KYC, authentication
│   ├── svc-wallet/              # Wallet, balance, transaction history
│   ├── svc-governance/          # Proposals, voting, parameter updates
│   ├── svc-organizations/       # Multi-sig accounts, organization management
│   └── svc-loans/               # Loan applications, approvals
│
├── workers/                     # Background workers
│   ├── outbox-submitter/        # Submits commands to Fabric (reliable writes)
│   └── projector/               # Builds read models from Fabric events
│
├── packages/                    # Shared libraries
│   ├── core-config/             # Environment configuration with Zod validation
│   ├── core-logger/             # Pino structured logging
│   ├── core-db/                 # Prisma ORM client and utilities
│   ├── core-http/               # Express middlewares (error, validation)
│   ├── core-fabric/             # Hyperledger Fabric SDK integration
│   ├── core-events/             # Event schema registry with JSON Schema validation
│   └── core-openapi/            # OpenAPI schema validation
│
├── db/                          # Database
│   ├── schema.prisma            # Prisma schema definition
│   └── migrations/              # Database migrations
│
├── config/                      # Configuration files
│   ├── base.yaml                # Base configuration
│   ├── networks/                # Network-specific configs
│   ├── connection-profiles/     # Fabric connection profiles
│   └── wallets/                 # Fabric identity wallets
│
├── docs/                        # Documentation
│   ├── adr/                     # Architecture Decision Records
│   ├── sequences/               # Sequence diagrams
│   └── deployment.md            # Deployment guide
│
├── scripts/                     # Operational scripts
│   ├── setup-dev.sh             # Development environment setup
│   ├── setup-testnet.sh         # Testnet environment setup
│   └── migrate.sh               # Database migration runner
│
├── turbo.json                   # Turborepo configuration
├── package.json                 # Root package configuration
└── tsconfig.json                # TypeScript configuration
```

## Blockchain Integration Layer

### Fabric SDK Integration (packages/core-fabric/)

**Key Responsibilities:**
- Manage Fabric Gateway connections per network
- Submit transactions to chaincode
- Query chaincode state
- Listen to block/chaincode events
- Handle identity enrollment and wallet management

**Core Files:**
```
packages/core-fabric/
├── src/
│   ├── gateway.ts               # Fabric Gateway client wrapper
│   ├── network-config.ts        # Network configuration loader
│   ├── identity.ts              # Identity/wallet management
│   ├── contract.ts              # Contract invocation helpers
│   ├── event-listener.ts        # Block/chaincode event stream
│   └── types.ts                 # Fabric-specific types
├── test/
│   └── gateway.test.ts          # Integration tests
└── package.json
```

**Example: Multi-Network Gateway Manager**

```typescript
// packages/core-fabric/src/gateway.ts
import { Gateway, Wallets, Network, Contract } from 'fabric-network';
import { config } from '@gx/core-config';

export class FabricGatewayManager {
  private gateway: Gateway | null = null;
  private network: Network | null = null;
  private contract: Contract | null = null;

  async connect(): Promise<void> {
    const networkId = config.fabric.networkId; // 'dev', 'testnet', 'mainnet'

    // Load network-specific connection profile
    const connectionProfile = await this.loadConnectionProfile(networkId);

    // Load identity wallet for this network
    const wallet = await this.loadWallet(networkId);
    const identity = await wallet.get(config.fabric.identityLabel);

    if (!identity) {
      throw new Error(`Identity ${config.fabric.identityLabel} not found in wallet`);
    }

    // Create gateway
    this.gateway = new Gateway();
    await this.gateway.connect(connectionProfile, {
      wallet,
      identity: config.fabric.identityLabel,
      discovery: { enabled: true, asLocalhost: networkId === 'dev' },
    });

    // Get network and contract
    this.network = await this.gateway.getNetwork(config.fabric.channelName);
    this.contract = this.network.getContract(config.fabric.chaincodeName);
  }

  async submitTransaction(functionName: string, ...args: string[]): Promise<Buffer> {
    if (!this.contract) throw new Error('Gateway not connected');
    return await this.contract.submitTransaction(functionName, ...args);
  }

  async evaluateTransaction(functionName: string, ...args: string[]): Promise<Buffer> {
    if (!this.contract) throw new Error('Gateway not connected');
    return await this.contract.evaluateTransaction(functionName, ...args);
  }

  async disconnect(): Promise<void> {
    if (this.gateway) {
      this.gateway.disconnect();
      this.gateway = null;
      this.network = null;
      this.contract = null;
    }
  }

  private async loadConnectionProfile(networkId: string): Promise<any> {
    const profilePath = `config/connection-profiles/${networkId}-connection.yaml`;
    // Load and parse YAML
    return require(profilePath);
  }

  private async loadWallet(networkId: string): Promise<Wallet> {
    const walletPath = `config/wallets/${networkId}`;
    return await Wallets.newFileSystemWallet(walletPath);
  }
}
```

### Chaincode Function Mappings

**38 Chaincode Functions Across 7 Contracts:**

```typescript
// packages/core-fabric/src/chaincode-functions.ts

export const ChaincodeFunctions = {
  // AdminContract (6 functions)
  BOOTSTRAP_SYSTEM: 'Admin:BootstrapSystem',
  INITIALIZE_COUNTRY_DATA: 'Admin:InitializeCountryData',
  ACTIVATE_TREASURY: 'Admin:ActivateTreasuryAccount',
  PAUSE_SYSTEM: 'Admin:PauseSystem',
  RESUME_SYSTEM: 'Admin:ResumeSystem',
  GET_SYSTEM_STATUS: 'Admin:GetSystemStatus',

  // IdentityContract (5 functions)
  CREATE_USER: 'Identity:CreateUser',
  USER_EXISTS: 'Identity:UserExists',
  REQUEST_RELATIONSHIP: 'Identity:RequestRelationship',
  CONFIRM_RELATIONSHIP: 'Identity:ConfirmRelationship',
  GET_MY_PROFILE: 'Identity:GetMyProfile',

  // TokenomicsContract (11 functions)
  DISTRIBUTE_GENESIS: 'Tokenomics:DistributeGenesis',
  GET_BALANCE: 'Tokenomics:GetBalance',
  TRANSFER: 'Tokenomics:Transfer',
  TRANSFER_FROM_ORG: 'Tokenomics:TransferFromOrganization',
  MINT_TOKENS: 'Tokenomics:MintTokens',
  BURN_TOKENS: 'Tokenomics:BurnTokens',
  QUERY_TX_HISTORY: 'Tokenomics:QueryTransactionHistory',
  GET_TOTAL_SUPPLY: 'Tokenomics:GetTotalSupply',
  GET_CIRCULATING_SUPPLY: 'Tokenomics:GetCirculatingSupply',
  GET_TREASURY_BALANCE: 'Tokenomics:GetTreasuryBalance',
  CALCULATE_ALLOCATION: 'Tokenomics:CalculateUserAllocation',

  // OrganizationContract (7 functions)
  PROPOSE_ORGANIZATION: 'Organization:ProposeOrganization',
  ENDORSE_MEMBERSHIP: 'Organization:EndorseMembership',
  ACTIVATE_ORGANIZATION: 'Organization:ActivateOrganization',
  DEFINE_AUTH_RULE: 'Organization:DefineAuthRule',
  INITIATE_MULTISIG_TX: 'Organization:InitiateMultiSigTx',
  APPROVE_MULTISIG_TX: 'Organization:ApproveMultiSigTx',
  GET_ORGANIZATION: 'Organization:GetOrganization',

  // LoanPoolContract (3 functions)
  APPLY_FOR_LOAN: 'LoanPool:ApplyForLoan',
  APPROVE_LOAN: 'LoanPool:ApproveLoan',
  GET_MY_LOANS: 'LoanPool:GetMyLoans',

  // GovernanceContract (6 functions)
  SUBMIT_PROPOSAL: 'Governance:SubmitProposal',
  VOTE_ON_PROPOSAL: 'Governance:VoteOnProposal',
  EXECUTE_PROPOSAL: 'Governance:ExecuteProposal',
  GET_PROPOSAL_DETAILS: 'Governance:GetProposalDetails',
  LIST_ACTIVE_PROPOSALS: 'Governance:ListActiveProposals',
  GET_MY_VOTES: 'Governance:GetMyVotes',

  // TaxAndFeeContract (2 functions)
  CALCULATE_TX_FEE: 'TaxAndFee:CalculateTransactionFee',
  TRIGGER_HOARDING_TAX: 'TaxAndFee:TriggerHoardingTaxCycle',
};
```

### Event Catalog

**Blockchain Events (Emitted by Chaincode):**

```typescript
// packages/core-events/src/event-types.ts

export enum FabricEventType {
  // System Events
  SYSTEM_BOOTSTRAPPED = 'SystemBootstrapped',
  SYSTEM_PAUSED = 'SystemPaused',
  SYSTEM_RESUMED = 'SystemResumed',
  COUNTRY_INITIALIZED = 'CountryInitialized',

  // Identity Events
  USER_CREATED = 'UserCreated',
  RELATIONSHIP_REQUESTED = 'RelationshipRequested',
  RELATIONSHIP_CONFIRMED = 'RelationshipConfirmed',
  PROFILE_UPDATED = 'ProfileUpdated',

  // Tokenomics Events
  GENESIS_DISTRIBUTED = 'GenesisDistributed',
  TOKENS_MINTED = 'TokensMinted',
  TOKENS_BURNED = 'TokensBurned',
  TRANSFER_COMPLETED = 'TransferCompleted',
  TRANSFER_FAILED = 'TransferFailed',

  // Organization Events
  ORGANIZATION_PROPOSED = 'OrganizationProposed',
  ORGANIZATION_ACTIVATED = 'OrganizationActivated',
  MULTISIG_TX_INITIATED = 'MultiSigTxInitiated',
  MULTISIG_TX_APPROVED = 'MultiSigTxApproved',
  MULTISIG_TX_EXECUTED = 'MultiSigTxExecuted',

  // Loan Events
  LOAN_APPLIED = 'LoanApplied',
  LOAN_APPROVED = 'LoanApproved',
  LOAN_REPAID = 'LoanRepaid',
  LOAN_DEFAULTED = 'LoanDefaulted',

  // Governance Events
  PROPOSAL_SUBMITTED = 'ProposalSubmitted',
  VOTE_CAST = 'VoteCast',
  PROPOSAL_EXECUTED = 'ProposalExecuted',
  PROPOSAL_REJECTED = 'ProposalRejected',

  // Tax/Fee Events
  TRANSACTION_FEE_COLLECTED = 'TransactionFeeCollected',
  HOARDING_TAX_APPLIED = 'HoardingTaxApplied',
}
```

**Event Schemas (JSON Schema Validation):**

```typescript
// packages/core-events/src/schemas/user-created.schema.ts
export const UserCreatedSchema = {
  $id: 'UserCreated',
  type: 'object',
  required: ['userId', 'nationality', 'timestamp'],
  properties: {
    userId: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' },
    nationality: { type: 'string', pattern: '^[A-Z]{2}$' },
    biometricHash: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

// packages/core-events/src/schemas/transfer-completed.schema.ts
export const TransferCompletedSchema = {
  $id: 'TransferCompleted',
  type: 'object',
  required: ['txId', 'from', 'to', 'amount', 'timestamp'],
  properties: {
    txId: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    amount: { type: 'number', minimum: 0 },
    fee: { type: 'number', minimum: 0 },
    timestamp: { type: 'string', format: 'date-time' },
  },
};
```

## Database Schema

### Core Tables (Prisma Schema)

```prisma
// db/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// OUTBOX PATTERN (Write Path)
// ============================================================

model OutboxCommand {
  id            String    @id @default(uuid())
  aggregateId   String    // User ID, Org ID, etc.
  commandType   String    // CreateUser, Transfer, etc.
  payload       Json      // Command arguments
  status        String    @default("PENDING") // PENDING, PROCESSING, COMPLETED, FAILED
  attempts      Int       @default(0)
  maxAttempts   Int       @default(3)
  error         String?
  createdAt     DateTime  @default(now())
  processedAt   DateTime?

  @@index([status, createdAt])
  @@index([aggregateId])
}

// ============================================================
// PROJECTOR STATE (Read Path)
// ============================================================

model ProjectorState {
  id              String   @id @default(uuid())
  blockNumber     BigInt   @default(0)
  transactionId   String?
  lastEventId     String?
  updatedAt       DateTime @updatedAt
}

// ============================================================
// IDEMPOTENCY
// ============================================================

model HttpIdempotency {
  idempotencyKey  String    @id
  endpoint        String
  method          String
  statusCode      Int
  responseBody    Json
  createdAt       DateTime  @default(now())
  expiresAt       DateTime

  @@index([expiresAt])
}

// ============================================================
// READ MODELS (Projections from Blockchain Events)
// ============================================================

model UserProfile {
  userId          String    @id
  biometricHash   String?
  nationality     String
  trustScore      Int       @default(0)
  status          String    @default("ACTIVE") // ACTIVE, SUSPENDED, BANNED
  genesisMinted   Boolean   @default(false)
  createdAt       DateTime
  updatedAt       DateTime  @updatedAt

  // Relations
  wallets         Wallet[]
  sentTransfers   Transaction[] @relation("SentTransfers")
  receivedTransfers Transaction[] @relation("ReceivedTransfers")

  @@index([nationality])
  @@index([status])
}

model Wallet {
  walletId        String    @id @default(uuid())
  userId          String
  balance         BigInt    @default(0)
  lockedBalance   BigInt    @default(0)
  lastUpdated     DateTime  @updatedAt

  user            UserProfile @relation(fields: [userId], references: [userId])

  @@index([userId])
}

model Transaction {
  txId            String    @id
  blockNumber     BigInt
  transactionId   String
  fromUserId      String
  toUserId        String
  amount          BigInt
  fee             BigInt    @default(0)
  type            String    // TRANSFER, GENESIS, MINT, BURN
  status          String    // PENDING, COMPLETED, FAILED
  metadata        Json?
  timestamp       DateTime

  sender          UserProfile @relation("SentTransfers", fields: [fromUserId], references: [userId])
  recipient       UserProfile @relation("ReceivedTransfers", fields: [toUserId], references: [userId])

  @@index([fromUserId])
  @@index([toUserId])
  @@index([timestamp])
  @@index([type])
}

model Organization {
  orgId           String    @id
  name            String
  stakeholders    String[]  // Array of user IDs
  requiredApprovals Int
  balance         BigInt    @default(0)
  status          String    // PROPOSED, ACTIVE, SUSPENDED
  createdAt       DateTime
  updatedAt       DateTime  @updatedAt

  transactions    MultiSigTransaction[]

  @@index([status])
}

model MultiSigTransaction {
  txId            String    @id
  orgId           String
  initiatorId     String
  recipientId     String
  amount          BigInt
  approvals       String[]  // Array of user IDs who approved
  requiredApprovals Int
  status          String    // PENDING, APPROVED, EXECUTED, REJECTED
  createdAt       DateTime
  executedAt      DateTime?

  organization    Organization @relation(fields: [orgId], references: [orgId])

  @@index([orgId])
  @@index([status])
}

model Loan {
  loanId          String    @id
  borrowerId      String
  amount          BigInt
  collateralHash  String
  status          String    // PENDING, APPROVED, ACTIVE, REPAID, DEFAULTED
  appliedAt       DateTime
  approvedAt      DateTime?
  repaidAt        DateTime?

  @@index([borrowerId])
  @@index([status])
}

model Proposal {
  proposalId      String    @id
  proposerId      String
  targetParam     String    // Parameter to change
  currentValue    String
  proposedValue   String
  yesVotes        Int       @default(0)
  noVotes         Int       @default(0)
  status          String    // ACTIVE, PASSED, REJECTED, EXECUTED
  createdAt       DateTime
  votingEndsAt    DateTime
  executedAt      DateTime?

  votes           Vote[]

  @@index([status])
  @@index([votingEndsAt])
}

model Vote {
  voteId          String    @id @default(uuid())
  proposalId      String
  voterId         String
  vote            String    // YES, NO
  votedAt         DateTime

  proposal        Proposal @relation(fields: [proposalId], references: [proposalId])

  @@unique([proposalId, voterId])
  @@index([voterId])
}

// ============================================================
// SYSTEM CONFIGURATION
// ============================================================

model SystemParameter {
  paramId         String    @id
  value           String
  description     String
  lastUpdated     DateTime  @updatedAt
}
```

## Service Implementation Patterns

### HTTP Service Structure (apps/svc-identity/)

```
apps/svc-identity/
├── src/
│   ├── app.ts                   # Express app setup
│   ├── index.ts                 # Entry point
│   ├── config.ts                # Environment configuration
│   ├── routes/
│   │   ├── index.ts             # Route aggregator
│   │   ├── auth.routes.ts       # Authentication routes
│   │   ├── user.routes.ts       # User management routes
│   │   └── health.routes.ts     # Health check routes
│   ├── controllers/
│   │   ├── auth.controller.ts   # Request handlers
│   │   └── user.controller.ts
│   ├── services/
│   │   ├── auth.service.ts      # Business logic
│   │   └── user.service.ts
│   ├── repositories/
│   │   └── user.repository.ts   # Database access
│   ├── fabric/
│   │   └── commands.ts          # Outbox command builders
│   ├── middlewares/
│   │   ├── auth.middleware.ts   # JWT validation
│   │   ├── validation.middleware.ts
│   │   └── idempotency.middleware.ts
│   └── types/
│       └── index.ts             # TypeScript types
├── test/
│   ├── integration/
│   └── unit/
├── package.json
└── tsconfig.json
```

### Example: User Creation Endpoint (Write Path)

```typescript
// apps/svc-identity/src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { logger } from '@gx/core-logger';

export class UserController {
  constructor(private userService: UserService) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const { nationality, biometricHash } = req.body;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      // Write to outbox (does NOT directly call Fabric)
      const commandId = await this.userService.createUser({
        nationality,
        biometricHash,
        idempotencyKey,
      });

      logger.info({ commandId }, 'User creation command queued');

      // Return 202 Accepted (command queued, not yet processed)
      res.status(202).json({
        commandId,
        message: 'User creation command queued',
      });
    } catch (error) {
      logger.error({ error }, 'User creation failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      // Query read model (PostgreSQL)
      const user = await this.userService.getUserProfile(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json(user);
    } catch (error) {
      logger.error({ error }, 'User retrieval failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

```typescript
// apps/svc-identity/src/services/user.service.ts
import { prisma } from '@gx/core-db';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  async createUser(data: {
    nationality: string;
    biometricHash: string;
    idempotencyKey: string;
  }): Promise<string> {
    // Check idempotency
    const existing = await prisma.httpIdempotency.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });

    if (existing) {
      // Return existing command ID
      return JSON.parse(existing.responseBody).commandId;
    }

    // Generate user ID
    const userId = uuidv4();

    // Write to outbox table (NOT directly to Fabric)
    const command = await prisma.outboxCommand.create({
      data: {
        aggregateId: userId,
        commandType: 'CreateUser',
        payload: {
          userId,
          nationality: data.nationality,
          biometricHash: data.biometricHash,
        },
      },
    });

    // Store idempotency record
    await prisma.httpIdempotency.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        endpoint: '/api/v1/users',
        method: 'POST',
        statusCode: 202,
        responseBody: { commandId: command.id },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    return command.id;
  }

  async getUserProfile(userId: string) {
    return await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        wallets: true,
      },
    });
  }
}
```

### Outbox Submitter Worker (workers/outbox-submitter/)

```typescript
// workers/outbox-submitter/src/index.ts
import { prisma } from '@gx/core-db';
import { FabricGatewayManager } from '@gx/core-fabric';
import { logger } from '@gx/core-logger';
import { ChaincodeFunctions } from '@gx/core-fabric/chaincode-functions';

const POLL_INTERVAL_MS = 1000; // Poll every 1 second
const BATCH_SIZE = 10;

export class OutboxSubmitter {
  private gateway: FabricGatewayManager;
  private running = false;

  constructor() {
    this.gateway = new FabricGatewayManager();
  }

  async start(): Promise<void> {
    await this.gateway.connect();
    this.running = true;

    logger.info('Outbox submitter started');

    while (this.running) {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error({ error }, 'Batch processing failed');
      }

      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.gateway.disconnect();
    logger.info('Outbox submitter stopped');
  }

  private async processBatch(): Promise<void> {
    // Fetch pending commands
    const commands = await prisma.outboxCommand.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: prisma.outboxCommand.fields.maxAttempts },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (commands.length === 0) return;

    logger.debug({ count: commands.length }, 'Processing outbox commands');

    for (const command of commands) {
      await this.processCommand(command);
    }
  }

  private async processCommand(command: any): Promise<void> {
    try {
      // Mark as processing
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
        },
      });

      // Map command type to chaincode function
      const result = await this.submitToFabric(command);

      // Mark as completed
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });

      logger.info({ commandId: command.id, commandType: command.commandType }, 'Command submitted to Fabric');
    } catch (error) {
      logger.error({ commandId: command.id, error }, 'Command submission failed');

      // Update error status
      await prisma.outboxCommand.update({
        where: { id: command.id },
        data: {
          status: command.attempts + 1 >= command.maxAttempts ? 'FAILED' : 'PENDING',
          error: error.message,
        },
      });
    }
  }

  private async submitToFabric(command: any): Promise<any> {
    const { commandType, payload } = command;

    switch (commandType) {
      case 'CreateUser':
        return await this.gateway.submitTransaction(
          ChaincodeFunctions.CREATE_USER,
          payload.userId,
          payload.nationality,
          payload.biometricHash
        );

      case 'Transfer':
        return await this.gateway.submitTransaction(
          ChaincodeFunctions.TRANSFER,
          payload.recipientId,
          payload.amount.toString()
        );

      case 'DistributeGenesis':
        return await this.gateway.submitTransaction(
          ChaincodeFunctions.DISTRIBUTE_GENESIS,
          payload.userId,
          payload.nationality
        );

      // Add more command mappings...

      default:
        throw new Error(`Unknown command type: ${commandType}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start worker
const submitter = new OutboxSubmitter();
submitter.start().catch(err => {
  logger.error({ err }, 'Outbox submitter crashed');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await submitter.stop();
  process.exit(0);
});
```

### Projector Worker (workers/projector/)

```typescript
// workers/projector/src/index.ts
import { prisma } from '@gx/core-db';
import { FabricGatewayManager } from '@gx/core-fabric';
import { EventValidator, FabricEventType } from '@gx/core-events';
import { logger } from '@gx/core-logger';

export class ProjectorWorker {
  private gateway: FabricGatewayManager;
  private running = false;

  constructor() {
    this.gateway = new FabricGatewayManager();
  }

  async start(): Promise<void> {
    await this.gateway.connect();
    this.running = true;

    logger.info('Projector worker started');

    // Get last processed block
    const state = await this.getProjectorState();
    const startBlock = state.blockNumber + 1;

    // Listen to block events
    const network = await this.gateway.getNetwork();
    const listener = await network.addBlockListener(
      async (event) => {
        if (!this.running) return;
        await this.processBlock(event);
      },
      { startBlock }
    );

    logger.info({ startBlock }, 'Listening for blockchain events');
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.gateway.disconnect();
    logger.info('Projector worker stopped');
  }

  private async processBlock(blockEvent: any): Promise<void> {
    try {
      const blockNumber = blockEvent.blockNumber.toNumber();
      logger.debug({ blockNumber }, 'Processing block');

      // Extract chaincode events from block
      for (const txEvent of blockEvent.blockData.data.data) {
        const chaincodeEvents = this.extractChaincodeEvents(txEvent);

        for (const event of chaincodeEvents) {
          await this.handleEvent(event);
        }
      }

      // Update projector state
      await this.updateProjectorState(blockNumber);
    } catch (error) {
      logger.error({ error, blockNumber: blockEvent.blockNumber }, 'Block processing failed');
      throw error; // Retry on next poll
    }
  }

  private async handleEvent(event: any): Promise<void> {
    const { eventName, payload } = event;

    // Validate event against schema
    if (!EventValidator.validate(eventName, payload)) {
      logger.warn({ eventName, payload }, 'Invalid event schema');
      return;
    }

    logger.debug({ eventName }, 'Handling event');

    switch (eventName) {
      case FabricEventType.USER_CREATED:
        await this.handleUserCreated(payload);
        break;

      case FabricEventType.TRANSFER_COMPLETED:
        await this.handleTransferCompleted(payload);
        break;

      case FabricEventType.GENESIS_DISTRIBUTED:
        await this.handleGenesisDistributed(payload);
        break;

      case FabricEventType.ORGANIZATION_ACTIVATED:
        await this.handleOrganizationActivated(payload);
        break;

      // Add more event handlers...

      default:
        logger.debug({ eventName }, 'Unhandled event type');
    }
  }

  private async handleUserCreated(payload: any): Promise<void> {
    await prisma.userProfile.create({
      data: {
        userId: payload.userId,
        nationality: payload.nationality,
        biometricHash: payload.biometricHash,
        trustScore: 0,
        status: 'ACTIVE',
        genesisMinted: false,
        createdAt: new Date(payload.timestamp),
      },
    });

    // Create wallet
    await prisma.wallet.create({
      data: {
        userId: payload.userId,
        balance: 0,
        lockedBalance: 0,
      },
    });

    logger.info({ userId: payload.userId }, 'User profile created');
  }

  private async handleTransferCompleted(payload: any): Promise<void> {
    // Update balances
    await prisma.wallet.update({
      where: { userId: payload.from },
      data: { balance: { decrement: BigInt(payload.amount) + BigInt(payload.fee) } },
    });

    await prisma.wallet.update({
      where: { userId: payload.to },
      data: { balance: { increment: BigInt(payload.amount) } },
    });

    // Record transaction
    await prisma.transaction.create({
      data: {
        txId: payload.txId,
        blockNumber: BigInt(payload.blockNumber),
        transactionId: payload.transactionId,
        fromUserId: payload.from,
        toUserId: payload.to,
        amount: BigInt(payload.amount),
        fee: BigInt(payload.fee),
        type: 'TRANSFER',
        status: 'COMPLETED',
        timestamp: new Date(payload.timestamp),
      },
    });

    logger.info({ txId: payload.txId }, 'Transfer recorded');
  }

  private async handleGenesisDistributed(payload: any): Promise<void> {
    // Update user's genesis flag
    await prisma.userProfile.update({
      where: { userId: payload.userId },
      data: { genesisMinted: true },
    });

    // Update wallet balance
    await prisma.wallet.update({
      where: { userId: payload.userId },
      data: { balance: { increment: BigInt(payload.amount) } },
    });

    // Record genesis transaction
    await prisma.transaction.create({
      data: {
        txId: payload.txId,
        blockNumber: BigInt(payload.blockNumber),
        transactionId: payload.transactionId,
        fromUserId: 'TREASURY',
        toUserId: payload.userId,
        amount: BigInt(payload.amount),
        fee: 0,
        type: 'GENESIS',
        status: 'COMPLETED',
        timestamp: new Date(payload.timestamp),
      },
    });

    logger.info({ userId: payload.userId, amount: payload.amount }, 'Genesis distribution recorded');
  }

  private async handleOrganizationActivated(payload: any): Promise<void> {
    await prisma.organization.create({
      data: {
        orgId: payload.orgId,
        name: payload.name,
        stakeholders: payload.stakeholders,
        requiredApprovals: payload.requiredApprovals,
        balance: 0,
        status: 'ACTIVE',
        createdAt: new Date(payload.timestamp),
      },
    });

    logger.info({ orgId: payload.orgId }, 'Organization activated');
  }

  private async getProjectorState() {
    let state = await prisma.projectorState.findFirst();
    if (!state) {
      state = await prisma.projectorState.create({
        data: { blockNumber: 0 },
      });
    }
    return state;
  }

  private async updateProjectorState(blockNumber: number): Promise<void> {
    await prisma.projectorState.updateMany({
      data: { blockNumber: BigInt(blockNumber) },
    });
  }

  private extractChaincodeEvents(txData: any): any[] {
    // Parse transaction data and extract chaincode events
    // This is Fabric-specific parsing logic
    return [];
  }
}

// Start worker
const projector = new ProjectorWorker();
projector.start().catch(err => {
  logger.error({ err }, 'Projector worker crashed');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await projector.stop();
  process.exit(0);
});
```

## Configuration Management

### Environment Configuration (packages/core-config/)

```typescript
// packages/core-config/src/index.ts
import { z } from 'zod';

const NetworkIdSchema = z.enum(['dev', 'testnet', 'mainnet']);

const ConfigSchema = z.object({
  // Application
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  port: z.coerce.number().default(3000),

  // Database
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),

  // Fabric Network
  fabric: z.object({
    networkId: NetworkIdSchema,
    channelName: z.string().default('gxchannel'),
    chaincodeName: z.string().default('gxtv3'),
    mspId: z.string(),
    identityLabel: z.string().default('partner-api'),
    connectionProfilePath: z.string(),
    walletPath: z.string(),
    tlsEnabled: z.boolean().default(true),
    tlsCertPath: z.string().optional(),
    tlsKeyPath: z.string().optional(),
    tlsCaPath: z.string().optional(),
  }),

  // Security
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('1h'),

  // Observability
  metricsEnabled: z.boolean().default(true),
  metricsPort: z.coerce.number().default(9090),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const networkId = process.env.GX_NETWORK || 'dev';

  const rawConfig = {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    port: process.env.API_PORT,

    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,

    fabric: {
      networkId,
      channelName: process.env.GX_FABRIC_CHANNEL,
      chaincodeName: process.env.GX_FABRIC_CHAINCODE,
      mspId: process.env.GX_FABRIC_MSP_ID,
      identityLabel: process.env.GX_FABRIC_IDENTITY_LABEL,
      connectionProfilePath: process.env.GX_FABRIC_CONNECTION_PROFILE || `config/connection-profiles/${networkId}-connection.yaml`,
      walletPath: process.env.GX_FABRIC_WALLET_PATH || `config/wallets/${networkId}`,
      tlsEnabled: process.env.GX_FABRIC_TLS_ENABLED === 'true',
      tlsCertPath: process.env.GX_FABRIC_TLS_CERT_PATH,
      tlsKeyPath: process.env.GX_FABRIC_TLS_KEY_PATH,
      tlsCaPath: process.env.GX_FABRIC_TLS_CA_PATH,
    },

    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,

    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    metricsPort: process.env.METRICS_PORT,
  };

  return ConfigSchema.parse(rawConfig);
}

export const config = loadConfig();
```

### Example .env Files

**.env.dev (Development)**
```bash
NODE_ENV=development
LOG_LEVEL=debug
API_PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gx_protocol_dev
REDIS_URL=redis://localhost:6379

# Fabric Network
GX_NETWORK=dev
GX_FABRIC_CHANNEL=gxchannel
GX_FABRIC_CHAINCODE=gxtv3
GX_FABRIC_MSP_ID=Org1MSP
GX_FABRIC_IDENTITY_LABEL=partner-api
GX_FABRIC_TLS_ENABLED=false

# Security
JWT_SECRET=dev-secret-key-change-in-production-minimum-32-characters

# Observability
METRICS_ENABLED=true
METRICS_PORT=9090
```

**.env.testnet (Testnet)**
```bash
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3000

# Database
DATABASE_URL=postgresql://gx_user:secure_password@postgres.testnet:5432/gx_protocol_testnet
REDIS_URL=redis://redis.testnet:6379

# Fabric Network
GX_NETWORK=testnet
GX_FABRIC_CHANNEL=gxchannel
GX_FABRIC_CHAINCODE=gxtv3
GX_FABRIC_MSP_ID=Org1MSP
GX_FABRIC_IDENTITY_LABEL=partner-api
GX_FABRIC_TLS_ENABLED=true
GX_FABRIC_TLS_CERT_PATH=/etc/fabric/tls/server.crt
GX_FABRIC_TLS_KEY_PATH=/etc/fabric/tls/server.key
GX_FABRIC_TLS_CA_PATH=/etc/fabric/tls/ca.crt

# Security (use Kubernetes secrets in production)
JWT_SECRET=${JWT_SECRET}

# Observability
METRICS_ENABLED=true
METRICS_PORT=9090
```

**.env.mainnet (Mainnet)**
```bash
NODE_ENV=production
LOG_LEVEL=warn
API_PORT=3000

# Database
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}

# Fabric Network
GX_NETWORK=mainnet
GX_FABRIC_CHANNEL=gxchannel
GX_FABRIC_CHAINCODE=gxtv3
GX_FABRIC_MSP_ID=Org1MSP
GX_FABRIC_IDENTITY_LABEL=partner-api
GX_FABRIC_TLS_ENABLED=true
GX_FABRIC_TLS_CERT_PATH=/etc/fabric/tls/server.crt
GX_FABRIC_TLS_KEY_PATH=/etc/fabric/tls/server.key
GX_FABRIC_TLS_CA_PATH=/etc/fabric/tls/ca.crt

# Security (ALL from Kubernetes secrets/Vault)
JWT_SECRET=${JWT_SECRET}

# Observability
METRICS_ENABLED=true
METRICS_PORT=9090
```

## Development Workflow

### Local Development Setup

```bash
# 1. Install dependencies
cd gx-protocol-backend
npm install

# 2. Start PostgreSQL and Redis (Docker Compose)
docker-compose up -d postgres redis

# 3. Run database migrations
npm run migrate:dev

# 4. Ensure blockchain network is running (testnet or dev)
# For dev network:
cd ../gx-coin-fabric
./deploy.sh

# 5. Configure environment
cp .env.example .env.dev
# Edit .env.dev with correct values
export GX_NETWORK=dev

# 6. Start all services
npm run dev

# 7. Run tests
npm run test
```

### Testing Against Different Networks

```bash
# Test against dev network
export GX_NETWORK=dev
npm run dev

# Test against testnet
export GX_NETWORK=testnet
npm run dev

# Run integration tests against specific network
GX_NETWORK=testnet npm run test:integration
```

### Switching Networks at Runtime

For services that need to interact with multiple networks simultaneously (rare use case):

```typescript
// packages/core-fabric/src/multi-network-manager.ts
export class MultiNetworkManager {
  private gateways: Map<string, FabricGatewayManager> = new Map();

  async getGateway(networkId: 'dev' | 'testnet' | 'mainnet'): Promise<FabricGatewayManager> {
    if (!this.gateways.has(networkId)) {
      const gateway = new FabricGatewayManager(networkId);
      await gateway.connect();
      this.gateways.set(networkId, gateway);
    }
    return this.gateways.get(networkId)!;
  }

  async disconnectAll(): Promise<void> {
    for (const [networkId, gateway] of this.gateways) {
      await gateway.disconnect();
    }
    this.gateways.clear();
  }
}
```

## Monitoring and Observability

### Health Checks

```typescript
// apps/svc-identity/src/routes/health.routes.ts
import { Router } from 'express';
import { prisma } from '@gx/core-db';
import { FabricGatewayManager } from '@gx/core-fabric';

const router = Router();

// Liveness probe
router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe
router.get('/readyz', async (req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Fabric connection
    const gateway = new FabricGatewayManager();
    const isConnected = await gateway.ping();

    // Check projection lag
    const state = await prisma.projectorState.findFirst();
    const fabricHeight = await gateway.getBlockHeight();
    const lagBlocks = fabricHeight - Number(state.blockNumber);
    const lagMs = lagBlocks * 2000; // Assuming ~2s per block

    if (lagMs > 60000) {
      // More than 1 minute behind
      return res.status(503).json({
        ready: false,
        reason: 'Projection lag too high',
        lagMs,
        lagBlocks,
      });
    }

    res.status(200).json({
      ready: true,
      lagMs,
      lagBlocks,
      fabricHeight,
      projectionHeight: Number(state.blockNumber),
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message,
    });
  }
});

export default router;
```

### Prometheus Metrics

```typescript
// packages/core-monitoring/src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

// HTTP metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Fabric metrics
export const fabricTransactionsTotal = new Counter({
  name: 'fabric_transactions_total',
  help: 'Total number of Fabric transactions submitted',
  labelNames: ['chaincode', 'function', 'status'],
  registers: [register],
});

export const fabricTransactionDuration = new Histogram({
  name: 'fabric_transaction_duration_seconds',
  help: 'Fabric transaction duration in seconds',
  labelNames: ['chaincode', 'function'],
  registers: [register],
});

// Outbox metrics
export const outboxCommandsTotal = new Counter({
  name: 'outbox_commands_total',
  help: 'Total number of outbox commands',
  labelNames: ['command_type', 'status'],
  registers: [register],
});

export const outboxProcessingDuration = new Histogram({
  name: 'outbox_processing_duration_seconds',
  help: 'Outbox command processing duration',
  labelNames: ['command_type'],
  registers: [register],
});

// Projector metrics
export const projectionLag = new Gauge({
  name: 'projection_lag_blocks',
  help: 'Number of blocks the projector is behind',
  registers: [register],
});

export const eventsProcessedTotal = new Counter({
  name: 'events_processed_total',
  help: 'Total number of blockchain events processed',
  labelNames: ['event_type', 'status'],
  registers: [register],
});
```

## Security Best Practices

### Identity Management

1. **Never store private keys in code or environment variables**
   - Use Fabric wallets (filesystem, in-memory, or HSM-backed)
   - Production: Use HashiCorp Vault or Kubernetes secrets

2. **Separate identities per service**
   - `partner-api`: For backend API transaction submission
   - `admin`: For administrative operations
   - `auditor`: For read-only audit queries

3. **TLS everywhere in production**
   - Peer-to-peer communication
   - Client-to-peer communication
   - Database connections

### API Security

1. **JWT authentication for all write endpoints**
2. **Rate limiting per endpoint**
3. **Input validation using OpenAPI schemas**
4. **Idempotency for all write operations**
5. **CORS configuration**

### Network Security

1. **Testnet**: Isolated from mainnet (separate K8s namespace)
2. **Mainnet**: Network policies, firewall rules
3. **Monitoring**: Alert on suspicious transaction patterns

## Common Patterns and Anti-Patterns

### DO (Best Practices)

1. **Always use outbox pattern for Fabric writes**
   ```typescript
   // CORRECT
   await prisma.outboxCommand.create({
     data: { commandType: 'Transfer', payload: { ... } }
   });
   ```

2. **Always validate events against schemas**
   ```typescript
   if (!EventValidator.validate(eventName, payload)) {
     logger.warn('Invalid event schema');
     return;
   }
   ```

3. **Always track projection lag**
   ```typescript
   const lagMs = (fabricHeight - projectionHeight) * blockTimeMs;
   if (lagMs > threshold) {
     // Alert or degrade service
   }
   ```

4. **Always use idempotency keys**
   ```typescript
   headers: {
     'X-Idempotency-Key': uuidv4()
   }
   ```

### DON'T (Anti-Patterns)

1. **Never bypass outbox for Fabric writes**
   ```typescript
   // WRONG
   await fabricGateway.submitTransaction('Transfer', ...);
   ```

2. **Never query Fabric directly for read operations**
   ```typescript
   // WRONG - Use PostgreSQL read models instead
   await fabricGateway.evaluateTransaction('GetBalance', userId);
   ```

3. **Never ignore projection lag**
   ```typescript
   // WRONG - Could serve stale data
   const balance = await getBalanceFromPostgres(userId);
   return balance; // Might be out of sync!
   ```

4. **Never hardcode network configuration**
   ```typescript
   // WRONG
   const peerEndpoint = 'peer0.org1.testnet:7051';

   // CORRECT
   const peerEndpoint = config.fabric.peerEndpoint;
   ```

## Deployment

### Docker Compose (Development Only)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: gx_protocol_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  svc-identity:
    build:
      context: .
      dockerfile: apps/svc-identity/Dockerfile
    environment:
      GX_NETWORK: dev
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/gx_protocol_dev
      REDIS_URL: redis://redis:6379
    ports:
      - '3000:3000'
    depends_on:
      - postgres
      - redis

  outbox-submitter:
    build:
      context: .
      dockerfile: workers/outbox-submitter/Dockerfile
    environment:
      GX_NETWORK: dev
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/gx_protocol_dev
    depends_on:
      - postgres

  projector:
    build:
      context: .
      dockerfile: workers/projector/Dockerfile
    environment:
      GX_NETWORK: dev
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/gx_protocol_dev
    depends_on:
      - postgres

volumes:
  postgres-data:
```

### Kubernetes (Testnet/Mainnet)

```yaml
# k8s/svc-identity-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-identity
  namespace: gx-protocol
spec:
  replicas: 3
  selector:
    matchLabels:
      app: svc-identity
  template:
    metadata:
      labels:
        app: svc-identity
    spec:
      containers:
      - name: svc-identity
        image: gx-protocol/svc-identity:latest
        env:
        - name: GX_NETWORK
          value: "testnet"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: gx-db-credentials
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: gx-jwt-secret
              key: secret
        - name: GX_FABRIC_TLS_CERT_PATH
          value: /etc/fabric/tls/server.crt
        volumeMounts:
        - name: fabric-tls
          mountPath: /etc/fabric/tls
          readOnly: true
        - name: fabric-crypto
          mountPath: /etc/fabric/crypto
          readOnly: true
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: fabric-tls
        secret:
          secretName: fabric-tls-certs
      - name: fabric-crypto
        secret:
          secretName: fabric-crypto-material
```

## Troubleshooting

### Common Issues

**Issue: Outbox commands stuck in PENDING**
- Check outbox-submitter worker logs
- Verify Fabric network connectivity
- Check chaincode is responsive: `kubectl logs -n fabric -l chaincode=gxtv3`

**Issue: Projection lag increasing**
- Check projector worker logs
- Verify Fabric event stream connectivity
- Monitor `projection_lag_blocks` metric

**Issue: "User already exists" error**
- Check idempotency key is unique
- Verify user doesn't exist in read model
- Check outbox table for duplicate commands

**Issue: Different data between testnet and mainnet**
- Verify correct `GX_NETWORK` environment variable
- Check connection profile is loading correct network
- Verify wallet contains identity for target network

### Debugging Commands

```bash
# Check outbox queue depth
docker exec -it postgres psql -U postgres -d gx_protocol_dev \
  -c "SELECT status, COUNT(*) FROM outbox_commands GROUP BY status;"

# Check projection lag
docker exec -it postgres psql -U postgres -d gx_protocol_dev \
  -c "SELECT * FROM projector_state;"

# View recent failed commands
docker exec -it postgres psql -U postgres -d gx_protocol_dev \
  -c "SELECT * FROM outbox_commands WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 10;"

# Test Fabric connectivity
kubectl exec -n fabric peer0-org1-0 -- peer channel getinfo -c gxchannel
```

## Documentation and Resources

- **Hyperledger Fabric Docs**: https://hyperledger-fabric.readthedocs.io/
- **Fabric Node SDK**: https://hyperledger.github.io/fabric-sdk-node/
- **CQRS Pattern**: https://martinfowler.com/bliki/CQRS.html
- **Outbox Pattern**: https://microservices.io/patterns/data/transactional-outbox.html
- **Prisma ORM**: https://www.prisma.io/docs

---

**Last Updated**: 2025-11-13
**Maintained By**: GX Protocol Development Team
