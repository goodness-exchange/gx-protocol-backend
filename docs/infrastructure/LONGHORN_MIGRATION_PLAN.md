# Longhorn Distributed Storage Migration Plan
**Project:** GX Protocol Backend Enterprise HA
**Date:** 2025-11-17
**Objective:** Migrate PostgreSQL and Redis from local-path to Longhorn distributed storage
**Estimated Time:** 1-2 days
**Risk Level:** Medium (with proper backups)

---

## Executive Summary

**Problem:** PostgreSQL and Redis StatefulSets are concentrated on srv1117946 worker node due to local-path storage creating PersistentVolume node affinity. This creates a single point of failure.

**Solution:** Deploy Longhorn distributed block storage to enable true pod mobility and automatic replication across all control-plane nodes.

**Benefits:**
- ✅ Eliminate single point of failure
- ✅ Automatic 3-way replication across nodes
- ✅ Pod mobility (can reschedule to any node)
- ✅ Built-in backup and snapshot capabilities
- ✅ Web UI for monitoring and management
- ✅ Production-grade HA for enterprise deployment

---

## Prerequisites

### Cluster Requirements
- ✅ Kubernetes 1.21+ (We have K3s v1.33.5)
- ✅ 3+ nodes for replica distribution (We have 3 control-plane nodes)
- ✅ open-iscsi installed on all nodes
- ✅ 100GB+ available storage per node

### Verify open-iscsi Installation
```bash
# Check on all control-plane nodes
for node in srv1089618 srv1089624 srv1092158; do
  echo "=== Checking $node ==="
  ssh root@$node "systemctl status iscsid || dnf install -y iscsi-initiator-utils && systemctl enable --now iscsid"
done
```

### Backup Current Data (CRITICAL)
```bash
# PostgreSQL full backup
kubectl exec -n backend-mainnet postgres-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pg_dumpall -U gx_admin' > /tmp/postgres_full_backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup size
ls -lh /tmp/postgres_full_backup_*.sql

# Redis snapshot
kubectl exec -n backend-mainnet redis-0 -- redis-cli SAVE
kubectl exec -n backend-mainnet redis-0 -- redis-cli LASTSAVE

# Copy Redis RDB file
kubectl cp backend-mainnet/redis-0:/data/dump.rdb /tmp/redis_backup_$(date +%Y%m%d_%H%M%S).rdb

# Verify backup
ls -lh /tmp/redis_backup_*.rdb
```

---

## Phase 1: Longhorn Installation (30 minutes)

### Step 1: Install Longhorn via kubectl (5 minutes)
```bash
# Install Longhorn v1.7.2 (latest stable)
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml

# Expected output:
# namespace/longhorn-system created
# serviceaccount/longhorn-service-account created
# clusterrole.rbac.authorization.k8s.io/longhorn-role created
# clusterrolebinding.rbac.authorization.k8s.io/longhorn-bind created
# customresourcedefinition.apiextensions.k8s.io/... created
# ... (many CRDs)
# daemonset.apps/longhorn-manager created
# deployment.apps/longhorn-driver-deployer created
# service/longhorn-backend created
# ...
```

### Step 2: Wait for Longhorn Pods Ready (10-15 minutes)
```bash
# Monitor installation progress
watch -n 5 'kubectl get pods -n longhorn-system'

# Expected pods (all should be Running):
# - longhorn-manager-xxxxx (DaemonSet - 1 per node)
# - longhorn-driver-deployer-xxxxx
# - longhorn-ui-xxxxx
# - csi-attacher-xxxxx
# - csi-provisioner-xxxxx
# - csi-resizer-xxxxx
# - csi-snapshotter-xxxxx
# - engine-image-xxxxx
# - instance-manager-xxxxx (1 per node)

# Verify all pods running (should show 20+ pods)
kubectl get pods -n longhorn-system --no-headers | grep -c Running
```

### Step 3: Verify Longhorn Storage Class Created (1 minute)
```bash
# Check storage class
kubectl get storageclass

# Expected output:
# NAME                 PROVISIONER          RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION
# local-path (default) rancher.io/local-path Delete          WaitForFirstConsumer   false
# longhorn             driver.longhorn.io   Delete          Immediate              true

# Verify Longhorn is ready
kubectl get nodes.longhorn.io -n longhorn-system

# Expected output:
# NAME                      STATE   ALLOWSCHEDULING   SCHEDULABLE   AGE
# srv1089618.hstgr.cloud   ready   true              true          5m
# srv1089624.hstgr.cloud   ready   true              true          5m
# srv1092158.hstgr.cloud   ready   true              true          5m
# srv1117946.hstgr.cloud   ready   true              true          5m
```

