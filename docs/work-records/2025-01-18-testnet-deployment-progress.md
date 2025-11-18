# Work Record: Testnet Environment Deployment and Testing Setup

**Date**: January 18, 2025
**Session Duration**: ~2 hours
**Focus Area**: Setting up complete testnet environment for end-to-end CQRS testing

## Executive Summary

Successfully deployed most of the testnet infrastructure but encountered image distribution challenges to the testnet worker node. This session focused on creating a safe testing environment isolated from production mainnet.

## Environment Architecture Decision

### Cluster Layout
- **Mainnet** (fabric + backend-mainnet): Production - 3 control-plane nodes (Malaysia, Arizona, Germany)
- **Testnet** (fabric-testnet + backend-testnet): Pre-production testing - 1 worker node (srv1117946 Malaysia)
- **Devnet** (fabric-devnet + backend-devnet): Development - Empty (not yet deployed)

### Decision: Use Testnet for Bootstrap Testing
**Rationale**:
1. ✅ Isolated from production data
2. ✅ Blockchain already running (minimal setup required)
3. ✅ Safe for experimentation and iteration
4. ✅ Can be reset if tests fail
5. ✅ Realistic production-like environment

## Deployment Progress

### ✅ COMPLETED TASKS

#### 1. PostgreSQL Deployment (backend-testnet)
- **Status**: ✅ Running
- **Pod**: postgres-0
- **Replicas**: 1 (reduced from 3 for testnet)
- **Database**: gx_protocol created
- **Tables**: 37 tables migrated successfully
- **Migration**: Used `/db/prisma/migrations/20251113_init_production_schema/migration.sql`
- **Connection**: Verified working

**Commands Used**:
```bash
# Deploy PostgreSQL StatefulSet
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g; s/replicas: 3/replicas: 1/g' \
  k8s/infrastructure/database/postgres-statefulset.yaml | kubectl apply -f -

# Deploy PostgreSQL ConfigMap and Secrets
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' \
  k8s/infrastructure/database/postgres-config.yaml | kubectl apply -f -

# Deploy Services
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' \
  k8s/infrastructure/database/postgres-service.yaml | kubectl apply -f -

# Run migration
cat db/prisma/migrations/20251113_init_production_schema/migration.sql | \
  kubectl exec -i -n backend-testnet postgres-0 -- psql -U gx_admin -d gx_protocol
```

**Verification**:
```sql
SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';
-- Result: 37 tables
```

#### 2. Redis Deployment (backend-testnet)
- **Status**: ✅ Running
- **Pod**: redis-0
- **Replicas**: 1 (reduced from 3 for testnet)
- **Connection**: Ready for workers

**Commands Used**:
```bash
# Deploy Redis StatefulSet
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g; s/replicas: 3/replicas: 1/g' \
  k8s/infrastructure/cache/redis-statefulset.yaml | kubectl apply -f -

# Deploy Redis ConfigMap and Secrets
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' \
  k8s/infrastructure/cache/redis-config.yaml | kubectl apply -f -

# Deploy Services
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' \
  k8s/infrastructure/cache/redis-service.yaml | kubectl apply -f -
```

#### 3. Chaincode Upgrade Attempt (fabric-testnet)
- **Status**: ⚠️ Partially Complete
- **Current Version**: v1.0 (running)
- **Target Version**: v1.26 (built but not deployed)
- **Image Built**: `10.43.75.195:5000/gxtv3-chaincode-testnet:1.26`
- **Blocker**: Cannot distribute image to testnet worker node (srv1117946) due to SSH access restrictions

**Build Process**:
```bash
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric
docker build -t 10.43.75.195:5000/gxtv3-chaincode-testnet:1.26 \
  -f k8s/base/chaincode/Dockerfile .
docker push 10.43.75.195:5000/gxtv3-chaincode-testnet:1.26
```

**Issue Encountered**:
- Testnet worker node (srv1117946) cannot pull from internal registry (10.43.75.195:5000)
- SSH access denied when attempting to manually import image
- Fell back to v1.0 which is already on the node

**Current State**:
- Chaincode v1.0 running (has basic contracts but may not have all latest fixes)
- Can proceed with testing using v1.0
- Image distribution infrastructure needs improvement for testnet

#### 4. Backend Configuration (backend-testnet)
- **Status**: ✅ Complete
- **ConfigMaps Copied**: backend-config
- **Secrets Copied**: backend-secrets, fabric-credentials
- **ServiceAccount Created**: backend-worker

