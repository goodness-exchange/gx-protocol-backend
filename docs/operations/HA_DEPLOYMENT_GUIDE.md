# High Availability Deployment Guide - Outbox Submitter Worker

**Version**: 2.0.16+
**Last Updated**: 2025-11-20
**Applies To**: backend-mainnet namespace

---

## Overview

This guide documents the high availability (HA) configuration for the outbox-submitter worker, which manages multi-identity Fabric blockchain transaction submission. The HA setup ensures continuous operation of blockchain write operations through geographic distribution and replica redundancy.

---

## Architecture

### Multi-Replica Configuration

**Current Production Setup**:
- **Replicas**: 2 pods
- **Geographic Distribution**:
  - Pod 1: srv1089618.hstgr.cloud (Kuala Lumpur, Malaysia - APAC)
  - Pod 2: srv1092158.hstgr.cloud (Frankfurt am Main, Germany - EMEA)
- **Scheduling**: Flexible (no node affinity constraints)
- **Image**: `docker.io/gx-protocol/outbox-submitter:2.0.16`

### Per-Pod Architecture

Each replica pod runs:
- **3 Fabric Client Instances** (one per identity):
  1. `org1-super-admin` (gx_super_admin role)
  2. `org1-admin` (gx_admin role)
  3. `org1-partner-api` (gx_partner_api role)
- **Outbox Polling Loop**: Queries PostgreSQL for pending commands
- **Prometheus Metrics Endpoint**: Port 9090
- **Command Router**: Selects appropriate identity based on command type

**Total Fabric Connections**: 6 (3 identities × 2 replicas)

### Load Distribution Behavior

**Database-Driven Coordination**:
- Both pods poll the same `outbox_commands` table in PostgreSQL
- Commands are processed in FIFO order with `FOR UPDATE SKIP LOCKED`
- Natural load distribution through database row-level locking
- No external load balancer required for worker coordination

**Failover Characteristics**:
- **Failure Mode**: If one pod crashes, the other continues processing all commands
- **Recovery**: When crashed pod restarts, it resumes polling and shares load
- **Zero Downtime**: No transaction interruption during single-pod failure
- **Split-Brain Prevention**: Database locking ensures exactly-once processing

---

## Prerequisites for HA Deployment

### 1. Image Availability on All Scheduler Target Nodes

**Requirement**: The outbox-submitter image must be present on all control-plane nodes where pods may be scheduled.

**Current Cluster Nodes** (backend-mainnet):
- srv1089618.hstgr.cloud (Malaysia)
- srv1089624.hstgr.cloud (Phoenix, USA)
- srv1092158.hstgr.cloud (Germany)

**Verification Command**:
```bash
# Check image on each node
for node in srv1089618 srv1089624 srv1092158; do
  echo "=== $node ==="
  kubectl get nodes -o wide | grep $node
  kubectl debug node/$node.hstgr.cloud -it --image=busybox -- \
    chroot /host sh -c 'k3s ctr images ls | grep outbox-submitter'
done
```

**Expected Output** (for v2.0.16):
```
docker.io/gx-protocol/outbox-submitter:2.0.16
```

### 2. ConfigMap Wallet Deployed

**Required ConfigMap**: `fabric-wallet` in `backend-mainnet` namespace

**Verification**:
```bash
kubectl get configmap fabric-wallet -n backend-mainnet
```

**Expected Keys**:
- `ca-cert`
- `org1-super-admin-cert`
- `org1-super-admin-key`
- `org1-admin-cert`
- `org1-admin-key`
- `org1-partner-api-cert`
- `org1-partner-api-key`

### 3. Database Connectivity

**PostgreSQL StatefulSet**: `postgres` in `backend-mainnet` namespace

**Verification**:
```bash
kubectl get statefulset postgres -n backend-mainnet
# Should show: postgres   3/3   (3 replicas ready)
```

### 4. Fabric Network Health

