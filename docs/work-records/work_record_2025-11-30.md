# Work Record - November 30, 2025

## Session Overview

Testing the user approval flow and on-chain registration process in the GX Coin Protocol.

## Work Completed

### 1. KYR Evidence Tab Enhancement (Continued from Nov 27)

**Problem:** Documents weren't displaying in admin dashboard KYR Evidence tab.

**Solution:**
- Backend: Added `KYCDocumentDTO` interface and updated `submitKYC` to create `KYCDocument` records
- Frontend: Enhanced display with file type badges, size formatting, and "Pending Upload" status
- Inserted test `KYCDocument` records for verification

**Commits:**
- `c0749fe` - feat(svc-identity): add KYCDocumentDTO type
- `08ba71d` - feat(svc-identity): create KYCDocument records during KYR submission
- `ac5733a` (frontend) - feat(admin): enhance KYR Evidence tab display

### 2. User Approval Flow Investigation

**Flow Discovered:**
1. Admin approves user → `PENDING_ADMIN_APPROVAL` → `APPROVED_PENDING_ONCHAIN`
2. `fabricUserId` generated using `generateFabricUserId()` function
3. Batch registration creates `CREATE_USER` outbox commands
4. Outbox-submitter processes commands and submits to Fabric blockchain

### 3. OutboxCommand Schema Fix

**Problem:** `user-management.service.ts` was using old schema fields (`aggregateId`, `commandId`) that didn't exist in current Prisma schema.

**Solution:** Updated to use correct fields:
- `service`: 'identity'
- `requestId`: unique idempotency key
- `id` instead of `commandId`
- Payload contains `userId` instead of `aggregateId`

**Commit:** `a95acdd` - fix(svc-admin): align OutboxCommand creation with Prisma schema

### 4. Controller Approval Fix

**Problem:** `approveUser` controller required `req.user?.profileId` but auth was disabled for testing.

**Solution:** Added fallback to use `system-admin` when auth is disabled.

**Commit:** `d5e37c1` - fix(svc-admin): add fallback adminId for testing

### 5. Fabric Integration Issue Identified

**Issue:** CreateUser transactions fail with `10 ABORTED: failed to collect enough transaction endorsements`

**Root Cause Investigation:**
- Chaincode validates `biometricHash` must be 64 characters (SHA-256)
- Country must be initialized (MY is initialized ✓)
- Endorsement policy requires endorsement from both Org1 and Org2
- SDK may only be submitting to one org

**Chaincode Validation Requirements (identity_contract.go:47-89):**
1. `userID` cannot be empty
2. `nationality` must be 2-letter ISO code
3. `age` must be 0-150
4. `biometricHash` must be exactly 64 characters (SHA-256 hex)
5. Country must exist in `stats_{countryCode}` state

## Test User Status

- **User:** Test User (testflow@example.com)
- **profileId:** 1a9bcb45-596e-4873-b70f-d83ce5bd72e1
- **fabricUserId:** MY 8F0 ABH006 0TURJ 7108
- **Status:** APPROVED_PENDING_ONCHAIN

## Pending Issues

### Fabric Endorsement Issue

The outbox-submitter is failing to get enough endorsements for CreateUser transactions. This needs investigation:

1. **Check Fabric SDK configuration** - Verify it's configured to submit to both orgs
2. **Check endorsement policy** - Verify chaincode endorsement policy
3. **Check peer connectivity** - Ensure both org peers are reachable
4. **Circuit breaker** - After failures, circuit breaker opens and blocks retries

### SSH Issue to Node 1 (72.60.210.201)

Unable to SSH to first k3s node - prevents deploying updated Docker images.

## Files Modified

### Backend
- `apps/svc-admin/src/services/user-management.service.ts` - Fixed OutboxCommand schema
- `apps/svc-admin/src/controllers/user-management.controller.ts` - Added auth fallback
- `apps/svc-identity/src/services/users.service.ts` - Added KYCDocument creation
- `apps/svc-identity/src/types/dtos.ts` - Added KYCDocumentDTO

### Frontend
- `components/admin/UserDetailModal.tsx` - Enhanced KYR Evidence display

## Next Steps

1. **Investigate Fabric endorsement issue**
   - Check core-fabric SDK configuration
   - Verify multi-org endorsement setup
   - Test direct chaincode invocation from peer CLI

2. **Fix SSH access to node 1**
   - Required for deploying updated images to all nodes

3. **Complete on-chain user creation test**
   - Once endorsement issue is resolved
   - Verify genesis distribution follows

4. **File storage implementation**
   - Required for KYR document uploads
   - Enable actual document viewing in admin dashboard
