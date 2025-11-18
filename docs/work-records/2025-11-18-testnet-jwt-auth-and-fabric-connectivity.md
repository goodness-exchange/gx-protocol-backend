# Testnet JWT Authentication Setup and Fabric Connectivity Debugging

**Date:** 2025-11-18
**Environment:** backend-testnet, fabric-testnet
**Objective:** Enable API-based testing of testnet by setting up JWT authentication and establishing backend-to-Fabric connectivity

---

## Session Overview

Successfully configured JWT authentication for testnet API services and resolved multiple infrastructure issues blocking backend-to-Fabric communication. Work is ongoing to resolve final Fabric SDK connection configuration.

---

## Work Completed

### 1. JWT Authentication Setup

**Problem:** API endpoints required JWT authentication but testnet had no JWT_SECRET configured.

**Solution:**
- Generated secure JWT secret: `openssl rand -base64 48`
- Result: `bTxC368axZ9oQRyiEjdWaZOeurMc8QjgpkOgpj+YFJV4shlRyBeplR19kNCDIh54`
- Updated backend-secrets Secret in backend-testnet namespace
- Restarted API services (svc-admin, svc-identity, svc-tokenomics)

**Issue Discovered:** Initial JWT token used wrong field name (`status` instead of `role`)

**Fix:**
- Analyzed middleware code: `packages/core-http/src/middlewares/auth.ts`
- Discovered correct structure requires `role` field matching `UserRole` enum
- Generated corrected JWT token with payload:
```json
{
  "profileId": "test-super-admin-001",
  "email": "admin@gxcoin.test",
  "role": "SUPER_ADMIN",
  "iat": 1763465428,
  "exp": 1763551828
}
```

**Result:** ✅ JWT authentication working - API requests successfully authenticated

### 2. Database Schema Fixes

**Problem:** `PrismaClientUnknownRequestError` when attempting to create outbox commands.

**Root Cause:** CommandType enum in PostgreSQL only had 2 values (CREATE_USER, TRANSFER_TOKENS) but Prisma schema defined 24 values.

**Investigation:**
```sql
-- Found incomplete enum
SELECT enumlabel FROM pg_enum WHERE enumtypid = '"CommandType"'::regtype;
-- Returned only: CREATE_USER, TRANSFER_TOKENS
```

**Solution:** Added all missing enum values via SQL:
```sql
ALTER TYPE "CommandType" ADD VALUE 'BOOTSTRAP_SYSTEM';
ALTER TYPE "CommandType" ADD VALUE 'DISTRIBUTE_GENESIS';
ALTER TYPE "CommandType" ADD VALUE 'FREEZE_WALLET';
-- ... (21 total values added)
```

**Result:** ✅ All 24 CommandType enum values now present in database

### 3. Kubernetes NetworkPolicy Configuration

**Problem:** Backend workers unable to connect to Fabric peers - connection refused errors.

**Root Cause Analysis:**
1. `fabric-testnet` namespace has `default-deny-all` NetworkPolicy blocking all ingress
2. `backend-testnet` had egress policy but selector mismatch
3. No corresponding ingress policy in `fabric-testnet`

**Solutions Applied:**

**A. Created Ingress Policy in fabric-testnet:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-testnet-ingress
  namespace: fabric-testnet
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: backend-testnet
    ports:
    - protocol: TCP
      port: 7050  # Orderer
    - protocol: TCP
      port: 7051  # Peer
    - protocol: TCP
      port: 7053  # Peer events
    - protocol: TCP
      port: 7054  # CA
```

**B. Fixed Egress Policy Pod Selector:**
- **Issue:** Policy matched `component=backend` but outbox-submitter pods have `component=worker`
- **Fix:** Updated selector to match worker pods:
```bash
kubectl patch networkpolicy allow-fabric-testnet-egress -n backend-testnet \
  --type=json -p='[{"op": "replace", "path": "/spec/podSelector/matchLabels/component", "value": "worker"}]'
