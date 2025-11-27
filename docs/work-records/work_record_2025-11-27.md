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

### 5. Admin Dashboard User Detail Modal UI Improvements

**File Modified:** `gx-wallet-frontend/components/admin/UserDetailModal.tsx`

**Changes:**
- Added icon to Full Name field (`User` icon) for consistent alignment with other fields
- Added icon to Gender field (`Users` icon) for consistent alignment
- Removed PEP (Politically Exposed Person) Declaration section - not required for this use case
- Removed unused `Flag` icon import and `isPEP`/`pepDetails` from interface

### 6. Backend - Address Query Fix

**File Modified:** `apps/svc-admin/src/services/user-management.service.ts`

**Problem:** Admin API's `getUserDetails` endpoint was not returning address data.

**Solution:** Added `addresses` relation to the Prisma `include` clause with `isCurrent` ordering.

```typescript
include: {
  kycVerifications: { ... },
  addresses: {
    orderBy: { isCurrent: 'desc' },
  },
},
```

**Docker Image Deployed:** `svc-admin:2.0.11`

### 7. Test User Address Data Added

Inserted test address data for user `1a9bcb45-596e-4873-b70f-d83ce5bd72e1` via direct SQL:
```sql
INSERT INTO "Address" (
  "addressId", "tenantId", "profileId", "addressType", "isCurrent",
  "addressLine1", "addressLine2", "city", "stateProvince", "postalCode",
  "countryCode", "isVerified", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'default', '1a9bcb45-596e-4873-b70f-d83ce5bd72e1',
  'CURRENT', true, '123 Test Street', 'Suite 456', 'Kuala Lumpur',
  'Federal Territory', '50000', 'MY', false, NOW(), NOW()
);
```

## Commits Made

### Backend (gx-protocol-backend)
1. `[previous session]` - fix(svc-identity): correct identityNum field mapping in auth service
2. `502df40` - feat(svc-admin): include user addresses in getUserDetails query

### Frontend (gx-wallet-frontend)
3. `59c432c` - fix(admin): correct user details parsing from BFF response
4. `b78b8d4` - feat(api): update KYC submit route for enhanced KYR wizard data
5. `bbbb45f` - refactor(admin): improve user detail modal UI consistency

## Docker Images Deployed

| Service | Version | Deployed To |
|---------|---------|-------------|
| svc-identity | 2.0.24 | All 3 nodes |
| svc-admin | 2.0.10 | All 3 nodes |
| svc-admin | 2.0.11 | All 3 nodes |

## KYR Evidence Display Notes

The KYR Evidence tab in admin dashboard currently displays:
- Document metadata (type, number, issuing country, dates) when KYRDocument records exist
- "View" button links to `storageUrl` when documents are uploaded to storage
- Falls back to showing KYR verification hash/size/mime when no documents exist

**Future Enhancement:** To enable full document viewing, the system needs:
1. File upload service integration (S3/MinIO)
2. KYRDocument record creation with `storageUrl` during KYR submission
3. Secure document download endpoint for admin access

### 8. Backend - KYCDocument Record Creation on KYR Submission

**Files Modified:**
- `apps/svc-identity/src/types/dtos.ts` - Added KYCDocumentDTO interface
- `apps/svc-identity/src/services/users.service.ts` - Create KYCDocument records in submitKYC

**Problem:** KYR Evidence tab in admin dashboard showed empty documents because `KYCDocument` table was never populated during KYR submission.

**Solution:**
1. Added `KYCDocumentDTO` interface with comprehensive document metadata fields
2. Updated `SubmitKYCRequestDTO` to include optional `documents` array
3. Modified `submitKYC` method to create `KYCDocument` records within the same transaction
4. Use `pending://` URL scheme as placeholder until file storage is implemented

**Test Data Inserted:**
```sql
-- Added 3 test documents for user 1a9bcb45-596e-4873-b70f-d83ce5bd72e1
INSERT INTO "KYCDocument" (documentType, documentNumber, storageUrl, ...) VALUES
('NATIONAL_ID', '920101-10-1234', 'pending://national-id-front.png', ...),
('NATIONAL_ID', '920101-10-1234', 'pending://national-id-back.png', ...),
('PASSPORT', 'A12345678', 'pending://passport.png', ...);
```

### 9. Frontend - KYR Evidence Tab UI Enhancement

**File Modified:** `gx-wallet-frontend/components/admin/UserDetailModal.tsx`

**Changes:**
- Added file type badge (PNG, JPEG, PDF) next to document type
- Show file name for pending uploads
- Display file size in human-readable format (KB/MB)
- Show truncated file hash for verification
- Added "Pending Upload" badge for documents with pending:// URLs
- Show "View" button only for documents with valid storage URLs
- Improved layout with flex containers for date fields

## Commits Made (Session 2)

### Backend (gx-protocol-backend)
6. `c0749fe` - feat(svc-identity): add KYCDocumentDTO type for enhanced KYR document support
7. `08ba71d` - feat(svc-identity): create KYCDocument records during KYR submission

### Frontend (gx-wallet-frontend)
8. `ac5733a` - feat(admin): enhance KYR Evidence tab with improved document display

## Current Status

**KYR Evidence Tab Now Shows:**
- Document type (NATIONAL_ID, PASSPORT, etc.)
- File type badge (PNG, JPEG, PDF)
- File name from pending:// URL
- Document number, issuing country, dates
- File size in KB/MB
- Truncated file hash
- "Pending Upload" status badge (since no file storage yet)

**What's Still Needed for Full Document Viewing:**
1. File storage service (S3/MinIO) integration
2. File upload endpoint during KYR submission
3. Replace pending:// URLs with actual storage URLs
4. Secure document download endpoint for admin access

## Pending Tasks

1. **File Storage Implementation** - For KYR document upload and admin viewing
2. **KYR Wizard Integration Testing** - Test full KYR submission flow with new document creation

## Related Files

### Backend
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-admin/src/services/user-management.service.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-admin/src/controllers/user-management.controller.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-identity/src/services/auth.service.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-identity/src/services/users.service.ts`
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/apps/svc-identity/src/types/dtos.ts`

### Frontend
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/app/(root)/admin/dashboard/page.tsx`
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/components/admin/UserDetailModal.tsx`
- `/home/sugxcoin/prod-blockchain/gx-wallet-frontend/app/api/users/[id]/kyc/submit/route.ts`
