# Work Record: Parameter Mismatch Fix and Additional Findings

**Date**: November 18, 2025
**Session Duration**: ~3 hours
**Focus Area**: Fixing worker-chaincode parameter mismatches and testing CQRS flow

## Executive Summary

Fixed critical parameter mismatches between outbox-submitter worker and Hyperledger Fabric chaincode functions. Successfully deployed corrected worker version 2.0.12 to production. Discovered additional issues during end-to-end testing that require immediate attention.

## Issues Identified and Fixed

### 1. CREATE_USER Parameter Mismatch (CRITICAL - FIXED ✅)

**Problem**:
- Worker sent 3 parameters: `userId`, `countryCode`, `userType`
- Chaincode expected 4 parameters: `userID`, `biometricHash`, `nationality`, `age`

**Impact**: All user creation operations failing with JSPB error

**Fix Applied** (`workers/outbox-submitter/src/index.ts:475-485`):
```typescript
// BEFORE:
case 'CREATE_USER':
  return {
    contractName: 'IdentityContract',
    functionName: 'CreateUser',
    args: [
      payload.userId as string,
      payload.countryCode as string,  // WRONG FIELD
      payload.userType as string,     // EXTRA FIELD
    ],
  };

// AFTER:
case 'CREATE_USER':
  return {
    contractName: 'IdentityContract',
    functionName: 'CreateUser',
    args: [
      payload.userId as string,
      payload.biometricHash as string,    // NEW: Required 64-char SHA-256 hex
      payload.nationality as string,      // CHANGED: From countryCode
      payload.age.toString(),             // NEW: Required age field
    ],
  };
```

**Chaincode Signature** (`gx-coin-fabric/chaincode/identity_contract.go:47`):
```go
func (s *IdentityContract) CreateUser(
  ctx contractapi.TransactionContextInterface,
  userID string,        // Unique user identifier
  biometricHash string, // 64-character SHA-256 hash
  nationality string,   // 2-letter ISO country code
  age int               // User age (0-150)
) error
```

### 2. TRANSFER_TOKENS Function Name Mismatch (FIXED ✅)

**Problem**:
- Worker called: `TokenomicsContract:TransferTokens`
- Chaincode function name: `Transfer`

**Fix Applied**:
```typescript
// BEFORE:
case 'TRANSFER_TOKENS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'TransferTokens',  // WRONG NAME
    args: [
      payload.fromUserId as string,
      payload.toUserId as string,
      payload.amount as string,
      payload.remark as string || '',
    ],
  };

// AFTER:
case 'TRANSFER_TOKENS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'Transfer',  // CORRECT NAME
    args: [
      payload.fromUserId as string,
      payload.toUserId as string,
      payload.amount.toString(),  // Ensured conversion to string
      payload.remark as string || '',
    ],
  };
```

**Chaincode Signature** (`gx-coin-fabric/chaincode/tokenomics_contract.go:372`):
```go
func (s *TokenomicsContract) Transfer(
  ctx contractapi.TransactionContextInterface,
  fromID string,
  toID string,
  amount uint64,
  remark string
) error
```

### 3. DISTRIBUTE_GENESIS Parameter Mismatch (FIXED ✅)

**Problem**:
- Worker sent 3 parameters: `userId`, `userType`, `countryCode`
- Chaincode expected 2 parameters: `userID`, `nationality`

**Fix Applied**:
```typescript
// BEFORE:
case 'DISTRIBUTE_GENESIS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'DistributeGenesis',
    args: [
      payload.userId as string,
      payload.userType as string,    // EXTRA FIELD - not needed
      payload.countryCode as string, // WRONG FIELD NAME
    ],
  };

// AFTER:
case 'DISTRIBUTE_GENESIS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'DistributeGenesis',
    args: [
      payload.userId as string,
      payload.nationality as string,  // CHANGED: Correct field name
    ],
  };
```

**Chaincode Signature** (`gx-coin-fabric/chaincode/tokenomics_contract.go:41`):
```go
func (s *TokenomicsContract) DistributeGenesis(
  ctx contractapi.TransactionContextInterface,
  userID string,
  nationality string  // 2-letter ISO country code
) error
```

**Why userType is not needed**: The chaincode automatically determines phase allocation based on country statistics, not user type. The `userType` parameter was likely a remnant from an older implementation.

### 4. FREEZE_WALLET Not Implemented in Chaincode (FIXED ✅)

