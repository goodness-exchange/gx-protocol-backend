# GX Protocol - Concurrency Analysis Report

**Date**: December 9, 2025
**Analyst**: Architecture Review
**Scope**: End-to-end concurrency handling across chaincode, backend, and frontend

---

## Executive Summary

This report analyzes concurrency handling across the entire GX Protocol stack. Several **critical issues** were identified that could lead to:
- Double-spending in concurrent transfers
- Lost balance updates
- Duplicate transaction records
- Inconsistent read model state

### Risk Summary

| Layer | Risk Level | Critical Issues | Action Required |
|-------|------------|-----------------|-----------------|
| Chaincode | 🔴 HIGH | TOCTOU in transfers, no idempotency | Immediate |
| Outbox-Submitter | 🔴 HIGH | No pessimistic locking, double-submission risk | Immediate |
| Projector | 🔴 HIGH | No idempotency, checkpoint race | Immediate |
| Frontend | 🟡 MEDIUM | Optimistic updates without rollback | Short-term |

---

## 1. Chaincode Layer (Hyperledger Fabric)

### 1.1 Critical: TOCTOU Race in Transfer Function

**Location**: `gx-coin-fabric/chaincode/tokenomics_contract.go:869-881`

```go
// Read balance (T1)
fromBalance, err := s._readBalance(ctx, fromID)

// Check balance (T2) - GAP HERE
if fromBalance < (amount + senderFee) {
    return fmt.Errorf("insufficient funds...")
}

// Debit account (T3)
err = s._debit(ctx, fromID, amount+senderFee)
```

**Problem**: Time-of-Check to Time-of-Use (TOCTOU) vulnerability
- Two concurrent transactions can both read `balance = 100`
- Both pass the check for `amount = 80`
- Both debit, resulting in negative balance

**Impact**: Double-spending possible

### 1.2 Critical: Genesis Distribution Race

**Location**: `gx-coin-fabric/chaincode/tokenomics_contract.go:122-243`

Multiple shared state keys updated without atomicity:
- `GlobalCounters`
- `SupplyLedger`
- `CountryStats`

**Problem**: Concurrent genesis distributions can:
1. Both read `Phase1Allocation = 50`
2. Both decrement to 49
3. Only 1 allocation actually consumed

### 1.3 Missing Idempotency Keys

**Problem**: No mechanism to prevent re-processing of same transaction
- If submission fails after balance update, retry creates duplicate

### 1.4 Fabric's MVCC Protection (Partial)

Fabric DOES provide MVCC conflict detection:
- Transactions that read same key will abort if another committed first
- But code doesn't handle these aborts gracefully

**What's Missing**:
- No retry logic in chaincode
- No idempotency keys
- No explicit read-set declaration

---

## 2. Outbox-Submitter Worker

### 2.1 Critical: No Pessimistic Locking

**Location**: `workers/outbox-submitter/src/index.ts:504-549`

```typescript
// PROBLEM: findMany + updateMany are NOT atomic
const commands = await tx.outboxCommand.findMany({
  where: { status: 'PENDING' },
  take: batchSize,
});

await tx.outboxCommand.updateMany({
  where: { id: { in: commands.map(c => c.id) } },
  data: { status: 'LOCKED', lockedBy: workerId },
});
```

**Race Condition**:
```
Worker A: SELECT * WHERE status='PENDING' → [cmd#1, cmd#2]
Worker B: SELECT * WHERE status='PENDING' → [cmd#1, cmd#2]  ← SAME!
Worker A: UPDATE SET status='LOCKED' WHERE id IN (1,2)
Worker B: UPDATE SET status='LOCKED' WHERE id IN (1,2)     ← OVERWRITES
```

**Impact**: Both workers submit same command to Fabric

### 2.2 Critical: Lock Timeout Too Short

**Default**: 30 seconds

**Problem**: Fabric consensus can exceed 30 seconds under load
- Another worker picks up "stale" lock
- Double-submission occurs

### 2.3 Missing Version/Optimistic Locking

Status updates don't verify current state:
```typescript
await this.prisma.outboxCommand.update({
  where: { id: command.id },
  data: { status: 'COMMITTED' },
  // MISSING: AND status = 'LOCKED' AND version = X
});
```

### 2.4 Side Effects Not Idempotent

**Location**: `workers/outbox-submitter/src/index.ts:1023-1135`

- Wallet creation doesn't check if exists
- Notification creation uses `randomUUID()` - no deduplication

---

## 3. Projector Worker

### 3.1 Critical: No Idempotency Checks

**All event handlers** lack idempotency:

```typescript
// handleInternalTransferEvent - lines 872-906
await tx.transaction.create({
  data: {
    tenantId: this.config.tenantId,
    onChainTxId: event.transactionId,
    // No check: Does this transaction already exist?
  },
});
```

