# Work Record - December 11, 2025

## Session 14: Transaction Fee Display Fix

### Session Overview
Investigated and fixed the issue where transaction fees stopped being captured and displayed after block 91. The root cause was an outdated projector image that didn't handle the new chaincode event field naming.

### Problem Statement
- Cross-border P2P transfers (0.15% fee) were showing 0 fee in the transaction history
- Fees were correctly calculated on blockchain but not captured in the PostgreSQL read model
- Issue started after block 91 when chaincode was updated

### Investigation Process

1. **Initial Analysis**
   - Confirmed blockchain was correctly calculating fees (3750 Qirat for 2.5 GX cross-border)
   - FEE transactions existed in CouchDB with correct amounts
   - Issue was in the projector not reading the event data correctly

2. **Root Cause Discovery**
   - Parsed raw block data from blocks 91 and 99
   - Block 91 (working): `"totalFee": 7500` (old field name)
   - Block 99 (broken): `"fee": 3750` (new field name)
   - Chaincode was updated on Dec 10 08:17 to change from `totalFee` to `fee`
   - Projector fix was committed (36ebb6f) at Dec 10 11:18
   - BUT projector pod was started at Dec 10 06:37 (BEFORE the fix)
   - Image 2.0.7 didn't include the fix

3. **Timeline of Issue**
   - Block 90 (07:42): `totalFee:15` - worked (old chaincode, old projector)
   - Block 91 (08:02): `totalFee:7500` - worked (old chaincode, old projector)
   - Chaincode updated at 08:17 - changed field to `fee`
   - Chaincode restart at 10:33 - deployed new code
   - Block 96 (11:07): `totalFee:0` - broken (new chaincode with `fee`, old projector expecting `totalFee`)

### Solution Applied

1. **Rebuilt Projector Image**
   - Built projector package with `npm run build --filter=projector`
   - Created Docker image v2.0.8
   - Imported to K3s containerd: `docker save | sudo k3s ctr images import -`

2. **Deployed Updated Projector**
   - Updated deployment to use image `gx-protocol/projector:2.0.8`
   - Restarted to establish fresh database connections
   - Projector correctly parsed `payload.fee` from events

3. **Restarted Outbox-Submitter**
   - Found stale gRPC connections to 127.0.0.1:7051
   - Restarted to establish fresh connections to peers

### Verification Results

**Block 100 (Test Transfer - 1 GX cross-border)**
```
TransferWithFeesCompleted processed:
- fromUserId: LK FF3 ABL912 0WLUY 6025
- toUserId: US A12 XYZ789 TEST1 3985
- amount: 1,000,000 Qirat (1 GX)
- totalFee: 1,500 Qirat (0.15%)
- senderFee: 1,500 (sender pays all)
- receiverFee: 0
- netReceived: 1,000,000 (receiver gets full amount)
- transactionType: P2P
- scope: CROSS_BORDER
```

**Database Verification**
```sql
SELECT type, amount, fee, counterparty FROM "Transaction" ORDER BY timestamp DESC LIMIT 3;

-- Results:
-- FEE      | 1500     | 0    | SYSTEM_OPERATIONS_FUND
-- RECEIVED | 1000000  | 0    | LK FF3 ABL912 0WLUY 6025
-- SENT     | 1000000  | 1500 | US A12 XYZ789 TEST1 3985
```

### Key Files Changed

| File | Change |
|------|--------|
| `workers/projector/Dockerfile` | Rebuilt with v2.0.8 |
| Kubernetes Deployment | Updated image to `gx-protocol/projector:2.0.8` |

### Technical Details

**Event Field Name Change:**
- Old chaincode format: `{ totalFee: number, senderFee: number, receiverFee: number }`
- New chaincode format: `{ fee: number, senderFee: number, receiverFee: number }`

**Projector Fix (commit 36ebb6f):**
```typescript
// Line 1150 in workers/projector/src/index.ts
const totalFee = typeof payload.fee === 'string'
  ? parseFloat(payload.fee)
  : (payload.fee || payload.totalFee || 0);
```

### Lessons Learned

1. **Image Versioning**: Always rebuild and redeploy all affected services after code changes
2. **Field Name Changes**: Coordinate chaincode field name changes with projector updates
3. **Deployment Order**: When changing event schemas, deploy projector BEFORE chaincode
4. **Raw Block Analysis**: Parsing raw blockchain data was crucial to identify the field naming issue

