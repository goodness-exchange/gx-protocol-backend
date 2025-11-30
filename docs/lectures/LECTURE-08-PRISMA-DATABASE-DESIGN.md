# Lecture 08: Prisma ORM & Database Schema Design

**Course:** GX Protocol Backend Architecture
**Module:** Data Layer Patterns
**Duration:** 150 minutes
**Level:** Intermediate to Advanced
**Prerequisites:** SQL fundamentals, TypeScript basics

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Part I: Introduction to Prisma ORM](#part-i-introduction-to-prisma-orm)
3. [Part II: Schema Organization & Conventions](#part-ii-schema-organization--conventions)
4. [Part III: Multi-Tenancy Patterns](#part-iii-multi-tenancy-patterns)
5. [Part IV: Enums & Type Safety](#part-iv-enums--type-safety)
6. [Part V: Progressive Registration Pattern](#part-v-progressive-registration-pattern)
7. [Part VI: CQRS Data Models](#part-vi-cqrs-data-models)
8. [Part VII: Relationships & Indexing](#part-vii-relationships--indexing)
9. [Part VIII: Migrations & Evolution](#part-viii-migrations--evolution)
10. [Part IX: Transactions & Atomicity](#part-ix-transactions--atomicity)
11. [Part X: Production Patterns](#part-x-production-patterns)
12. [Exercises](#exercises)
13. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Design production-grade database schemas with Prisma
2. Implement multi-tenancy patterns effectively
3. Use enums for type-safe status management
4. Design progressive registration flows
5. Model CQRS read/write patterns in PostgreSQL
6. Create effective indexes for query optimization
7. Write safe database migrations
8. Use transactions for atomic operations

---

## Part I: Introduction to Prisma ORM

### 1.1 What is Prisma?

Prisma is a next-generation ORM that provides:

```
PRISMA ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  schema.prisma  │────▶│  Prisma Client  │────▶│   PostgreSQL    │   │
│  │                 │     │  (Generated)    │     │                 │   │
│  │  - Models       │     │                 │     │  - Tables       │   │
│  │  - Relations    │     │  - Type-safe    │     │  - Indexes      │   │
│  │  - Enums        │     │  - Auto-complete│     │  - Constraints  │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│           │                       │                                     │
│           │                       │                                     │
│           ▼                       ▼                                     │
│  ┌─────────────────┐     ┌─────────────────┐                           │
│  │   Migrations    │     │   Type Safety   │                           │
│  │                 │     │                 │                           │
│  │  - SQL files    │     │  - TypeScript   │                           │
│  │  - Version ctrl │     │  - IntelliSense │                           │
│  │  - Rollback     │     │  - Compile-time │                           │
│  └─────────────────┘     └─────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 GX Protocol Schema Overview

```prisma
// =============================================================================
// GX COIN PROTOCOL - ENHANCED PRODUCTION SCHEMA
// =============================================================================
// Version: 2.0 (Enhanced)
// Date: October 16, 2025
//
// This schema incorporates:
// - Multi-tenancy across all tables
// - CQRS/Event-Driven Architecture
// - Trust Score & Family Relationship Tree (80 points)
// - Business Account Governance & Multi-Signature
// - Comprehensive Audit Trail
// - Session & Device Management
// - Notification System
// - Enhanced KYC Document Management
// - Transaction Limits & Fraud Prevention
// - Contact Management
// - Hoarding Tax Calculation
// =============================================================================

generator client {
  provider = "prisma-client-js"
  output   = "../../packages/core-db/node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 1.3 Schema Sections

| Section | Purpose | Key Tables |
|---------|---------|------------|
| **ENUMs** | Type-safe status values | OutboxStatus, UserProfileStatus, KycStatus |
| **Progressive Registration** | Multi-step signup | PendingRegistration |
| **Core Identity** | Users and organizations | UserProfile, OrganizationProfile, Country |
| **Trust Score** | Family relationship scoring | FamilyRelationship, TrustScore |
| **Wallet & Transactions** | Financial operations | Wallet, Transaction, Beneficiary |
| **Business Accounts** | Multi-sig governance | BusinessAccount, BusinessSignatory |
| **KYC Documents** | Compliance documents | KYCVerification, KYCDocument |
| **Fraud Prevention** | Limits and risk scoring | TransactionLimit, TransactionRiskScore |
| **Session Management** | Security | UserSession, TrustedDevice |
| **Notifications** | User alerts | Notification, PushToken |
| **Audit Trail** | Compliance logging | AuditLog |
| **CQRS Infrastructure** | Event handling | OutboxCommand, ProjectorState, EventLog |

---

## Part II: Schema Organization & Conventions

### 2.1 Naming Conventions

```prisma
// Table naming: PascalCase, singular
model UserProfile {
  // Primary key: <entity>Id
  profileId String @id @default(uuid())

  // Foreign keys: <referenced_entity>Id
  walletId String

  // Status fields: status, <context>Status
  status        UserProfileStatus
  onchainStatus String?

  // Timestamps: snake_case in DB, camelCase in Prisma
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  // Soft delete: deletedAt
  deletedAt DateTime? @db.Timestamptz(3)
}
```

### 2.2 Standard Field Patterns

```prisma
// Every table should have:
model StandardTable {
  id       String @id @default(uuid())  // UUID primary key
  tenantId String                        // Multi-tenancy

  // Core fields here...

  // Timestamps (PostgreSQL TIMESTAMPTZ with 3 decimal precision)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @db.Timestamptz(3)
  deletedAt DateTime? @db.Timestamptz(3)  // Soft delete

  // Standard indexes
  @@index([tenantId])
  @@index([tenantId, deletedAt])
}
```

### 2.3 Decimal Precision for Money

```prisma
// GX Coin uses 9 decimal places (nano-precision)
// Total: 36 digits, 9 after decimal point
// Max value: 999,999,999,999,999,999,999,999,999.999999999

model Wallet {
  cachedBalance Decimal @default(0) @db.Decimal(36, 9)
}

model Transaction {
  amount Decimal @db.Decimal(36, 9)
  fee    Decimal @default(0) @db.Decimal(36, 9)
}
```

---

## Part III: Multi-Tenancy Patterns

### 3.1 Why Multi-Tenancy?

GX Protocol uses **tenant isolation** for:
- Multiple deployment environments (testnet, mainnet)
- Future white-label deployments
- Data isolation and security

```
MULTI-TENANCY ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Database: gx_protocol                                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Tenant: "mainnet"                                                │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │  │
│  │  │ UserProfile │ │   Wallet    │ │ Transaction │                  │  │
│  │  │ tenantId=   │ │ tenantId=   │ │ tenantId=   │                  │  │
│  │  │ "mainnet"   │ │ "mainnet"   │ │ "mainnet"   │                  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Tenant: "testnet"                                                │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │  │
│  │  │ UserProfile │ │   Wallet    │ │ Transaction │                  │  │
│  │  │ tenantId=   │ │ tenantId=   │ │ tenantId=   │                  │  │
│  │  │ "testnet"   │ │ "testnet"   │ │ "testnet"   │                  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Implementation Pattern

```prisma
model UserProfile {
  profileId String @id @default(uuid())
  tenantId  String  // Required on every table

  // ... other fields

  // Tenant-scoped indexes for query performance
  @@index([tenantId, status])
  @@index([tenantId, email])
  @@index([tenantId, phoneNum])
  @@index([tenantId, deletedAt])
}
```

### 3.3 Tenant-Scoped Unique Constraints

```prisma
// Wrong: Global uniqueness
model OutboxCommand {
  requestId String @unique  // ❌ Conflicts across tenants
}

// Correct: Tenant-scoped uniqueness
model OutboxCommand {
  id        String @id @default(cuid())
  tenantId  String
  requestId String

  @@unique([tenantId, requestId])  // ✅ Unique per tenant
}
```

### 3.4 Tenant Middleware

```typescript
// packages/core-db/src/middleware.ts

import { PrismaClient } from '@prisma/client';

export function createTenantPrisma(tenantId: string): PrismaClient {
  const prisma = new PrismaClient();

  // Automatically inject tenantId on all queries
  prisma.$use(async (params, next) => {
    // Inject tenantId on create
    if (params.action === 'create' || params.action === 'createMany') {
      params.args.data.tenantId = tenantId;
    }

    // Inject tenantId filter on reads
    if (['findFirst', 'findMany', 'findUnique', 'count'].includes(params.action)) {
      params.args.where = {
        ...params.args.where,
        tenantId,
      };
    }

    return next(params);
  });

  return prisma;
}
```

---

## Part IV: Enums & Type Safety

### 4.1 Status Enums

Enums provide type-safe status management:

```prisma
// Registration lifecycle
enum UserProfileStatus {
  REGISTERED              // Initial registration completed
  PENDING_ADMIN_APPROVAL  // Awaiting admin review
  APPROVED_PENDING_ONCHAIN // Approved, waiting blockchain sync
  DENIED                  // Admin rejected
  ACTIVE                  // Full active user
  FROZEN                  // Account frozen (compliance)
  SUSPENDED               // Temporary suspension
  CLOSED                  // Permanently closed
}

// CQRS command lifecycle
enum OutboxStatus {
  PENDING    // Created, not yet processed
  LOCKED     // Worker has claimed it
  SUBMITTED  // Submitted to Fabric
  COMMITTED  // Confirmed on blockchain
  FAILED     // Submission failed (DLQ)
}

// KYC verification states
enum KycStatus {
  PENDING   // Documents submitted
  APPROVED  // Verification passed
  REJECTED  // Verification failed
  EXPIRED   // Documents expired
}
```

### 4.2 Command Types (CQRS)

```prisma
enum CommandType {
  // IdentityContract
  CREATE_USER

  // TokenomicsContract
  TRANSFER_TOKENS
  DISTRIBUTE_GENESIS
  FREEZE_WALLET
  UNFREEZE_WALLET

  // OrganizationContract
  PROPOSE_ORGANIZATION
  ENDORSE_MEMBERSHIP
  ACTIVATE_ORGANIZATION
  DEFINE_AUTH_RULE
  INITIATE_MULTISIG_TX
  APPROVE_MULTISIG_TX
  EXECUTE_MULTISIG_TX

  // LoanPoolContract
  APPLY_FOR_LOAN
  APPROVE_LOAN

  // GovernanceContract
  SUBMIT_PROPOSAL
  CAST_VOTE
  EXECUTE_PROPOSAL

  // AdminContract
  BOOTSTRAP_SYSTEM
  INITIALIZE_COUNTRY_DATA
  UPDATE_SYSTEM_PARAMETER
  PAUSE_SYSTEM
  RESUME_SYSTEM
  APPOINT_ADMIN
  ACTIVATE_TREASURY

  // TaxAndFeeContract
  APPLY_VELOCITY_TAX
}
```

### 4.3 Relationship Status (Trust Score)

```prisma
enum RelationType {
  FATHER
  MOTHER
  SPOUSE
  CHILD
  SIBLING
  BUSINESS_PARTNER
  DIRECTOR
  WORKPLACE_ASSOCIATE
  FRIEND
}

enum RelationshipStatus {
  PENDING        // Invitation sent, awaiting confirmation
  CONFIRMED      // Both parties confirmed
  REJECTED       // Rejected by invitee
  DECEASED       // Marked deceased with documentation
  DIVORCED       // Marked divorced with documentation
  NOT_APPLICABLE // User indicated N/A (triggers re-weighting)
}
```

### 4.4 TypeScript Usage

```typescript
import { UserProfileStatus, OutboxStatus } from '@prisma/client';

// Type-safe status checks
function isUserActive(status: UserProfileStatus): boolean {
  return status === UserProfileStatus.ACTIVE;
}

// Type-safe status transitions
async function approveUser(prisma: PrismaClient, profileId: string) {
  await prisma.userProfile.update({
    where: { profileId },
    data: {
      status: UserProfileStatus.APPROVED_PENDING_ONCHAIN, // Type-checked
    },
  });
}
```

---

## Part V: Progressive Registration Pattern

### 5.1 Design Rationale

The **Progressive Registration Pattern** (inspired by Wise.com) breaks registration into manageable steps:

```
PROGRESSIVE REGISTRATION FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Step 1: EMAIL_PENDING → EMAIL_SENT                                     │
│  ├─ User enters email                                                   │
│  └─ System sends OTP to email                                           │
│                                                                         │
│  Step 2: EMAIL_SENT → EMAIL_VERIFIED                                    │
│  └─ User enters OTP, email verified                                     │
│                                                                         │
│  Step 3: EMAIL_VERIFIED → NAME_COUNTRY_SET                              │
│  └─ User enters first name, last name, country                          │
│                                                                         │
│  Step 4: NAME_COUNTRY_SET → DOB_GENDER_SET                              │
│  └─ User enters date of birth, gender                                   │
│                                                                         │
│  Step 5: DOB_GENDER_SET → PASSWORD_SET                                  │
│  └─ User creates password                                               │
│                                                                         │
│  Step 6: PASSWORD_SET → PHONE_SENT                                      │
│  ├─ User enters phone number                                            │
│  └─ System sends OTP to phone                                           │
│                                                                         │
│  Step 7: PHONE_SENT → PHONE_VERIFIED → COMPLETED                        │
│  ├─ User enters OTP, phone verified                                     │
│  └─ Data migrated to UserProfile                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Schema Design

```prisma
enum RegistrationStep {
  EMAIL_PENDING    // Initial state
  EMAIL_SENT       // OTP sent to email
  EMAIL_VERIFIED   // Email OTP verified
  NAME_COUNTRY_SET // First name, last name, country collected
  DOB_GENDER_SET   // Date of birth and gender collected
  PASSWORD_SET     // Password created
  PHONE_SENT       // OTP sent to phone
  PHONE_VERIFIED   // Phone OTP verified
  COMPLETED        // Migrated to UserProfile
}

model PendingRegistration {
  id       String @id @default(uuid())
  tenantId String @default("default")

  // Step 1 & 2: Email verification
  email             String    @unique
  emailOtpHash      String?   // bcrypt hash of OTP
  emailOtpExpiresAt DateTime? @db.Timestamptz(3)
  emailOtpAttempts  Int       @default(0) // Rate limiting: max 5 attempts
  emailVerified     Boolean   @default(false)
  emailVerifiedAt   DateTime? @db.Timestamptz(3)

  // Step 3: Name & Country
  firstName   String?
  lastName    String?
  countryCode String? @db.Char(2) // ISO 3166-1 alpha-2

  // Step 4: DOB & Gender
  dateOfBirth DateTime? @db.Date
  gender      Gender?

  // Step 5: Password
  passwordHash String?

  // Step 6 & 7: Phone verification
  phoneNum          String?   @unique
  phoneOtpHash      String?
  phoneOtpExpiresAt DateTime? @db.Timestamptz(3)
  phoneOtpAttempts  Int       @default(0)
  phoneVerified     Boolean   @default(false)
  phoneVerifiedAt   DateTime? @db.Timestamptz(3)

  // Progress tracking
  currentStep RegistrationStep @default(EMAIL_PENDING)

  // Security & Audit
  ipAddress String?
  userAgent String?

  // Timestamps & Expiry
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)
  expiresAt DateTime @db.Timestamptz(3) // Auto-cleanup (24h)

  // Migration tracking
  migratedToProfileId String?   @unique
  migratedAt          DateTime? @db.Timestamptz(3)

  @@index([tenantId, currentStep])
  @@index([tenantId, email])
  @@index([tenantId, phoneNum])
  @@index([expiresAt]) // For cleanup job
}
```

### 5.3 OTP Security Pattern

```typescript
// services/registration.service.ts

import bcrypt from 'bcrypt';
import crypto from 'crypto';

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// Generate secure OTP
function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Store OTP securely
async function sendEmailOTP(prisma: PrismaClient, registrationId: string) {
  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 10);

  await prisma.pendingRegistration.update({
    where: { id: registrationId },
    data: {
      emailOtpHash: otpHash,
      emailOtpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      emailOtpAttempts: 0,
      currentStep: 'EMAIL_SENT',
    },
  });

  // Send email with OTP
  await emailService.send(otp);
}

// Verify OTP with rate limiting
async function verifyEmailOTP(
  prisma: PrismaClient,
  registrationId: string,
  otp: string
): Promise<boolean> {
  const registration = await prisma.pendingRegistration.findUnique({
    where: { id: registrationId },
  });

  if (!registration || !registration.emailOtpHash) {
    throw new Error('No pending OTP');
  }

  // Check rate limiting
  if (registration.emailOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new Error('Too many attempts');
  }

  // Check expiry
  if (new Date() > registration.emailOtpExpiresAt!) {
    throw new Error('OTP expired');
  }

  // Verify OTP
  const isValid = await bcrypt.compare(otp, registration.emailOtpHash);

  if (!isValid) {
    // Increment attempt counter
    await prisma.pendingRegistration.update({
      where: { id: registrationId },
      data: { emailOtpAttempts: { increment: 1 } },
    });
    return false;
  }

  // Mark as verified
  await prisma.pendingRegistration.update({
    where: { id: registrationId },
    data: {
      emailVerified: true,
      emailVerifiedAt: new Date(),
      emailOtpHash: null, // Clear OTP
      currentStep: 'EMAIL_VERIFIED',
    },
  });

  return true;
}
```

---

## Part VI: CQRS Data Models

### 6.1 Outbox Pattern Table

```prisma
model OutboxCommand {
  id          String       @id @default(cuid())
  tenantId    String
  service     String                    // "svc-identity", "svc-tokenomics"
  commandType CommandType               // Enum: CREATE_USER, TRANSFER_TOKENS
  requestId   String                    // Idempotency key
  payload     Json                      // Command arguments
  status      OutboxStatus @default(PENDING)
  attempts    Int          @default(0)  // Retry count
  lockedBy    String?                   // Worker ID holding lock
  lockedAt    DateTime?    @db.Timestamptz(3)
  submittedAt DateTime?    @db.Timestamptz(3)
  fabricTxId  String?                   // Blockchain transaction ID
  commitBlock BigInt?                   // Block number
  errorCode   String?                   // Error classification
  error       String?                   // Error message
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(3)

  // Transaction approval support
  transactionApprovals TransactionApproval[]

  @@unique([tenantId, requestId])    // Idempotency
  @@index([status, createdAt])       // Worker polling
  @@index([tenantId, status])
  @@index([fabricTxId])              // Lookup by blockchain ID
}
```

### 6.2 Projector Checkpoint Table

```prisma
model ProjectorState {
  tenantId       String
  projectorName  String   // "main-projector", "analytics-projector"
  channel        String   // "gxchannel"
  lastBlock      BigInt   // Last processed block number
  lastEventIndex Int      // Event index within block
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  @@id([tenantId, projectorName, channel])  // Composite primary key
}
```

### 6.3 Event Log (Audit Trail)

```prisma
model EventLog {
  id           String   @id @default(cuid())
  tenantId     String
  fabricTxId   String                    // Blockchain transaction ID
  blockNumber  BigInt                    // Block number
  channel      String                    // "gxchannel"
  chaincode    String                    // "gxtv3"
  eventName    String                    // "UserCreated", "TransferCompleted"
  eventVersion String                    // "1.0"
  payload      Json                      // Event data
  txTimestamp  DateTime @db.Timestamptz(3)
  ingestedAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([tenantId, blockNumber])
  @@index([fabricTxId])
  @@index([tenantId, eventName])
}
```

### 6.4 Dead Letter Queue

```prisma
model EventDLQ {
  id          String   @id @default(cuid())
  tenantId    String
  reason      String                    // "VALIDATION_FAILED", "PROCESSING_ERROR"
  rawPayload  Json                      // Original event
  fabricTxId  String?
  blockNumber BigInt?
  channel     String?
  chaincode   String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([tenantId, createdAt])
}
```

---

## Part VII: Relationships & Indexing

### 7.1 One-to-Many Relationships

```prisma
model UserProfile {
  profileId String @id @default(uuid())

  // One user has many wallets
  wallets     Wallet[]
  // One user has many transactions (via wallet)
  // One user has many sessions
  sessions    UserSession[]
  // One user has many notifications
  notifications Notification[]
}

model Wallet {
  walletId  String @id @default(uuid())
  profileId String

  // Many-to-one: wallet belongs to user
  userProfile  UserProfile   @relation(fields: [profileId], references: [profileId], onDelete: Cascade)

  // One wallet has many transactions
  transactions Transaction[]
}
```

### 7.2 Many-to-Many with Join Table

```prisma
// User <-> Organization relationship
model UserOrganizationLink {
  id            String @id @default(cuid())
  tenantId      String
  userProfileId String
  orgProfileId  String
  role          String    // "owner", "admin", "member"
  addedAt       DateTime  @default(now()) @db.Timestamptz(3)

  userProfile         UserProfile         @relation(fields: [userProfileId], references: [profileId], onDelete: Cascade)
  organizationProfile OrganizationProfile @relation(fields: [orgProfileId], references: [orgProfileId], onDelete: Cascade)

  @@unique([tenantId, userProfileId, orgProfileId])
  @@index([userProfileId])
  @@index([orgProfileId])
  @@index([tenantId])
}
```

### 7.3 Self-Referential Relationships

```prisma
// Family relationship (bidirectional)
model FamilyRelationship {
  relationshipId     String             @id @default(uuid())
  tenantId           String
  initiatorProfileId String             // User who sent the invite
  relatedProfileId   String?            // Target user
  relatedEmail       String?            // For off-platform invitations
  relationType       RelationType
  status             RelationshipStatus @default(PENDING)

  // Self-referential: both sides point to UserProfile
  initiator UserProfile  @relation("InitiatedRelationships", fields: [initiatorProfileId], references: [profileId], onDelete: Cascade)
  related   UserProfile? @relation("ReceivedRelationships", fields: [relatedProfileId], references: [profileId], onDelete: Cascade)

  @@unique([tenantId, initiatorProfileId, relatedProfileId, relationType])
  @@index([tenantId, initiatorProfileId])
  @@index([tenantId, relatedProfileId])
}
```

### 7.4 Index Strategy

```prisma
model Transaction {
  offTxId     String @id @default(uuid())
  tenantId    String
  onChainTxId String?
  walletId    String
  type        OffChainTxType
  counterparty String
  amount      Decimal @db.Decimal(36, 9)
  timestamp   DateTime @db.Timestamptz(3)

  // Index 1: Wallet transaction history (most common query)
  @@index([tenantId, walletId, timestamp])

  // Index 2: Counterparty lookup
  @@index([tenantId, counterparty, timestamp])

  // Index 3: Time-based queries (reports, analytics)
  @@index([timestamp])

  // Unique constraint: One on-chain tx per tenant
  @@unique([tenantId, onChainTxId])
}
```

### 7.5 Index Guidelines

| Query Pattern | Index Type | Example |
|--------------|------------|---------|
| Equality + Equality | Composite index | `@@index([tenantId, status])` |
| Equality + Range | Composite (equality first) | `@@index([tenantId, createdAt])` |
| Foreign key lookup | Single column | `@@index([profileId])` |
| Unique constraint | Unique index | `@@unique([tenantId, email])` |
| Text search | GIN index (via migration) | `CREATE INDEX ... USING GIN` |

---

## Part VIII: Migrations & Evolution

### 8.1 Migration Workflow

```bash
# Development: Create migration from schema changes
npx prisma migrate dev --name add_kyc_documents

# Production: Apply pending migrations
npx prisma migrate deploy

# View migration status
npx prisma migrate status

# Reset database (DESTRUCTIVE - dev only)
npx prisma migrate reset
```

### 8.2 Migration File Structure

```
db/migrations/
├── 20250101000000_initial/
│   └── migration.sql
├── 20250115000000_add_trust_score/
│   └── migration.sql
├── 20250120000000_add_kyc_documents/
│   └── migration.sql
└── migration_lock.toml
```

### 8.3 Safe Migration Patterns

```sql
-- ✅ Safe: Add nullable column
ALTER TABLE "UserProfile" ADD COLUMN "middleName" TEXT;

-- ✅ Safe: Add column with default
ALTER TABLE "Wallet" ADD COLUMN "isFrozen" BOOLEAN DEFAULT false;

-- ❌ Dangerous: Add NOT NULL column without default
ALTER TABLE "UserProfile" ADD COLUMN "required_field" TEXT NOT NULL;

-- ✅ Safe alternative: Two-step migration
-- Step 1: Add nullable
ALTER TABLE "UserProfile" ADD COLUMN "required_field" TEXT;
-- Step 2: Backfill data
UPDATE "UserProfile" SET "required_field" = 'default' WHERE "required_field" IS NULL;
-- Step 3: Add constraint (separate migration)
ALTER TABLE "UserProfile" ALTER COLUMN "required_field" SET NOT NULL;
```

### 8.4 Enum Evolution

```sql
-- Adding new enum values (safe)
ALTER TYPE "CommandType" ADD VALUE 'NEW_COMMAND';

-- Note: Removing enum values requires:
-- 1. Create new enum
-- 2. Update column to use new enum
-- 3. Drop old enum
-- This is a breaking change - avoid in production
```

---

## Part IX: Transactions & Atomicity

### 9.1 Interactive Transactions

```typescript
// Atomic wallet transfer
async function transferFunds(
  prisma: PrismaClient,
  fromWalletId: string,
  toWalletId: string,
  amount: number
) {
  return prisma.$transaction(async (tx) => {
    // Step 1: Debit sender
    const sender = await tx.wallet.update({
      where: { walletId: fromWalletId },
      data: { cachedBalance: { decrement: amount } },
    });

    if (sender.cachedBalance < 0) {
      throw new Error('Insufficient funds');
    }

    // Step 2: Credit receiver
    await tx.wallet.update({
      where: { walletId: toWalletId },
      data: { cachedBalance: { increment: amount } },
    });

    // Step 3: Create transaction records
    await tx.transaction.createMany({
      data: [
        {
          tenantId: sender.tenantId,
          walletId: fromWalletId,
          type: 'SENT',
          counterparty: toWalletId,
          amount: -amount,
          timestamp: new Date(),
        },
        {
          tenantId: sender.tenantId,
          walletId: toWalletId,
          type: 'RECEIVED',
          counterparty: fromWalletId,
          amount: amount,
          timestamp: new Date(),
        },
      ],
    });

    return { success: true };
  });
}
```

### 9.2 Transaction Options

```typescript
await prisma.$transaction(
  async (tx) => {
    // Operations
  },
  {
    maxWait: 5000,  // Max wait to acquire lock (ms)
    timeout: 10000, // Max transaction duration (ms)
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }
);
```

### 9.3 Batch Transactions

```typescript
// Sequential batch operations (all or nothing)
const [user, wallet, notification] = await prisma.$transaction([
  prisma.userProfile.create({ data: userData }),
  prisma.wallet.create({ data: walletData }),
  prisma.notification.create({ data: notificationData }),
]);
```

---

## Part X: Production Patterns

### 10.1 Soft Delete

```prisma
model UserProfile {
  // ... other fields
  deletedAt DateTime? @db.Timestamptz(3)

  @@index([tenantId, deletedAt])
}
```

```typescript
// Soft delete
await prisma.userProfile.update({
  where: { profileId },
  data: { deletedAt: new Date() },
});

// Query excluding deleted
await prisma.userProfile.findMany({
  where: {
    tenantId,
    deletedAt: null,  // Only non-deleted records
  },
});
```

### 10.2 Optimistic Locking

```prisma
model OutboxCommand {
  id        String   @id
  version   Int      @default(1)  // Version counter
  updatedAt DateTime @updatedAt
}
```

```typescript
// Read record with version
const command = await prisma.outboxCommand.findUnique({
  where: { id: commandId },
});

// Update with version check
const updated = await prisma.outboxCommand.updateMany({
  where: {
    id: commandId,
    version: command.version,  // Optimistic lock
  },
  data: {
    status: 'LOCKED',
    version: { increment: 1 },
  },
});

if (updated.count === 0) {
  throw new Error('Concurrent modification detected');
}
```

### 10.3 Connection Pooling

```typescript
// Configure connection pool
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'error', 'warn'],
});

// In production, use PgBouncer for connection pooling
// DATABASE_URL="postgresql://...?pgbouncer=true&connection_limit=10"
```

### 10.4 Query Performance

```typescript
// Use select to limit returned fields
const users = await prisma.userProfile.findMany({
  where: { tenantId, status: 'ACTIVE' },
  select: {
    profileId: true,
    firstName: true,
    lastName: true,
    email: true,
    // Don't select passwordHash, etc.
  },
});

// Use pagination
const users = await prisma.userProfile.findMany({
  where: { tenantId },
  skip: 20,
  take: 10,
  orderBy: { createdAt: 'desc' },
});

// Use cursor-based pagination for large datasets
const users = await prisma.userProfile.findMany({
  where: { tenantId },
  take: 10,
  cursor: { profileId: lastSeenId },
  skip: 1,  // Skip the cursor record
});
```

---

## Exercises

### Exercise 1: Schema Design

Design a Prisma schema for a "Referral Program" feature:
- Users can invite other users via email
- Track referral status (pending, registered, rewarded)
- Award points to referrer when invitee registers
- Limit to 10 referrals per user

### Exercise 2: Migration Safety

You need to add a required `nationalIdNumber` field to `UserProfile`. Write a migration plan that:
1. Doesn't break existing records
2. Allows gradual backfill
3. Eventually enforces NOT NULL

### Exercise 3: Query Optimization

Given this query pattern:
```typescript
// Find all transactions for a user in the last 30 days
const transactions = await prisma.transaction.findMany({
  where: {
    wallet: { profileId: userId },
    timestamp: { gte: thirtyDaysAgo },
  },
});
```

Design the optimal index and explain why.

### Exercise 4: Tenant Isolation

Implement a Prisma middleware that:
1. Automatically injects `tenantId` on all operations
2. Prevents cross-tenant data access
3. Logs all operations for audit

---

## Further Reading

### Official Documentation

- **Prisma Docs:** https://www.prisma.io/docs
- **Prisma Schema Reference:** https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
- **PostgreSQL Best Practices:** https://wiki.postgresql.org/wiki/Performance_Optimization

### Books

- **High Performance PostgreSQL** by Gregory Smith
- **Designing Data-Intensive Applications** by Martin Kleppmann

### Related GX Protocol Documentation

- **LECTURE-06:** Event-Driven Projections
- **docs/adr/002-cqrs-outbox-pattern.md**
- **db/prisma/schema.prisma** (source code)

---

## Summary

In this lecture, we covered:

1. **Prisma ORM:** Schema design, client generation, type safety
2. **Schema Organization:** Naming conventions, standard patterns
3. **Multi-Tenancy:** Tenant isolation with `tenantId` on every table
4. **Enums:** Type-safe status management
5. **Progressive Registration:** Step-by-step user onboarding
6. **CQRS Models:** Outbox, projector state, event log
7. **Relationships:** One-to-many, many-to-many, self-referential
8. **Indexing:** Composite indexes for query performance
9. **Migrations:** Safe schema evolution
10. **Transactions:** Atomic multi-table operations

**Key Takeaways:**

- Always include `tenantId` for multi-tenancy
- Use enums for type-safe status management
- Design indexes for your query patterns
- Use transactions for multi-table atomicity
- Plan migrations carefully for production

**Next Lecture:** LECTURE-09 - Monorepo Architecture with Turborepo

---

**End of Lecture 08**
