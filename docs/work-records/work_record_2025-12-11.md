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
