# Work Record: Enterprise-Level Concurrency Fixes

**Date**: December 10, 2025
**Session**: 10
**Focus**: Implementing industry-standard concurrency patterns across backend workers

---

## Summary

Comprehensive enterprise-level concurrency fixes for the outbox-submitter and projector workers, addressing critical race conditions and idempotency issues identified in the concurrency analysis.

---

## Problems Identified

### Outbox-Submitter Issues
1. **No Pessimistic Locking**: `findMany + updateMany` pattern allowed multiple workers to claim same commands
2. **Lock Timeout Too Short**: 30 seconds insufficient for Fabric consensus under load
3. **No Optimistic Locking**: Status updates didn't verify current state before modification

### Projector Issues
1. **No Idempotency Checks**: Event replay after crash created duplicate transaction records
2. **Multiple Instance Vulnerability**: No distributed lock prevented multiple projectors
3. **Non-Atomic Updates**: Multi-table updates (WalletFrozen) not wrapped in transactions

---

## Solutions Implemented

### 1. Outbox-Submitter: Pessimistic Locking (Critical)

**Pattern**: `FOR UPDATE SKIP LOCKED`

```sql
WITH claimed AS (
  SELECT id FROM "OutboxCommand"
  WHERE (status = 'PENDING' OR ...)
  ORDER BY "createdAt" ASC
  LIMIT $batchSize
  FOR UPDATE SKIP LOCKED  -- Atomic claim!
)
UPDATE "OutboxCommand"
SET status = 'LOCKED', "lockedBy" = $workerId
FROM claimed
WHERE "OutboxCommand".id = claimed.id
RETURNING *
```

**Benefits**:
- Atomic SELECT + UPDATE in single query
- Workers skip locked rows (no blocking)
- Scales to N workers processing disjoint sets

### 2. Outbox-Submitter: Optimistic Locking

```typescript
const updateResult = await this.prisma.outboxCommand.updateMany({
  where: {
    id: command.id,
    status: 'LOCKED',
    lockedBy: this.config.workerId,  // Must still own the lock
  },
  data: { status: 'COMMITTED', ... },
});

if (updateResult.count === 0) {
  // Another worker took over - skip side effects
  return;
}
```

### 3. Projector: Idempotency Checks

```typescript
private async isTransactionAlreadyProcessed(onChainTxId: string): Promise<boolean> {
  // Step 1: Check in-memory cache (O(1))
  if (this.processedTxCache.has(onChainTxId)) return true;

  // Step 2: Check database
  const existing = await this.prisma.transaction.findFirst({
    where: { tenantId, onChainTxId },
  });

  if (existing) {
    this.addToProcessedCache(onChainTxId);
    return true;
  }
  return false;
}
```

**Applied to handlers**:
- `handleInternalTransferEvent`
- `handleTransferCompleted`
- `handleGenesisDistributed`

### 4. Projector: Distributed Lock

**Pattern**: PostgreSQL Advisory Locks

```typescript
private async acquireDistributedLock(): Promise<boolean> {
  const lockId = this.hashStringToInt(`projector:${tenantId}:${channel}`);

  const result = await this.prisma.$queryRaw`
    SELECT pg_try_advisory_lock(${lockId})
  `;

  return result[0]?.pg_try_advisory_lock ?? false;
}
```

**Benefits**:
- Session-scoped (auto-released on disconnect)
- No dedicated lock table needed
- Non-blocking (returns immediately if held)

### 5. Projector: Atomic Multi-Table Updates

```typescript
// Before: Two separate queries (non-atomic)
await this.prisma.wallet.updateMany({...});
await this.prisma.userProfile.updateMany({...});

// After: Single transaction (atomic)
await this.prisma.$transaction(async (tx) => {
  await tx.wallet.updateMany({...});
  await tx.userProfile.updateMany({...});
});
```

---

## Configuration Changes

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| LOCK_TIMEOUT | 30000ms | 300000ms | Fabric consensus can exceed 30s |
| Projector replicas | N | 1 (enforced) | Single instance via advisory lock |

---

## Files Modified

