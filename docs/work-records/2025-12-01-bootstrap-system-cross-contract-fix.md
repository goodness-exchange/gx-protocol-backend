# Work Record: 2025-12-01 - BootstrapSystem Cross-Contract Invocation Fix

## Session Overview
Fixed a critical chaincode bug that prevented BootstrapSystem from successfully initializing genesis distribution pools.

## Problem Description

### Symptom
BOOTSTRAP_SYSTEM commands were marked as COMMITTED in the outbox, but genesis pools had no balances. The chaincode silently failed during InvokeChaincode calls.

### Root Cause
Hyperledger Fabric **does not allow** `InvokeChaincode` calls to the **same chaincode** within a single transaction. When BootstrapSystem (AdminContract) tried to call TokenomicsContract:Mint or TokenomicsContract:GetBalance via InvokeChaincode, the transaction ID already existed in Fabric's context, causing a "txid exists" error.

### Error Flow (Before Fix)
```
BootstrapSystem → InvokeChaincode("TokenomicsContract:Mint", ...)
                → Fabric rejects: "txid exists"
                → Endorsement fails silently
                → Transaction committed without pool initialization
```

## Solution Implemented

### Approach
Replace InvokeChaincode calls with **direct ledger operations** using package-level helper functions that access state via `GetStub().GetState()` and `PutState()`.

### New Helper Functions (helpers.go)

```go
// readBalance - Direct ledger read for balance key
func readBalance(ctx contractapi.TransactionContextInterface, accountID string) (uint64, error) {
    balanceKey := fmt.Sprintf("balance_%s", accountID)
    data, err := ctx.GetStub().GetState(balanceKey)
    // ... unmarshal and return
}

// creditAccount - Direct ledger write with overflow protection
func creditAccount(ctx contractapi.TransactionContextInterface, accountID string, amount uint64) error {
    balanceKey := fmt.Sprintf("balance_%s", accountID)
    // Read current balance, add amount, write new balance
    // ... with overflow protection
}
```

### Modified initPool Function (admin_contract.go)

**Before:**
```go
initPool := func(poolID string, amount uint64, poolName string) error {
    // Used InvokeChaincode - FAILED
    balanceResponse := ctx.GetStub().InvokeChaincode(ChaincodeName,
        [][]byte{[]byte("TokenomicsContract:GetBalance"), []byte(poolID)}, channelName)
    // ...
    mintResponse := ctx.GetStub().InvokeChaincode(ChaincodeName,
        [][]byte{[]byte("TokenomicsContract:Mint"), ...}, channelName)
}
```

**After:**
```go
initPool := func(poolID string, amount uint64, _ string) error {
    // Direct ledger operations - WORKS
    balance, err := readBalance(ctx, poolID)
    if err == nil && balance > 0 {
        return nil // Pool exists
    }
    return creditAccount(ctx, poolID, amount)
}
```

## Deployment Steps

1. Modified chaincode source files
2. Built new chaincode image: `gxtv3-chaincode:v1.32`
3. Deployed to K3s cluster
4. Restarted peer0-org1 to connect to new chaincode
5. Restarted outbox-submitter to reset circuit breaker
6. Created new BOOTSTRAP_SYSTEM command
7. Verified pools were created successfully

## Verification Results

All 6 genesis distribution pools successfully created with correct balances:

| Pool Account | Balance (Qirat) | Coins |
|---|---|---|
| SYSTEM_USER_GENESIS_POOL | 577,500,000,000,000,000 | 577.5B |
| SYSTEM_GOVT_GENESIS_POOL | 152,000,000,000,000,000 | 152B |
| SYSTEM_CHARITABLE_POOL | 158,000,000,000,000,000 | 158B |
| SYSTEM_LOAN_POOL | 312,500,000,000,000,000 | 312.5B |
| SYSTEM_GX_POOL | 31,250,000,000,000,000 | 31.25B |
| SYSTEM_OPERATIONS_FUND | 18,750,000,000,000,000 | 18.75B |

**Total**: 1.25 Trillion GX Coins (matching whitepaper specification)

## Command Result

```sql
SELECT id, status, "fabricTxId" FROM "OutboxCommand" WHERE id = 'bootstrap-v132-test-1764562765';

                id                |  status   |                            fabricTxId
----------------------------------+-----------+------------------------------------------------------------------
 bootstrap-v132-test-1764562765   | COMMITTED | 331e6d952e2ad9a75cde50c3885af5692706a1ae3590ca252d0df1d17efb860e
```

## Files Changed

### gx-coin-fabric/chaincode/helpers.go
- Added `readBalance()` function for direct balance lookup
- Added `creditAccount()` function for direct balance crediting
- Both functions include proper error handling and overflow protection

### gx-coin-fabric/chaincode/admin_contract.go
- Modified `BootstrapSystem.initPool` to use direct ledger operations
- Removed InvokeChaincode calls that caused "txid exists" errors
- Simplified pool initialization logic

## Git Commits

1. `928f582` - feat(chaincode): add package-level balance helpers for cross-contract operations
2. `43cec4d` - fix(chaincode): use direct ledger operations in BootstrapSystem

## Key Learnings

### Fabric InvokeChaincode Limitation
- InvokeChaincode is designed for **cross-chaincode** calls (e.g., chaincode A calling chaincode B)
- Calling the **same chaincode** via InvokeChaincode creates a transaction ID conflict
- Solution: Use direct ledger operations (`GetState`/`PutState`) for intra-chaincode operations

### Debugging Approach
1. Initial error showed empty message ("failed to mint coins for SYSTEM_USER_GENESIS_POOL: ")
2. Added better error handling to capture response Message AND Payload
3. Revealed actual error: "INVOKE_CHAINCODE failed: transaction ID: ...exists"
4. Root cause identified: Fabric cross-contract call limitation

## Status
- **BootstrapSystem**: Working correctly
- **Genesis Pools**: All 6 pools initialized with correct balances
- **Chaincode Version**: v1.32 deployed to production

## Next Steps
1. Test complete user registration flow with genesis distribution
2. Verify DistributeGenesis can transfer from pools to users
3. Test country-specific treasury allocations