**Impact**: If projector restarts mid-batch, same events processed twice

### 3.2 Critical: Checkpoint Race Condition

**Location**: `workers/projector/src/index.ts:415-429`

```typescript
// In-memory state updated BEFORE database write
this.lastProcessedBlock = event.blockNumber;
this.lastEventIndex++;

// Save checkpoint periodically
if (this.eventCounter % this.config.checkpointInterval === 0) {
  await this.saveCheckpoint();  // Could fail!
}
```

**Problem**: If `saveCheckpoint()` fails, in-memory state is ahead of database

### 3.3 Critical: No Multiple Instance Protection

No distributed lock prevents multiple projectors:
```typescript
// Both instances could:
// 1. Read checkpoint: block 1000
// 2. Subscribe from block 1001
// 3. Both process same events
```

### 3.4 Non-Atomic Multi-Table Updates

**Location**: `workers/projector/src/index.ts:981-1053`

```typescript
// Two separate queries, NOT in transaction
await this.prisma.wallet.updateMany({...});
await this.prisma.userProfile.updateMany({...});
```

**Impact**: Wallet frozen but UserProfile not (or vice versa)

### 3.5 Balance Updates Without Row Locking

```typescript
await tx.wallet.update({
  where: { walletId: senderWallet.walletId },
  data: { cachedBalance: { decrement: amount } },
});
```

**Problem**: Prisma's `decrement` is `UPDATE balance = balance - X`
- Without `SELECT FOR UPDATE`, concurrent reads can both see old value

---

## 4. Frontend

### 4.1 Medium: Optimistic Updates Without Full Rollback

**Location**: `gx-wallet-frontend/app/(root)/(client)/send/page.tsx:198-226`

```typescript
// Optimistic update
setBeneficiaries(prev =>
  prev.map(b => b.id === id ? { ...b, isFavorite: !b.isFavorite } : b)
);

try {
  await fetch(`/api/beneficiaries/${id}/favorite`, { method: 'PATCH' });
} catch (error) {
  // Revert on error
  setBeneficiaries(prev =>
    prev.map(b => b.id === id ? { ...b, isFavorite: beneficiary.isFavorite } : b)
  );
}
```

**Issue**: If user toggles rapidly, state can become inconsistent

### 4.2 Low: No Transfer Status Polling

**Location**: `components/send/TransactionForm.tsx:95-102`

```typescript
await apiClient('/wallet/transfer', {
  method: 'POST',
  body: JSON.stringify({ toID, amount, reason })
})

toast.success('Transaction sent successfully!')
```

**Issue**: Shows success immediately after 202 Accepted
- Transfer might still be PENDING in outbox
- User thinks it completed but could still fail

### 4.3 Low: Dashboard Data Staleness

`fetchDashboardData` doesn't implement polling/refetch:
- Balance shown could be stale after transfer
- Manual refresh required

---

## 5. Recommended Fixes

### 5.1 Immediate (Critical)

#### A. Add Pessimistic Locking to Outbox-Submitter

```typescript
// Use raw SQL for proper locking
const commands = await prisma.$queryRaw`
  SELECT * FROM "OutboxCommand"
  WHERE status IN ('PENDING', 'FAILED')
  AND (status != 'LOCKED' OR "lockedAt" < NOW() - INTERVAL '5 minutes')
  AND attempts < ${maxRetries}
  ORDER BY "createdAt" ASC
  LIMIT ${batchSize}
  FOR UPDATE SKIP LOCKED
`;
```

#### B. Add Idempotency to Projector

```typescript
// Before creating transaction record
const existing = await tx.transaction.findUnique({
  where: { tenantId_onChainTxId: { tenantId, onChainTxId: event.transactionId } }
});
if (existing) {
  this.log('info', 'Event already processed, skipping', { txId: event.transactionId });
  return;
}
```

#### C. Add Database Unique Constraint

```prisma
model Transaction {
  // ... existing fields
  @@unique([tenantId, onChainTxId])  // Prevent duplicates
}
```

#### D. Increase Lock Timeout

```typescript
// Change from 30s to 5 minutes
lockTimeout: parseInt(process.env.LOCK_TIMEOUT || '300000', 10),
```

### 5.2 Short-Term (High Priority)

#### E. Single Projector Instance

Add distributed lock using Redis:
```typescript
const lock = await redis.set('projector:lock', workerId, 'NX', 'EX', 60);
if (!lock) {
  this.log('warn', 'Another projector instance is running');
  process.exit(0);
}
```

#### F. Wrap Multi-Table Updates in Transaction

```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.wallet.updateMany({...});
  await tx.userProfile.updateMany({...});
});
```

#### G. Add Version Field for Optimistic Locking

```prisma
model OutboxCommand {
  // ... existing fields
  version Int @default(0)
}
```