1. **workers/outbox-submitter/src/index.ts**
   - Added `FOR UPDATE SKIP LOCKED` for atomic command claiming
   - Implemented optimistic locking for status updates
   - Increased lock timeout to 5 minutes

2. **workers/projector/src/index.ts**
   - Added `isTransactionAlreadyProcessed()` idempotency check
   - Added `processedTxCache` for O(1) duplicate detection
   - Added `acquireDistributedLock()` using PostgreSQL advisory locks
   - Wrapped WalletFrozen/Unfrozen handlers in transactions

3. **docs/CONCURRENCY_ANALYSIS.md** (NEW)
   - Comprehensive analysis of concurrency issues across all layers
   - Severity-ranked recommendations with code examples

---

## Commits

1. `49a1685` - feat(outbox-submitter): implement enterprise-level concurrency handling
2. `34089c6` - feat(projector): implement enterprise-level concurrency and idempotency
3. `34e4a14` - docs(concurrency): add comprehensive end-to-end concurrency analysis report

---

## Risk Mitigation

| Issue | Risk Before | Risk After | Mitigation |
|-------|-------------|------------|------------|
| Double-submission | HIGH | LOW | Pessimistic locking + optimistic verification |
| Duplicate transactions | HIGH | ELIMINATED | Idempotency checks + unique constraint |
| Multiple projectors | HIGH | ELIMINATED | PostgreSQL advisory lock |
| Stale lock takeover | MEDIUM | LOW | 5-minute timeout + worker verification |

---

## Testing Notes

### Concurrency Test Cases

```bash
# Test 1: Multiple outbox workers
kubectl scale deployment outbox-submitter --replicas=3
# Verify: Each command processed exactly once

# Test 2: Projector failover
kubectl delete pod projector-xxx
# Verify: New pod acquires lock, no duplicates

# Test 3: Rapid transfers
for i in {1..10}; do
  curl -X POST /api/v1/transfers -d '{"amount":100}' &
done
wait
# Verify: Total balance unchanged
```

---

---

## Chaincode Layer Fixes

### 6. Idempotency Keys for TransferInternal

Added optional `idempotencyKey` parameter to `TransferInternal`:

```go
func (s *TokenomicsContract) TransferInternal(
    ctx contractapi.TransactionContextInterface,
    fromID, toID, amountStr, txType, remark string,
    idempotencyKey ...string,  // NEW: Optional idempotency key
) error {
    if len(idempotencyKey) > 0 && idempotencyKey[0] != "" {
        alreadyProcessed, err := checkAndSetIdempotencyKey(ctx, idempotencyKey[0])
        if alreadyProcessed {
            return nil  // Skip duplicate
        }
    }
    // ... proceed with transfer
}
```

### 7. Helper Functions for Idempotency

Added to `helpers.go`:
- `checkAndSetIdempotencyKey()` - Atomic check-and-set for idempotency
- `isOperationProcessed()` - Read-only check for idempotency

### 8. MVCC Documentation

Documented Fabric's built-in MVCC protection in the `Transfer` function:

```go
// CONCURRENCY SAFETY (Fabric MVCC):
// Hyperledger Fabric uses Multi-Version Concurrency Control (MVCC) to prevent double-spending.
// When this function reads the sender's balance, Fabric records that read in the transaction's
// "read set". At commit time, if another transaction modified that balance after our read,
// the endorsement fails with MVCC_READ_CONFLICT.
```

### Chaincode Commits

1. `591fbfc` - feat(chaincode): add idempotency key functions for enterprise concurrency
2. `9be30b9` - feat(chaincode): add idempotency support and MVCC documentation

---

## Complete Concurrency Stack

| Layer | Protection Mechanism | Status |
|-------|---------------------|--------|
| **Chaincode** | MVCC read-set conflict detection | Built-in |
| **Chaincode** | GenesisMinted flag (genesis idempotency) | Existing |
| **Chaincode** | Idempotency keys (TransferInternal) | NEW |
| **Outbox-Submitter** | FOR UPDATE SKIP LOCKED | NEW |
| **Outbox-Submitter** | Optimistic locking with worker verification | NEW |
| **Projector** | Idempotency cache + DB check | NEW |
| **Projector** | PostgreSQL advisory lock | NEW |
| **Database** | Unique constraint (tenantId, onChainTxId) | Existing |

