# User Registration and Account Status Management Architecture

**Version:** 1.0
**Date:** 2025-11-24
**Status:** Design Document
**Authors:** Architecture Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Registration Flow](#registration-flow)
4. [Account Status State Machine](#account-status-state-machine)
5. [Database Schema](#database-schema)
6. [Blockchain Integration](#blockchain-integration)
7. [API Specifications](#api-specifications)
8. [Event-Driven Synchronization](#event-driven-synchronization)
9. [Security and Compliance](#security-and-compliance)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

This document defines the architecture for user registration, KYC verification, admin approval workflow, and account status management in the GX Protocol system. The design implements a multi-stage registration process that separates off-chain identity management from on-chain blockchain registration, ensuring regulatory compliance while maintaining system performance.

### Key Features

- **Multi-stage Registration**: Progressive user onboarding from initial signup to blockchain registration
- **KYC Verification**: Document-based identity verification with admin review
- **Batch On-Chain Registration**: Efficient blockchain registration of approved users
- **Account Status Management**: Comprehensive freeze/unfreeze capabilities for compliance
- **Event-Driven Sync**: Automatic synchronization between off-chain database and blockchain state
- **Audit Trail**: Complete tracking of all status changes and administrative actions

### Architecture Principles

1. **Separation of Concerns**: Off-chain identity management separate from on-chain registration
2. **CQRS Pattern**: Commands go through outbox pattern, queries read from PostgreSQL
3. **Idempotency**: All operations can be safely retried without side effects
4. **Auditability**: Full history of status transitions and admin actions
5. **Regulatory Compliance**: KYC/AML workflow with admin approval gates

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend Application                        │
│                     (User Registration & KYC Portal)                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend Services Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ svc-identity │  │  svc-admin   │  │  outbox-submitter worker │  │
│  │  (User API)  │  │ (Admin API)  │  │   (Blockchain Writer)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────────────┘  │
│         │                  │                   │                     │
│         └──────────────────┴───────────────────┘                     │
│                            │                                         │
│                            ▼                                         │
│                   ┌─────────────────┐                                │
│                   │   PostgreSQL    │                                │
│                   │  (Read Model)   │                                │
│                   │                 │                                │
│                   │ - UserProfile   │                                │
│                   │ - OutboxCommand │                                │
│                   │ - KYCDocuments  │                                │
│                   └─────────────────┘                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ Fabric SDK
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Hyperledger Fabric Network                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    gxtv3 Chaincode                            │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │   │
│  │  │IdentityContract│  │TokenomicsContract│ │AdminContract   │ │   │
│  │  │                │  │                  │ │                │ │   │
│  │  │ - CreateUser   │  │ - Transfer       │ │ - FreezeUser   │ │   │
│  │  │ - GetUser      │  │ - GetBalance     │ │ - UnfreezeUser │ │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                            │                                         │
│                            ▼                                         │
│                    ┌──────────────┐                                  │
│                    │ Event Stream │                                  │
│                    └──────┬───────┘                                  │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
                            │ Events (UserCreated, UserFrozen, etc.)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Projector Worker                               │
│               (Blockchain → Database Synchronization)                │
│                                                                      │
│  Listens to Fabric events and updates PostgreSQL read models        │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Frontend** | User registration forms, KYC document upload, status display |
| **svc-identity** | User authentication, profile management, registration API |
| **svc-admin** | Admin dashboard, KYC review, approval/denial, freeze/unfreeze |
| **outbox-submitter** | Reliable blockchain command submission via outbox pattern |
| **projector** | Event-driven sync of blockchain state to PostgreSQL |
| **Fabric Chaincode** | Immutable on-chain user records, transaction validation |

---

## Registration Flow

### Complete User Journey

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Registration Process                         │
└─────────────────────────────────────────────────────────────────────┘

1. Initial Registration (Off-Chain)
   ┌─────────────────────────────────────────────────────────────────┐
   │ User submits:                                                    │
   │ - Email address                                                  │
   │ - Password                                                       │
   │ - Basic profile info                                             │
   │                                                                  │
   │ Backend:                                                         │
   │ - Creates UserProfile record                                     │
   │ - Status: REGISTERED                                             │
   │ - Sends email verification                                       │
   └─────────────────────────────────────────────────────────────────┘
                              ↓
2. KYC Document Submission
   ┌─────────────────────────────────────────────────────────────────┐
   │ User uploads:                                                    │
   │ - Government-issued ID (passport, national ID, driver license)   │
   │ - Proof of address (utility bill, bank statement)                │
   │ - Selfie photo (liveness check)                                  │
   │ - Biometric data hash                                            │
   │                                                                  │
   │ User provides:                                                   │
   │ - Full legal name                                                │
   │ - Date of birth                                                  │
   │ - Nationality                                                    │
   │ - Residential address                                            │
   │                                                                  │
   │ Backend:                                                         │
   │ - Stores documents in secure storage (S3/MinIO)                  │
   │ - Updates UserProfile                                            │
   │ - Status: PENDING_ADMIN_APPROVAL                                 │
   │ - Notifies admin team                                            │
   └─────────────────────────────────────────────────────────────────┘
                              ↓
3. Admin Review & Approval
   ┌─────────────────────────────────────────────────────────────────┐
   │ Admin reviews:                                                   │
   │ - Document authenticity                                          │
   │ - Photo matching                                                 │
   │ - Biometric hash uniqueness                                      │
   │ - Sanctions/PEP screening                                        │
   │                                                                  │
   │ Admin decision:                                                  │
   │                                                                  │
   │ IF APPROVED:                                                     │
   │   - Generate unique Fabric User ID (e.g., GX4B7N9K2M8P3X)       │
   │   - Status: APPROVED_PENDING_ONCHAIN                             │
   │   - Record: reviewedBy, reviewedAt                               │
   │                                                                  │
   │ IF DENIED:                                                       │
   │   - Status: DENIED                                               │
   │   - Record: denialReason                                         │
   │   - Notify user                                                  │
   └─────────────────────────────────────────────────────────────────┘
                              ↓
4. Batch On-Chain Registration
   ┌─────────────────────────────────────────────────────────────────┐
   │ Admin triggers batch registration:                               │
   │                                                                  │
   │ GET /api/v1/admin/users/pending-onchain                          │
   │ → Returns list of approved users awaiting blockchain registration│
   │                                                                  │
   │ POST /api/v1/admin/users/batch-register-onchain                  │
   │ → Creates OutboxCommand for each user:                           │
   │   {                                                              │
   │     commandType: 'CreateUser',                                   │
   │     payload: {                                                   │
   │       userId: 'GX4B7N9K2M8P3X',                                  │
   │       biometricHash: '0x...',                                    │
   │       nationality: 'US',                                         │
   │       age: 35                                                    │
   │     }                                                            │
   │   }                                                              │
   │                                                                  │
   │ Outbox-Submitter:                                                │
   │ → Picks up commands                                              │
   │ → Invokes IdentityContract:CreateUser                            │
   │ → Blockchain creates User record                                 │
   │ → Emits UserCreated event                                        │
   └─────────────────────────────────────────────────────────────────┘
                              ↓
5. Event Synchronization
   ┌─────────────────────────────────────────────────────────────────┐
   │ Projector receives UserCreated event:                            │
   │                                                                  │
   │ Event payload:                                                   │
   │ {                                                                │
   │   userID: 'GX4B7N9K2M8P3X',                                      │
   │   nationality: 'US',                                             │
   │   status: 'ACTIVE',                                              │
   │   timestamp: '2025-11-24T10:00:00Z',                             │
   │   blockNumber: 156,                                              │
   │   transactionId: 'abc123...'                                     │
   │ }                                                                │
   │                                                                  │
   │ Projector updates database:                                      │
   │ - status: ACTIVE                                                 │
   │ - onchainStatus: ACTIVE                                          │
   │ - onchainRegisteredAt: timestamp                                 │
   │ - blockNumber: 156                                               │
   │ - transactionId: abc123...                                       │
   │                                                                  │
   │ User can now:                                                    │
   │ ✅ Send/receive transactions                                     │
   │ ✅ Receive genesis allocation (if eligible)                      │
   │ ✅ Participate in governance                                     │
   └─────────────────────────────────────────────────────────────────┘
```

### Registration Timeline

| Stage | Estimated Duration | Responsible Party |
|-------|-------------------|-------------------|
| 1. Initial Registration | 2-5 minutes | User |
| 2. Email Verification | 1-10 minutes | User |
| 3. KYC Document Upload | 10-30 minutes | User |
| 4. Admin Review | 1-24 hours | Admin Team |
| 5. Batch Registration | 5-30 seconds per batch (100 users) | System |
| 6. Event Sync | 1-5 seconds | System |
| **Total (typical)** | **2-26 hours** | - |

---

## Account Status State Machine

### Status Definitions

| Status | Description | Can Login? | Can Transact? | Can Be Modified? |
|--------|-------------|-----------|---------------|------------------|
| **REGISTERED** | Initial signup, email verified | ✅ | ❌ | ✅ |
| **KYC_IN_PROGRESS** | User filling KYC form | ✅ | ❌ | ✅ |
| **PENDING_ADMIN_APPROVAL** | KYC submitted, awaiting review | ✅ (view only) | ❌ | ✅ |
| **APPROVED_PENDING_ONCHAIN** | Admin approved, awaiting blockchain | ✅ (view only) | ❌ | ✅ |
| **DENIED** | KYC denied by admin | ✅ (can resubmit) | ❌ | ✅ |
| **ACTIVE** | Fully operational on-chain | ✅ | ✅ | ✅ |
| **FROZEN** | Account locked, cannot transact | ✅ (view only) | ❌ | ✅ (can unfreeze) |
| **SUSPENDED** | Cannot login (severe) | ❌ | ❌ | ✅ (can reinstate) |
| **CLOSED** | Permanently closed | ❌ | ❌ | ❌ (terminal) |

### State Transition Diagram

```
                    ┌──────────────┐
                    │  REGISTERED  │
                    └──────┬───────┘
                           │
                           │ User starts KYC
                           ▼
                  ┌─────────────────┐
                  │ KYC_IN_PROGRESS │
                  └────────┬────────┘
                           │
                           │ User submits KYC
                           ▼
              ┌────────────────────────────┐
              │ PENDING_ADMIN_APPROVAL     │
              └─────────┬──────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        │ Admin Denies  │               │ Admin Approves
        ▼               │               ▼
   ┌────────┐           │    ┌──────────────────────────┐
   │ DENIED │           │    │ APPROVED_PENDING_ONCHAIN │
   └────────┘           │    └────────┬─────────────────┘
        │               │             │
        │ User          │             │ Batch registration
        │ resubmits     │             ▼
        └───────────────┘    ┌─────────────┐
                             │   ACTIVE    │──────┐
                             └──────┬──────┘      │
                                    │             │
                     ┌──────────────┼──────────┐  │
                     │              │          │  │
         Admin       │              │          │  │ Admin
         freezes     │              │          │  │ suspends
                     ▼              │          ▼  │
                ┌─────────┐         │     ┌──────────┐
                │ FROZEN  │         │     │SUSPENDED │
                └────┬────┘         │     └─────┬────┘
                     │              │           │
         Admin       │              │           │ Admin
         unfreezes   │              │           │ reinstates
                     └──────────────┘           │
                                                │
                                    Admin       │
                                    closes      │
                                    permanently │
                                                ▼
                                         ┌──────────┐
                                         │  CLOSED  │
                                         └──────────┘
                                          (terminal)
```

### Freeze/Lock Reasons

| Reason Code | Description | Typical Use Case |
|------------|-------------|------------------|
| **ADMIN_ACTION** | Manual administrative freeze | Policy violation, manual review |
| **SUSPICIOUS_ACTIVITY** | Fraud detection triggered | Unusual transaction patterns |
| **COMPLIANCE_REVIEW** | AML/KYC re-verification needed | Periodic compliance checks |
| **COURT_ORDER** | Legal mandate | Subpoena, asset seizure |
| **USER_REQUEST** | User-initiated freeze | User reports lost device |
| **INACTIVITY** | Dormant account policy | No activity for 2+ years |
| **DEBT_COLLECTION** | Outstanding obligations | Unpaid loan, tax debt |

---

## Database Schema

### Prisma Schema

```prisma
// User status enumeration
enum UserStatus {
  REGISTERED
  KYC_IN_PROGRESS
  PENDING_ADMIN_APPROVAL
  APPROVED_PENDING_ONCHAIN
  DENIED
  ACTIVE
  FROZEN
  SUSPENDED
  CLOSED
}

// Account lock/freeze reasons
enum AccountLockReason {
  ADMIN_ACTION
  SUSPICIOUS_ACTIVITY
  COMPLIANCE_REVIEW
  COURT_ORDER
  USER_REQUEST
  INACTIVITY
  DEBT_COLLECTION
}

// Main user profile table
model UserProfile {
  id              String      @id @default(uuid())
  email           String      @unique
  passwordHash    String

  // Blockchain linkage
  fabricUserId    String?     @unique  // Generated after admin approval

  // Status tracking
  status          UserStatus  @default(REGISTERED)
  onchainStatus   String?     // Mirror of blockchain User.Status

  // Account lock/freeze
  isLocked        Boolean     @default(false)
  lockReason      AccountLockReason?
  lockedBy        String?     // Admin user ID
  lockedAt        DateTime?
  lockNotes       String?     // Additional context

  // Personal information (KYC)
  firstName       String?
  lastName        String?
  dateOfBirth     DateTime?
  nationality     String?     // ISO country code
  residentialAddress Json?    // Structured address object
  phoneNumber     String?

  // Identity verification
  biometricHash   String?     @unique  // SHA-256 hash of biometric data
  idDocumentType  String?     // passport, national_id, drivers_license
  idDocumentNumber String?
  idDocumentExpiry DateTime?

  // KYC documents (stored in S3/MinIO)
  kycDocuments    Json?       // Array of document URLs and metadata

  // Admin review tracking
  reviewedBy      String?     // Admin user ID
  reviewedAt      DateTime?
  denialReason    String?

  // Blockchain synchronization
  onchainRegisteredAt DateTime?
  blockNumber         BigInt?
  transactionId       String?
  lastSyncedAt        DateTime?

  // Timestamps
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  statusHistory   UserStatusHistory[]

  @@index([status])
  @@index([fabricUserId])
  @@index([isLocked])
  @@index([email])
}

// Audit trail for status changes
model UserStatusHistory {
  id              String      @id @default(uuid())
  userId          String
  user            UserProfile @relation(fields: [userId], references: [id])

  previousStatus  UserStatus
  newStatus       UserStatus

  changedBy       String?     // Admin user ID (null if system)
  changeReason    String?
  changeNotes     String?

  // For freeze/unfreeze events
  lockReason      AccountLockReason?

  // Blockchain event tracking
  blockNumber     BigInt?
  transactionId   String?

  createdAt       DateTime    @default(now())

  @@index([userId])
  @@index([newStatus])
  @@index([createdAt])
}

// KYC document metadata
model KYCDocument {
  id              String      @id @default(uuid())
  userId          String

  documentType    String      // passport_photo, id_front, id_back, selfie, proof_of_address
  fileUrl         String      // S3/MinIO URL
  fileName        String
  fileSize        Int         // Bytes
  mimeType        String

  uploadedAt      DateTime    @default(now())
  verifiedBy      String?     // Admin user ID
  verifiedAt      DateTime?
  verificationNotes String?

  @@index([userId])
}
```

### Example Database Records

**Scenario: User "Alice" completes registration**

```json
// UserProfile record
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "fabricUserId": "GX4B7N9K2M8P3X",
  "status": "ACTIVE",
  "onchainStatus": "ACTIVE",
  "isLocked": false,
  "firstName": "Alice",
  "lastName": "Johnson",
  "dateOfBirth": "1989-05-15T00:00:00Z",
  "nationality": "US",
  "biometricHash": "0x5f7a8c9d3e1b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7",
  "idDocumentType": "passport",
  "idDocumentNumber": "N12345678",
  "reviewedBy": "admin-001",
  "reviewedAt": "2025-11-24T10:00:00Z",
  "onchainRegisteredAt": "2025-11-24T10:05:00Z",
  "blockNumber": 156,
  "transactionId": "abc123def456",
  "lastSyncedAt": "2025-11-24T10:05:02Z",
  "createdAt": "2025-11-23T08:30:00Z",
  "updatedAt": "2025-11-24T10:05:02Z"
}

// UserStatusHistory records
[
  {
    "id": "hist-001",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "previousStatus": null,
    "newStatus": "REGISTERED",
    "changedBy": null,
    "createdAt": "2025-11-23T08:30:00Z"
  },
  {
    "id": "hist-002",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "previousStatus": "REGISTERED",
    "newStatus": "KYC_IN_PROGRESS",
    "changedBy": null,
    "createdAt": "2025-11-23T09:00:00Z"
  },
  {
    "id": "hist-003",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "previousStatus": "KYC_IN_PROGRESS",
    "newStatus": "PENDING_ADMIN_APPROVAL",
    "changedBy": null,
    "createdAt": "2025-11-23T09:30:00Z"
  },
  {
    "id": "hist-004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "previousStatus": "PENDING_ADMIN_APPROVAL",
    "newStatus": "APPROVED_PENDING_ONCHAIN",
    "changedBy": "admin-001",
    "changeReason": "KYC documents verified, identity confirmed",
    "createdAt": "2025-11-24T10:00:00Z"
  },
  {
    "id": "hist-005",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "previousStatus": "APPROVED_PENDING_ONCHAIN",
    "newStatus": "ACTIVE",
    "changedBy": null,
    "blockNumber": 156,
    "transactionId": "abc123def456",
    "createdAt": "2025-11-24T10:05:02Z"
  }
]
```

---

## Blockchain Integration

### Fabric User ID Generation

**Algorithm: NanoID-based (Recommended)**

```typescript
import { customAlphabet } from 'nanoid';

// Generate collision-free user IDs
// Using custom alphabet (no ambiguous characters: 0/O, 1/I/l)
const nanoid = customAlphabet('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 12);

async function generateFabricUserId(): Promise<string> {
  let fabricUserId: string;
  let isUnique = false;

  while (!isUnique) {
    const randomPart = nanoid(); // 12 chars
    fabricUserId = `GX${randomPart}`;

    // Verify uniqueness in database
    const existing = await prisma.userProfile.findUnique({
      where: { fabricUserId }
    });

    if (!existing) {
      isUnique = true;
    }
  }

  return fabricUserId;
}

// Example generated IDs:
// GX4B7N9K2M8P3X
// GXHQ8M3N7P2R5T
// GX9C3E7J2K8N4P
```

**Characteristics:**
- **Prefix**: `GX` for easy identification
- **Length**: 14 characters total (2 + 12)
- **Collision probability**: ~1 in 2^60 (negligible for billions of users)
- **Character set**: 35 characters (0-9, A-Z excluding O, I, L)
- **URL-safe**: No special characters
- **Case-insensitive**: All uppercase for consistency

### Chaincode Functions (To Be Implemented)

#### 1. FreezeUser

```go
// In chaincode/identity_contract.go

// FreezeUser locks a user account, preventing all transactions
// Only admins with FREEZE_WALLET permission can freeze accounts
//
// Args:
//   userID string - The Fabric User ID to freeze
//   reason string - Reason for freezing (for audit trail)
//
// Returns:
//   error if user not found or already frozen
func (ic *IdentityContract) FreezeUser(
    ctx contractapi.TransactionContextInterface,
    userID string,
    reason string,
) error {
    // Access control - require admin
    if err := RequireAdmin(ctx); err != nil {
        return err
    }

    // Get user from ledger
    user, err := GetUser(ctx, userID)
    if err != nil {
        return fmt.Errorf("user not found: %v", err)
    }

    // Check if already frozen
    if user.Status == "FROZEN" || user.Status == "LOCKED" {
        return fmt.Errorf("user %s is already frozen/locked", userID)
    }

    // Update status
    user.Status = "FROZEN"

    // Save to ledger
    userJSON, _ := json.Marshal(user)
    err = ctx.GetStub().PutState(userKey(userID), userJSON)
    if err != nil {
        return fmt.Errorf("failed to update user: %v", err)
    }

    // Emit event for projector
    event := map[string]interface{}{
        "userID":    userID,
        "status":    "FROZEN",
        "reason":    reason,
        "timestamp": time.Now(),
        "freezedBy": getCallerID(ctx), // Admin ID
    }
    eventJSON, _ := json.Marshal(event)
    ctx.GetStub().SetEvent("UserFrozen", eventJSON)

    return nil
}
```

#### 2. UnfreezeUser

```go
// UnfreezeUser unlocks a frozen user account
// Only admins with UNFREEZE_WALLET permission can unfreeze accounts
//
// Args:
//   userID string - The Fabric User ID to unfreeze
//
// Returns:
//   error if user not found or not frozen
func (ic *IdentityContract) UnfreezeUser(
    ctx contractapi.TransactionContextInterface,
    userID string,
) error {
    // Access control
    if err := RequireAdmin(ctx); err != nil {
        return err
    }

    // Get user
    user, err := GetUser(ctx, userID)
    if err != nil {
        return fmt.Errorf("user not found: %v", err)
    }

    // Check if frozen
    if user.Status != "FROZEN" && user.Status != "LOCKED" {
        return fmt.Errorf("user %s is not frozen/locked", userID)
    }

    // Update status
    user.Status = "ACTIVE"

    // Save to ledger
    userJSON, _ := json.Marshal(user)
    err = ctx.GetStub().PutState(userKey(userID), userJSON)
    if err != nil {
        return fmt.Errorf("failed to update user: %v", err)
    }

    // Emit event
    event := map[string]interface{}{
        "userID":      userID,
        "status":      "ACTIVE",
        "timestamp":   time.Now(),
        "unfreezedBy": getCallerID(ctx),
    }
    eventJSON, _ := json.Marshal(event)
    ctx.GetStub().SetEvent("UserUnfrozen", eventJSON)

    return nil
}
```

#### 3. ValidateUserCanTransact (Helper)

```go
// In chaincode/helpers.go

// ValidateUserCanTransact checks if user is in valid status for transactions
// This should be called at the start of all transaction functions
//
// Args:
//   ctx - Transaction context
//   userID - User ID to validate
//
// Returns:
//   error if user cannot transact (frozen, suspended, etc.)
func ValidateUserCanTransact(
    ctx contractapi.TransactionContextInterface,
    userID string,
) error {
    user, err := GetUser(ctx, userID)
    if err != nil {
        return fmt.Errorf("user not found: %v", err)
    }

    // Define blocked statuses
    blockedStatuses := []string{
        "FROZEN",
        "LOCKED",
        "SUSPENDED",
        "CLOSED",
        "DECEASED",
    }

    // Check if status is blocked
    for _, blocked := range blockedStatuses {
        if user.Status == blocked {
            return fmt.Errorf(
                "user account is %s and cannot transact",
                user.Status,
            )
        }
    }

    // Only ACTIVE and VERIFIED users can transact
    allowedStatuses := []string{"ACTIVE", "VERIFIED"}
    isAllowed := false
    for _, allowed := range allowedStatuses {
        if user.Status == allowed {
            isAllowed = true
            break
        }
    }

    if !isAllowed {
        return fmt.Errorf(
            "user account status %s is not allowed to transact",
            user.Status,
        )
    }

    return nil
}
```

#### 4. Update Transfer Function

```go
// In chaincode/tokenomics_contract.go

func (tc *TokenomicsContract) Transfer(
    ctx contractapi.TransactionContextInterface,
    recipientID string,
    amount uint64,
    remark string,
) error {
    senderID := getCallerID(ctx)

    // BEFORE VALIDATION: Check if both parties can transact
    if err := ValidateUserCanTransact(ctx, senderID); err != nil {
        return fmt.Errorf("sender validation failed: %v", err)
    }

    if err := ValidateUserCanTransact(ctx, recipientID); err != nil {
        return fmt.Errorf("recipient validation failed: %v", err)
    }

    // Continue with existing transfer logic...
    // (balance checks, fee calculation, wallet updates, etc.)

    return nil
}
```

### Blockchain Events

**Events emitted by chaincode:**

| Event Name | Trigger | Payload Fields |
|-----------|---------|----------------|
| `UserCreated` | New user registered on-chain | `userID`, `nationality`, `status`, `timestamp` |
| `UserFrozen` | Admin freezes account | `userID`, `status`, `reason`, `freezedBy`, `timestamp` |
| `UserUnfrozen` | Admin unfreezes account | `userID`, `status`, `unfreezedBy`, `timestamp` |
| `UserStatusChanged` | Any status change | `userID`, `previousStatus`, `newStatus`, `reason`, `timestamp` |

---

## API Specifications

### 1. User Registration APIs (svc-identity)

#### POST /api/v1/auth/register

**Description**: Initial user registration with email/password

**Request:**
```json
{
  "email": "alice@example.com",
  "password": "SecurePassword123!",
  "confirmPassword": "SecurePassword123!"
}
```

**Response: 201 Created**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "status": "REGISTERED",
  "message": "Registration successful. Please check your email to verify."
}
```

**Error Responses:**
- `400` - Email already registered
- `422` - Invalid email format or weak password

---

#### POST /api/v1/users/kyc

**Description**: Submit KYC documents and information

**Authentication**: Required (JWT)

**Request (multipart/form-data):**
```
firstName: Alice
lastName: Johnson
dateOfBirth: 1989-05-15
nationality: US
phoneNumber: +1234567890
residentialAddress: {"street":"123 Main St","city":"New York","country":"US","postalCode":"10001"}
idDocumentType: passport
idDocumentNumber: N12345678
idDocumentExpiry: 2030-05-15
biometricHash: 0x5f7a8c9d3e1b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7

Files:
- passport_photo (image/jpeg, max 5MB)
- id_front (image/jpeg, max 5MB)
- id_back (image/jpeg, max 5MB)
- selfie (image/jpeg, max 5MB)
- proof_of_address (application/pdf, max 5MB)
```

**Response: 200 OK**
```json
{
  "message": "KYC documents submitted successfully",
  "status": "PENDING_ADMIN_APPROVAL",
  "submittedAt": "2025-11-23T09:30:00Z"
}
```

---

### 2. Admin APIs (svc-admin)

#### GET /api/v1/admin/users

**Description**: List users with filtering

**Authentication**: Required (Admin role)

**Query Parameters:**
- `status` (optional): Filter by UserStatus
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `search` (optional): Search by email, name, or fabricUserId

**Example Request:**
```
GET /api/v1/admin/users?status=PENDING_ADMIN_APPROVAL&page=1&limit=20
```

**Response: 200 OK**
```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "alice@example.com",
      "firstName": "Alice",
      "lastName": "Johnson",
      "nationality": "US",
      "status": "PENDING_ADMIN_APPROVAL",
      "kycDocuments": [
        {
          "type": "passport_photo",
          "url": "https://storage.gxcoin.money/kyc/550e8400.../passport.jpg",
          "uploadedAt": "2025-11-23T09:30:00Z"
        }
      ],
      "createdAt": "2025-11-23T08:30:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

#### POST /api/v1/admin/users/:userId/approve

**Description**: Approve user's KYC and generate Fabric User ID

**Authentication**: Required (Admin role)

**Request:**
```json
{
  "notes": "All documents verified. Identity confirmed via passport."
}
```

**Response: 200 OK**
```json
{
  "message": "User approved successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "fabricUserId": "GX4B7N9K2M8P3X",
  "status": "APPROVED_PENDING_ONCHAIN",
  "reviewedBy": "admin-001",
  "reviewedAt": "2025-11-24T10:00:00Z"
}
```

---

#### POST /api/v1/admin/users/:userId/deny

**Description**: Deny user's KYC application

**Authentication**: Required (Admin role)

**Request:**
```json
{
  "reason": "Document quality insufficient - passport photo is blurry"
}
```

**Response: 200 OK**
```json
{
  "message": "User KYC denied",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "DENIED",
  "denialReason": "Document quality insufficient - passport photo is blurry",
  "reviewedBy": "admin-001",
  "reviewedAt": "2025-11-24T10:00:00Z"
}
```

---

#### GET /api/v1/admin/users/pending-onchain

**Description**: Get list of users approved and awaiting blockchain registration

**Authentication**: Required (Admin role)

**Response: 200 OK**
```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "alice@example.com",
      "fabricUserId": "GX4B7N9K2M8P3X",
      "firstName": "Alice",
      "lastName": "Johnson",
      "nationality": "US",
      "biometricHash": "0x5f7a8c9d...",
      "approvedAt": "2025-11-24T10:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "email": "bob@example.com",
      "fabricUserId": "GXHQ8M3N7P2R5T",
      "firstName": "Bob",
      "lastName": "Smith",
      "nationality": "CA",
      "biometricHash": "0x7g8h9i0j...",
      "approvedAt": "2025-11-24T10:01:00Z"
    }
  ],
  "total": 2
}
```

---

#### POST /api/v1/admin/users/batch-register-onchain

**Description**: Trigger batch blockchain registration for approved users

**Authentication**: Required (Super Admin role)

**Request:**
```json
{
  "userIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Response: 202 Accepted**
```json
{
  "message": "Batch registration queued",
  "count": 2,
  "commands": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "fabricUserId": "GX4B7N9K2M8P3X",
      "commandId": "cmd-001",
      "status": "PENDING"
    },
    {
      "userId": "660e8400-e29b-41d4-a716-446655440001",
      "fabricUserId": "GXHQ8M3N7P2R5T",
      "commandId": "cmd-002",
      "status": "PENDING"
    }
  ]
}
```

---

#### POST /api/v1/admin/users/:userId/freeze

**Description**: Freeze user account (prevent all transactions)

**Authentication**: Required (Super Admin role)

**Request:**
```json
{
  "reason": "SUSPICIOUS_ACTIVITY",
  "notes": "Multiple failed login attempts from different IPs. Investigating potential account compromise."
}
```

**Response: 200 OK**
```json
{
  "message": "User frozen successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "fabricUserId": "GX4B7N9K2M8P3X",
  "status": "FROZEN",
  "lockReason": "SUSPICIOUS_ACTIVITY",
  "lockedBy": "admin-001",
  "lockedAt": "2025-11-24T15:30:00Z"
}
```

---

#### POST /api/v1/admin/users/:userId/unfreeze

**Description**: Unfreeze user account (restore transaction capability)

**Authentication**: Required (Super Admin role)

**Response: 200 OK**
```json
{
  "message": "User unfrozen successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "fabricUserId": "GX4B7N9K2M8P3X",
  "status": "ACTIVE",
  "unfrozenBy": "admin-001",
  "unfrozenAt": "2025-11-24T16:00:00Z"
}
```

---

#### GET /api/v1/admin/users/frozen

**Description**: List all frozen accounts

**Authentication**: Required (Admin role)

**Response: 200 OK**
```json
{
  "frozenUsers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "alice@example.com",
      "fabricUserId": "GX4B7N9K2M8P3X",
      "firstName": "Alice",
      "lastName": "Johnson",
      "lockReason": "SUSPICIOUS_ACTIVITY",
      "lockNotes": "Multiple failed login attempts...",
      "lockedBy": "admin-001",
      "lockedAt": "2025-11-24T15:30:00Z"
    }
  ],
  "total": 1
}
```

---

## Event-Driven Synchronization

### Projector Event Handlers

**Location**: `workers/projector/src/index.ts`

#### 1. handleUserCreated

```typescript
private async handleUserCreated(
  payload: any,
  event: BlockchainEvent
): Promise<void> {
  const { userID, nationality, status, biometricHash } = payload;

  // Update user profile with on-chain data
  await this.prisma.userProfile.update({
    where: { fabricUserId: userID },
    data: {
      status: 'ACTIVE',
      onchainStatus: status,
      onchainRegisteredAt: event.timestamp,
      blockNumber: BigInt(event.blockNumber),
      transactionId: event.transactionId,
      lastSyncedAt: event.timestamp,
    },
  });

  // Create status history record
  await this.prisma.userStatusHistory.create({
    data: {
      userId: (await this.prisma.userProfile.findUnique({
        where: { fabricUserId: userID },
        select: { id: true }
      }))!.id,
      previousStatus: 'APPROVED_PENDING_ONCHAIN',
      newStatus: 'ACTIVE',
      blockNumber: BigInt(event.blockNumber),
      transactionId: event.transactionId,
    },
  });

  this.log('info', 'User registered on-chain', {
    userID,
    blockNumber: event.blockNumber
  });
}
```

#### 2. handleUserFrozen

```typescript
private async handleUserFrozen(
  payload: any,
  event: BlockchainEvent
): Promise<void> {
  const { userID, reason, freezedBy } = payload;

  // Get user ID from fabricUserId
  const user = await this.prisma.userProfile.findUnique({
    where: { fabricUserId: userID },
    select: { id: true, status: true }
  });

  if (!user) {
    this.log('warn', 'User not found for freeze event', { userID });
    return;
  }

  // Update user profile
  await this.prisma.userProfile.update({
    where: { fabricUserId: userID },
    data: {
      status: 'FROZEN',
      onchainStatus: 'FROZEN',
      isLocked: true,
      lastSyncedAt: event.timestamp,
    },
  });

  // Create status history record
  await this.prisma.userStatusHistory.create({
    data: {
      userId: user.id,
      previousStatus: user.status,
      newStatus: 'FROZEN',
      changeReason: reason,
      blockNumber: BigInt(event.blockNumber),
      transactionId: event.transactionId,
    },
  });

  this.log('info', 'User frozen on-chain', { userID });
}
```

#### 3. handleUserUnfrozen

```typescript
private async handleUserUnfrozen(
  payload: any,
  event: BlockchainEvent
): Promise<void> {
  const { userID, unfreezedBy } = payload;

  // Get user ID from fabricUserId
  const user = await this.prisma.userProfile.findUnique({
    where: { fabricUserId: userID },
    select: { id: true, status: true }
  });

  if (!user) {
    this.log('warn', 'User not found for unfreeze event', { userID });
    return;
  }

  // Update user profile
  await this.prisma.userProfile.update({
    where: { fabricUserId: userID },
    data: {
      status: 'ACTIVE',
      onchainStatus: 'ACTIVE',
      isLocked: false,
      lockReason: null,
      lockedBy: null,
      lockedAt: null,
      lockNotes: null,
      lastSyncedAt: event.timestamp,
    },
  });

  // Create status history record
  await this.prisma.userStatusHistory.create({
    data: {
      userId: user.id,
      previousStatus: user.status,
      newStatus: 'ACTIVE',
      blockNumber: BigInt(event.blockNumber),
      transactionId: event.transactionId,
    },
  });

  this.log('info', 'User unfrozen on-chain', { userID });
}
```

### Event Registration

```typescript
// In workers/projector/src/index.ts - processEvent method

private async processEvent(event: BlockchainEvent): Promise<void> {
  const { eventName, payload } = event;

  switch (eventName) {
    case 'UserCreated':
      await this.handleUserCreated(payload, event);
      break;

    case 'UserFrozen':
      await this.handleUserFrozen(payload, event);
      break;

    case 'UserUnfrozen':
      await this.handleUserUnfrozen(payload, event);
      break;

    case 'CountryDataInitialized':
      await this.handleCountryDataInitialized(payload, event);
      break;

    // ... other event handlers

    default:
      this.log('warn', 'Unknown event type', { eventName });
  }
}
```

---

## Security and Compliance

### 1. Access Control Matrix

| Operation | User | Admin | Super Admin |
|-----------|------|-------|-------------|
| Register account | ✅ | ✅ | ✅ |
| Submit KYC | ✅ | ❌ | ❌ |
| View own profile | ✅ | ❌ | ❌ |
| View all users | ❌ | ✅ | ✅ |
| Approve KYC | ❌ | ✅ | ✅ |
| Deny KYC | ❌ | ✅ | ✅ |
| Batch register on-chain | ❌ | ❌ | ✅ |
| Freeze account | ❌ | ❌ | ✅ |
| Unfreeze account | ❌ | ❌ | ✅ |
| View frozen accounts | ❌ | ✅ | ✅ |
| Close account permanently | ❌ | ❌ | ✅ |

### 2. KYC Document Storage Security

**Requirements:**
- Encrypted at rest (AES-256)
- Encrypted in transit (TLS 1.3)
- Access logging (who accessed which document when)
- Retention policy (7 years for regulatory compliance)
- Automatic deletion after account closure + retention period

**Recommended Storage:**
- **S3-compatible storage** (AWS S3, MinIO, DigitalOcean Spaces)
- **Bucket structure**:
  ```
  gx-kyc-documents/
  ├── production/
  │   ├── {userId}/
  │   │   ├── passport_photo.jpg
  │   │   ├── id_front.jpg
  │   │   ├── id_back.jpg
  │   │   ├── selfie.jpg
  │   │   └── proof_of_address.pdf
  ```
- **Access control**: Pre-signed URLs with 5-minute expiration

### 3. Biometric Hash Security

**Generation process:**
```typescript
import crypto from 'crypto';

function generateBiometricHash(biometricData: Buffer): string {
  // Use SHA-256 for one-way hashing
  const hash = crypto
    .createHash('sha256')
    .update(biometricData)
    .digest('hex');

  return `0x${hash}`;
}

// Verification (on subsequent login/transaction)
function verifyBiometric(
  providedData: Buffer,
  storedHash: string
): boolean {
  const computedHash = generateBiometricHash(providedData);
  return computedHash === storedHash;
}
```

**Important:**
- Never store raw biometric data
- Hash is **one-way** (cannot reverse to get original biometric)
- Stored on blockchain for **duplicate detection** (prevent multi-accounting)

### 4. Audit Logging

All administrative actions must be logged:

```typescript
model AdminAuditLog {
  id          String   @id @default(uuid())
  adminId     String
  action      String   // APPROVE_KYC, DENY_KYC, FREEZE_USER, UNFREEZE_USER
  targetUserId String?
  payload     Json     // Complete request body
  ipAddress   String
  userAgent   String
  timestamp   DateTime @default(now())

  @@index([adminId])
  @@index([action])
  @@index([timestamp])
}
```

### 5. Rate Limiting

Prevent abuse of registration endpoints:

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /auth/register | 3 requests | per IP per hour |
| POST /users/kyc | 5 requests | per user per day |
| POST /admin/users/batch-register-onchain | 10 batches | per admin per hour |
| POST /admin/users/:userId/freeze | 100 requests | per admin per hour |

### 6. Data Privacy (GDPR Compliance)

**User Rights:**
- Right to access (GET /api/v1/users/me/data)
- Right to rectification (PATCH /api/v1/users/me)
- Right to erasure (DELETE /api/v1/users/me) - with blockchain considerations
- Right to data portability (GET /api/v1/users/me/export)

**Blockchain Immutability Challenge:**
- On-chain data **cannot be deleted** (blockchain is immutable)
- Solution: Store only **minimal PII** on-chain (biometric hash, nationality, age)
- Store **full PII** off-chain (can be deleted)
- User deletion = off-chain data deletion + on-chain account marked as "CLOSED"

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Tasks:**
- [ ] Update Prisma schema with new enums and models
- [ ] Run database migrations
- [ ] Implement Fabric User ID generation utility
- [ ] Create user registration API endpoints (svc-identity)
- [ ] Implement KYC document upload (S3 integration)
- [ ] Build basic admin dashboard UI (read-only)

**Deliverables:**
- Users can register and upload KYC documents
- Admins can view pending KYC submissions

### Phase 2: Admin Workflow (Week 3-4)

**Tasks:**
- [ ] Implement admin approval/denial APIs
- [ ] Build admin review UI
- [ ] Implement batch on-chain registration API
- [ ] Add admin audit logging
- [ ] Implement email notifications (approval, denial, freeze)

**Deliverables:**
- Complete admin KYC review workflow
- Batch blockchain registration capability

### Phase 3: Blockchain Integration (Week 5-6)

**Tasks:**
- [ ] Add FreezeUser function to chaincode
- [ ] Add UnfreezeUser function to chaincode
- [ ] Update Transfer function with status validation
- [ ] Upgrade chaincode to production (k8s)
- [ ] Test on-chain freeze/unfreeze

**Deliverables:**
- Chaincode supports account freezing
- All transaction functions validate user status

### Phase 4: Event Synchronization (Week 7)

**Tasks:**
- [ ] Implement projector event handlers (UserCreated, UserFrozen, UserUnfrozen)
- [ ] Add event schema validation
- [ ] Test end-to-end sync (off-chain → blockchain → off-chain)
- [ ] Monitor projector lag metrics

**Deliverables:**
- Real-time synchronization between database and blockchain
- Status changes reflected in both systems

### Phase 5: Security & Compliance (Week 8-9)

**Tasks:**
- [ ] Implement rate limiting on all endpoints
- [ ] Add access control checks (RBAC)
- [ ] Set up KYC document encryption
- [ ] Implement audit logging dashboard
- [ ] GDPR compliance features (data export, deletion)
- [ ] Penetration testing

**Deliverables:**
- Secure, compliant registration system
- Audit trail for all administrative actions

### Phase 6: Testing & Launch (Week 10)

**Tasks:**
- [ ] Integration testing (full user journey)
- [ ] Load testing (batch registration of 1000+ users)
- [ ] User acceptance testing (UAT)
- [ ] Documentation finalization
- [ ] Production deployment
- [ ] Monitoring and alerting setup

**Deliverables:**
- Production-ready registration system
- Complete documentation for operations team

---

## Appendix

### A. Example Batch Registration Performance

**Scenario**: Registering 1000 users on blockchain

| Metric | Value | Notes |
|--------|-------|-------|
| Users per batch | 100 | Recommended batch size |
| Total batches | 10 | Sequential processing |
| Time per CreateUser tx | 2-3 seconds | Including multi-org endorsement |
| Total time (sequential) | ~50 minutes | 100 users × 3s × 10 batches |
| Total time (parallel) | ~10 minutes | 10 batches × 100 users in parallel |
| Fabric throughput | ~300-500 TPS | Production network capacity |

**Optimization:**
- Use parallel outbox command processing
- Batch users by nationality (reduces endorsement complexity)
- Schedule during off-peak hours

### B. Status Transition Triggers

| Status Change | Trigger | Initiated By |
|---------------|---------|--------------|
| null → REGISTERED | User submits registration form | User |
| REGISTERED → KYC_IN_PROGRESS | User starts KYC form | User |
| KYC_IN_PROGRESS → PENDING_ADMIN_APPROVAL | User submits KYC documents | User |
| PENDING_ADMIN_APPROVAL → APPROVED_PENDING_ONCHAIN | Admin approves KYC | Admin |
| PENDING_ADMIN_APPROVAL → DENIED | Admin denies KYC | Admin |
| APPROVED_PENDING_ONCHAIN → ACTIVE | Blockchain UserCreated event received | System |
| ACTIVE → FROZEN | Admin freezes account | Admin |
| FROZEN → ACTIVE | Admin unfreezes account | Admin |
| ACTIVE → SUSPENDED | Admin suspends account | Admin |
| SUSPENDED → ACTIVE | Admin reinstates account | Admin |
| ACTIVE → CLOSED | Admin closes account permanently | Admin |

### C. Database Indexes

For optimal query performance:

```sql
-- UserProfile indexes
CREATE INDEX idx_userprofile_status ON "UserProfile"(status);
CREATE INDEX idx_userprofile_fabricuserid ON "UserProfile"("fabricUserId");
CREATE INDEX idx_userprofile_islocked ON "UserProfile"("isLocked");
CREATE INDEX idx_userprofile_email ON "UserProfile"(email);
CREATE INDEX idx_userprofile_createdat ON "UserProfile"("createdAt");
CREATE INDEX idx_userprofile_reviewedat ON "UserProfile"("reviewedAt");

-- UserStatusHistory indexes
CREATE INDEX idx_userstatushistory_userid ON "UserStatusHistory"("userId");
CREATE INDEX idx_userstatushistory_newstatus ON "UserStatusHistory"("newStatus");
CREATE INDEX idx_userstatushistory_createdat ON "UserStatusHistory"("createdAt");

-- KYCDocument indexes
CREATE INDEX idx_kycdocument_userid ON "KYCDocument"("userId");
CREATE INDEX idx_kycdocument_uploadedat ON "KYCDocument"("uploadedAt");

-- OutboxCommand indexes (existing)
CREATE INDEX idx_outboxcommand_status ON "OutboxCommand"(status);
CREATE INDEX idx_outboxcommand_commandtype ON "OutboxCommand"("commandType");
CREATE INDEX idx_outboxcommand_createdat ON "OutboxCommand"("createdAt");
```

---

## Conclusion

This architecture provides a robust, scalable, and compliant user registration and account management system for the GX Protocol. By separating off-chain identity management from on-chain registration, the system achieves:

1. **Regulatory Compliance**: Full KYC/AML workflow with admin approval gates
2. **Performance**: Batch registration prevents blockchain bottlenecks
3. **Security**: Multi-layer access control, encrypted document storage, audit trails
4. **Flexibility**: Status-based account management (freeze, suspend, close)
5. **Auditability**: Complete history of all status changes and admin actions
6. **Eventual Consistency**: Event-driven sync ensures database and blockchain stay aligned

**Next Steps:**
1. Review and approve this architecture document
2. Create implementation tasks in project management system
3. Assign teams to each phase
4. Begin Phase 1 implementation

---

**Document Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Architecture Team | Initial design document |

**Approvals:**

- [ ] Technical Lead
- [ ] Security Officer
- [ ] Compliance Officer
- [ ] Product Manager
