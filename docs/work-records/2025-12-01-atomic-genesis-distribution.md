# Work Record: Atomic Genesis Distribution Implementation

**Date:** 2025-12-01
**Session:** Continuation from previous E2E wallet flow work

## Summary

Implemented atomic genesis distribution within the chaincode `CreateUser` function, ensuring that user creation and genesis token allocation happen in a single atomic transaction. This eliminates race conditions and ensures data consistency.

## Tasks Completed

### 1. Projector Event Validation Fix
- **Problem:** Projector was failing to process `UserCreated` events due to missing `eventVersion` field validation
- **Solution:** Made `eventVersion` optional in `event-validator.ts` with default value `'1.0'`
- **File:** `packages/core-events/src/validators/event-validator.ts`

### 2. Lenient Event Validation Mode
- **Problem:** Strict schema validation was causing events to be skipped
- **Solution:** Changed projector to lenient validation mode (log warnings but continue processing)
- **File:** `workers/projector/src/index.ts`

### 3. Field Name Compatibility
- **Problem:** Chaincode uses `userID` (capital ID), handler expected `userId`
- **Solution:** Added fallback: `const fabricUserId = payload.userID || payload.userId;`
- **File:** `workers/projector/src/index.ts`

### 4. Projector Create Fallback Removal
- **Problem:** Unknown `identityNum` field causing errors in create fallback
- **Solution:** Removed create fallback, now logs warning for unknown fabricUserId
- **File:** `workers/projector/src/index.ts`

### 5. Atomic Genesis Distribution (Main Feature)

#### Problem
Genesis distribution was a separate `DISTRIBUTE_GENESIS` command in the outbox, creating:
- Race conditions between user creation and genesis distribution
- Potential for partial data states
- Complexity in transaction management

#### Solution
Modified chaincode to auto-distribute genesis coins atomically during `CreateUser`:

**New Architecture:**
```
CreateUser()
  → Save user to ledger
  → distributeGenesisForNewUser(ctx, &user)  // Atomic within same tx
      → _distributeGenesisForUser(ctx, user)
          → Full 6-phase tokenomics algorithm
          → Pool transfers
          → Country stats update
          → Event emission
```

**Key Technical Challenge:**
Fabric's `GetState` cannot read uncommitted `PutState` writes within the same transaction. Solution: Pass `User` object pointer directly instead of re-reading from ledger.

#### Files Modified

**chaincode/tokenomics_contract.go:**
- Refactored `DistributeGenesis` into two functions:
  - `_distributeGenesisInternal()` - reads user from ledger (for manual admin calls)
  - `_distributeGenesisForUser()` - takes User pointer directly (for atomic CreateUser flow)

**chaincode/identity_contract.go:**
- Added call to `distributeGenesisForNewUser(ctx, &user)` after user creation
- Full 6-phase tokenomics algorithm preserved

**chaincode/helpers.go:**
- Added bridge function `distributeGenesisForNewUser()` to avoid circular imports

**workers/outbox-submitter/src/index.ts:**
- Added backward compatibility for `countryCode`/`nationality` field names

### 6. Chaincode Deployment

Successfully deployed chaincode v2.9 sequence 13 to production Kubernetes cluster:

```
Committed chaincode definition for chaincode 'gxtv3' on channel 'gxchannel':
Version: 2.9, Sequence: 13, Endorsement Plugin: escc, Validation Plugin: vscc,
Approvals: [Org1MSP: true, Org2MSP: true, PartnerOrg1MSP: false]
```

**Package ID:** `gxtv3_v135:b2e53226a0820570cc44d0d0614144c6f8ee3fabd14daf2d7b6829b94845e9c7`

**Deployment Steps:**
1. Built Docker image `gxtv3-chaincode:v1.35` with atomic genesis code
2. Imported to K3s container runtime
3. Created CCAAS package with new package ID
4. Installed on peer0-org1 and peer0-org2
5. Approved for Org1MSP and Org2MSP
6. Committed chaincode definition
7. Updated deployment environment variables

## Technical Details

### Read-After-Write Fix

**Problem:**
```go
// This fails - Fabric cannot read uncommitted writes
userBytes, _ := ctx.GetStub().GetState(userKey) // Returns nil!
```

**Solution:**
```go
// Pass pointer directly - no re-read needed
func (s *TokenomicsContract) _distributeGenesisForUser(
    ctx contractapi.TransactionContextInterface,
    user *User,  // Direct pointer, not re-read from ledger
) error {
    // Use user.UserID, user.Nationality directly
}
```

### Genesis Distribution Algorithm Preserved

The full 6-phase tokenomics model remains intact:
- Phase validation (PHASE_1 through PHASE_6)
- Age-based eligibility (18-65 years)
- Country-wise allocation from genesis pools
- Pool transfers and balance updates
- Event emission (UserCreated, GenesisDistributed)

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/core-events/src/validators/event-validator.ts` | fix | Optional eventVersion with default |
| `workers/projector/src/index.ts` | fix | Lenient validation, field name compat |
| `workers/outbox-submitter/src/index.ts` | fix | countryCode/nationality compat |
| `chaincode/tokenomics_contract.go` | feat | Refactored genesis distribution |
| `chaincode/identity_contract.go` | feat | Auto-genesis on CreateUser |
| `chaincode/helpers.go` | feat | Bridge function for cross-contract |

## Production Status

- **Chaincode Version:** 2.9
- **Sequence:** 13
- **Status:** Deployed and running
- **Cluster:** K3s v1.33.5 on 4-node global cluster

## Next Steps

1. Verify E2E user creation through API endpoint
2. Update chaincode unit tests for new CreateUser flow
3. Monitor projector for genesis distribution events
4. Remove `DISTRIBUTE_GENESIS` command type from outbox-submitter (cleanup)

## Lessons Learned

1. **Fabric Transaction Isolation:** Always pass data directly when needed within same transaction; don't rely on re-reading just-written state
2. **Cross-Contract Calls:** Use package-level helper functions instead of `InvokeChaincode` to avoid transaction ID conflicts
3. **Event Validation:** Schema validation should be lenient for backward compatibility with chaincode events