---

## Frontend Send Page Implementation

### Session 10b: Full Send Page Overhaul

Implemented a complete, fully operational send/transfer page in the frontend with proper CQRS async handling.

### Changes Made

#### 1. Beneficiaries API Route (`app/api/beneficiaries/route.ts`)
- Transform backend response to match frontend `Beneficiary` interface
- Extract beneficiaries array from `{beneficiaries: [], total: n}` response
- Map `walletAddress`/`fabricUserId` to `address` field

#### 2. Wallet API Route (`app/api/wallet/route.ts`)
- Switch from `tokenomicsClient` to `identityClient` (API gateway)
- Transform response to `WalletData` interface with `user` and `wallet` objects
- Handle 404 gracefully with "Pending Activation" status
- Include `fabricUserId` as wallet address for transfers

#### 3. Transfer API Route (`app/api/wallet/transfer/route.ts`)
- Refactored to return `202 Accepted` immediately with `commandId`
- Removed blocking `submitAndWaitForCommand` pattern
- Better error handling for business logic errors (self-transfer, inactive account, etc.)
- Frontend handles status polling for better UX

#### 4. Transfer Status Endpoint (`app/api/wallet/transfer/[commandId]/route.ts`) - NEW
- Polls backend `/transfers/:commandId/status`
- Returns command status: `PENDING`, `PROCESSING`, `CONFIRMED`, `FAILED`
- Includes transaction ID and error details

#### 5. TransactionForm Component (`components/send/TransactionForm.tsx`)
- Added transfer state management: `idle`, `submitting`, `pending`, `confirmed`, `failed`
- Client-side polling for blockchain confirmation (60 second timeout)
- Real-time status updates during processing
- Confirmation screen with transaction ID on success
- Error screen with retry option on failure
- Loading spinner and disabled form during processing
- Specific error messages for common failures

#### 6. Icons (`lib/icons.ts`)
- Added `Loader2` for spinning loader animation

### Frontend Commits (gx-wallet-frontend)

1. `5580fe0` - fix(api): transform beneficiaries response to match frontend interface
2. `a00ce16` - fix(api): use identity client for wallet balance and handle 404
3. `eea6597` - refactor(api): simplify transfer to return commandId immediately
4. `f2efb07` - feat(api): add transfer status polling endpoint
5. `98a17a4` - feat(send): implement full transaction flow with status polling
6. `7145ac1` - chore(icons): add Loader2 icon for loading states

---

---

## Session 10c: Transaction Fee Implementation

### Problem Discovered

Testing transfers between `user1@test.com` and `user2@test.com` revealed that **transaction fees were not being charged**. Investigation uncovered that:

1. Backend uses `TransferInternal` chaincode function which is **fee-exempt by design**
2. The regular `Transfer` function requires `submitter == fromID` (user signing their own transaction)
3. Backend operates with a shared admin identity (`gx_partner_api`), making it unable to use `Transfer`

### Root Cause

```
Backend → Fabric (via shared admin identity)
       ↓
     TransferInternal (fee-exempt)
       ↓
     No fees charged
```

The `TransferInternal` function was created for system operations (genesis distribution, loan disbursements, treasury operations) where fees should NOT be charged. User-to-user transfers through the backend were inadvertently using this fee-exempt path.

### Solution: TransferWithFees Function

Created a new chaincode function that enables admin-initiated transfers WITH fee calculation for non-system accounts.

#### Fee Exemption Logic (`helpers.go`)

