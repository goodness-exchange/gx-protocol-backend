# MVP Implementation Plan - User Registration System

**Version:** 1.0
**Date:** 2025-11-24
**Goal:** Get frontend → backend → blockchain working end-to-end

---

## MVP Scope Definition

### What We're Building (MVP)

✅ **Core User Journey:**
1. User registers with email/password
2. User submits KYC (name, DOB, gender, nationality, documents)
3. Admin reviews and approves/denies
4. System generates Fabric User ID
5. Admin triggers batch on-chain registration
6. User becomes ACTIVE on blockchain
7. User can send/receive transactions

✅ **Essential Features Only:**
- User registration API
- KYC document upload (S3)
- Admin dashboard (read/approve/deny)
- Fabric User ID generation
- Batch blockchain registration
- Account freeze/unfreeze
- Basic email notifications

❌ **NOT in MVP (defer to post-launch):**
- Advanced fraud detection
- Multi-language support
- Complex monitoring dashboards
- Load testing
- Disaster recovery procedures
- Automated AML screening
- SMS notifications
- Webhook system
- Admin MFA
- GDPR data export

---

## MVP Architecture - Simplified

```
┌─────────────────┐
│  React Frontend │ (Simple forms)
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  svc-identity   │ Registration, KYC
│  svc-admin      │ Admin approval
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │ UserProfile, OutboxCommand
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ outbox-submitter│ → Fabric CreateUser
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Fabric Chaincode│ IdentityContract
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Projector     │ UserCreated → DB sync
└─────────────────┘
```

---

## Implementation Phases (MVP Only)

### Phase 1: Database & ID Generation (Week 1)

**Backend Tasks:**
- [ ] Update Prisma schema:
  - Add `gender` field to UserProfile
  - Add UserStatus enum
  - Add AccountLockReason enum
- [ ] Create database migration
- [ ] Implement Fabric User ID generation utility (`packages/core-fabric/src/id-generator.ts`)
- [ ] Write unit tests for ID generation/decoding

**Deliverables:**
- `packages/core-fabric/src/id-generator.ts` working
- Database schema updated
- Tests passing

**Estimated Time:** 3-4 days

---

### Phase 2: User Registration APIs (Week 1-2)

**Backend Tasks:**
- [ ] `POST /api/v1/auth/register` - Email/password registration
- [ ] `POST /api/v1/auth/login` - JWT authentication
- [ ] `POST /api/v1/users/kyc` - KYC document upload
  - Integrate S3/MinIO for document storage
  - Validate: firstName, lastName, DOB, gender, nationality
  - Store documents: passport_photo, id_front, id_back, selfie, proof_of_address
- [ ] `GET /api/v1/users/me` - Get own profile
- [ ] Basic email service (send verification email)

**Frontend Tasks:**
- [ ] Registration form (email/password)
- [ ] Login page
- [ ] KYC form (multi-step):
  - Step 1: Personal info (name, DOB, gender, nationality)
  - Step 2: Document upload (drag-drop)
  - Step 3: Review and submit
- [ ] User dashboard (view status)

**Deliverables:**
- Users can register and submit KYC
- Status updates to PENDING_ADMIN_APPROVAL

**Estimated Time:** 5-7 days

---

### Phase 3: Admin Dashboard (Week 2)

**Backend Tasks:**
- [ ] `GET /api/v1/admin/users` - List users with filters
- [ ] `GET /api/v1/admin/users/:userId` - Get user details + KYC documents
- [ ] `POST /api/v1/admin/users/:userId/approve` - Approve KYC
  - Generate Fabric User ID
  - Update status to APPROVED_PENDING_ONCHAIN
- [ ] `POST /api/v1/admin/users/:userId/deny` - Deny KYC
- [ ] `GET /api/v1/admin/users/pending-onchain` - List approved users
- [ ] `POST /api/v1/admin/users/batch-register-onchain` - Trigger batch registration

**Frontend Tasks:**
- [ ] Admin login page
- [ ] User list view (table with filters)
- [ ] User detail view:
  - Display KYC documents
  - Approve/Deny buttons
  - Denial reason textarea
- [ ] Batch registration page:
  - Show approved users
  - Select users for batch
  - Trigger registration button

**Deliverables:**
- Admin can review KYC submissions
- Admin can approve/deny
- Admin can trigger batch registration

**Estimated Time:** 5-7 days

---

### Phase 4: Blockchain Integration (Week 3)