**Commands Used**:
```bash
# Copy backend-config
kubectl get configmap backend-config -n backend-mainnet -o yaml | \
  sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' | kubectl apply -f -

# Copy backend-secrets
kubectl get secret backend-secrets -n backend-mainnet -o yaml | \
  sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' | kubectl apply -f -

# Copy fabric-credentials
kubectl get secret fabric-credentials -n backend-mainnet -o yaml | \
  sed 's/namespace: backend-mainnet/namespace: backend-testnet/g' | kubectl apply -f -

# Create service account
kubectl create serviceaccount backend-worker -n backend-testnet
```

### ⏸️ IN PROGRESS TASKS

#### 5. Worker Deployments (backend-testnet)
- **Status**: ⏸️ Blocked - Image Distribution Issue
- **Deployments Created**: outbox-submitter, projector
- **Images Required**:
  - `gx-protocol/outbox-submitter:2.0.13`
  - `gx-protocol/projector:2.0.11`
- **Blocker**: Worker images not available on testnet worker node (srv1117946)

**Current Pod State**:
```
outbox-submitter-5c7b9b9779-sk6g4   0/1     CrashLoopBackOff   1 (3s ago)   7s
outbox-submitter-5c7b9b9779-w5knl   0/1     CrashLoopBackOff   1 (4s ago)   8s
outbox-submitter-7bf8545c5d-746xg   0/1     ImagePullBackOff   0            16s
projector-5f6984d5b-fthsx           0/1     ErrImagePull       0            15s
```

**Error Analysis**:
- **ImagePullBackOff**: Node cannot pull from registry
  - Registry at 10.43.75.195:5000 is on control-plane node
  - Testnet worker node (srv1117946) has no network route to registry
  - Testnet is isolated on single worker node
- **CrashLoopBackOff**: Older pods failing due to Fabric connection issues

**Deployment Commands Used**:
```bash
# Deploy outbox-submitter
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g; \
     s/gx-protocol\/outbox-submitter:[0-9.]*$/gx-protocol\/outbox-submitter:2.0.13/g' \
  k8s/backend/deployments/outbox-submitter.yaml | kubectl apply -f -

# Deploy projector
sed 's/namespace: backend-mainnet/namespace: backend-testnet/g; \
     s/gx-protocol\/projector:[0-9.]*$/gx-protocol\/projector:2.0.11/g' \
  k8s/backend/deployments/projector.yaml | kubectl apply -f -
```

## Technical Issues Discovered

### Issue 1: Testnet Worker Node Image Distribution

**Problem**:
- Testnet runs on dedicated worker node (srv1117946)
- Worker node cannot access internal registry on control-plane nodes
- SSH access denied when attempting manual image import

**Root Cause**:
- Registry service (10.43.75.195:5000) exposed via ClusterIP on control-plane nodes
- Testnet worker node is in different network segment
- SSH keys not configured for automated image distribution

**Potential Solutions**:
1. **Harbor/External Registry**: Deploy proper container registry accessible from all nodes
2. **NodePort Registry**: Expose registry on NodePort accessible from worker node
3. **Image Pre-loading**: Manually pre-load images to worker node before deployment
4. **Registry DaemonSet**: Run registry replica on each node
5. **Public Registry**: Use Docker Hub or GHCR for testnet images

**Recommended Immediate Fix**:
```bash
# Option 1: Build images directly on worker node
ssh root@srv1117946
cd /path/to/code
docker build -t gx-protocol/outbox-submitter:2.0.13 ...
docker build -t gx-protocol/projector:2.0.11 ...

# Option 2: Use imagePullPolicy: Never and pre-load
kubectl patch deployment outbox-submitter -n backend-testnet \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"outbox-submitter","imagePullPolicy":"Never"}]}}}}'
```

### Issue 2: Prometheus ServiceMonitor CRD Missing