**Problem**:
- Worker had mapping for `FREEZE_WALLET` command
- No corresponding function exists in chaincode

**Investigation**:
```bash
$ cd gx-coin-fabric/chaincode && grep "FreezeWallet" *.go
# No results found
```

**Fix Applied**:
```typescript
case 'FREEZE_WALLET':
  throw new Error('FREEZE_WALLET command not implemented in chaincode - use Admin:LockUser instead');
```

**Alternative Solution**: Use existing `Admin:LockUser` function which provides equivalent functionality.

## Deployment Details

### Version Information

**Worker Version**: 2.0.12
**Deployment Date**: November 18, 2025 08:00 UTC
**Deployment Method**: Rolling update (zero downtime)

### Docker Image Build

```bash
# Build command
docker build -t gx-protocol/outbox-submitter:2.0.12 -f workers/outbox-submitter/Dockerfile .

# Image size
359MB compressed (gzipped tarball)

# Build time
~45 seconds (with Turborepo caching)
```

### Multi-Node Deployment

Deployed to all 3 production K8s nodes:
- ✅ `srv1089618` (72.60.210.201) - Kuala Lumpur, Malaysia
- ✅ `srv1089624` (217.196.51.190) - Phoenix, Arizona, USA
- ✅ `srv1092158` (72.61.81.3) - Frankfurt, Germany

**Deployment Commands**:
```bash
# Save and compress image
docker save gx-protocol/outbox-submitter:2.0.12 | gzip > /tmp/outbox-submitter-2.0.12.tar.gz

# Import to local node
sudo /usr/local/bin/k3s ctr images import /tmp/outbox-submitter-2.0.12.tar.gz

# Copy and import to remote nodes
for server in 217.196.51.190 72.61.81.3; do
  scp /tmp/outbox-submitter-2.0.12.tar.gz root@$server:/tmp/
  ssh root@$server "sudo /usr/local/bin/k3s ctr images import /tmp/outbox-submitter-2.0.12.tar.gz && rm /tmp/outbox-submitter-2.0.12.tar.gz"
done

# Update Kubernetes deployment
kubectl set image deployment/outbox-submitter -n backend-mainnet outbox-submitter=gx-protocol/outbox-submitter:2.0.12
kubectl rollout status deployment/outbox-submitter -n backend-mainnet
```

### Deployment Verification

```bash
$ kubectl get pods -n backend-mainnet -l app=outbox-submitter
NAME                                READY   STATUS    RESTARTS   AGE
outbox-submitter-6495f8b9cb-9dstg   1/1     Running   0          2m

$ kubectl logs -n backend-mainnet deployment/outbox-submitter --tail=5
{"timestamp":"2025-11-18T08:00:06.907Z","level":"info","service":"core-fabric","message":"Successfully connected to Fabric network"}
{"timestamp":"2025-11-18T08:00:06.907Z","level":"info","service":"outbox-submitter","message":"Connected to Fabric network"}
{"timestamp":"2025-11-18T08:00:06.909Z","level":"info","service":"outbox-submitter","message":"Outbox submitter worker started successfully"}
{"timestamp":"2025-11-18T08:00:06.909Z","level":"info","service":"outbox-submitter","message":"Metrics server listening on port 9090"}
```

## End-to-End Test Results

### Test 1: Original Payload (Expected Failure)

**Test Command**:
```sql
INSERT INTO "OutboxCommand" (...) VALUES (
  'test-cmd-1fd95633-a916-41d3-b1cc-29fb1d4cb2d8',
  ...
  '{
    "userId": "test-user-001",
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "countryCode": "US",
    "phoneNumber": "+1234567890"
  }'::jsonb,
  'PENDING',
  ...
);
```

**Result**: ❌ FAILED (as expected with old worker)
**Error**: `Inconsistent type in JSPB repeated field array. Got undefined expected object`
**Status**: Moved to Dead Letter Queue after 5 retry attempts

### Test 2: Corrected Payload (Partial Success)

**Test Command**:
```sql
INSERT INTO "OutboxCommand" (...) VALUES (
  'test-cmd-v2-2b8c2928-0d5c-493e-bafd-dd827274087f',
  ...
  '{
    "userId": "test-user-002",
    "biometricHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    "nationality": "US",
    "age": 25
  }'::jsonb,
  'PENDING',
  ...
);
```

**Result**: ⚠️  PARTIAL - Command picked up, but new issues discovered