```go
// Fee-exempt accounts - no fees charged when either party is exempt
func isFeeExemptAccount(accountID string) bool {
    switch accountID {
    case UserGenesisPoolAccountID:     // "SYSTEM_USER_GENESIS_POOL"
    case GovtGenesisPoolAccountID:     // "SYSTEM_GOVT_GENESIS_POOL"
    case CharitablePoolAccountID:      // "SYSTEM_CHARITABLE_POOL"
    case LoanPoolAccountID:            // "SYSTEM_LOAN_POOL"
    case GXPoolAccountID:              // "SYSTEM_GX_POOL"
    case OperationsFundAccountID:      // "SYSTEM_OPERATIONS_FUND"
    case SystemMinterAccountID:        // "SYSTEM_MINTER"
        return true
    }
    // Country treasuries are also exempt
    if len(accountID) > 9 && accountID[:9] == "treasury_" {
        return true
    }
    return false
}

func shouldChargeTransferFee(fromID, toID string) bool {
    return !isFeeExemptAccount(fromID) && !isFeeExemptAccount(toID)
}
```

#### TransferWithFees Function (`tokenomics_contract.go`)

```go
type TransferWithFeesResult struct {
    Success       bool   `json:"success"`
    Amount        uint64 `json:"amount"`
    TotalFee      uint64 `json:"totalFee"`
    SenderFee     uint64 `json:"senderFee"`
    ReceiverFee   uint64 `json:"receiverFee"`
    NetReceived   uint64 `json:"netReceived"`
    IsIdempotent  bool   `json:"isIdempotent"`
    TransactionID string `json:"transactionId"`
}

func (s *TokenomicsContract) TransferWithFees(
    ctx contractapi.TransactionContextInterface,
    fromID, toID, amountStr, txType, remark string,
    idempotencyKey ...string,
) (*TransferWithFeesResult, error)
```

**Key Features**:
- Uses existing `_calculateTransactionFee()` for progressive fee calculation
- Splits P2P fees 50/50 between sender and receiver
- Supports idempotency keys for exactly-once semantics
- Emits `TransferWithFeesCompleted` event with fee breakdown
- Falls back to fee-exempt transfer if either party is a system account

#### Fee Structure (Existing Algorithm)

| Transfer Type | Amount Range | Fee Rate |
|--------------|--------------|----------|
| P2P Local    | < 3 coins    | 0%       |
| P2P Local    | 3-100 coins  | 0.05%    |
| P2P Local    | > 100 coins  | 0.1%     |
| P2P Cross-Country | All     | 0.15%    |
| Business     | All          | 0.2%     |

**Example**: 10,000 Qirat P2P transfer:
- Total Fee: 10 Qirat (0.1%)
- Sender Fee: 5 Qirat
- Receiver Fee: 5 Qirat
- Net Received: 9,995 Qirat

### Backend Integration

#### Outbox-Submitter (`workers/outbox-submitter/src/index.ts`)

```typescript
case 'TRANSFER_TOKENS':
    return {
        contractName: 'TokenomicsContract',
        functionName: 'TransferWithFees',  // Changed from TransferInternal
        args: [
            payload.fromUserId as string,
            payload.toUserId as string,
            payload.amount.toString(),
            '',  // txType hint - empty for auto-detect
            payload.remark as string || 'User-initiated transfer',
            payload.idempotencyKey as string || '',
        ],
    };
```

#### Projector (`workers/projector/src/index.ts`)

Added `handleTransferWithFeesCompleted` event handler:

```typescript
private async handleTransferWithFeesCompleted(
    payload: TransferWithFeesCompletedPayload,
    event: FabricEvent
): Promise<void> {
    const { fromID, toID, amount, senderFee, receiverFee, netReceived, txID } = payload;

    // Check idempotency
    if (await this.isTransactionAlreadyProcessed(txID)) return;

    // Record SENT transaction (gross amount)
    await this.prisma.transaction.create({
        data: {
            type: 'SENT',
            amount: BigInt(amount),
            onChainTxId: txID,
            // ...
        }
    });

    // Record RECEIVED transaction (net amount)
    await this.prisma.transaction.create({
        data: {
            type: 'RECEIVED',
            amount: BigInt(netReceived),
            onChainTxId: `${txID}_received`,
            // ...
        }
    });

    // Record FEE transaction if fees were charged
    if (senderFee > 0 || receiverFee > 0) {
        await this.prisma.transaction.create({
            data: {
                type: 'FEE',
                amount: BigInt(senderFee + receiverFee),
                onChainTxId: `${txID}_fee`,
                // ...
            }
        });
    }
}
```