**Blockchain Pods**: Orderers and peers in `fabric` namespace

**Verification**:
```bash
kubectl get pods -n fabric -l app=orderer
kubectl get pods -n fabric -l app=peer
# All should be Running (1/1)
```

---

## Deployment Procedures

### Building the Image

**Location**: `/home/sugxcoin/prod-blockchain/gx-protocol-backend`

**Build Command**:
```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend

# Build with Turbo (includes all dependencies)
npm run build

# Build Docker image
docker build \
  -f workers/outbox-submitter/Dockerfile \
  -t gx-protocol/outbox-submitter:2.0.X \
  .

# Tag with version
docker tag gx-protocol/outbox-submitter:2.0.X gx-protocol/outbox-submitter:latest
```

**Build Time**: ~10 seconds (with warm cache)
**Image Size**: ~359MB compressed

### Distributing Images to Multi-Node Cluster

**Process**: Save → Transfer → Import on each control-plane node

#### Step 1: Save Image as Tarball
```bash
cd /tmp
docker save gx-protocol/outbox-submitter:2.0.X | gzip > outbox-submitter-2.0.X.tar.gz
```

**Output Size**: ~359MB

#### Step 2: Transfer to All Control-Plane Nodes

**Parallel Transfer** (recommended):
```bash
VERSION=2.0.X

for node in 72.60.210.201 217.196.51.190 72.61.81.3; do
  echo "=== Transferring to $node ==="
  scp /tmp/outbox-submitter-${VERSION}.tar.gz root@$node:/tmp/ &
done

# Wait for all transfers to complete
wait
echo "All transfers complete"
```

**Transfer Time**: 12-27 seconds per node (varies by geography)

**Retry Strategy** (if transfer fails):
```bash
# Use different filename to avoid cached partial transfers
RETRY_VERSION="${VERSION}-retry$(date +%s)"

scp /tmp/outbox-submitter-${VERSION}.tar.gz \
    root@FAILED_NODE:/tmp/outbox-submitter-${RETRY_VERSION}.tar.gz
```

#### Step 3: Import on Each Node

**SSH to each node and import**:
```bash
# Malaysia node
ssh root@72.60.210.201
gunzip < /tmp/outbox-submitter-2.0.X.tar.gz | k3s ctr images import -
rm /tmp/outbox-submitter-2.0.X.tar.gz
exit

# USA node
ssh root@217.196.51.190
gunzip < /tmp/outbox-submitter-2.0.X.tar.gz | k3s ctr images import -
rm /tmp/outbox-submitter-2.0.X.tar.gz
exit

# Germany node
ssh root@72.61.81.3
gunzip < /tmp/outbox-submitter-2.0.X.tar.gz | k3s ctr images import -
rm /tmp/outbox-submitter-2.0.X.tar.gz
exit
```

**Import Time**: ~5-10 seconds per node

**Verification After Import**:
```bash
# From control machine
for node in srv1089618 srv1089624 srv1092158; do
  echo "=== $node ==="
  ssh root@$(kubectl get node $node.hstgr.cloud -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}') \
    "k3s ctr images ls | grep outbox-submitter:2.0.X"
done
```

### Deploying New Version (Rolling Update)

#### Update Deployment with New Image

```bash
kubectl set image deployment/outbox-submitter \
  outbox-submitter=gx-protocol/outbox-submitter:2.0.X \
  -n backend-mainnet
```

**Kubernetes Behavior**:
- Creates new ReplicaSet with updated image
- Terminates one old pod, starts one new pod
- Waits for new pod to be Ready
- Terminates second old pod, starts second new pod
- Rollout completes when all replicas running new version

**Monitor Rollout**:
```bash
kubectl rollout status deployment/outbox-submitter -n backend-mainnet
```

**Expected Output**:
```
Waiting for deployment "outbox-submitter" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "outbox-submitter" rollout to finish: 1 old replicas are pending termination...
deployment "outbox-submitter" successfully rolled out
```

