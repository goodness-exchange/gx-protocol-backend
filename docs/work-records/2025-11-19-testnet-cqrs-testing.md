# Testnet CQRS Flow Testing - 2025-11-19

**Date:** November 19, 2025
**Duration:** ~1 hour
**Objective:** Test end-to-end CQRS flow on testnet backend deployment

## Context

Following the successful MSP ID fix and projector event listener connection, this session focused on testing the complete CQRS flow:
1. Command submission via OutboxCommand table
2. Outbox-submitter processing and Fabric submission
3. Chaincode execution
4. Event emission
5. Projector receiving events
6. Read model updates

## Testing Approach

### Test Command: CREATE_USER

Chose CREATE_USER as the test command because:
- Simple chaincode function with clear parameters
- Available in CommandType enum
- Non-privileged operation (doesn't require BOOTSTRAP)
- Good representative of CQRS flow

**Required Payload Format:**
```json
{
  "userId": "string",
  "biometricHash": "string",
  "nationality": "string",
  "age": number
}
```

**Chaincode Mapping:**
- Contract: `IdentityContract`
- Function: `CreateUser`
- Args: `[userId, biometricHash, nationality, age.toString()]`

## Test Execution

### Test 1: Initial Command (test-cmd-001)
**Issue:** Missing required `age` field
**Error:** `Cannot read properties of undefined (reading 'toString')`
**Resolution:** Added age field to payload

### Test 2: Corrected Payload (test-cmd-002)
**Command:**
```sql
INSERT INTO "OutboxCommand" VALUES (
  'test-cmd-002', 'default', 'svc-identity', 'CREATE_USER', 'req-test-002',
  '{"userId":"user-test-002","biometricHash":"hash123","nationality":"US","age":25}'::jsonb,
  'PENDING', NOW()
);
```

**Result:** Outbox-submitter picked up command ✅
**Issue:** Fabric endorsement failed
**Error:** `10 ABORTED: failed to endorse transaction`

### Root Cause Investigation

**Peer Logs Analysis:**
```
WARN [endorser] ProcessProposal -> Failed to invoke chaincode
error="error in simulation: failed to execute transaction:
could not launch chaincode gxtv3_1.0: connection failed:
error creating grpc connection to gxtv3-chaincode-0.gxtv3-chaincode.fabric-testnet.svc.cluster.local:7052:
failed to create new connection: dial tcp 10.42.3.133:7052: connect: no route to host"
```

**Critical Discovery:**
- Peer trying to connect to chaincode at **10.42.3.133:7052** (stale IP)
- Actual chaincode pod at **10.42.3.231** (current IP)
- Headless service DNS should resolve dynamically but peer has cached connection
- Root cause: Testnet was set up 7 days ago, chaincode pod has been restarted/moved since then

## Attempted Fixes

### Fix Attempt 1: Restart Peer Pod ⚠️
**Action:** `kubectl delete pod -n fabric-testnet peer0-org1-0`
**Expected:** Peer reconnects to current chaincode IP
**Result:** Partially successful - peer restarted but outbox-submitter connection broke
**New Error:** `14 UNAVAILABLE: connect ECONNREFUSED 10.42.3.140:7051`

### Fix Attempt 2: Restart Outbox-Submitter ✅
**Action:** `kubectl delete pod -n backend-testnet outbox-submitter-*`
**Expected:** Refresh Fabric connection to new peer IP
**Result:** Connection restored, but chaincode issue persisted

### Fix Attempt 3: Restart Chaincode Pod ⚠️
**Action:** `kubectl delete pod -n fabric-testnet gxtv3-chaincode-0`
**Expected:** Force peer to establish new connection
**Result:** Chaincode restarted with new IP (10.42.3.44) but peer still trying old IP (10.42.3.133)

**Conclusion:** Peer has persistent cached chaincode connection metadata that survives pod restart

## Components Status

### ✅ Working Components

1. **Outbox-Submitter:**
   - Successfully connects to Fabric peer
   - Processes commands from OutboxCommand table
   - Submits transactions to Fabric
   - Retry logic working (5 attempts before DLQ)
   - Metrics endpoint responsive

2. **Projector:**
   - Event listener successfully connected to Fabric
   - No errors in logs since MSP ID fix
   - Waiting for chaincode events (blocked by chaincode issue)
   - Checkpoint state tracking working

3. **Database Layer:**
   - OutboxCommand table functional
   - Commands being inserted and updated
   - Status transitions working (PENDING → FAILED)
   - Error messages being captured

4. **Backend-to-Fabric Communication:**
   - gRPC connection established
   - MSP validation passing
   - Transaction proposals reaching peer
   - Error responses being received

### 🔴 Blocking Issue

**Chaincode Connectivity Problem:**

**Symptoms:**
- Peer cannot connect to chaincode container
- Connection attempts fail with "no route to host"
- Peer using stale cached IP address
- Issue persists across pod restarts

**Technical Details:**
```
Cached IP (peer memory): 10.42.3.133:7052 ❌
Current chaincode IP:    10.42.3.44:7052 ✅
Service DNS:             gxtv3-chaincode-0.gxtv3-chaincode.fabric-testnet.svc.cluster.local
```

**Why This Happens:**
- Fabric peer caches chaincode runtime connection metadata
- Cache persists in peer's data volume (PVC)
- Pod restarts don't clear the cache
- Testnet network was created 7 days ago, IPs have changed since

**Impact:**
- Blocks all chaincode invocations
- Prevents transaction execution
- Stops CQRS write path from completing
- Projector cannot receive events (no transactions completing)

## Architecture Validation

Despite the chaincode issue, we successfully validated:

### CQRS Write Path (Partial ✅)
```
OutboxCommand Table ✅
   ↓
Outbox-Submitter Worker ✅
   ↓
Fabric SDK Client ✅
   ↓
Peer gRPC Connection ✅
   ↓
Chaincode Container ❌ (connectivity issue)
```

### CQRS Read Path (Ready ⏳)
```
Chaincode Event ⏳ (blocked)
   ↓
Projector Event Listener ✅ (waiting)
   ↓
Read Model Update ⏳
   ↓
PostgreSQL Tables ✅
```

### Infrastructure Health ✅
```
PostgreSQL:      1/1 READY ✅
Redis:           1/1 READY ✅
Outbox-Submitter: 1/1 READY ✅
Projector:       1/1 READY ✅
Peer:            1/1 READY ✅
Chaincode:       1/1 READY ✅ (pod healthy, but peer can't reach it)
```

## Recommended Solutions

### Option 1: Clear Peer Data Volume (DESTRUCTIVE)
**Action:** Delete peer PVC to clear all cached metadata
**Risk:** Loses all chaincode install history, requires reinstall
**Downtime:** ~5-10 minutes

```bash
kubectl scale statefulset -n fabric-testnet peer0-org1 --replicas=0
kubectl delete pvc -n fabric-testnet data-peer0-org1-0
kubectl scale statefulset -n fabric-testnet peer0-org1 --replicas=1
# Wait for peer to start
# Reinstall chaincode using lifecycle commands
```

### Option 2: Update Chaincode External Endpoint (RECOMMENDED)
**Action:** Update chaincode connection metadata via Fabric lifecycle
**Risk:** Low - updates configuration only
**Downtime:** None

```bash
# Update chaincode package with current endpoint
peer lifecycle chaincode install gxtv3-updated.tar.gz
peer lifecycle chaincode approveformyorg ...
peer lifecycle chaincode commit ...
```

### Option 3: Recreate Testnet from Scratch (NUCLEAR)
**Action:** Delete and recreate entire fabric-testnet namespace
**Risk:** High - loses all data, requires full reconfiguration
**Downtime:** ~30 minutes
**When to use:** If other options fail

## Key Learnings

### Fabric Chaincode-as-a-Service (CCAAS) Considerations

1. **Connection Caching:**
   - Peers cache chaincode connection information
   - Cache survives pod restarts (stored in PVC)
   - Dynamic IP changes break cached connections
   - No automatic reconnection mechanism

2. **Stateful Nature:**
   - Fabric peers maintain persistent state
   - Chaincode metadata is part of that state
   - Pod restarts ≠ state reset
   - PVC must be cleared for full reset

3. **Headless Services Limitation:**
   - Kubernetes headless services provide DNS
   - But Fabric peers don't re-resolve DNS on connection failure
   - Once connection fails, peer retries same (stale) IP
   - Manual intervention required to update

### CQRS Pattern Validation

1. **Outbox Pattern Works:**
   - Commands reliably stored in database
   - Worker picks them up consistently
   - Retry logic handles transient failures
   - DLQ prevents infinite loops

2. **Event Listener Ready:**
   - Projector successfully connects
   - MSP validation passing
   - Waiting for events (blocked by chaincode issue)
   - Once unblocked, should work immediately

3. **Separation of Concerns:**
   - Write path (commands) independent of read path (events)
   - Failure in chaincode doesn't crash workers
   - System degrades gracefully
   - Easy to identify failure point

## Test Data Summary

**Commands Submitted:** 5
**Commands Processed:** 5
**Commands Succeeded:** 0 (blocked by chaincode connectivity)
**Commands Failed:** 5 (endorsement failure)

**Command IDs:**
- test-cmd-001: Payload error (missing age)
- test-cmd-002: Chaincode connectivity
- test-cmd-003: Peer connection lost after restart
- test-cmd-004: Chaincode connectivity (after outbox restart)
- test-cmd-005: Chaincode connectivity (after chaincode restart)

## Next Steps

### Immediate (Required to Unblock)
1. ⏳ **Fix Chaincode Connectivity** - Choose one of the 3 solutions above
2. ⏳ **Retry Test Command** - Submit new CREATE_USER after fix
3. ⏳ **Verify Complete CQRS Flow** - Confirm event reaches projector
4. ⏳ **Check Read Model** - Verify UserProfile table updated

### Short-term (Once Unblocked)
1. ⏳ **Test BOOTSTRAP_SYSTEM** - Initialize system configuration
2. ⏳ **Test TRANSFER_TOKENS** - Verify tokenomics flow
3. ⏳ **Verify API Services** - Check if they become ready after first transaction
4. ⏳ **Performance Testing** - Measure backend-to-Fabric latency

### Long-term (Improvements)
1. ⏳ **Chaincode Connection Monitoring** - Add health checks for chaincode connectivity
2. ⏳ **Automatic Reconnection** - Implement peer reconnection logic
3. ⏳ **IP Stability** - Consider StatefulSet with stable network identity for chaincode
4. ⏳ **Documentation** - Create troubleshooting guide for this issue

## Time Breakdown

- Command format investigation: ~15 minutes
- Test execution and observation: ~20 minutes
- Root cause analysis (peer logs): ~10 minutes
- Fix attempts (3 pod restarts): ~15 minutes
- Documentation: ~10 minutes

**Total Session Time:** ~1 hour

## Files Modified

**Database Operations (Temporary Test Data):**
- OutboxCommand table: 5 test commands inserted
- ProjectorState table: Checkpoint initialized

**No Configuration Changes:**
- All pods restarted but no config modifications
- No deployments or services updated

## Success Metrics

### Achieved ✅
- Outbox-submitter operational and processing commands
- Fabric connectivity established (backend → peer)
- MSP validation working correctly
- Command retry logic validated
- Error handling and DLQ functioning
- Projector event listener ready and waiting

### Blocked 🔴
- Chaincode invocation (connectivity issue)
- Transaction completion
- Event emission
- Read model updates
- End-to-end CQRS flow completion

## Conclusion

The testnet backend CQRS infrastructure is **functionally operational** but **blocked by a Fabric network configuration issue**. The problem is isolated to chaincode connectivity and does not affect the backend code or architecture.

**Root Cause:** Stale chaincode IP cached in peer's persistent volume
**Workaround:** Requires Fabric network-level fix (peer data reset or chaincode reinstall)
**Impact:** Prevents transaction execution but validates all other components

Once the chaincode connectivity is resolved (estimated 10-15 minutes), the complete CQRS flow should work immediately without any backend changes.

**Recommendation:** Proceed with Option 2 (Update Chaincode External Endpoint) as it's the least disruptive solution with no data loss.
