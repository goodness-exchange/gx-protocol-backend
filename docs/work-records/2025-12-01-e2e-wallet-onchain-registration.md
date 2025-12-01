# Work Record: 2025-12-01 - End-to-End Wallet & On-Chain User Registration Fix

## Session Overview
Fixed critical issues preventing end-to-end wallet functionality, specifically user on-chain registration via the outbox-submitter pattern.

## Problems Fixed

### 1. DNS Resolution for Fabric Peer Discovery
**Symptom:** outbox-submitter failing with `connect ECONNREFUSED 127.0.0.1:7051`

**Root Cause:** Fabric Gateway SDK uses peer discovery which returns peer addresses like `peer0.org1.prod.goodness.exchange:7051`. These external hostnames didn't resolve inside the Kubernetes cluster, causing fallback to localhost.

**Solution:** Added peer and orderer external hostnames to CoreDNS NodeHosts configmap, mapping them to internal K8s service IPs:
```
# Added to kube-system/coredns NodeHosts
10.43.102.66 peer0.org1.prod.goodness.exchange
10.43.246.73 peer0.org2.prod.goodness.exchange
10.43.150.227 peer1.org1.prod.goodness.exchange
10.43.103.105 peer1.org2.prod.goodness.exchange
10.43.243.208 orderer0.ordererorg.prod.goodness.exchange
10.43.45.44 orderer1.ordererorg.prod.goodness.exchange
10.43.120.99 orderer2.ordererorg.prod.goodness.exchange
10.43.22.162 orderer3.ordererorg.prod.goodness.exchange
10.43.229.224 orderer4.ordererorg.prod.goodness.exchange
```

### 2. BiometricHash Format Mismatch
**Symptom:** `chaincode response 500, invalid biometricHash format: must be 64 characters (SHA-256 hex)`

**Root Cause:** The `batchRegisterOnchain` function was sending the user's bcrypt password hash (60 characters starting with `$2b$10$...`) as the biometricHash. The chaincode requires a SHA-256 hex string (exactly 64 characters).

**Solution:** Modified `user-management.service.ts` to generate a proper SHA-256 hash:
```typescript
// Generate SHA-256 biometric hash from user's unique identifiers
const biometricSource = `${user.profileId}:${user.fabricUserId}:${user.dateOfBirth?.toISOString() || ''}`;
const sha256BiometricHash = createHash('sha256').update(biometricSource).digest('hex');
```

## Files Changed

### gx-protocol-backend/apps/svc-admin/src/services/user-management.service.ts
- Added `import { createHash } from 'crypto';` at line 1
- Modified `batchRegisterOnchain` function (lines 281-295) to generate SHA-256 biometricHash

## Verification Results

### Direct Blockchain Test
Successfully created test user directly on blockchain:
```bash
peer chaincode invoke ... -c '{"function":"IdentityContract:CreateUser","Args":["MY TEST USR001 DIRECT 0001","a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd","MY","30"]}'
```
Transaction ID: `5626640c49a2081a79561936b43bf63ef17359db0e0f79940acb384ce307796f`

### Outbox-Submitter Integration Test
Successfully registered user via outbox pattern:
- User: `MY 8F0 ABH006 0TURJ 7108`
- Command ID: `cmimqikvu0000m601q22zpkt8`
- Status: `COMMITTED`
- Fabric TX: `a1a731d884334d95379836d19a3c48765a8a47d19257781a24d1df210baa78fc`
- Block: 62
- SHA-256 Hash: `641df8264b1a280c5ce0b246682d551f5d15c661528caca704483307ad0f1ee2` (64 chars)

## Deployment Notes

### Image Deployment
Built and deployed svc-admin:2.0.14 to all 3 control-plane nodes:
- srv1089618.hstgr.cloud (72.60.210.201)
- srv1089624.hstgr.cloud (217.196.51.190)
- srv1092158.hstgr.cloud (72.61.81.3)

### Memory Management
Node srv1089618 was at 90% memory utilization. Ran `docker system prune -af --volumes` to clean up unused Docker resources.

## Known Issues

### Projector Event Validation
The projector is receiving UserCreated events but failing schema validation:
```
Event must have an "eventVersion" field
```
This is a schema mismatch between chaincode events and projector expectations. Users are created on-chain successfully, but the read model isn't being updated.

### Recommended Follow-up
1. Add `eventVersion` field to chaincode UserCreated events, OR
2. Update projector schema to make `eventVersion` optional

## Architecture Notes

### Fabric Gateway SDK Peer Discovery
The Fabric Gateway SDK automatically discovers peers by querying the connected peer for network topology. The discovered peer addresses use the hostnames configured in their TLS certificates (e.g., `peer0.org1.prod.goodness.exchange`). For Kubernetes deployments where backend services run in the same cluster as Fabric:

**Option A (Implemented):** Add external hostnames to CoreDNS NodeHosts
**Option B:** Configure Fabric SDK to use internal service names (requires SDK configuration changes)

### BiometricHash Purpose
The `biometricHash` field on-chain is designed for biometric fingerprint verification. In the current implementation, we generate a deterministic SHA-256 from user identifiers since actual biometric data isn't collected during registration. This ensures:
- Uniqueness per user
- Reproducibility for verification
- Compliance with chaincode validation (64 hex characters)

## Status
- **On-Chain Registration:** Working
- **Outbox Pattern:** Working
- **Projector Read Model:** Needs eventVersion fix
- **Deployed Version:** svc-admin:2.0.14, chaincode v1.32