**Chaincode Tasks:**
- [ ] Add `FreezeUser` function to `identity_contract.go`
- [ ] Add `UnfreezeUser` function to `identity_contract.go`
- [ ] Add `ValidateUserCanTransact` helper to `helpers.go`
- [ ] Update `Transfer` function to check user status
- [ ] Add unit tests for freeze/unfreeze
- [ ] Upgrade chaincode on Kubernetes

**Backend Tasks:**
- [ ] Update outbox-submitter to handle:
  - `CreateUser` command
  - `FreezeUser` command
  - `UnfreezeUser` command
- [ ] Test on Fabric testnet first

**Deliverables:**
- Chaincode supports freeze/unfreeze
- Outbox-submitter can create users on-chain
- Users become ACTIVE after on-chain registration

**Estimated Time:** 5-7 days

---

### Phase 5: Event Synchronization (Week 3)

**Backend Tasks:**
- [ ] Add projector event handlers:
  - `handleUserCreated` - Update status to ACTIVE
  - `handleUserFrozen` - Update status to FROZEN
  - `handleUserUnfrozen` - Update status to ACTIVE
- [ ] Add event schemas to `packages/core-events`
- [ ] Test event sync end-to-end

**Deliverables:**
- Database stays in sync with blockchain
- Status changes reflected in real-time

**Estimated Time:** 3-4 days

---

### Phase 6: Freeze/Unfreeze (Week 4)

**Backend Tasks:**
- [ ] `POST /api/v1/admin/users/:userId/freeze` - Freeze account
- [ ] `POST /api/v1/admin/users/:userId/unfreeze` - Unfreeze account
- [ ] `GET /api/v1/admin/users/frozen` - List frozen accounts

**Frontend Tasks:**
- [ ] Freeze/Unfreeze buttons in user detail view
- [ ] Frozen accounts list page
- [ ] Display freeze reason

**Deliverables:**
- Admin can freeze/unfreeze accounts
- Frozen users cannot transact

**Estimated Time:** 2-3 days

---

### Phase 7: Testing & Bug Fixes (Week 4)

**Tasks:**
- [ ] End-to-end manual testing:
  - Register → KYC → Approve → On-chain → Transfer
  - Register → KYC → Deny
  - Approve → Freeze → Unfreeze
- [ ] Fix bugs discovered
- [ ] Basic error handling (user-friendly messages)
- [ ] Input validation on all forms

**Deliverables:**
- All core flows working
- No critical bugs

**Estimated Time:** 3-5 days

---

## MVP Deliverables Checklist

### Backend APIs (svc-identity)
- [ ] POST /api/v1/auth/register
- [ ] POST /api/v1/auth/login
- [ ] POST /api/v1/users/kyc
- [ ] GET /api/v1/users/me

### Backend APIs (svc-admin)
- [ ] GET /api/v1/admin/users
- [ ] GET /api/v1/admin/users/:userId
- [ ] POST /api/v1/admin/users/:userId/approve
- [ ] POST /api/v1/admin/users/:userId/deny
- [ ] GET /api/v1/admin/users/pending-onchain
- [ ] POST /api/v1/admin/users/batch-register-onchain
- [ ] POST /api/v1/admin/users/:userId/freeze
- [ ] POST /api/v1/admin/users/:userId/unfreeze
- [ ] GET /api/v1/admin/users/frozen

### Blockchain (Chaincode)
- [ ] FreezeUser function
- [ ] UnfreezeUser function
- [ ] ValidateUserCanTransact helper
- [ ] Transfer function checks status

### Frontend (User Portal)
- [ ] Registration page
- [ ] Login page
- [ ] KYC form (3 steps)
- [ ] User dashboard (status display)

### Frontend (Admin Portal)
- [ ] Admin login
- [ ] User list with filters
- [ ] User detail with KYC documents
- [ ] Approve/Deny actions
- [ ] Batch registration page
- [ ] Freeze/Unfreeze actions
- [ ] Frozen accounts list

### Workers
- [ ] outbox-submitter handles CreateUser, FreezeUser, UnfreezeUser
- [ ] projector handles UserCreated, UserFrozen, UserUnfrozen

### Infrastructure
- [ ] S3/MinIO bucket for KYC documents
- [ ] Email service configured (SendGrid/SES)
- [ ] Database migrations run

---

## Simplified Tech Stack (MVP)

### Backend
- **Framework:** Express.js (keep it simple)
- **Database:** PostgreSQL + Prisma
- **Storage:** MinIO (self-hosted) or AWS S3
- **Email:** SendGrid or AWS SES (pick one)
- **Auth:** JWT (no OAuth for MVP)

### Frontend
- **Framework:** React + TypeScript
- **State:** React Context or Zustand (no Redux overhead)
- **UI:** Tailwind CSS + Shadcn/UI (fast development)
- **Forms:** React Hook Form + Zod validation
- **HTTP:** Axios or Fetch