### Step 4: Configure Longhorn Settings (5 minutes)
```bash
# Set replica count to 3 for high availability
kubectl patch settings.longhorn.io default-replica-count -n longhorn-system \
  --type merge -p '{"value":"3"}'

# Disable scheduling on worker node (keep data on control-plane)
kubectl label node srv1117946.hstgr.cloud node.longhorn.io/create-default-disk=false

# Verify settings
kubectl get settings.longhorn.io -n longhorn-system | grep replica
```

### Step 5: Access Longhorn UI (Optional - for monitoring)
```bash
# Port-forward to Longhorn UI
kubectl port-forward -n longhorn-system svc/longhorn-frontend 8080:80

# Open browser: http://localhost:8080
# Dashboard shows:
# - Node status
# - Volume health
# - Replica distribution
# - Storage capacity
```

---

## Phase 2: PostgreSQL Migration (2-3 hours)

### Step 1: Create PostgreSQL Backup Job (5 minutes)
```bash
# Create backup ConfigMap with script
kubectl create configmap -n backend-mainnet postgres-migration-backup \
  --from-literal=backup.sh='#!/bin/bash
set -e
PGPASSWORD=$POSTGRES_PASSWORD pg_dumpall -U gx_admin > /backup/postgres_migration_$(date +%Y%m%d_%H%M%S).sql
echo "Backup completed: $(ls -lh /backup/postgres_migration_*.sql)"
'

# Create backup job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: postgres-migration-backup
  namespace: backend-mainnet
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: backup
        image: postgres:15-alpine
        command: ["/bin/sh", "/scripts/backup.sh"]
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        volumeMounts:
        - name: backup-script
          mountPath: /scripts
        - name: backup-volume
          mountPath: /backup
      volumes:
      - name: backup-script
        configMap:
          name: postgres-migration-backup
          defaultMode: 0755
      - name: backup-volume
        hostPath:
          path: /tmp/postgres-backup
          type: DirectoryOrCreate
EOF

# Wait for backup completion
kubectl wait --for=condition=complete --timeout=600s job/postgres-migration-backup -n backend-mainnet

# Verify backup
kubectl logs job/postgres-migration-backup -n backend-mainnet
```

### Step 2: Create New StatefulSet with Longhorn Storage (10 minutes)
```bash
# Create new StatefulSet manifest
cat > /tmp/postgres-statefulset-longhorn.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-longhorn
  namespace: backend-mainnet
  labels:
    app: postgres
    storage: longhorn
spec:
  serviceName: postgres-headless
  replicas: 3
  selector:
    matchLabels:
      app: postgres
      storage: longhorn
  template:
    metadata:
      labels:
        app: postgres
        storage: longhorn
        component: database
        tier: infrastructure
    spec:
      affinity:
        # HARD requirement: Spread replicas across different nodes
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: postgres
                storage: longhorn
            topologyKey: kubernetes.io/hostname
        # HARD requirement: Only schedule on control-plane nodes
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists

      securityContext:
        fsGroup: 999
        runAsUser: 999
        runAsNonRoot: true

      containers:
      - name: postgres
        image: postgres:15-alpine
        imagePullPolicy: IfNotPresent

        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: POSTGRES_DB
          value: gx_protocol
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        - name: POSTGRES_INITDB_ARGS
          value: "--encoding=UTF8 --locale=en_US.UTF-8"

        ports:
        - name: postgres
          containerPort: 5432
          protocol: TCP

        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        - name: postgres-config
          mountPath: /etc/postgresql/postgresql.conf
          subPath: postgresql.conf
          readOnly: true
        - name: postgres-config
          mountPath: /etc/postgresql/pg_hba.conf
          subPath: pg_hba.conf
          readOnly: true

        resources:
          requests:
            cpu: 1000m
            memory: 2Gi
          limits:
            cpu: 2000m
            memory: 4Gi

        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3

      volumes:
      - name: postgres-config
        configMap:
          name: postgres-config

  volumeClaimTemplates:
  - metadata:
      name: postgres-data
      labels:
        app: postgres
        storage: longhorn
    spec:
      accessModes:
      - ReadWriteOnce
      storageClassName: longhorn  # CHANGED FROM local-path
      resources:
        requests:
          storage: 100Gi
EOF

# Apply new StatefulSet
kubectl apply -f /tmp/postgres-statefulset-longhorn.yaml
```

