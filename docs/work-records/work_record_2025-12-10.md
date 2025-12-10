# Work Record - December 10, 2025

## Session 10: Genesis Transaction Backfill and Fee Verification

### Summary
Fixed missing genesis transactions in user transaction history and verified transaction fee implementation.

---

## Issues Addressed

### Issue 1: Missing Genesis Transactions in Transaction History
**Problem:** Users' transaction history did not show their genesis allocation (500 GX received on registration).

**Root Cause:** The projector worker started from block 89 (`ProjectorState.lastBlock: 89`), missing all earlier blocks that contained `GenesisDistributed` events. The projector has a `handleGenesisDistributed` handler, but it never processed the genesis events because they occurred in blocks 1-10.

**Solution:** Created a one-time database backfill script to insert GENESIS transaction records for all wallets that were missing them.

**SQL Migration Applied:**
```sql
INSERT INTO "Transaction" (
  "offTxId", "tenantId", "onChainTxId", "walletId",
  "type", "counterparty", "amount", "fee",
  "remark", "timestamp", "blockNumber"
)
SELECT
  'genesis-' || w."walletId",
  'default',
  'genesis-backfill-' || w."walletId",
  w."walletId",
  'GENESIS'::"OffChainTxType",
  'SYSTEM_USER_GENESIS_POOL',
  500000000,  -- 500 GX = 500,000,000 Qirat
  0,
  'Genesis allocation: Phase 1 User (500 GX)',
  w."createdAt",
  1
FROM "Wallet" w
LEFT JOIN "Transaction" t ON w."walletId" = t."walletId" AND t.type = 'GENESIS'
WHERE t."offTxId" IS NULL;
```

**Result:** 5 genesis transactions successfully backfilled:
- testflow@example.com (profileId: 1a9bcb45-596e-4873-b70f-d83ce5bd72e1)
- user1@test.com (profileId: 0afd6668-7d30-4187-a3cc-9052912f5c83)
- user2@test.com (profileId: 3985c27d-a51f-4b57-983b-377953e6199c)
- e2e-sync-53a089@test.com (profileId: e2e-test-sync-e20e51875c8e)
- e2e-test2-079f@gxcoin.money (profileId: e2e-test-sync2-079f9689)

---

### Issue 2: Transaction Fee Verification
**Problem:** Need to verify fee structure works correctly, especially:
1. 3 GX threshold for free transactions
2. Fee split between sender and receiver
3. Fee display in transaction history

**Findings:**

#### Fee Structure (from `consts.go` and `tokenomics_contract.go`):

| Transaction Type | Scope | Amount Range | Fee Rate |
|------------------|-------|--------------|----------|
| P2P | Local | < 3 GX | 0% (Free) |
| P2P | Local | 3-100 GX | 0.05% |
| P2P | Local | > 100 GX | 0.1% |
| P2P | Cross-Border | 0-100 GX | 0.15% |
| P2P | Cross-Border | > 100 GX | 0.25% |
| Merchant | Local | Any | 0.15% |
| Merchant | Cross-Border | Any | 0.3% |
| Government | Local | Any | 0.1% |
| Government | Cross-Border | Any | 0.2% |
| B2B | Local | Any | 0.2% |
| B2B | Cross-Border | Any | 0.4% |

**Key Discovery:** The 3 GX free threshold **only applies to LOCAL P2P transactions**. Cross-border P2P transactions have no free tier.

#### Test Transfer Results:

**Test 1: 10,000 Q (0.01 GX) Cross-Border Transfer**
- From: LK user (user1@test.com)
- To: US user (user2@test.com)
- Scope: CROSS_BORDER (different countries)
- Fee: 15 Q (0.15% of 10,000 Q = 15 Q) ✓
- Fee Split: 7 Q sender + 8 Q receiver

**Test 2: 5,000,000 Q (5 GX) Cross-Border Transfer**
- From: LK user (user1@test.com)
- To: US user (user2@test.com)
- Scope: CROSS_BORDER
- Fee: 7,500 Q (0.15% of 5,000,000 Q = 7,500 Q) ✓
- Fee Split: 3,750 Q sender + 3,750 Q receiver
- Net Received: 4,996,250 Q (5,000,000 - 3,750 Q)