### Zero-Downtime Update Strategy

**Key Principle**: At least 1 replica always running during update

**Configuration** (already applied):
```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Allow 1 extra pod during update
      maxUnavailable: 0  # Always maintain minimum replicas
```

**Update Flow**:
1. New pod starts on available node
2. New pod initializes all 3 Fabric clients (~271ms)
3. New pod becomes Ready
4. Old pod receives SIGTERM
5. Old pod completes in-flight transactions
6. Old pod terminates
7. Repeat for second replica

**Transaction Continuity**:
- Database locking prevents duplicate processing
- In-flight transactions complete before pod termination
- New pods resume polling immediately after startup

---

## ConfigMap Wallet Management

### Structure and Mount Behavior

**ConfigMap Keys** → **Mounted Files**:
```
ConfigMap Key               Mounted Path
-------------               ------------
ca-cert                  →  /fabric-wallet/ca-cert
org1-super-admin-cert    →  /fabric-wallet/org1-super-admin-cert
org1-super-admin-key     →  /fabric-wallet/org1-super-admin-key
org1-admin-cert          →  /fabric-wallet/org1-admin-cert
org1-admin-key           →  /fabric-wallet/org1-admin-key
org1-partner-api-cert    →  /fabric-wallet/org1-partner-api-cert
org1-partner-api-key     →  /fabric-wallet/org1-partner-api-key
```

**Critical Note**: ConfigMap keys become **flat files**, NOT directory structures. Code must reference paths like `/fabric-wallet/org1-super-admin-cert`, NOT `/fabric-wallet/org1-super-admin/cert.pem`.

### Updating Wallet Credentials

**Scenario**: Rotating Fabric CA certificates or re-enrolling identities

#### Step 1: Prepare New Certificate/Key Files
```bash
# Example: Re-enrolled org1-super-admin identity
ls -la /tmp/new-wallet/
# org1-super-admin-cert.pem
# org1-super-admin-key.pem
```