### Session Metrics
- **Duration**: ~40 minutes
- **Blocks Analyzed**: 90, 91, 96, 99, 100
- **Services Redeployed**: projector (v2.0.7 -> v2.0.8), outbox-submitter (restarted)
- **Test Transactions**: 1 (1 GX cross-border P2P)

### Current System State
- Blockchain Height: 101
- Projector: v2.0.8, processing events correctly
- Fee Capture: Working for all new transactions
- Sender-Pays-All Model: Verified working

---

## Session 14b: Currency Display Formatting (Q/GX)

### Session Overview
Implemented smart currency display formatting across the frontend to show amounts appropriately in Qirat (Q) or GX based on the value, and updated all currency labels from "X" to "GX".

### Requirements
- Amounts less than 1,000,000 Qirat (< 1 GX) should display as "XQ" (e.g., "10Q", "1,500Q")
- Amounts at or above 1,000,000 Qirat (>= 1 GX) should display as "X GX" (e.g., "1 GX", "1.5 GX")
- Replace all "X" currency references with "GX" throughout the frontend

### Implementation

#### 1. Created Centralized Utility Function
**File:** `lib/utils.ts`

Added `formatCurrency()` function that:
- Takes amount in Qirat (number or string)
- Returns formatted string with appropriate unit
- Handles edge cases (undefined, NaN, zero)

```typescript
export function formatCurrency(amount: number | string | undefined): string {
  const QIRAT_PER_GX = 1000000
  if (numAmount < QIRAT_PER_GX) {
    return `${Math.round(numAmount).toLocaleString()}Q`
  }
  const gxAmount = numAmount / QIRAT_PER_GX
  return `${formatted} GX`
}
```

#### 2. Updated Components

| Component | Changes |
|-----------|---------|
| `lib/utils.ts` | Added shared `formatCurrency` utility function |
| `FormattedBalance.tsx` | Changed "X" to "GX" in currency unit display |
| `RecentTransactions.tsx` | Replaced local formatting with shared utility |
| `RecentActivity.tsx` | Replaced local formatting with shared utility |
| `NewTransaction.tsx` | Updated `formatXCoins` to use Q/GX logic |
| `BalanceCard.tsx` | Dynamic Q/GX display for main balance |
| `transactions/page.tsx` | Using shared `formatCurrency` utility |

#### 3. BalanceCard Special Handling
The balance card needed special treatment since it displays the value and unit separately:
- Created `getBalanceValue()` - returns just the numeric portion
- Created `getBalanceUnit()` - returns "Q" or "GX" based on amount

### Display Examples

| Amount (Qirat) | Before | After |
|----------------|--------|-------|
| 100 | 0.00 X | 100Q |
| 1,500 | 0.00 X | 1,500Q |
| 100,000 | 0.10 X | 100,000Q |
| 999,999 | 1.00 X | 999,999Q |
| 1,000,000 | 1.00 X | 1 GX |
| 1,500,000 | 1.50 X | 1.5 GX |
| 10,000,000 | 10.00 X | 10 GX |

### Commits Made
1. `feat(utils): add formatCurrency utility for smart Q/GX display`
2. `fix(FormattedBalance): change currency unit from X to GX`
3. `refactor(RecentTransactions): use shared formatCurrency utility`
4. `refactor(RecentActivity): use shared formatCurrency utility`
5. `fix(NewTransaction): update currency formatting to use Q/GX logic`
6. `fix(BalanceCard): implement smart Q/GX balance display`
7. `refactor(transactions): use shared formatCurrency utility`

### Files Changed
- 7 files modified
- +78 lines, -52 lines (net +26 lines)

### Session Metrics
- **Duration**: ~15 minutes
- **Components Updated**: 7
- **Commits**: 7 (staged, file-by-file)

### Current System State
- All frontend currency displays use smart Q/GX formatting
- Amounts < 1 GX show in Qirat format (e.g., "1,500Q")
- Amounts >= 1 GX show in GX format (e.g., "1.5 GX")
- "X" branding replaced with "GX" throughout

---

## Session 15: Profile Page Enterprise Implementation & KYR Mobile Improvements