### Step 3: Wait for New Pods to Start (15-20 minutes)
```bash
# Monitor pod creation (Longhorn will provision volumes on-demand)
watch -n 5 'kubectl get pods -n backend-mainnet -l storage=longhorn -o wide'

# Expected progression:
# postgres-longhorn-0: Pending → Running (5-7 minutes)
# postgres-longhorn-1: Pending → Running (5-7 minutes)
# postgres-longhorn-2: Pending → Running (5-7 minutes)

# Verify all 3 pods running
kubectl get pods -n backend-mainnet -l storage=longhorn

# Verify pod distribution
kubectl get pods -n backend-mainnet -l storage=longhorn -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName

# Expected output (1 pod per control-plane node):
# NAME                   NODE
# postgres-longhorn-0   srv1089618.hstgr.cloud
# postgres-longhorn-1   srv1089624.hstgr.cloud
# postgres-longhorn-2   srv1092158.hstgr.cloud
```

### Step 4: Verify Longhorn Volume Replication (5 minutes)
```bash
# Check Longhorn volumes created
kubectl get volumes.longhorn.io -n longhorn-system

# Expected output (3 volumes):
# NAME                                       STATE      ROBUSTNESS   SCHEDULED   SIZE
# pvc-xxxxx-postgres-data-postgres-longhorn-0   attached   healthy      True        100Gi
# pvc-xxxxx-postgres-data-postgres-longhorn-1   attached   healthy      True        100Gi
# pvc-xxxxx-postgres-data-postgres-longhorn-2   attached   healthy      True        100Gi

# Check replica distribution for each volume
kubectl get replicas.longhorn.io -n longhorn-system

# Each volume should have 3 replicas spread across 3 nodes
```

### Step 5: Restore PostgreSQL Data (30-45 minutes)
```bash
# Copy backup into new postgres-longhorn-0 pod
BACKUP_FILE=$(ls -t /tmp/postgres_full_backup_*.sql | head -1)
kubectl cp $BACKUP_FILE backend-mainnet/postgres-longhorn-0:/tmp/restore.sql

# Restore database
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d postgres -f /tmp/restore.sql'

# Verify data restoration
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c "\dt"'

# Expected output: List of all tables (User, Wallet, OutboxCommand, etc.)
```

### Step 6: Update Backend Services to Use New StatefulSet (10 minutes)
```bash
# Update backend-config ConfigMap to point to new service
kubectl patch configmap backend-config -n backend-mainnet --type merge -p '{
  "data": {
    "DATABASE_HOST": "postgres-longhorn-headless.backend-mainnet.svc.cluster.local"
  }
}'

# Rolling restart all services to pick up new config
kubectl rollout restart deployment -n backend-mainnet \
  svc-identity svc-tokenomics svc-organization svc-loanpool \
  svc-governance svc-admin svc-tax outbox-submitter projector

# Wait for all services to be ready
kubectl rollout status deployment -n backend-mainnet svc-identity
# ... (repeat for all services)
```

### Step 7: Verify Connectivity and Data Integrity (15 minutes)
```bash
# Test database connectivity from svc-identity
kubectl exec -n backend-mainnet deployment/svc-identity -- sh -c \
  'PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT COUNT(*) FROM \"User\";"'

# Expected output: (count of users)

# Verify all critical tables accessible
for table in User Wallet OutboxCommand ProjectorState; do
  echo "=== Checking $table ==="
  kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
    "PGPASSWORD=\$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c 'SELECT COUNT(*) FROM \"$table\";'"
done
```

### Step 8: Scale Down Old StatefulSet (5 minutes)
```bash
# Scale old StatefulSet to 0 (keep PVCs for now)
kubectl scale statefulset postgres -n backend-mainnet --replicas=0

# Wait for all old pods to terminate
kubectl wait --for=delete pod/postgres-0 pod/postgres-1 pod/postgres-2 \
  -n backend-mainnet --timeout=120s

# Verify only new pods running
kubectl get pods -n backend-mainnet -l app=postgres
```

### Step 9: Cleanup Old Resources (After 24h Testing Period)
```bash
# DANGER: Only run after confirming new setup stable for 24+ hours

# Delete old StatefulSet
kubectl delete statefulset postgres -n backend-mainnet

# Delete old PVCs (PERMANENT DATA LOSS)
kubectl delete pvc postgres-data-postgres-0 -n backend-mainnet
kubectl delete pvc postgres-data-postgres-1 -n backend-mainnet
kubectl delete pvc postgres-data-postgres-2 -n backend-mainnet

# Verify old PVs removed
kubectl get pv | grep postgres
```