### Commits

| Repository | Commit | Description |
|------------|--------|-------------|
| gx-coin-fabric | `58083c1` | feat(chaincode): add fee exemption helpers for system pools and treasuries |
| gx-coin-fabric | `5852c21` | feat(chaincode): implement TransferWithFees for enterprise fee calculation |
| gx-protocol-backend | `aee889c` | feat(outbox-submitter): switch TRANSFER_TOKENS to use TransferWithFees |
| gx-protocol-backend | `753efbc` | feat(projector): add TransferWithFeesCompleted event handler for fee tracking |

### Files Modified

| File | Changes |
|------|---------|
| `gx-coin-fabric/chaincode/helpers.go` | Added `isFeeExemptAccount()`, `shouldChargeTransferFee()` |
| `gx-coin-fabric/chaincode/tokenomics_contract.go` | Added `TransferWithFeesResult` struct, `TransferWithFees()` function |
| `gx-protocol-backend/workers/outbox-submitter/src/index.ts` | Changed TRANSFER_TOKENS to use TransferWithFees |
| `gx-protocol-backend/workers/projector/src/index.ts` | Added `handleTransferWithFeesCompleted()` handler |

### Transfer Types Now Supported

| Transfer Type | Fee Status | Chaincode Function |
|--------------|------------|-------------------|
| User → User | **CHARGED** | `TransferWithFees` |
| Org → User | **CHARGED** | `TransferWithFees` |
| User → Org | **CHARGED** | `TransferWithFees` |
| Org → Org | **CHARGED** | `TransferWithFees` |
| Pool → User (Genesis) | EXEMPT | `TransferInternal` |
| Pool → User (Loan) | EXEMPT | `TransferInternal` |
| User → Treasury (Tax) | EXEMPT | `TransferInternal` |
| Any → System Pool | EXEMPT | `TransferInternal` |

### Architecture Decision: Admin-Initiated vs Client-Signed

The user raised whether client-side signing (users signing with their own Fabric identity) is the industry standard. Analysis:

**Client-Signed Transactions**:
- Users have their own Fabric identity
- Frontend holds private keys (or uses hardware wallet)
- User signs each transaction

**Admin-Initiated (Current Architecture)**:
- Users authenticate via JWT to backend
- Backend holds shared admin identity
- Backend submits transactions on behalf of users

**Decision**: Continue with admin-initiated architecture because:
1. **User Experience**: No need for users to manage Fabric keys
2. **Key Management**: Single secure admin key vs millions of user keys
3. **Recovery**: Users can reset via email/phone, not lost private keys
4. **Mobile Support**: No hardware wallet dependency
5. **Compliance**: Backend can enforce rules before submission

The `TransferWithFees` function properly enables fees while maintaining this architecture.

### Deployment Notes

**Chaincode Upgrade Required**:
```bash
cd gx-coin-fabric
./scripts/k8s-upgrade-chaincode.sh <new_version> <new_sequence>
```

**Backend Deployment**:
```bash
# After chaincode upgrade completes
kubectl rollout restart deployment outbox-submitter -n backend-mainnet
kubectl rollout restart deployment projector -n backend-mainnet
```

### Testing Checklist

- [ ] Deploy updated chaincode to testnet
- [ ] Verify fee calculation for small transfer (< 3 coins) - should be 0
- [ ] Verify fee calculation for medium transfer (3-100 coins) - should be 0.05%
- [ ] Verify fee calculation for large transfer (> 100 coins) - should be 0.1%
- [ ] Verify system pool transfers remain fee-exempt
- [ ] Verify transaction history shows separate FEE record
- [ ] Verify sender balance = original - amount - senderFee
- [ ] Verify receiver balance = original + netReceived

---

## Next Steps

1. Deploy updated chaincode to testnet with new version
2. Upgrade backend workers on testnet
3. Run comprehensive fee calculation tests
4. Monitor for any edge cases with fee exemption logic
5. Deploy to mainnet after testnet validation