### Session Overview
Implemented a comprehensive, enterprise-grade profile settings page displaying verified KYC/KYR data in read-only format, and made mobile-first improvements to the KYR relationships page.

### Requirements
1. Profile page at `/settings/profile` to display all verified user registration and KYC data
2. Data should be read-only (already verified)
3. Enterprise standards with mobile-first responsive design
4. PEP (Politically Exposed Person) status should NOT be displayed
5. KYR page mobile improvements and error handling fixes

### Implementation

#### 1. Backend Updates - User Profile Service

**File:** `apps/svc-identity/src/services/users.service.ts`

Extended `getUserProfile` to return comprehensive KYC data:
- Added Prisma includes for related address and country data
- Returns all KYC fields: national ID, passport, employment, address, blockchain identity

```typescript
const user = await db.userProfile.findUnique({
  where: { profileId },
  include: {
    addresses: {
      where: { isCurrent: true },
      take: 1,
    },
    nationalityCountry: {
      select: { countryName: true },
    },
  },
});
```

**File:** `apps/svc-identity/src/types/dtos.ts`

- Added `AddressDTO` interface for address data structure
- Extended `UserProfileDTO` with 40+ fields covering all KYC data

#### 2. Frontend Type Updates

**File:** `types/index.ts`

- Added `UserAddress` interface
- Extended `UserProfile` with comprehensive KYC fields:
  - Personal details (middleName, gender, dateOfBirth, placeOfBirth)
  - National ID (nationalIdNumber, nationalIdIssuedAt, nationalIdExpiresAt)
  - Passport (passportNumber, passportIssuingCountry, passportIssuedAt, passportExpiresAt)
  - Employment (employmentStatus, jobTitle, companyName, industry, workEmail, workPhoneNum)
  - Address (full UserAddress object)
  - Blockchain identity (fabricUserId, onchainStatus, onchainRegisteredAt)
  - Account status (isLocked, lockReason, lockedAt)
  - Admin review (reviewedBy, reviewedAt, denialReason)

#### 3. Profile Page Implementation

**File:** `app/(root)/(client)/settings/profile/page.tsx`

Complete redesign with 7 collapsible sections:

| Section | Content |
|---------|---------|
| Personal Information | Name, DOB, gender, nationality, place of birth |
| National ID | ID number, issue/expiry dates (masked) |
| Passport | Passport number, issuing country, dates (masked) |
| Current Address | Full address with verification status |
| Employment | Status, job title, company, industry, work contact |
| Blockchain Identity | Fabric User ID, on-chain status, registration date |
| Account Status | Account creation/update, status badge, lock info |

**Key UI Features:**
- Collapsible sections with expand/collapse animation
- Mobile-first design: `pb-20 sm:pb-8`, `text-[10px] sm:text-xs` sizing
- Data masking for sensitive fields (last 4 characters visible)
- Verification badges (green checkmarks for verified data)
- Status badges with color coding

**Components Created:**
- `Section`: Collapsible container with header and expand state
- `InfoField`: Label/value display with optional masking

#### 4. KYR Relationships Page Improvements

**File:** `app/(root)/(client)/settings/relationships/page.tsx`

**Error Handling Fixes:**
1. Added content-type checking before JSON parsing to prevent doctype errors:
```typescript
const contentType = response.headers.get('content-type')
if (!contentType || !contentType.includes('application/json')) {
  if (response.status === 404) {
    toast.error('Relationships feature is not yet available', {
      description: 'This feature will be enabled soon.'
    })
  } else {
    toast.error('Server error. Please try again later.')
  }
  return
}
```

2. Network error handling for "Failed to fetch":
```typescript
} catch (err: any) {
  if (err.message === 'Failed to fetch') {
    toast.error('Unable to connect to server', {
      description: 'Please check your connection and try again.'
    })
  }
}
```

**Mobile Improvements:**
- Consistent styling with profile page
- Mobile-friendly touch targets
- Responsive grid layouts

#### 5. Icons Update

**File:** `lib/icons.ts`

- Added `Building2` icon export for employment section

### User Feedback & Fixes

| Feedback | Resolution |
|----------|------------|
| "PEP status shouldn't be there" | Did not include isPEP/pepDetails in frontend display |
| "Failed to fetch" on profile | Backend deployment was pending - resolved after deploy |
| "Doctype error" on KYR form submit | Added content-type header check |
| "Failed to fetch" on KYR | Added network error handling with user-friendly toast |