---

## Phase 3: Redis Migration (1-2 hours)

### Step 1: Create Redis Backup (5 minutes)
```bash
# Trigger Redis save
kubectl exec -n backend-mainnet redis-0 -- redis-cli SAVE

# Wait for save completion
kubectl exec -n backend-mainnet redis-0 -- redis-cli LASTSAVE

# Copy RDB file
kubectl cp backend-mainnet/redis-0:/data/dump.rdb \
  /tmp/redis_migration_backup_$(date +%Y%m%d_%H%M%S).rdb

# Verify backup
ls -lh /tmp/redis_migration_backup_*.rdb
```

### Step 2: Create New Redis StatefulSet with Longhorn (10 minutes)
```bash
cat > /tmp/redis-statefulset-longhorn.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-longhorn
  namespace: backend-mainnet
  labels:
    app: redis
    storage: longhorn
spec:
  serviceName: redis-headless
  replicas: 3
  selector:
    matchLabels:
      app: redis
      storage: longhorn
  template:
    metadata:
      labels:
        app: redis
        storage: longhorn
        component: cache
        tier: infrastructure
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: redis
                storage: longhorn
            topologyKey: kubernetes.io/hostname
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists

      securityContext:
        fsGroup: 999
        runAsUser: 999
        runAsNonRoot: true

      containers:
      - name: redis
        image: redis:7-alpine
        imagePullPolicy: IfNotPresent

        command:
        - redis-server
        - /etc/redis/redis.conf

        ports:
        - name: redis
          containerPort: 6379
          protocol: TCP

        volumeMounts:
        - name: redis-data
          mountPath: /data
        - name: redis-config
          mountPath: /etc/redis
          readOnly: true

        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 2Gi

        livenessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3

      volumes:
      - name: redis-config
        configMap:
          name: redis-config

  volumeClaimTemplates:
  - metadata:
      name: redis-data
      labels:
        app: redis
        storage: longhorn
    spec:
      accessModes:
      - ReadWriteOnce
      storageClassName: longhorn
      resources:
        requests:
          storage: 20Gi
EOF

kubectl apply -f /tmp/redis-statefulset-longhorn.yaml
```

### Step 3: Wait for Redis Pods and Restore Data (20 minutes)
```bash
# Monitor pod creation
watch -n 5 'kubectl get pods -n backend-mainnet -l storage=longhorn,app=redis -o wide'

# Wait for all 3 pods running
kubectl wait --for=condition=ready pod -l app=redis,storage=longhorn \
  -n backend-mainnet --timeout=600s

# Restore backup to redis-longhorn-0
REDIS_BACKUP=$(ls -t /tmp/redis_migration_backup_*.rdb | head -1)
kubectl cp $REDIS_BACKUP backend-mainnet/redis-longhorn-0:/data/dump.rdb

# Restart redis-longhorn-0 to load data
kubectl delete pod redis-longhorn-0 -n backend-mainnet

# Wait for pod ready
kubectl wait --for=condition=ready pod/redis-longhorn-0 -n backend-mainnet --timeout=120s

# Verify data loaded
kubectl exec -n backend-mainnet redis-longhorn-0 -- redis-cli DBSIZE
```

### Step 4: Update Backend Services (5 minutes)
```bash
# Update ConfigMap
kubectl patch configmap backend-config -n backend-mainnet --type merge -p '{
  "data": {
    "REDIS_HOST": "redis-longhorn-headless.backend-mainnet.svc.cluster.local"
  }
}'

# Rolling restart services
kubectl rollout restart deployment -n backend-mainnet \
  svc-identity svc-tokenomics svc-organization
```

### Step 5: Verify and Cleanup (10 minutes)
```bash
# Test Redis connectivity
kubectl exec -n backend-mainnet deployment/svc-identity -- sh -c \
  'redis-cli -h $REDIS_HOST PING'

# Expected output: PONG

# Scale down old Redis
kubectl scale statefulset redis -n backend-mainnet --replicas=0

# Cleanup after 24h testing
# kubectl delete statefulset redis -n backend-mainnet
# kubectl delete pvc redis-data-redis-0 redis-data-redis-1 redis-data-redis-2 -n backend-mainnet
```

