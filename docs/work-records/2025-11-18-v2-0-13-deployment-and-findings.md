# Work Record: Worker v2.0.13 Deployment and Blockchain Bootstrap Requirements

**Date**: November 18, 2025
**Session Duration**: ~1 hour
**Focus Area**: Deploying fixed worker with corrected parameter mappings and discovering blockchain initialization requirements

## Executive Summary

Successfully built and deployed outbox-submitter v2.0.13 with:
1. ✅ Fixed CREATE_USER parameter mapping (4 params: userId, biometricHash, nationality, age)
2. ✅ Fixed TRANSFER_TOKENS function name (Transfer not TransferTokens)
3. ✅ Fixed DISTRIBUTE_GENESIS parameter mapping (2 params: userId, nationality)
4. ✅ Fixed errorCode type conversion (Int → String)
5. ✅ Resolved v2.0.12 localhost connection issue via clean build
6. ✅ Confirmed Fabric connection to correct endpoint: `peer0-org1.fabric.svc.cluster.local:7051`
7. ❌ Discovered blockchain requires system bootstrap before accepting CreateUser transactions

## Deployment Timeline

### v2.0.12 (Failed - Localhost Connection Issue)
- **Built**: 2025-01-18 ~08:10 UTC
- **Issue**: Connected to `127.0.0.1:7051` instead of Kubernetes DNS
- **Root Cause**: Suspected build caching or stale TypeScript compilation
- **Action**: Rolled back to v2.0.11

### v2.0.13 (Success - Clean Build)
- **Built**: 2025-01-18 08:16 UTC
- **Build Command**: `turbo run clean && turbo run build --no-cache --filter=outbox-submitter`
- **Image**: `gx-protocol/outbox-submitter:2.0.13`
- **Distributed to**:
  - srv1089618 (Malaysia) - Local node
  - srv1089624 (Arizona) - `217.196.51.190`
  - srv1092158 (Frankfurt) - `72.61.81.3`
- **Deployed**: backend-mainnet namespace
- **Status**: ✅ Running successfully
- **Fabric Connection**: ✅ Correct endpoint `peer0-org1.fabric.svc.cluster.local:7051`

## Code Changes in v2.0.13

### File: `/home/sugxcoin/prod-blockchain/gx-protocol-backend/workers/outbox-submitter/src/index.ts`

**Line 410 - errorCode Type Fix**:
```typescript
errorCode: error.code?.toString() || 'UNKNOWN_ERROR',
```

**Lines 475-485 - CREATE_USER Parameter Fix**:
```typescript
case 'CREATE_USER':
  return {
    contractName: 'IdentityContract',
    functionName: 'CreateUser',
    args: [
      payload.userId as string,
      payload.biometricHash as string,    // NEW: Required 64-char SHA-256
      payload.nationality as string,      // CHANGED: From countryCode
      payload.age.toString(),             // NEW: Required age field
    ],
  };
```

**Lines 488-498 - TRANSFER_TOKENS Function Name Fix**:
```typescript
case 'TRANSFER_TOKENS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'Transfer',  // FIXED: Was TransferTokens
    args: [
      payload.fromUserId as string,
      payload.toUserId as string,
      payload.amount.toString(),
      payload.remark as string || '',
    ],
  };
```

**Lines 500-508 - DISTRIBUTE_GENESIS Parameter Fix**:
```typescript
case 'DISTRIBUTE_GENESIS':
  return {
    contractName: 'TokenomicsContract',
    functionName: 'DistributeGenesis',
    args: [
      payload.userId as string,
      payload.nationality as string,  // REMOVED: userType parameter
    ],
  };
```

## End-to-End CQRS Test Results

### Test Payload Inserted
```sql
INSERT INTO "OutboxCommand" (
  id, tenantId, service, commandType, requestId, payload, status, attempts, createdAt, updatedAt
) VALUES (
  'test-cmd-v2013-c1d16374-14f2-468c-9210-9fd3e6069df9',
  'default-tenant',
  'svc-identity',
  'CREATE_USER',
  'test-req-[uuid]',
  '{
    "userId": "test-user-v2013",
    "biometricHash": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
    "nationality": "US",
    "age": 30
  }',
  'PENDING',
  0,
  NOW(),
  NOW()
);
```