### Blockchain
- **Existing:** Hyperledger Fabric 2.5 (already running)
- **Changes:** Add 2 new functions (FreezeUser, UnfreezeUser)

---

## MVP Database Schema (Simplified)

```prisma
enum UserStatus {
  REGISTERED
  PENDING_ADMIN_APPROVAL
  APPROVED_PENDING_ONCHAIN
  DENIED
  ACTIVE
  FROZEN
}

enum AccountLockReason {
  ADMIN_ACTION
  SUSPICIOUS_ACTIVITY
  COURT_ORDER
}

model UserProfile {
  id              String      @id @default(uuid())
  email           String      @unique
  passwordHash    String
  fabricUserId    String?     @unique
  status          UserStatus  @default(REGISTERED)

  // Personal info
  firstName       String?
  lastName        String?
  dateOfBirth     DateTime?
  gender          String?     // "male" or "female"
  nationality     String?

  // KYC documents (S3 URLs)
  kycDocuments    Json?

  // Lock status
  isLocked        Boolean     @default(false)
  lockReason      AccountLockReason?
  lockedAt        DateTime?

  // Admin review
  reviewedBy      String?
  reviewedAt      DateTime?
  denialReason    String?

  // Blockchain sync
  onchainRegisteredAt DateTime?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([status])
  @@index([email])
}

// Existing tables
model OutboxCommand { ... }
model ProjectorState { ... }
```

---

## MVP API Examples (Simplified)

### 1. Register User

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "SecurePassword123!"
}

Response: 201 Created
{
  "userId": "550e8400-...",
  "email": "alice@example.com",
  "status": "REGISTERED"
}
```

### 2. Submit KYC

```bash
POST /api/v1/users/kyc
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

firstName: Alice
lastName: Johnson
dateOfBirth: 1989-05-15
gender: female
nationality: US
passport_photo: <file>
id_front: <file>
selfie: <file>

Response: 200 OK
{
  "status": "PENDING_ADMIN_APPROVAL"
}
```

### 3. Admin Approve

```bash
POST /api/v1/admin/users/550e8400-.../approve
Authorization: Bearer <admin_jwt>

Response: 200 OK
{
  "fabricUserId": "US A3F HBF934 0ABCD 1234",
  "status": "APPROVED_PENDING_ONCHAIN"
}
```

### 4. Batch Register

```bash
POST /api/v1/admin/users/batch-register-onchain
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "userIds": ["550e8400-...", "660e8400-..."]
}

Response: 202 Accepted
{
  "message": "Batch registration queued",
  "count": 2
}
```

---

## MVP Development Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Backend Foundation | DB schema, ID generator, registration APIs |
| Week 2 | Frontend + Admin | User KYC form, Admin dashboard |
| Week 3 | Blockchain Integration | Chaincode updates, event sync |
| Week 4 | Freeze/Unfreeze + Testing | Account management, bug fixes |

**Total MVP Duration:** 4 weeks with 2 full-time developers

---

## Post-MVP Enhancements (Defer to v2)

These are important but NOT blockers for MVP:

1. **Fraud Detection** - Duplicate biometric detection
2. **Advanced Monitoring** - Grafana dashboards, alerting
3. **Load Testing** - Performance under 1000+ concurrent users
4. **Multi-language** - i18n support
5. **SMS Notifications** - Two-factor auth
6. **AML Screening** - Automated sanctions checking
7. **Admin MFA** - Multi-factor authentication
8. **Webhooks** - External system integration
9. **Disaster Recovery** - Backup/restore procedures
10. **Penetration Testing** - Security audit

---

## Success Criteria (MVP Launch)

✅ **Functional:**
- User can register and submit KYC
- Admin can approve/deny KYC
- Approved users get on-chain accounts
- Users can send/receive transactions
- Admin can freeze/unfreeze accounts

✅ **Performance:**
- API response time < 2 seconds
- KYC document upload < 30 seconds
- Batch registration (100 users) < 10 minutes

✅ **Stability:**
- No critical bugs
- Database and blockchain stay in sync
- Projector processes events without crashes

---

## Next Steps

1. **Review this MVP scope** - Confirm what's in/out
2. **Set up development environment** - DB, S3, email service
3. **Start with Phase 1** - Database schema and ID generator
4. **Daily standups** - Track progress, unblock issues
5. **Ship MVP in 4 weeks** - Iterate based on real usage

---

**Remember:** Perfect is the enemy of done. Ship the MVP, get real users, then improve based on actual feedback!

