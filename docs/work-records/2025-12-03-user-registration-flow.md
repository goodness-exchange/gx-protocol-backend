# Work Record: Complete User Registration E2E Flow

**Date:** 2025-12-03
**Branch:** `phase1-infrastructure`
**Author:** Development Team

---

## Summary

Implemented the complete end-to-end user registration flow connecting the backend svc-identity service with the Hyperledger Fabric blockchain. The flow now properly separates registration, KYC approval, and blockchain registration into distinct phases.

## User Registration Flow (Complete)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE REGISTRATION FLOW                        │
└─────────────────────────────────────────────────────────────────────┘

PHASE 1: User Registration (7 Steps)
─────────────────────────────────────
Step 1: POST /api/v1/registration/email
        → Creates PendingRegistration, sends OTP

Step 2: POST /api/v1/registration/email/verify
        → Verifies email OTP (test: "111111")

Step 3: POST /api/v1/registration/name-country
        → Collects firstName, lastName, countryCode

Step 4: POST /api/v1/registration/dob-gender
        → Collects DOB and gender, checks genesis eligibility (13-73)

Step 5: POST /api/v1/registration/password
        → Sets password (min 8 chars, upper+lower+number)

Step 6: POST /api/v1/registration/phone
        → Sends phone OTP

Step 7: POST /api/v1/registration/phone/verify
        → Verifies phone OTP, migrates to UserProfile
        → Status: REGISTERED
        → onchainStatus: NOT_REGISTERED
        → Returns JWT tokens


PHASE 2: KYC Submission & Review
────────────────────────────────
User submits KYC documents via wallet app
Admin reviews via admin panel:
  - GET /api/v1/admin/users?status=REGISTERED
  - GET /api/v1/admin/users/:id
  - POST /api/v1/admin/users/:id/approve
        → Status: ACTIVE
        → onchainStatus: NOT_REGISTERED (still)


PHASE 3: Batch Blockchain Registration
──────────────────────────────────────
Admin triggers batch registration:
  - GET /api/v1/admin/users/pending-blockchain
        → Lists users with ACTIVE status, NOT_REGISTERED onchainStatus

  - POST /api/v1/admin/batch-approve-blockchain
        → Generates Fabric User IDs
        → Creates CREATE_USER outbox commands
        → onchainStatus: PENDING

Outbox-submitter worker:
  → Picks up CREATE_USER commands
  → Submits IdentityContract:CreateUser to Fabric
  → Creates user on blockchain with genesis distribution

Projector worker:
  → Receives UserCreated event from Fabric
  → Updates UserProfile:
        → Status: ACTIVE
        → onchainStatus: ACTIVE
        → onchainRegisteredAt: <timestamp>


COMPLETE!
─────────
User is now fully registered on blockchain with genesis coins.
```

## API Endpoints Added

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/admin/users/pending-blockchain | List users awaiting blockchain registration |
| POST | /api/v1/admin/batch-approve-blockchain | Batch process users for blockchain |

## Files Modified

| File | Changes |
|------|---------|
| `apps/svc-identity/src/services/admin.service.ts` | Added `batchApproveForBlockchain`, `getUsersPendingBlockchain`, `calculateAge` |
| `apps/svc-identity/src/controllers/admin.controller.ts` | Added controller methods for new endpoints |
| `apps/svc-identity/src/routes/admin.routes.ts` | Added new routes |
| `apps/svc-identity/src/services/registration.service.ts` | Documentation clarification |

## Key Design Decisions

### 1. Separation of Concerns

Registration does NOT interact with blockchain because:
- Users need KYC verification first
- Admin must approve users before blockchain registration
- Batch processing is more efficient than individual submissions
- Allows for manual review before blockchain commitment

### 2. Fabric User ID Generation

Uses existing `generateFabricUserId` from `@gx/core-fabric`:
- Format: `CC CCC AANNNN TCCCC NNNN` (e.g., "MY A3F HBF934 0XYZW 1234")
- Encodes: Country, DOB, Gender, Account Type
- Deterministic but with random suffix for uniqueness

### 3. Outbox Pattern

Blockchain commands go through outbox for reliability:
1. Admin service creates outbox command in DB transaction
2. Outbox-submitter worker picks up and submits to Fabric
3. Projector receives events and updates read model

### 4. Status Tracking

| UserProfile.status | UserProfile.onchainStatus | Meaning |
|-------------------|---------------------------|---------|
| REGISTERED | NOT_REGISTERED | Completed 7-step registration |
| ACTIVE | NOT_REGISTERED | KYC approved, awaiting blockchain |
| ACTIVE | PENDING | Batch approved, outbox command created |
| ACTIVE | ACTIVE | Fully registered on blockchain |

## Commits Made

```
ff03be7 docs(svc-identity): clarify registration service does not interact with blockchain
3bfa458 feat(svc-identity): add admin routes for batch blockchain registration
2e67fb7 feat(svc-identity): add admin controller methods for batch blockchain approval
2940b82 feat(svc-identity): add batch blockchain registration for approved users
```

## Testing Instructions

### 1. Complete Registration (Steps 1-7)

```bash
# Step 1: Submit email
curl -X POST http://localhost:3000/api/v1/registration/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Step 2: Verify email OTP (use "111111")
curl -X POST http://localhost:3000/api/v1/registration/email/verify \
  -H "Content-Type: application/json" \
  -d '{"registrationId":"<uuid>","otp":"111111"}'

# Steps 3-7: Continue with name-country, dob-gender, password, phone, phone/verify
```

### 2. Admin Approve KYC

```bash
# List registered users
curl http://localhost:3000/api/v1/admin/users?status=REGISTERED

# Approve user KYC
curl -X POST http://localhost:3000/api/v1/admin/users/<profileId>/approve
```

### 3. Batch Blockchain Registration

```bash
# List users pending blockchain
curl http://localhost:3000/api/v1/admin/users/pending-blockchain

# Trigger batch registration
curl -X POST http://localhost:3000/api/v1/admin/batch-approve-blockchain
```

### 4. Verify Blockchain Registration

```bash
# Check outbox commands
psql -c "SELECT * FROM \"OutboxCommand\" WHERE \"commandType\" = 'CREATE_USER' ORDER BY \"createdAt\" DESC LIMIT 5;"

# Check user onchain status after projector processes
psql -c "SELECT \"profileId\", \"fabricUserId\", \"status\", \"onchainStatus\" FROM \"UserProfile\" WHERE \"fabricUserId\" IS NOT NULL;"
```

## Next Steps

1. Implement actual email/SMS OTP providers (replace test code "111111")
2. Add admin authentication to protect batch approval endpoints
3. Implement KYC document upload and storage
4. Add rate limiting for batch approval
5. Frontend integration for admin panel

---

## Appendix: Outbox Command Payload

```json
{
  "tenantId": "default",
  "service": "svc-identity",
  "commandType": "CREATE_USER",
  "requestId": "<profileId>",
  "payload": {
    "userId": "MY A3F HBF934 0XYZW 1234",
    "biometricHash": "<hash>",
    "nationality": "MY",
    "age": 30
  },
  "status": "PENDING"
}
```

Note: `userId` (lowercase 'd') matches outbox-submitter expectations.