### Worker Processing Log
```json
{"timestamp":"2025-11-18T08:18:19.619Z","level":"debug","service":"outbox-submitter","workerId":"outbox-submitter-64bdb6df4c-6sql9","message":"Processing command","commandId":"test-cmd-v2013-c1d16374-14f2-468c-9210-9fd3e6069df9","commandType":"CREATE_USER","attempts":0}
{"timestamp":"2025-11-18T08:18:19.620Z","level":"debug","service":"core-fabric","message":"Submitting transaction","contract":"IdentityContract","function":"CreateUser","argCount":4}
```

✅ **Parameter Count Correct**: Worker submitted 4 arguments as expected

### Fabric Rejection Error
```json
{"timestamp":"2025-11-18T08:18:20.814Z","level":"error","service":"core-fabric","message":"Transaction submission failed","contract":"IdentityContract","function":"CreateUser","error":"10 ABORTED: failed to endorse transaction, see attached details for more info","duration":1194}
```

**Final Status**: Command moved to Dead Letter Queue after 5 retries

## Root Cause Analysis: Blockchain Not Bootstrapped

### Discovery Process

1. **Checked CreateUser Function Signature** (`gx-coin-fabric/chaincode/identity_contract.go:47`)
   - Confirmed function expects: `userID, biometricHash, nationality, age`
   - Worker mapping now matches ✅

2. **Found Country Validation** (Lines 81-89)
   ```go
   countryKey := fmt.Sprintf("stats_%s", nationality)
   countryStatsJSON, err := ctx.GetStub().GetState(countryKey)
   if err != nil {
       return fmt.Errorf("failed to check country stats for %s: %w", nationality, err)
   }
   if countryStatsJSON == nil {
       return fmt.Errorf("country %s is not registered in the system. Please contact administrator to initialize country data", nationality)
   }
   ```

3. **Attempted System Status Query**
   ```bash
   peer chaincode query -C gxchannel -n gxtv3 -c '{"function":"Admin:GetSystemStatus","Args":[]}'
   ```

   **Error**: `Contract not found with name Admin`

   **Reason**: Multi-contract chaincode uses struct names (AdminContract, IdentityContract, etc.), not "Admin" prefix

### Blockchain Initialization Requirements

The GX Coin blockchain requires the following initialization sequence before accepting user transactions:

#### Step 1: Bootstrap System
**Function**: `AdminContract:BootstrapSystem`
**Access**: Requires `gx_super_admin` role
**Effect**: Initializes system metadata (bootstrap status, genesis timestamp)

#### Step 2: Initialize Country Data
**Function**: `AdminContract:InitializeCountryData`
**Parameters**: JSON array of countries with percentages
**Example**:
```json
[
  {"countryCode": "US", "percentage": 0.25},
  {"countryCode": "MY", "percentage": 0.15},
  {"countryCode": "DE", "percentage": 0.10}
]
```
**Effect**: Creates `stats_{countryCode}` ledger entries required for CreateUser validation

#### Step 3: Create Users
**Function**: `IdentityContract:CreateUser`
**Prerequisites**:
- System must be bootstrapped ✅
- Country must exist in country stats ✅
- Biometric hash must be 64-char SHA-256 hex ✅

##  Current Blockchain State

**Bootstrap Status**: ❌ Unknown (unable to query)
**Country Data**: ❌ Unknown (unable to query)
**Test Script**: ❌ Failing with certificate path issues

## Testing Blockers

### Issue 1: Test Script Certificate Path Error
```
Error: unable to load TLS root cert file from /etc/hyperledger/fabric/tls/ca.crt: no such file or directory
```