#### Step 2: Update ConfigMap
```bash
# Update specific key (example: super-admin cert)
kubectl create configmap fabric-wallet \
  -n backend-mainnet \
  --from-file=ca-cert=/path/to/ca-org1.pem \
  --from-file=org1-super-admin-cert=/tmp/new-wallet/org1-super-admin-cert.pem \
  --from-file=org1-super-admin-key=/tmp/new-wallet/org1-super-admin-key.pem \
  --from-file=org1-admin-cert=/path/to/org1-admin-cert.pem \
  --from-file=org1-admin-key=/path/to/org1-admin-key.pem \
  --from-file=org1-partner-api-cert=/path/to/org1-partner-api-cert.pem \
  --from-file=org1-partner-api-key=/path/to/org1-partner-api-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Step 3: Trigger Pod Restart to Pick Up New ConfigMap

**Deployment Restart** (forces new pods with updated mounts):
```bash
kubectl rollout restart deployment/outbox-submitter -n backend-mainnet
```

**Monitor Restart**:
```bash
kubectl rollout status deployment/outbox-submitter -n backend-mainnet
```

#### Step 4: Verify New Credentials Loaded

**Check Pod Logs**:
```bash
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=20
```

**Expected Output**:
```json
{"message":"Successfully connected Fabric client for org1-super-admin"}
{"message":"Successfully connected Fabric client for org1-admin"}
{"message":"Successfully connected Fabric client for org1-partner-api"}
{"message":"All Fabric clients initialized successfully","count":3}
```

---

## Post-Deployment Verification

### Checklist

**1. Pod Status**
```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter
```

**Expected**:
```
NAME                                READY   STATUS    RESTARTS   AGE
outbox-submitter-XXXXXXXXXX-xxxxx   1/1     Running   0          Xm
outbox-submitter-XXXXXXXXXX-yyyyy   1/1     Running   0          Xm
```

**2. Replica Distribution**
```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter -o wide
```

**Verify**:
- Pods scheduled on different nodes (geographic distribution)
- Both pods in `Running` state
- No `ImagePullBackOff` or `CrashLoopBackOff` errors

**3. Fabric Client Initialization**
```bash
# Check each pod's logs
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=50 | grep "Fabric client"
```

**Expected Output** (per pod):
```
Successfully connected Fabric client for org1-super-admin
Successfully connected Fabric client for org1-admin
Successfully connected Fabric client for org1-partner-api
All Fabric clients initialized successfully
```

**4. Metrics Endpoint**
```bash
# Port-forward to one pod
POD=$(kubectl get pods -n backend-mainnet -l app=outbox-submitter -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n backend-mainnet $POD 9090:9090 &

# Check metrics
curl http://localhost:9090/metrics | grep outbox_submitter
```

**5. Outbox Command Processing**
```bash
# Check if commands are being processed
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=100 | grep "Processing command"
```

**6. Database Connectivity**
```bash
# Check logs for database connection errors
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=100 | grep -i "error.*database"
```

**Expected**: No errors

---

## Rollback Procedures

### Rollback to Previous Image Version

**Scenario**: New version has runtime issues, need to revert

#### Quick Rollback
```bash
# Kubernetes maintains rollout history
kubectl rollout undo deployment/outbox-submitter -n backend-mainnet
```

**Monitor Rollback**:
```bash
kubectl rollout status deployment/outbox-submitter -n backend-mainnet
```

#### Rollback to Specific Revision
```bash
# View rollout history
kubectl rollout history deployment/outbox-submitter -n backend-mainnet

# Rollback to specific revision
kubectl rollout undo deployment/outbox-submitter -n backend-mainnet --to-revision=3
```

### Manual Image Revert
```bash
# Set to known-good version
kubectl set image deployment/outbox-submitter \
  outbox-submitter=gx-protocol/outbox-submitter:2.0.15 \
  -n backend-mainnet
```

### Verification After Rollback

Run full post-deployment verification checklist (see above).

---

## Security Considerations

### Current Implementation

**ConfigMap Storage**: Fabric wallet credentials stored in Kubernetes ConfigMap

**Security Characteristics**:
- ✅ Mounted as read-only volumes in pods
- ✅ RBAC restricts ConfigMap access to backend-mainnet namespace
- ❌ ConfigMaps are NOT encrypted at rest by default
- ❌ Credentials visible in `kubectl get configmap fabric-wallet -o yaml`

### Recommended Enhancement: Migrate to Secrets

**Future Work**: Move wallet credentials from ConfigMap to Kubernetes Secret

**Benefits**:
- Encryption at rest (if cluster encryption enabled)
- Better RBAC integration
- Industry best practice for credential storage

**Migration Procedure** (future sprint):
```bash
# Create Secret from ConfigMap data
kubectl create secret generic fabric-wallet \
  --from-file=ca-cert=/path/to/ca-org1.pem \
  --from-file=org1-super-admin-cert=/path/to/cert.pem \
  --from-file=org1-super-admin-key=/path/to/key.pem \
  # ... (all 7 keys)
  -n backend-mainnet

# Update Deployment to mount Secret instead of ConfigMap
# Change volumeMount source from configMap to secret
```

---

## Related Documentation

- **Phase 3 Deployment Record**: `docs/work-records/2025-11/2025-11-20-phase3-wallet-deployment.md`
- **Deployment Architecture**: `docs/architecture/DEPLOYMENT_ARCHITECTURE.md`
- **Outbox Pattern**: `docs/patterns/OUTBOX_PATTERN.md`
- **Multi-Identity Fabric Client**: `packages/core-fabric/README.md`

---

**Document Owner**: Backend Operations Team
**Review Cycle**: Quarterly or after major version updates
