# Work Record: November 30, 2025 - Fabric Gateway SDK Endorsement Fix

## Summary

Fixed critical issues preventing blockchain user registration through the Fabric Gateway SDK. Identified and resolved payload format mismatches and improved error diagnostics.

## Problems Identified

### 1. svc-identity Creating Incorrect OutboxCommand

**Issue**: The `registerUser` method in svc-identity was creating a `CREATE_USER` outbox command with off-chain payload fields (email, passwordHash, firstName, etc.) that didn't match the chaincode function signature.

**Root Cause**: Architectural confusion - the registration flow was incorrectly trying to submit user data to blockchain immediately instead of following the correct flow:
1. Create local user profile (off-chain)
2. User completes KYC
3. Admin approves KYC
4. Admin triggers on-chain registration via `batchRegisterOnchain()`

**Solution**: Refactored `registerUser` to create a direct `UserProfile` record in the database with `PENDING_KYC` status instead of creating an outbox command.

### 2. Fabric Gateway SDK Errors Not Providing Details

**Issue**: Endorsement failures showed generic "10 ABORTED: failed to endorse transaction" without any context about what actually failed.

**Solution**: Enhanced error logging in `core-fabric` to extract:
- EndorseError details (peer address, MSP ID, chaincode error message)
- gRPC error codes
- Cause chain for nested errors

### 3. BiometricHash Validation Error

**Issue**: Once proper logging was added, discovered the actual error:
```
invalid biometricHash format: must be 64 characters (SHA-256 hex)
```

**Solution**: Test payloads and actual user registration flow must provide a proper 64-character SHA-256 hex string for biometricHash.

## Files Modified

### apps/svc-identity/src/services/users.service.ts
- Changed `registerUser` to create `UserProfile` directly instead of `OutboxCommand`
- Returns `profileId` instead of `commandId`
- User status set to `PENDING_KYC` after registration

### apps/svc-identity/src/controllers/users.controller.ts
- Updated response handling from async (202 Accepted) to sync (201 Created)
- Changed logging from `commandId` to `profileId`

### packages/core-fabric/src/fabric-client.ts
- Added detailed error extraction for Fabric SDK endorsement failures
- Captures peer address, MSP ID, and chaincode error messages
- Logs gRPC error codes and cause chains

## Testing Results

### Successful CREATE_USER Transaction
```
Transaction committed successfully
- Contract: IdentityContract
- Function: CreateUser
- TransactionId: 8fc7f988a9d7e9a7a28b1a38a639a09a4a4d2039d82442632243402e5cd2a20b
- Block Number: 59
- Duration: 4552ms
```

### Database Verification
```sql
SELECT status, "fabricTxId", "commitBlock" FROM "OutboxCommand" WHERE id = 'test-sha256-...';
-- COMMITTED | 8fc7f988a9d7... | 59
```

## Key Learnings

1. **Error Logging is Critical**: The original generic error message made debugging extremely difficult. With proper error extraction, the actual chaincode validation error was immediately visible.

2. **Payload Format Matters**: The chaincode enforces strict validation on biometricHash (64 hex chars). The svc-admin `batchRegisterOnchain()` method correctly generates biometric hashes using bcrypt, which produces the proper format.

3. **Architecture Flow**: User registration should be a two-phase process:
   - Phase 1: Create local profile (fast, no blockchain)
   - Phase 2: Register on-chain after KYC approval (requires admin action)

## Deployed Versions

- outbox-submitter: v2.0.24 (with enhanced error logging)
- Chaincode: gxtv3 v2.8 sequence 12 (OR endorsement policy)

## Next Steps

1. Verify genesis token distribution flow works correctly
2. Consider adding biometricHash format validation in svc-admin before creating outbox commands
3. Update API documentation to reflect the new registration flow

## Related Commits

- `2714481` - refactor(svc-identity): change registerUser to create local profile
- `0eaf5c6` - fix(svc-identity): update registerUser controller for new response format
- `f92f38f` - fix(core-fabric): add detailed error logging for Fabric SDK endorsement failures