**Log Output**:
```json
{
  "timestamp":"2025-11-18T08:00:49.551Z",
  "level":"debug",
  "service":"outbox-submitter",
  "message":"Processing command",
  "commandId":"test-cmd-v2-2b8c2928-0d5c-493e-bafd-dd827274087f",
  "commandType":"CREATE_USER",
  "attempts":0
}
{
  "timestamp":"2025-11-18T08:00:50.655Z",
  "level":"error",
  "service":"core-fabric",
  "message":"Transaction submission failed",
  "contract":"IdentityContract",
  "function":"CreateUser",
  "error":"14 UNAVAILABLE: No connection established. Last error: Error: connect ECONNREFUSED 127.0.0.1:7051"
}
```

## New Issues Discovered

### Issue 1: Fabric Connection Fallback to Localhost (CRITICAL ❌)

**Symptom**: Worker successfully loads correct configuration (`peer0-org1.fabric.svc.cluster.local:7051`) but attempts connection to `127.0.0.1:7051` during transaction submission

**Evidence**:
- ✅ Startup log shows correct config: `"peerEndpoint":"peer0-org1.fabric.svc.cluster.local:7051"`
- ❌ Error shows wrong endpoint: `connect ECONNREFUSED 127.0.0.1:7051`

**Hypothesis**:
1. Fabric Gateway SDK might be caching old connection or falling back to default
2. There might be two different configuration loading paths (startup vs transaction)
3. The compiled TypeScript code might have stale configuration baked in

**Impact**: All Fabric transaction submissions fail

**Next Steps**:
- Investigate `core-fabric` package for dual configuration paths
- Check if Fabric Gateway client is being properly initialized with config
- Verify Docker image actually contains updated code

### Issue 2: Prisma errorCode Type Mismatch (MEDIUM ❌)

**Symptom**: When worker tries to save error to database, Prisma validation fails

**Error**:
```
Argument `errorCode`: Invalid value provided.
Expected String, NullableStringFieldUpdateOperationsInput or Null, provided Int.
```

**Root Cause**: Database schema defines `errorCode` as String, but worker code passes Int (gRPC status code)

**Fix Required** (two options):

**Option A**: Update database schema to accept Int
```prisma
model OutboxCommand {
  ...
  errorCode  Int?    @db.Integer  // CHANGE: Was String
  ...
}
```

**Option B**: Convert errorCode to String in worker
```typescript
// In worker error handling
{
  errorCode: error.code?.toString() || null,  // Convert to string
  error: error.message
}
```

**Recommendation**: Option B (convert to string in worker) - Less disruptive, no database migration required

**Impact**: Failed commands cannot save error details to database, causing repeated processing attempts

## Comprehensive Command Type Audit

Audited all command types defined in worker against chaincode functions:

| Command Type | Worker Function | Chaincode Function | Status | Notes |
|--------------|----------------|-------------------|--------|-------|
| CREATE_USER | IdentityContract:CreateUser | IdentityContract:CreateUser | ✅ FIXED | Updated to 4 params |
| TRANSFER_TOKENS | TokenomicsContract:Transfer | TokenomicsContract:Transfer | ✅ FIXED | Fixed function name |
| DISTRIBUTE_GENESIS | TokenomicsContract:DistributeGenesis | TokenomicsContract:DistributeGenesis | ✅ FIXED | Removed userType param |
| FREEZE_WALLET | - | N/A | ✅ FIXED | Throws error, use LockUser instead |
| UNFREEZE_WALLET | ? | ? | ⏸️ NOT AUDITED | Need to check |

**Recommendation**: Complete audit of all remaining command types before production use.

## Summary of Changes

### Files Modified

**1. `/home/sugxcoin/prod-blockchain/gx-protocol-backend/workers/outbox-submitter/src/index.ts`**
- Line 475-485: Fixed CREATE_USER mapping (3→4 params, corrected field names)
- Line 488-498: Fixed TRANSFER_TOKENS function name
- Line 500-508: Fixed DISTRIBUTE_GENESIS mapping (3→2 params)
- Line 510-511: Added error for FREEZE_WALLET

### Docker Images Created

- `gx-protocol/outbox-submitter:2.0.12` (359MB)

### Kubernetes Resources Updated

- `deployment/outbox-submitter` in `backend-mainnet` namespace
- Rolling update completed successfully with zero downtime

## Testing Checklist Status

### ✅ Completed

