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

## Next Steps

1. Deploy updated workers to testnet
2. Monitor for any edge cases with new locking patterns
3. Consider adding Redis-based distributed lock as alternative to advisory locks
4. Implement chaincode-level idempotency keys for full end-to-end protection