```

**Result:** ✅ Network connectivity established between namespaces

### 4. TLS Certificate Configuration

**Problem:** "unable to verify the first certificate" errors when connecting to Fabric peer.

**Root Cause:** Worker pods had mainnet TLS CA certificate, but testnet peers use different certificates.

**Investigation:**
```bash
# Mainnet CA (incorrect):
kubectl exec outbox-submitter -- cat /etc/fabric/ca-cert.pem | head -5
# Issuer: fabric-ca-server (October 2025)

# Testnet peer certificate location:
kubectl exec peer0-org1-0 -n fabric-testnet -- env | grep TLS
# CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
```

**Solution:**
```bash
# Extract correct TLS CA from testnet peer
kubectl exec -n fabric-testnet peer0-org1-0 -- \
  cat /etc/hyperledger/fabric/tls/ca.crt > /tmp/testnet-tls-ca.crt

# Update backend-testnet secret
kubectl patch secret fabric-credentials -n backend-testnet --type=json \
  -p="[{\"op\": \"replace\", \"path\": \"/data/ca-cert.pem\", \"value\": \"$(cat /tmp/testnet-tls-ca.crt | base64 -w 0)\"}]"

# Restart workers
kubectl rollout restart deployment/outbox-submitter -n backend-testnet
```

**Certificate Details:**
- Issuer: `tlsca.org1.testnet.goodness.exchange`
- Subject Alternative Names:
  - `peer0.org1.testnet.goodness.exchange`
  - `peer0-org1.fabric-testnet.svc.cluster.local`
  - `peer0`, `peer0-org1`, `localhost`

**Result:** ✅ TLS CA certificate correctly configured

### 5. TLS Server Name Override Configuration

**Problem:** Certificate hostname mismatch error:
```
Hostname/IP does not match certificate's altnames:
Host: peer0.org1.prod.goodness.exchange
is not in the cert's altnames: peer0.org1.testnet.goodness.exchange
```

**Root Cause:** ConfigMap had mainnet TLS server name override.

**Solution:**
```bash
kubectl patch configmap backend-config -n backend-testnet --type=json \
  -p='[{"op": "replace", "path": "/data/FABRIC_TLS_SERVER_NAME_OVERRIDE", "value": "peer0.org1.testnet.goodness.exchange"}]'
```

**Result:** ⚠️ Fixed hostname mismatch but introduced new issue (see Current Issues)

---

## API Testing Progress

### Bootstrap Endpoint Test

**Endpoint:** `POST /api/v1/bootstrap`

**Authentication:** Bearer token with SUPER_ADMIN role

**Request:**
```bash
kubectl exec svc-admin-xxx -- wget -O- -q \
  --header='Content-Type: application/json' \
  --header='Authorization: Bearer <jwt-token>' \
  --post-data='{}' \
  http://localhost:3006/api/v1/bootstrap