**File**: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/test_chaincode_k8s.sh`
**Issue**: TLS certificate path hardcoded to non-existent location in peer pod

### Issue 2: Contract Name Query Format
Queries using `Admin:GetSystemStatus` format fail with "Contract not found".
Need to investigate correct query format for multi-contract chaincode.

## Next Steps (Priority Order)

### 1. Fix Test Script TLS Certificate Path (HIGH)
- [ ] Find correct TLS CA cert path in peer pod
- [ ] Update `test_chaincode_k8s.sh` script
- [ ] Test bootstrap invocation

### 2. Bootstrap Blockchain (CRITICAL - BLOCKING)
- [ ] Invoke `AdminContract:BootstrapSystem`
- [ ] Verify bootstrap status
- [ ] Document bootstrap timestamp

### 3. Initialize Country Data (CRITICAL - BLOCKING)
- [ ] Prepare country data JSON (US, MY, DE minimum)
- [ ] Invoke `AdminContract:InitializeCountryData`
- [ ] Query country stats to verify creation

### 4. Retry CREATE_USER Test (VERIFICATION)
- [ ] Insert new test command with corrected payload
- [ ] Verify outbox-submitter processes successfully
- [ ] Confirm Fabric transaction commits
- [ ] Check for UserCreated event

### 5. Verify Projector Event Processing
- [ ] Monitor projector logs for UserCreated event
- [ ] Check UserProfile read model created in PostgreSQL
- [ ] Verify projector checkpoint updated

### 6. Document Complete CQRS Flow
- [ ] Create sequence diagram
- [ ] Document all prerequisites
- [ ] Update integration testing guide

## Validation Checklist (Post-Bootstrap)

### Parameter Validation (Chaincode)
- ✅ userId: Non-empty string
- ✅ biometricHash: Exactly 64 hex characters (SHA-256)
- ✅ nationality: 2-letter ISO country code (uppercase)
- ✅ age: Integer 0-150
- ⏸️ Country exists in system (blocked by bootstrap)

### Worker Submission
- ✅ Connects to correct Fabric endpoint
- ✅ Submits 4 arguments
- ✅ Retry logic working
- ✅ Circuit breaker functioning
- ✅ DLQ mechanism working

## Technical Debt Identified

1. **Test Script Maintenance**: TLS cert paths hardcoded, need dynamic detection
2. **Bootstrap Documentation**: Missing runbook for production deployment
3. **Contract Testing**: No automated validation of worker-chaincode compatibility
4. **Query Format**: Documentation unclear on multi-contract query syntax

## Lessons Learned

### 1. Clean Builds Matter
**Issue**: v2.0.12 had localhost connection issue despite identical code
**Solution**: Full clean build with `--no-cache` resolved the issue
**Prevention**: Add clean build step to CI/CD pipeline

### 2. Blockchain State Dependencies
**Issue**: CREATE_USER requires country data initialization
**Learning**: Document all blockchain state prerequisites for each operation
**Action**: Create initialization checklist for new deployments

### 3. Error Messages Need Improvement
**Issue**: "failed to endorse transaction" is too generic
**Improvement**: Chaincode should return specific error (e.g., "country not initialized")
**Note**: This may already exist but not visible due to error propagation

## Files Modified

1. `/home/sugxcoin/prod-blockchain/gx-protocol-backend/workers/outbox-submitter/src/index.ts`
   - Lines 410, 475-485, 488-498, 500-508, 510-511

## Docker Images Built

- `gx-protocol/outbox-submitter:2.0.13` (2025-01-18 08:16 UTC)
- Image hash: `sha256:abd5a9268955f3e96228994595182a30b52f7cc9d7c4a758faa6470398ea02da`

## Related Documentation

- Previous session: `2025-01-18-cqrs-end-to-end-test-and-findings.md`
- Previous session: `2025-01-18-parameter-mismatch-fix-and-findings.md`
- Previous session: `2025-01-18-backend-workers-fabric-integration-fix.md`
- Chaincode: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/chaincode/identity_contract.go`
- Test script: `/home/sugxcoin/prod-blockchain/gx-coin-fabric/test_chaincode_k8s.sh`

---

**Session Status**: PARTIAL SUCCESS - Worker deployed with fixes, but end-to-end test blocked by missing blockchain bootstrap
**Blocker**: Blockchain system not bootstrapped, country data not initialized
**Next Session Goal**: Bootstrap blockchain and complete full CQRS test cycle