---

## Phase 4: Verification and Testing (2-3 hours)

### Test 1: Pod Mobility (15 minutes)
```bash
# Simulate node failure by cordoning control-plane node
kubectl cordon srv1089618.hstgr.cloud

# Delete postgres pod on that node
kubectl delete pod postgres-longhorn-0 -n backend-mainnet

# Verify pod reschedules to different node
kubectl get pod postgres-longhorn-0 -n backend-mainnet -o wide

# Expected: Should start on srv1089624 or srv1092158

# Uncordon node
kubectl uncordon srv1089618.hstgr.cloud
```

### Test 2: Data Persistence (10 minutes)
```bash
# Insert test data
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c "CREATE TABLE migration_test (id SERIAL PRIMARY KEY, timestamp TIMESTAMP DEFAULT NOW());"'

kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c "INSERT INTO migration_test DEFAULT VALUES;"'

# Delete pod
kubectl delete pod postgres-longhorn-0 -n backend-mainnet

# Wait for pod ready
kubectl wait --for=condition=ready pod/postgres-longhorn-0 -n backend-mainnet --timeout=120s

# Verify data persists
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c "SELECT * FROM migration_test;"'

# Expected: Row with timestamp

# Cleanup test table
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c "DROP TABLE migration_test;"'
```

### Test 3: Replica Health (10 minutes)
```bash
# Check all Longhorn volumes healthy
kubectl get volumes.longhorn.io -n longhorn-system -o custom-columns=\
NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness,REPLICAS:.spec.numberOfReplicas

# Expected output (all volumes):
# STATE: attached
# ROBUSTNESS: healthy
# REPLICAS: 3

# Check replica distribution
kubectl get replicas.longhorn.io -n longhorn-system -o custom-columns=\
NAME:.metadata.name,NODE:.spec.nodeID,STATE:.status.currentState

# Expected: 3 replicas per volume, each on different node
```

### Test 4: API Integration (30 minutes)
```bash
# Test all critical API endpoints
BASE_URL="https://api.gxcoin.money"

# 1. Health check
curl -f $BASE_URL/api/v1/health

# 2. User registration
curl -X POST $BASE_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "migration_test_user",
    "email": "test@gxcoin.money",
    "password": "TestPass123!"
  }'

# 3. Login
TOKEN=$(curl -X POST $BASE_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@gxcoin.money",
    "password": "TestPass123!"
  }' | jq -r .token)

# 4. Get profile
curl -H "Authorization: Bearer $TOKEN" \
  $BASE_URL/api/v1/users/profile

# 5. Check wallet balance
curl -H "Authorization: Bearer $TOKEN" \
  $BASE_URL/api/v1/wallets/{userId}/balance
```

### Test 5: Performance Benchmarking (1-2 hours)
```bash
# Baseline PostgreSQL performance
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pgbench -U gx_admin -i gx_protocol'

kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pgbench -U gx_admin -c 10 -j 2 -t 1000 gx_protocol'

# Expected TPS: 500-1000 (acceptable for distributed storage)

# Redis performance
kubectl exec -n backend-mainnet redis-longhorn-0 -- redis-benchmark -q -n 10000

# Expected: 10000+ ops/sec
```

---

## Rollback Plan (If Issues Occur)

### Emergency Rollback to Local-Path Storage
```bash
# Step 1: Update ConfigMap back to old service
kubectl patch configmap backend-config -n backend-mainnet --type merge -p '{
  "data": {
    "DATABASE_HOST": "postgres-headless.backend-mainnet.svc.cluster.local",
    "REDIS_HOST": "redis-headless.backend-mainnet.svc.cluster.local"
  }
}'

# Step 2: Scale up old StatefulSets
kubectl scale statefulset postgres -n backend-mainnet --replicas=3
kubectl scale statefulset redis -n backend-mainnet --replicas=3

# Step 3: Wait for old pods ready
kubectl wait --for=condition=ready pod -l app=postgres \
  -n backend-mainnet --timeout=300s

# Step 4: Rolling restart services
kubectl rollout restart deployment -n backend-mainnet \
  svc-identity svc-tokenomics svc-organization

# Step 5: Verify services operational
kubectl get pods -n backend-mainnet

# Step 6: Scale down Longhorn StatefulSets
kubectl scale statefulset postgres-longhorn -n backend-mainnet --replicas=0
kubectl scale statefulset redis-longhorn -n backend-mainnet --replicas=0

# Step 7: Uninstall Longhorn (if necessary)
kubectl delete -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml
```