#### Transaction Records After Testing:
```
type     | amount_gx | fee_gx | counterparty
---------+-----------+--------+---------------------------
GENESIS  |   500.00  | 0.00   | SYSTEM_USER_GENESIS_POOL
SENT     |     5.00  | 0.0075 | US A12 XYZ789 TEST1 3985
RECEIVED |     4.9963| 0.0038 | LK FF3 ABL912 0WLUY 6025
FEE      |     0.0075| 0.00   | SYSTEM_OPERATIONS_FUND
```

---

## Technical Notes

### Blockchain Block History
- Hyperledger Fabric stores all blocks permanently
- Each peer maintains complete block history
- Can query any block by number (0 to current height)
- The Fabric SDK allows replaying events from any starting block
- Current blockchain height: 91 blocks

### Projector Checkpoint Mechanism
- Checkpoint stored in `ProjectorState` table
- Contains: `lastBlock`, `lastEventIndex`, `updatedAt`
- On restart, projector resumes from checkpoint
- **Issue:** If projector starts after genesis events, they are missed
- **Solution:** Either reset checkpoint to 0 or manually backfill

### Fee Calculation Flow
1. `TransferWithFees` called by outbox-submitter
2. `_calculateTransactionFee` determines:
   - Transaction type (P2P, Merchant, B2B, Government)
   - Geographic scope (Local vs Cross-Border)
   - Fee rate based on amount thresholds
3. Fee split: 50/50 for P2P, 100% sender for other types
4. Total fee sent to `SYSTEM_OPERATIONS_FUND`
5. `TransferWithFeesCompleted` event emitted
6. Projector creates 3 transaction records: SENT, RECEIVED, FEE

---

## Database State After Session

### Transaction Summary
| Type | Count |
|------|-------|
| GENESIS | 5 |
| SENT | 4 |
| RECEIVED | 4 |
| FEE | 2 |

### Wallet Balances
| User | Balance (Qirat) | Balance (GX) |
|------|-----------------|--------------|
| testflow@example.com | 500,000,000 | 500.00 |
| user1@test.com | ~499,978,493 | ~499.98 |
| user2@test.com | ~500,021,492 | ~500.02 |

---

## Files Modified
None - only database migration applied directly via psql.

## Commits
None - database-only changes.

---

## Session 11: Fee Policy Update - Sender-Pays-All Model

### Summary
Updated chaincode fee policy from 50-50 split to industry-standard sender-pays-all model. Enhanced transaction remarks and event data to enterprise audit trail standards.

---

## Changes Implemented

### Issue 1: Fee Split Policy Change
**Previous Behavior:** 50-50 fee split between sender and receiver for P2P transactions.

**New Behavior:** 100% sender pays all fees. Receiver always receives the full transfer amount with no deductions.

**Rationale:** This follows industry standards (Visa, Mastercard, PayPal, Wise, etc.) where the sender bears the full cost of the transaction.

#### Configuration Update (`consts.go`):
```go
// Fee Split Configuration
// All transaction fees are paid entirely by the sender.
// The receiver always gets the full transfer amount without any deductions.
// This follows industry standards where the sender bears the cost of the transaction.
const (
    FeeDistributionSenderPct   uint64 = 100 // 100% paid by sender
    FeeDistributionReceiverPct uint64 = 0   // 0% paid by receiver (receiver gets full amount)
)
```

---

### Issue 2: Enterprise Audit Trail Enhancement
**Problem:** Transaction remarks and event data lacked sufficient detail for enterprise-grade audit requirements.

**Solution:** Enhanced all transfer functions with:
1. ISO 8601 timestamps
2. Transaction type classification (P2P, MERCHANT, B2B, GOVERNMENT)
3. Geographic scope (LOCAL, CROSS_BORDER)
4. Fee breakdown with basis points and percentage
5. Fabric transaction ID for blockchain correlation