```typescript
// Update with version check
const result = await prisma.outboxCommand.updateMany({
  where: { id: command.id, status: 'LOCKED', version: command.version },
  data: { status: 'COMMITTED', version: { increment: 1 } },
});
if (result.count === 0) {
  throw new Error('Concurrent modification detected');
}
```

### 5.3 Medium-Term

#### H. Add Request Idempotency to Chaincode

Store idempotency key in chaincode to prevent duplicate processing:
```go
func (s *TokenomicsContract) Transfer(..., idempotencyKey string) error {
    // Check if this exact request was already processed
    processed, _ := ctx.GetStub().GetState("idem_" + idempotencyKey)
    if processed != nil {
        return fmt.Errorf("duplicate request: already processed")
    }

    // ... perform transfer ...

    // Mark as processed
    ctx.GetStub().PutState("idem_" + idempotencyKey, []byte("1"))
}
```

#### I. Frontend Transfer Status Polling

```typescript
const submitTransfer = async () => {
  const response = await apiClient('/wallet/transfer', { method: 'POST', body });
  const { commandId } = response;

  // Poll for status
  const status = await pollTransferStatus(commandId, {
    maxAttempts: 30,
    intervalMs: 2000,
  });

  if (status === 'COMMITTED') {
    toast.success('Transfer confirmed on blockchain!');
    refetchWallet();
  } else if (status === 'FAILED') {
    toast.error('Transfer failed: ' + status.error);
  }
};
```

---

## 6. Testing Recommendations

### 6.1 Concurrency Test Cases

| Test | Expected Result |
|------|-----------------|
| Two simultaneous transfers from same sender | One succeeds, one fails (or both fail) |
| Parallel genesis distributions same country | Allocations decrement atomically |
| Kill projector mid-batch, restart | No duplicate transactions |
| Two outbox workers competing | Each command processed exactly once |
| Rapid toggle favorite button | Final state matches server |

### 6.2 Load Testing

```bash
# Simulate concurrent transfers
for i in {1..10}; do
  curl -X POST /api/v1/transfers -d '{"toID":"...", "amount":100}' &
done
wait

# Verify: Total balance unchanged, no negative balances
```

---

## 7. Summary of Issues by Severity

### Critical (Must Fix Before Production Scale)

| Issue | Location | Risk |
|-------|----------|------|
| No pessimistic locking in outbox | outbox-submitter:504-549 | Double-submission |
| No idempotency in projector | projector:all handlers | Duplicate records |
| TOCTOU in chaincode transfers | chaincode:869-881 | Double-spending |
| Multiple projector instances | projector:347-369 | Duplicate projections |

### High (Fix Within 2 Weeks)

| Issue | Location | Risk |
|-------|----------|------|
| Lock timeout too short | outbox-submitter:80 | Premature takeover |
| Non-atomic multi-table updates | projector:981-1053 | State inconsistency |
| Missing version/optimistic locking | outbox-submitter:577-588 | Lost updates |

### Medium (Fix Within Month)

| Issue | Location | Risk |
|-------|----------|------|
| No transfer status polling | frontend:TransactionForm | User confusion |
| Optimistic update race | frontend:send/page:198-226 | UI inconsistency |
| No exponential backoff | outbox-submitter | Hammering on failure |

---

## 8. Architecture Recommendations

### Current Architecture (Has Issues)

```
User → API → OutboxCommand (PENDING)
                    ↓
        OutboxSubmitter (polls, locks, submits)
                    ↓
             Fabric Chaincode
                    ↓
        Projector (listens, projects)
                    ↓
           PostgreSQL Read Models
```

### Recommended Improvements

1. **Single Writer Pattern**: Only one outbox-submitter instance using distributed lock
2. **Idempotency at Every Layer**:
   - Chaincode: idempotency keys
   - Outbox: unique constraint on requestId
   - Projector: unique constraint on (tenantId, onChainTxId)
3. **Database Row-Level Locking**: Use `FOR UPDATE SKIP LOCKED` for command claiming
4. **Checkpoint-First Processing**: Save checkpoint BEFORE processing event (at-least-once becomes exactly-once with idempotency)

---

## Appendix: File Locations

| Component | File Path |
|-----------|-----------|
| Transfer chaincode | `gx-coin-fabric/chaincode/tokenomics_contract.go` |
| Genesis chaincode | `gx-coin-fabric/chaincode/tokenomics_contract.go:122-243` |
| Outbox-submitter | `gx-protocol-backend/workers/outbox-submitter/src/index.ts` |
| Projector | `gx-protocol-backend/workers/projector/src/index.ts` |
| Frontend send | `gx-wallet-frontend/components/send/TransactionForm.tsx` |
| Frontend dashboard | `gx-wallet-frontend/app/(root)/(client)/dashboard/page.tsx` |