---

## Post-Migration Monitoring

### Daily Checks (First Week)
```bash
# Check Longhorn volume health
kubectl get volumes.longhorn.io -n longhorn-system | grep -v healthy

# Check replica status
kubectl get replicas.longhorn.io -n longhorn-system | grep -v running

# Check pod distribution
kubectl get pods -n backend-mainnet -o wide -l storage=longhorn

# Check database connectivity
kubectl exec -n backend-mainnet deployment/svc-identity -- sh -c \
  'PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USER -d $DATABASE_NAME -c "SELECT 1;"'
```

### Performance Monitoring
```bash
# Longhorn metrics (if Prometheus enabled)
# - longhorn_volume_actual_size_bytes
# - longhorn_volume_read_throughput
# - longhorn_volume_write_throughput
# - longhorn_volume_read_latency
# - longhorn_volume_write_latency

# PostgreSQL slow queries
kubectl exec -n backend-mainnet postgres-longhorn-0 -- sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U gx_admin -d gx_protocol -c \
  "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"'
```

---

## Success Criteria

### Migration Considered Successful When:
- ✅ All 3 PostgreSQL pods running on different control-plane nodes
- ✅ All 3 Redis pods running on different control-plane nodes
- ✅ Each Longhorn volume has 3 healthy replicas
- ✅ All backend services connecting successfully to databases
- ✅ API endpoints responding correctly
- ✅ No data loss (verified via test queries)
- ✅ Performance acceptable (TPS within 80% of baseline)
- ✅ Pod mobility verified (can reschedule to any node)
- ✅ No errors in application logs for 24 hours

### Key Metrics After Migration:
| Metric | Before (local-path) | After (Longhorn) | Target |
|--------|---------------------|------------------|---------|
| PostgreSQL TPS | ~2000 | ~1500-1800 | >1500 |
| Redis ops/sec | ~50000 | ~40000-45000 | >30000 |
| Pod distribution | 2/3 on single node | 1/3 per node | Even |
| Data replication | None | 3x replicas | 3x |
| Failover time | Manual (hours) | Automatic (minutes) | <5 min |
| Storage capacity | 300Gi (fixed) | 300Gi (expandable) | Expandable |

---

## Cost-Benefit Analysis

### Storage Overhead:
- **Before:** 300Gi total (100Gi PostgreSQL × 3 local PVs)
- **After:** 900Gi total (300Gi × 3 replicas via Longhorn)
- **Additional Cost:** 600Gi (~$60/month at $0.10/GB/month)

### Performance Trade-off:
- **Latency:** +2-5ms (network replication overhead)
- **Throughput:** -10-20% (acceptable for HA benefits)

### Operational Benefits:
- **Downtime Reduction:** 99.9% → 99.99% uptime
- **Recovery Time:** Hours → Minutes
- **Manual Intervention:** Required → Automatic

### Return on Investment:
- **Cost:** ~$60/month storage + 2 days implementation
- **Benefit:** Eliminate single point of failure worth $10K+ business loss
- **ROI:** Positive within first month

---

## Timeline Summary

| Phase | Duration | Critical Path |
|-------|----------|---------------|
| Phase 1: Longhorn Installation | 30 min | No downtime |
| Phase 2: PostgreSQL Migration | 2-3 hours | ~10 min downtime during cutover |
| Phase 3: Redis Migration | 1-2 hours | ~5 min downtime during cutover |
| Phase 4: Verification | 2-3 hours | No downtime |
| **Total** | **6-9 hours** | **~15 min total downtime** |

**Recommended Schedule:**
- **Day 1 (Morning):** Phase 1 (Longhorn installation)
- **Day 1 (Afternoon):** Phase 2 (PostgreSQL migration)
- **Day 2 (Morning):** Phase 3 (Redis migration)
- **Day 2 (Afternoon):** Phase 4 (Testing and verification)

---

## Next Steps

1. **Review this plan** with team and get approval
2. **Schedule maintenance window** (recommend weekend for safety)
3. **Verify backups** of all critical data
4. **Install open-iscsi** on all control-plane nodes
5. **Execute Phase 1** (Longhorn installation)
6. **Monitor for 24 hours** before proceeding to Phase 2
7. **Execute Phases 2-4** during scheduled window
8. **Monitor for 1 week** before cleanup of old resources

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Next Review:** After Phase 1 completion
**Owner:** Backend Infrastructure Team