```

**Response:**
```json
{
  "commandId": "cmi4kelr40005rn01ta1j11qq",
  "message": "System bootstrap initiated."
}
```

**Status:** ✅ Command successfully queued in outbox table

**Outbox Record:**
```sql
SELECT id, "commandType", status, attempts FROM "OutboxCommand";
-- id: cmi4kelr40005rn01ta1j11qq
-- commandType: BOOTSTRAP_SYSTEM
-- status: FAILED
-- attempts: 5
```

---

## Current Issues

### Issue: Fabric SDK Connecting to Localhost

**Symptoms:**
- Outbox-submitter attempting to connect to `127.0.0.1:7051` instead of configured peer endpoint
- Error: `connect ECONNREFUSED 127.0.0.1:7051`

**Configuration:**
```yaml
# backend-config ConfigMap
FABRIC_PEER_ENDPOINT: peer0-org1.fabric-testnet.svc.cluster.local:7051
FABRIC_TLS_SERVER_NAME_OVERRIDE: peer0.org1.testnet.goodness.exchange
```

**Logs:**
```json
{
  "level": "error",
  "service": "core-fabric",
  "message": "Transaction submission failed",
  "error": "14 UNAVAILABLE: No connection established. Last error: Error: connect ECONNREFUSED 127.0.0.1:7051"
}
```

**Hypothesis:** TLS server name override may be interfering with Fabric SDK's endpoint resolution logic.

**Next Steps:**
1. Review core-fabric package SDK initialization code
2. Check if endpoint parsing is affected by gRPC options
3. Test connectivity with TLS server name override temporarily removed
4. Verify Fabric SDK version compatibility with configuration

---

## Infrastructure State

### backend-testnet Namespace

**ConfigMap (backend-config):**
- JWT_SECRET: ✅ Configured (48-byte base64)
- FABRIC_PEER_ENDPOINT: ✅ `peer0-org1.fabric-testnet.svc.cluster.local:7051`
- FABRIC_TLS_SERVER_NAME_OVERRIDE: ✅ `peer0.org1.testnet.goodness.exchange`
- FABRIC_MSP_ID: ✅ `Org1MSP`
- FABRIC_CHANNEL_NAME: ✅ `gxchannel`
- FABRIC_CHAINCODE_NAME: ✅ `gxtv3`

**Secret (backend-secrets):**
- JWT_SECRET: ✅ Updated
- ca-cert.pem: ✅ Testnet TLS CA certificate
- cert.pem: ⚠️ Still uses mainnet credentials (needs investigation)
- key.pem: ⚠️ Still uses mainnet credentials (needs investigation)

**Secret (fabric-credentials):**
- ca-cert.pem: ✅ Updated to testnet TLS CA
- cert.pem: ℹ️ Client certificate (may need testnet-specific cert)
- key.pem: ℹ️ Client private key (may need testnet-specific key)

**NetworkPolicies:**
- allow-fabric-testnet-egress: ✅ Configured with `component=worker` selector
- allow-dns: ✅ Allows DNS resolution
- allow-internal-backend: ✅ Allows internal communication
- default-deny-all: ✅ Baseline security

**Deployments:**
- svc-admin: ✅ Running (1/1)
- svc-identity: ✅ Running (1/1)
- svc-tokenomics: ✅ Running (1/1)
- outbox-submitter: ✅ Running (3/3 replicas)
- projector: ✅ Running (1/1)

**Database:**
- PostgreSQL: ✅ Running (postgres-0)
- Schema: ✅ All tables present
- Enums: ✅ CommandType has all 24 values
- Migrations: ⚠️ No _prisma_migrations table (schema loaded from dump)

### fabric-testnet Namespace

**NetworkPolicies:**
- allow-backend-testnet-ingress: ✅ Created (allows backend→fabric traffic)
- allow-dns: ✅ Allows DNS resolution
- allow-intra-namespace: ✅ Allows peer-to-peer communication
- default-deny-all: ✅ Baseline security

**Pods:**
- peer0-org1-0: ✅ Running
- peer0-org2-0: ✅ Running
- orderer0-ordererorg-0: ✅ Running
- orderer1-ordererorg-0: ✅ Running
- orderer2-ordererorg-0: ✅ Running
- gxtv3-chaincode-0: ✅ Running

---

## Lessons Learned

### 1. Secret vs ConfigMap Configuration
- Backend services load JWT_SECRET from **Secret**, not ConfigMap
- Always verify which configuration source is actually being used by deployments

### 2. Pod Label Selectors
- NetworkPolicy selectors must exactly match pod labels
- Use `kubectl get pods --show-labels` to verify labels before creating policies

### 3. Database Enum Synchronization
- Migrations table missing indicates schema loaded from dump, not migrated
- Enums can become out of sync between Prisma schema and actual database
- Always verify enum values match between schema.prisma and PostgreSQL

### 4. TLS Certificate Chains
- Mainnet and testnet use different certificate hierarchies
- TLS CA, client cert, and TLS server name override must all be consistent
- Extract certificates directly from running Fabric pods for accuracy

### 5. Kubernetes DNS Resolution
- Services resolve as `<service>.<namespace>.svc.cluster.local`
- NetworkPolicies use namespace selectors, not DNS names
- Verify connectivity with `nc` or similar tools after policy changes

---

## Next Actions

### Immediate (In Progress)
- [ ] Debug Fabric SDK localhost connection issue
- [ ] Review core-fabric package connection initialization
- [ ] Test with TLS server name override removed
- [ ] Verify client certificate/key match testnet requirements

### Short Term
- [ ] Successfully bootstrap testnet via API
- [ ] Initialize country data via API
- [ ] Test CREATE_USER command end-to-end
- [ ] Verify outbox→Fabric→projector flow

### Medium Term
- [ ] Document complete API testing procedures
- [ ] Create testnet-specific Fabric credential generation
- [ ] Set up proper Prisma migrations for testnet
- [ ] Implement monitoring for projection lag

---

## Files Modified

### Kubernetes Resources
- `backend-testnet/Secret/backend-secrets` - Updated JWT_SECRET
- `backend-testnet/Secret/fabric-credentials` - Updated TLS CA certificate
- `backend-testnet/ConfigMap/backend-config` - Updated FABRIC_TLS_SERVER_NAME_OVERRIDE
- `backend-testnet/NetworkPolicy/allow-fabric-testnet-egress` - Fixed pod selector
- `fabric-testnet/NetworkPolicy/allow-backend-testnet-ingress` - Created new policy

### Database
- `PostgreSQL/gx_protocol/CommandType enum` - Added 22 missing enum values

### Deployments Restarted
- `backend-testnet/Deployment/svc-admin` - For JWT_SECRET update
- `backend-testnet/Deployment/svc-identity` - For JWT_SECRET update
- `backend-testnet/Deployment/svc-tokenomics` - For JWT_SECRET update
- `backend-testnet/Deployment/outbox-submitter` - Multiple times for config updates

---

## Commands Reference

### JWT Token Generation (Node.js)
```javascript
const crypto = require('crypto');
const secret = 'bTxC368axZ9oQRyiEjdWaZOeurMc8QjgpkOgpj+YFJV4shlRyBeplR19kNCDIh54';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  profileId: 'test-super-admin-001',
  email: 'admin@gxcoin.test',
  role: 'SUPER_ADMIN',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
};