**Error**:
```
error: resource mapping not found for name: "outbox-submitter" namespace: "backend-testnet"
from "STDIN": no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

**Impact**: Non-blocking - deployments created successfully, only monitoring affected
**Resolution**: Will address in monitoring setup task

### Issue 3: Fabric Credentials Point to Mainnet

**Observation**:
- Copied fabric-credentials from backend-mainnet
- These credentials point to mainnet fabric peers
- Need to update for fabric-testnet peers

**Required Changes**:
```yaml
# Update fabric-credentials secret to point to testnet
FABRIC_PEER_ENDPOINT: peer0-org1.fabric-testnet.svc.cluster.local:7051
FABRIC_TLS_SERVER_NAME_OVERRIDE: peer0.org1.testnet.goodness.exchange  # If different
```

## Environment Comparison

| Component | Mainnet (backend-mainnet) | Testnet (backend-testnet) | Status |
|-----------|---------------------------|---------------------------|--------|
| Namespace | backend-mainnet | backend-testnet | ✅ |
| PostgreSQL | 3 replicas | 1 replica | ✅ Running |
| Redis | 3 replicas | 1 replica | ✅ Running |
| Outbox-Submitter | v2.0.13 running | v2.0.13 deployment created | ⏸️ ImagePull issue |
| Projector | v2.0.11 running | v2.0.11 deployment created | ⏸️ ImagePull issue |
| Database Schema | 37 tables | 37 tables | ✅ Migrated |
| Fabric Blockchain | fabric namespace (5 orderers, 4 peers) | fabric-testnet namespace (1 orderer, 2 peers) | ✅ Running |
| Chaincode | gxtv3 v1.25 | gxtv3 v1.0 | ✅ Running (older version) |
| Monitoring | Prometheus/Grafana (has "no data" issue) | Not deployed | ❌ Pending |

## Next Steps (Priority Order)

### IMMEDIATE (Required for Testing)

1. **Resolve Worker Image Distribution** (CRITICAL BLOCKER)
   - [ ] Option A: Set up SSH keys for srv1117946 automated access
   - [ ] Option B: Build images directly on worker node
   - [ ] Option C: Deploy local registry on worker node
   - [ ] Option D: Use NodePort to expose existing registry

2. **Update Fabric Credentials for Testnet**
   - [ ] Create new fabric-credentials secret pointing to fabric-testnet peers
   - [ ] Update backend-config with testnet-specific settings
   - [ ] Restart workers after credential update

3. **Verify Workers Start Successfully**
   - [ ] Check outbox-submitter logs for Fabric connection
   - [ ] Check projector logs for event stream connection
   - [ ] Verify database connectivity

### TESTING PHASE

4. **Bootstrap fabric-testnet Blockchain**
   - [ ] Invoke AdminContract:BootstrapSystem
   - [ ] Verify bootstrap timestamp and status

5. **Initialize Country Data**
   - [ ] Prepare test country data (US, MY, DE)
   - [ ] Invoke AdminContract:InitializeCountryData
   - [ ] Query stats_{countryCode} to verify

6. **Run End-to-End CQRS Tests**
   - [ ] Test CREATE_USER command flow
   - [ ] Test TRANSFER_TOKENS command flow
   - [ ] Test DISTRIBUTE_GENESIS command flow
   - [ ] Verify projector updates read models
   - [ ] Validate event processing

### MONITORING

7. **Fix Grafana "No Data" Issue**
   - [ ] Verify Prometheus is scraping targets
   - [ ] Check ServiceMonitor CRDs are installed
   - [ ] Verify metrics endpoints are accessible
   - [ ] Configure Grafana data sources
   - [ ] Import/update dashboards

8. **Deploy Testnet Monitoring**
   - [ ] Install Prometheus Operator (if missing)
   - [ ] Deploy Prometheus for testnet
   - [ ] Deploy Grafana for testnet
   - [ ] Create testnet-specific dashboards

## Files Modified/Created

### Configuration Deployed
1. PostgreSQL StatefulSet, Service, ConfigMap, Secret (backend-testnet)
2. Redis StatefulSet, Service, ConfigMap, Secret (backend-testnet)
3. backend-config ConfigMap (backend-testnet)
4. backend-secrets Secret (backend-testnet)
5. fabric-credentials Secret (backend-testnet)
6. backend-worker ServiceAccount (backend-testnet)
7. outbox-submitter Deployment (backend-testnet)
8. projector Deployment (backend-testnet)

### Docker Images Built
1. `10.43.75.195:5000/gxtv3-chaincode-testnet:1.26` (Built, pushed to registry, not deployed)

## Lessons Learned

### 1. Image Registry Architecture Matters
**Lesson**: Internal ClusterIP registry doesn't work for isolated worker nodes
**Impact**: Blocked worker deployment to testnet
**Prevention**: Use external registry (Harbor) or NodePort for multi-node clusters

### 2. Testnet Should Mirror Production Architecture
**Lesson**: Testnet on single worker node has different constraints than 3-node mainnet
**Improvement**: Consider deploying testnet across control-plane nodes for consistency

### 3. Secrets Must Be Environment-Specific
**Lesson**: Copying mainnet secrets to testnet creates wrong fabric connection
**Fix**: Create testnet-specific secrets with fabric-testnet endpoints

### 4. Monitoring CRDs Are Optional Dependencies
**Lesson**: ServiceMonitor resources fail if Prometheus Operator not installed
**Fix**: Make monitoring resources optional or install operator first

## Challenges Encountered

### 1. Node Access Restrictions
- **Challenge**: Cannot SSH to srv1117946 for manual image import
- **Blocker**: Prevents manual workaround for image distribution
- **Status**: Requires infrastructure team intervention or SSH key setup

### 2. Registry Network Isolation
- **Challenge**: Worker node cannot reach registry on control-plane node
- **Blocker**: All worker images must be pre-loaded or registry must be accessible
- **Status**: Architecture decision needed

### 3. Chaincode Version Mismatch
- **Challenge**: Testnet running v1.0, mainnet on v1.25
- **Risk**: Parameter signatures may differ between versions
- **Mitigation**: Test with v1.0 first, upgrade later if needed

## Testing Strategy (Post-Deployment)

### Phase 1: Infrastructure Validation
1. Verify all pods running in backend-testnet
2. Check Fabric connectivity from workers
3. Validate database connection from workers
4. Confirm Redis connectivity

### Phase 2: Blockchain Bootstrap
1. Bootstrap system via AdminContract:BootstrapSystem
2. Initialize 3 test countries (US, MY, DE)
3. Verify country stats created on-chain

### Phase 3: CQRS Flow Testing
1. Submit CREATE_USER command via outbox
2. Verify Fabric transaction endorsement and commit
3. Confirm projector receives UserCreated event
4. Validate UserProfile read model created
5. Repeat for TRANSFER_TOKENS and DISTRIBUTE_GENESIS

### Phase 4: Validation
1. Query blockchain state directly
2. Query PostgreSQL read models
3. Compare consistency between write and read models
4. Document any discrepancies

## Success Criteria

- [ ] PostgreSQL running with all 37 tables (✅ COMPLETE)
- [ ] Redis running and accessible (✅ COMPLETE)
- [ ] Outbox-submitter successfully connecting to fabric-testnet
- [ ] Projector successfully receiving events from fabric-testnet
- [ ] Fabric-testnet blockchain bootstrapped
- [ ] At least 3 countries initialized
- [ ] CREATE_USER flow working end-to-end
- [ ] Projector updating read models correctly
- [ ] Monitoring dashboards showing data
- [ ] Complete runbook documented for mainnet deployment

## Current Blockers

1. **🔴 CRITICAL**: Worker images not accessible on testnet node (srv1117946)
   - Blocks: All worker deployments and testing
   - Requires: Image distribution solution or SSH access

2. **🟡 MEDIUM**: Fabric credentials point to mainnet instead of testnet
   - Blocks: Fabric connectivity once workers start
   - Requires: Update fabric-credentials secret

3. **🟡 MEDIUM**: Monitoring "no data" issue on mainnet
   - Blocks: Observability during testing
   - Requires: Prometheus/Grafana debugging

## Time Estimates

- **Remaining Deployment Work**: 1-2 hours (depending on image distribution solution)
- **Bootstrap and Testing**: 2-3 hours
- **Monitoring Setup**: 2-4 hours
- **Documentation**: 1 hour
- **Total Remaining**: 6-10 hours

## Related Documentation

- Previous: `2025-01-18-v2-0-13-deployment-and-findings.md`
- Previous: `2025-01-18-parameter-mismatch-fix-and-findings.md`
- Previous: `2025-01-18-cqrs-end-to-end-test-and-findings.md`
- Architecture: `/docs/architecture/DEPLOYMENT_ARCHITECTURE.md`

---

**Session Status**: PARTIAL PROGRESS - Infrastructure deployed but workers blocked on image distribution
**Blocker**: Image distribution to isolated worker node
**Next Session Goal**: Resolve image distribution and complete worker deployment