- [x] Database schema migration (38 tables created)
- [x] Outbox pattern verification (polling, locking, retry logic)
- [x] Command parameter mapping fixes
- [x] Docker image build and deployment
- [x] Multi-node distribution
- [x] Worker startup verification

### ⏸️ Blocked (Awaiting Fixes)

- [ ] End-to-end CQRS flow test - BLOCKED by Fabric connection issue
- [ ] Projector event processing - BLOCKED by unable to submit transactions
- [ ] Read model verification - BLOCKED by unable to create test data

### 📋 Pending (Not Started)

- [ ] Complete audit of remaining command types (UNFREEZE_WALLET, etc.)
- [ ] API payload validation schema updates
- [ ] Frontend biometric capture integration (for CREATE_USER)
- [ ] Contract testing implementation
- [ ] Certificate expiration monitoring

## Immediate Action Items

### CRITICAL (P0) - Blocking All Operations

**1. Fix Fabric Connection Localhost Fallback**
- **Owner**: Backend Team
- **Effort**: 2-4 hours
- **Tasks**:
  - [ ] Investigate core-fabric package configuration loading
  - [ ] Verify compiled code contains correct peer endpoint
  - [ ] Check Fabric Gateway SDK initialization
  - [ ] Add connection diagnostic logging
  - [ ] Rebuild and redeploy worker v2.0.13

**2. Fix Prisma errorCode Type Mismatch**
- **Owner**: Backend Team
- **Effort**: 30 minutes
- **Tasks**:
  - [ ] Convert errorCode to string in worker error handling
  - [ ] Rebuild and deploy as part of v2.0.13
  - [ ] Test error handling path

### HIGH (P1) - Required for Production

**3. Complete Command Type Audit**
- **Owner**: Backend Team
- **Effort**: 2-3 hours
- **Tasks**:
  - [ ] Audit all remaining command types
  - [ ] Document expected payloads for each
  - [ ] Create test commands for each type
  - [ ] Fix any additional mismatches found

**4. API Payload Validation Updates**
- **Owner**: Backend/Frontend Teams
- **Effort**: 1 day
- **Tasks**:
  - [ ] Update CREATE_USER API to collect biometricHash and age
  - [ ] Update DISTRIBUTE_GENESIS API to remove userType
  - [ ] Add OpenAPI schema validation
  - [ ] Update API documentation

## Lessons Learned

### 1. Docker Image Verification is Critical

**Issue**: Despite successful build and deployment, runtime behavior suggests stale code

**Prevention**:
- Add smoke tests that verify function signatures match
- Include configuration validation in worker startup
- Log actual code versions/commit hashes in startup logs

### 2. Schema Drift Detection Needed

**Issue**: Worker and chaincode evolved independently without validation

**Prevention**:
- Implement contract testing framework
- Generate TypeScript interfaces from Go code automatically
- Add CI/CD checks for parameter count/type mismatches
- Version control function signatures

### 3. Type Safety at Boundaries

**Issue**: Prisma expects String but code passes Int for errorCode

**Prevention**:
- Use TypeScript strict mode
- Add runtime type validation at all boundaries
- Use branded types for different error code systems
- Lint rules for Prisma query arguments

### 4. End-to-End Testing is Essential

**Issue**: Individual components work but integration reveals issues

**Success**:
- Database migration worked flawlessly
- Outbox pattern implementation solid
- Worker resilience features (retry, circuit breaker, DLQ) all functioning

**Keep Doing**:
- Maintain comprehensive logging
- Use structured logs for easy debugging
- Implement gradual rollout for critical changes

## Next Steps

Once Fabric connection issue is resolved:

1. **Re-test end-to-end CQRS flow** with corrected payload
2. **Verify projector** receives and processes blockchain events
3. **Check read models** are correctly updated in PostgreSQL
4. **Complete command type audit** for all remaining types
5. **Implement contract tests** to prevent future schema drift
6. **Update API services** to collect new required fields
7. **Document breaking changes** in API changelog

## Related Work Records

- **Previous**: `/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/work-records/2025-01-18-cqrs-end-to-end-test-and-findings.md`
- **Fabric Integration Fix**: `/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/work-records/2025-01-18-backend-workers-fabric-integration-fix.md`

---

**Session Status**: Parameter mismatches fixed and deployed, new Fabric connection issue discovered and requires investigation
**Blocker**: Localhost connection fallback preventing transaction submission
**Next Session**: Debug Fabric Gateway configuration and connection handling
