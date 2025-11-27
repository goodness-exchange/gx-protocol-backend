# Work Record - November 27, 2025

## Summary

Continued debugging and fixing admin dashboard KYR data display issues. Resolved Prisma client compatibility issues across multiple backend services by rebuilding Docker images with fresh Prisma clients.

## Work Completed

### 1. Admin User Details API - Prisma Column Error Fix

**Problem:** Admin dashboard's "View" button for users returned error: "The column `UserProfile.identityNum` does not exist in the current database"

**Root Cause Investigation:**
- Initial suspicion: Prisma schema ConfigMap had stale schema definition
- Discovery: The Prisma client embedded in Docker images was generated from old schema
- Key finding: Ingress routes `/api/v1/admin` to `svc-admin:3002`, NOT `svc-identity:3001`

**Solution:**
1. Rebuilt `svc-identity:2.0.24` with `--no-cache` flag to regenerate Prisma client
2. Discovered actual issue: svc-admin (not svc-identity) handles `/api/v1/admin` routes
3. Rebuilt `svc-admin:2.0.10` with fresh Prisma client
4. Deployed to all 3 control-plane nodes

**Commands Used:**
```bash
# Build with no cache to force Prisma client regeneration
docker build -t gx-protocol/svc-admin:2.0.10 -f apps/svc-admin/Dockerfile --no-cache .

# Export and transfer to nodes
docker save gx-protocol/svc-admin:2.0.10 | gzip > /tmp/svc-admin-2.0.10.tar.gz
scp /tmp/svc-admin-2.0.10.tar root@217.196.51.190:/tmp/
ssh root@217.196.51.190 "k3s ctr images import /tmp/svc-admin-2.0.10.tar"
```

### 2. Frontend BFF Response Parsing Fix

**Problem:** Admin dashboard modal showed fallback data instead of full KYR data because:
- Backend returns user object directly at root level (not wrapped in `user`)
- BFF spreads this: `{ success: true, ...backendResponse }`
- Frontend was checking `data.user` which was always undefined

**File Modified:** `gx-wallet-frontend/app/(root)/admin/dashboard/page.tsx`

**Fix:**
```typescript
// Before:
if (data.success && data.user) {
  setSelectedUser(data.user);

// After:
const { success, message, ...userData } = data;
if (success && userData.profileId) {
  setSelectedUser(userData as User);
```

### 3. KYC Submit BFF Route Enhancement

**File Modified:** `gx-wallet-frontend/app/api/users/[id]/kyc/submit/route.ts`

**Changes:**
- Updated data structure to match enhanced KYR wizard output
- Changed from `identityDocument` to separate `nationalId` and `passport` fields
- Added support for:
  - `middleName`, `placeOfBirth` in personal details
  - `workDetails` for employment information
  - PEP (Politically Exposed Person) declaration fields
- Made `nationalId` front/back documents mandatory, `passport` optional
- Fixed params handling for Next.js 15 async params pattern
- Improved error logging with specific field names

### 4. auth.service.ts identityNum Field Mapping Fix

**File Modified:** `apps/svc-identity/src/services/auth.service.ts`

**Problem:** Login response DTO was using `user.identityNum` which doesn't exist in Prisma model.

**Fix:** Changed to use `user.nationalIdNumber` for the DTO field mapping.

## Commits Made

### Backend (gx-protocol-backend)
1. `[previous session]` - fix(svc-identity): correct identityNum field mapping in auth service

### Frontend (gx-wallet-frontend)
2. `59c432c` - fix(admin): correct user details parsing from BFF response
3. `b78b8d4` - feat(api): update KYC submit route for enhanced KYR wizard data

## Docker Images Deployed

| Service | Version | Deployed To |
|---------|---------|-------------|
| svc-identity | 2.0.24 | All 3 nodes |
| svc-admin | 2.0.10 | All 3 nodes |

## Challenges & Solutions

### Challenge 1: Stale Prisma Client in Docker Images
**Problem:** Docker images contained Prisma client generated from old schema before `nationalIdNumber` field was added.
**Solution:** Rebuilt images with `--no-cache` flag to force fresh `npx prisma generate`.

### Challenge 2: Wrong Service for Admin API
**Problem:** Assumed `/api/v1/admin/users/:id` was handled by svc-identity; wasted time rebuilding wrong image.
**Solution:** Checked Kubernetes ingress configuration to confirm svc-admin:3002 handles `/api/v1/admin` routes.

### Challenge 3: BFF Response Structure Mismatch
**Problem:** Frontend expected `data.user` but BFF spread response at root level.
**Solution:** Destructured response to extract success flag and use remaining fields as user object.

## Technical Notes

### Kubernetes Ingress Routing
```
/api/v1/admin/* -> svc-admin:3002
/api/v1/users/* -> svc-identity:3001
/api/v1/auth/*  -> svc-identity:3001
/api/v1/registration/* -> svc-identity:3001
```

### Admin User Details API Response Structure
Backend response (svc-admin):
```json
{
  "profileId": "uuid",
  "firstName": "Test",
  "lastName": "User",
  "nationalIdNumber": null,
  "employmentStatus": null,
  "isPEP": false,
  "kycVerifications": [...],
  ...
}
```

BFF response (adds success flag):
```json
{
  "success": true,
  "profileId": "uuid",
  "firstName": "Test",
  ...
}
```

## Verification

**API Test:**
```bash
curl -s https://api.gxcoin.money/api/v1/admin/users/1a9bcb45-596e-4873-b70f-d83ce5bd72e1 | jq '.'
```

**Result:** Full user data returned with all KYR fields (nationalIdNumber, employmentStatus, isPEP, kycVerifications, addresses).

## Pending Tasks

1. **Frontend Testing** - Manually test admin dashboard KYR tabs display after frontend fix
2. **KYR Wizard Integration Testing** - Test full KYR submission flow with new data structure

## Related Files

### Backend
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-admin/src/services/user-management.service.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-admin/src/controllers/user-management.controller.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-identity/src/services/auth.service.ts`

### Frontend
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/app/(root)/admin/dashboard/page.tsx`
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/components/admin/UserDetailModal.tsx`
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/app/api/users/[id]/kyc/submit/route.ts`