const headerBase64 = base64url(JSON.stringify(header));
const payloadBase64 = base64url(JSON.stringify(payload));
const unsigned = `${headerBase64}.${payloadBase64}`;

const signature = crypto.createHmac('sha256', secret)
  .update(unsigned).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const token = `${unsigned}.${signature}`;
```

### Database Enum Update
```sql
-- Add missing CommandType values
ALTER TYPE "CommandType" ADD VALUE 'BOOTSTRAP_SYSTEM';
ALTER TYPE "CommandType" ADD VALUE 'INITIALIZE_COUNTRY';
ALTER TYPE "CommandType" ADD VALUE 'UPDATE_SYSTEM_PARAMETER';
-- ... (repeat for all 22 missing values)

-- Verify
SELECT enumlabel FROM pg_enum
WHERE enumtypid = '"CommandType"'::regtype
ORDER BY enumsortorder;
```

### NetworkPolicy Testing
```bash
# Test connectivity from worker pod
kubectl exec -n backend-testnet outbox-submitter-xxx -- \
  nc -zv peer0-org1.fabric-testnet.svc.cluster.local 7051

# Check NetworkPolicy application
kubectl describe networkpolicy -n backend-testnet
kubectl describe networkpolicy -n fabric-testnet
```

### Certificate Extraction
```bash
# Extract TLS CA from peer
kubectl exec -n fabric-testnet peer0-org1-0 -- \
  cat /etc/hyperledger/fabric/tls/ca.crt > /tmp/testnet-tls-ca.crt

# Update secret
kubectl patch secret fabric-credentials -n backend-testnet --type=json \
  -p="[{\"op\": \"replace\", \"path\": \"/data/ca-cert.pem\", \"value\": \"$(cat /tmp/testnet-tls-ca.crt | base64 -w 0)\"}]"
```

---

## Time Tracking

- JWT Authentication Setup: ~30 minutes
- Database Schema Debugging: ~20 minutes
- NetworkPolicy Configuration: ~25 minutes
- TLS Certificate Configuration: ~35 minutes
- Fabric SDK Debugging: ~40 minutes (ongoing)

**Total Session Time:** ~2.5 hours

---

## Related Documentation

- [Deployment Architecture](/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/architecture/DEPLOYMENT_ARCHITECTURE.md)
- [Testnet API Deployment Session](/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/work-records/2025-01-18-testnet-api-deployment-and-testing.md)
- [CQRS Testing Session](/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/work-records/2025-01-17-cqrs-end-to-end-testing.md)