### Deployment

**Backend Deployment:**
1. Built all packages with Turborepo (17 tasks successful)
2. Created Docker image `gx-protocol/svc-identity:2.0.7`
3. Imported image to K3s on all 3 control-plane nodes:
   - srv1089618 (Kuala Lumpur)
   - srv1089624 (Phoenix)
   - srv1092158 (Frankfurt) - required additional image transfer
4. Updated Kubernetes deployment
5. Verified rollout with 3/3 pods running

**Frontend Deployment:**
- Pushed to `dev` branch for frontend CI/CD

### Files Changed

| File | Change |
|------|--------|
| `apps/svc-identity/src/services/users.service.ts` | Extended profile query with Prisma includes |
| `apps/svc-identity/src/types/dtos.ts` | Added AddressDTO, extended UserProfileDTO |
| `types/index.ts` | Added UserAddress, extended UserProfile |
| `app/(root)/(client)/settings/profile/page.tsx` | Complete enterprise redesign |
| `app/(root)/(client)/settings/relationships/page.tsx` | Error handling & mobile improvements |
| `lib/icons.ts` | Added Building2 icon |

### Session Metrics
- **Duration**: ~30 minutes (continued from previous session)
- **Backend Image**: svc-identity v2.0.7
- **Components Updated**: 6
- **Profile Sections**: 7 collapsible sections
- **Error Handlers Added**: 2 (content-type check, network error)

### Current System State
- svc-identity v2.0.7 deployed on all 3 mainnet nodes
- Profile page displaying comprehensive KYC data in read-only format
- KYR page with improved error handling
- PEP status correctly excluded from user-facing displays

---

## Session 16: Frontend BFF Pattern Implementation & Kubernetes Ingress Fix

### Session Overview
Continued from previous context - fixed CORS issues by implementing BFF (Backend For Frontend) pattern for relationships API, fixed profile page data mapping, and resolved critical 404 errors by updating Kubernetes Ingress configuration.

### Problems Identified

1. **Profile Page Data Issues**
   - Full name showing "Unknown"
   - Missing username, phone number, place of birth, nationality
   - **Root Cause**: Field name mismatch between backend and frontend
     - Backend returns: `firstName`, `lastName`, `phoneNum`, `nationalityCountryCode`
     - Frontend expects: `fname`, `lname`, `phone`, `country`