#### Transfer Remark Format:
```
[2025-12-10T14:30:45Z] User payment | Type: P2P | Scope: CROSS_BORDER | Fee: 7500 Q (0.1500%) | TxID: abc123...
```

#### Fee Record Remark Format:
```
[2025-12-10T14:30:45Z] Transaction fee | Transfer: sender-id -> recipient-id | Amount: 5000000 Q | Rate: 0.1500% (P2P/CROSS_BORDER) | TxID: abc123...
```

#### Event Data Structure:
```json
{
  "transactionId": "fabric-tx-id",
  "timestamp": "2025-12-10T14:30:45Z",
  "fromID": "sender-user-id",
  "toID": "recipient-user-id",
  "amount": 5000000,
  "fee": 7500,
  "netReceived": 5000000,
  "feeRateBps": 15,
  "feeRatePercent": 0.15,
  "transactionType": "P2P",
  "scope": "CROSS_BORDER",
  "senderCountry": "LK",
  "recipientCountry": "US",
  "feeRecipient": "SYSTEM_OPERATIONS_FUND",
  "feePayer": "SENDER_ONLY",
  "auditVersion": "2.0"
}
```

---

## Technical Details

### Updated Functions

#### `_calculateTransactionFee()`:
- Simplified return: Always returns `SenderFee = TotalFee`, `ReceiverFee = 0`
- Removed 50-50 split logic

#### `Transfer()`:
- Sender debited for: `amount + totalFee` (full fee on sender)
- Recipient credited for: `amount` (full amount, no deduction)
- Transaction record includes enterprise audit remark

#### `TransferWithFees()`:
- Same sender-pays-all model
- Enhanced event emission with comprehensive audit data
- Returns `NetReceived = amount` (receiver always gets full amount)

### Fee Rate Table (Unchanged)
| Type | Scope | Amount | Rate |
|------|-------|--------|------|
| P2P | Local | < 3 GX | 0% (Free) |
| P2P | Local | 3-100 GX | 0.05% |
| P2P | Local | > 100 GX | 0.1% |
| P2P | Cross-Border | 0-100 GX | 0.15% |
| P2P | Cross-Border | > 100 GX | 0.25% |
| Merchant | Local | Any | 0.15% |
| Merchant | Cross-Border | Any | 0.3% |
| Government | Local | Any | 0.1% |
| Government | Cross-Border | Any | 0.2% |
| B2B | Local | Any | 0.2% |
| B2B | Cross-Border | Any | 0.4% |

---

## Files Modified

| File | Changes |
|------|---------|
| `gx-coin-fabric/chaincode/consts.go` | Fee split constants (100-0 sender pays) |
| `gx-coin-fabric/chaincode/tokenomics_contract.go` | Fee calculation, Transfer(), TransferWithFees() |

## Commits

| Hash | Message |
|------|---------|
| d90262c | refactor(chaincode): change fee policy to sender-pays-all model |
| 027a5a5 | feat(chaincode): implement sender-pays-all fee model with enterprise audit trail |

---

## Testing Results

All chaincode unit tests passed:
```
=== RUN   TestTransferWithFees_HappyPath
--- PASS: TestTransferWithFees_HappyPath (0.00s)
=== RUN   TestTransfer_FeeCalculation
--- PASS: TestTransfer_FeeCalculation (0.00s)
... (all tests pass)
```

---

## Deployment Status

**Chaincode Version:** Committed to repository, awaiting deployment
**Current Deployed:** v2.12
**Target Version:** v2.13

**Deployment Command (when ready):**
```bash
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
./scripts/k8s-upgrade-chaincode.sh 2.13 <next-sequence>
```

---

## Next Steps
1. Deploy chaincode v2.13 to blockchain network
2. Verify fee policy in production with test transfers
3. Update frontend to handle simplified fee display (receiver fee always 0)
4. Consider adding projector reprocessing capability for historical events
5. Monitor fee collection in SYSTEM_OPERATIONS_FUND