2. **Data Masking Issue**
   - Phone number and sensitive fields were masked
   - User wanted all data visible (it's their own data)

3. **KYR Page 404 Errors**
   - POST to `/api/relationships` returning 404
   - **Root Cause**: Kubernetes Ingress missing route for `/api/v1/relationships`

### Solutions Implemented

#### 1. Profile Page Field Mapping Fix

**File:** `gx-wallet-frontend/app/api/users/me/route.ts`

Added field transformation layer:
```typescript
const userData = {
  id: rawData.profileId,
  profileId: rawData.profileId,
  email: rawData.email,
  fname: rawData.firstName,      // Map firstName -> fname
  lname: rawData.lastName,       // Map lastName -> lname
  firstName: rawData.firstName,
  lastName: rawData.lastName,
  phone: rawData.phoneNum,       // Map phoneNum -> phone
  phoneNum: rawData.phoneNum,
  country: rawData.nationalityCountryCode,  // Map nationalityCountryCode -> country
  countryName: rawData.nationalityCountryName,
  username: rawData.username || rawData.email?.split('@')[0],
  // ... all other fields
};
```

#### 2. Removed Data Masking

**File:** `gx-wallet-frontend/app/(root)/(client)/settings/profile/page.tsx`

Removed `sensitive` prop from InfoField components:
- Phone Number field
- National ID Number field
- Passport Number field
- Work Phone field

#### 3. Username Removal from Hero Card

**File:** `gx-wallet-frontend/app/(root)/(client)/settings/profile/page.tsx`

Removed only the `@username` line, kept Fabric ID badge as requested.

#### 4. BFF Routes for Relationships

Created new API routes to proxy requests through Next.js server:

| File | Purpose |
|------|---------|
| `app/api/relationships/route.ts` | GET list, POST create |
| `app/api/relationships/[id]/route.ts` | GET detail by ID |
| `app/api/relationships/[id]/confirm/route.ts` | POST confirm |
| `app/api/relationships/[id]/reject/route.ts` | POST reject |

**Example BFF Route:**
```typescript
// app/api/relationships/route.ts
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.user?.accessToken

  const body = await request.json()
  const response = await identityClient.post('/relationships', body, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return NextResponse.json({ success: true, data: response.data })
}
```

#### 5. Kubernetes Ingress Fix (Critical)

**Problem**: The Kubernetes Ingress was missing routes for several svc-identity endpoints, causing 404 errors from nginx.

**Command Used:**
```bash
kubectl patch ingress gx-backend-ingress -n backend-mainnet --type='json' -p='[
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/relationships",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/notifications",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/beneficiaries",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/transfers",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/commands",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/registration",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/documents",
    "pathType": "Prefix"
  }},
  {"op": "add", "path": "/spec/rules/0/http/paths/-", "value": {
    "backend": {"service": {"name": "svc-identity", "port": {"number": 3001}}},
    "path": "/api/v1/validation",
    "pathType": "Prefix"
  }}
]'
```

**Routes Added to Ingress:**
| Path | Service | Port |
|------|---------|------|
| `/api/v1/relationships` | svc-identity | 3001 |
| `/api/v1/notifications` | svc-identity | 3001 |
| `/api/v1/beneficiaries` | svc-identity | 3001 |
| `/api/v1/transfers` | svc-identity | 3001 |
| `/api/v1/commands` | svc-identity | 3001 |
| `/api/v1/registration` | svc-identity | 3001 |
| `/api/v1/documents` | svc-identity | 3001 |
| `/api/v1/validation` | svc-identity | 3001 |

### Verification

**Before Ingress Fix:**
```bash
curl -s https://api.gxcoin.money/api/v1/relationships
# <html><head><title>404 Not Found</title></head>...nginx...
```

**After Ingress Fix:**
```bash
curl -s https://api.gxcoin.money/api/v1/relationships
# {"error":"Unauthorized","message":"No authorization header provided"}
```

### Debugging Process

1. **Initial Investigation**: Server logs showed `identityClient.post('/relationships')` returning 404
2. **Port-Forward Test**: Direct test to pod showed endpoint working
   ```bash
   kubectl port-forward -n backend-mainnet svc/svc-identity 3001:3001
   curl http://localhost:3001/api/v1/relationships
   # {"error":"Unauthorized"} - Working!
   ```
3. **Ingress Analysis**: Examined ingress config, found missing paths
4. **Applied Fix**: Patched ingress with missing routes
5. **Verified**: Public API now returns proper response

### Files Changed

| File | Change |
|------|--------|
| `gx-wallet-frontend/app/api/users/me/route.ts` | Added field name transformation |
| `gx-wallet-frontend/app/(root)/(client)/settings/profile/page.tsx` | Removed username, removed masking |
| `gx-wallet-frontend/app/api/relationships/route.ts` | Created BFF route |
| `gx-wallet-frontend/app/api/relationships/[id]/route.ts` | Created BFF route |
| `gx-wallet-frontend/app/api/relationships/[id]/confirm/route.ts` | Created BFF route |
| `gx-wallet-frontend/app/api/relationships/[id]/reject/route.ts` | Created BFF route |
| Kubernetes Ingress `gx-backend-ingress` | Added 8 missing path rules |

### Lessons Learned

1. **Ingress Configuration**: When adding new backend endpoints, always update Kubernetes Ingress
2. **BFF Pattern**: Routing through Next.js API routes avoids CORS issues entirely
3. **Field Mapping**: Frontend and backend field names should be documented/standardized
4. **Debug Path**: Test directly against pods before assuming code is broken

### Session Metrics
- **Duration**: ~30 minutes
- **Root Causes Fixed**: 3 (field mapping, data masking, ingress routes)
- **BFF Routes Created**: 4
- **Ingress Paths Added**: 8
- **Services Affected**: svc-identity, frontend

### Current System State
- Frontend dev server running at http://localhost:3000
- All svc-identity endpoints now accessible via public API
- Profile page displaying correct data without masking
- KYR relationships page should now function correctly
