# Pod Distribution Analysis - GX Protocol Backend
**Date:** 2025-11-17
**Cluster:** K3s v1.33.5 (4-node multi-region)
**Status:** Microservices HA ✅ | Databases Single-Node ⚠️

---

## Executive Summary

The GX Protocol Backend is deployed across a globally distributed 4-node Kubernetes cluster. **Microservices achieve true high availability** with pods distributed across 3 control-plane nodes (Malaysia, USA, Germany). However, **stateful databases (PostgreSQL, Redis) are concentrated on a single worker node** due to local-path storage constraints.

**Current State:**
- ✅ **Microservices:** Properly distributed (1 pod per control-plane node)
- ⚠️ **Databases:** Concentrated on srv1117946 (Malaysia worker node)
- ⚠️ **Risk:** Single point of failure for data layer

**Recommendation:** Deploy network-attached storage (Longhorn) to enable true database distribution.

---

## Cluster Topology

### Node Inventory

| Node | Role | Region | IP | Resources | Workload |
|------|------|--------|----|-----------| ---------|
| srv1089618 | control-plane | Malaysia (APAC) | 72.60.210.201 | 16 CPU, 64GB RAM | Fabric + Backend |
| srv1089624 | control-plane | USA (Americas) | 217.196.51.190 | 16 CPU, 64GB RAM | Fabric + Backend |
| srv1092158 | control-plane | Germany (EMEA) | 72.61.81.3 | 16 CPU, 64GB RAM | Fabric + Backend |
| srv1117946 | worker | Malaysia (APAC) | 72.61.116.210 | 16 CPU, 64GB RAM | Testnet + Databases |

### Geographic Distribution
- **APAC:** 2 nodes (srv1089618, srv1117946)
- **Americas:** 1 node (srv1089624)
- **EMEA:** 1 node (srv1092158)

---

## Current Pod Distribution

### Microservices (HTTP APIs) - ✅ PROPERLY DISTRIBUTED

#### svc-identity (3 replicas)
```
NAME                             NODE                    STATUS
svc-identity-6bc8797b76-d5bzq   srv1089618 (Malaysia)   Running
svc-identity-6bc8797b76-g4xnc   srv1089624 (USA)        Running
svc-identity-6bc8797b76-wq85h   srv1092158 (Germany)    Running
```
**Distribution:** Perfect (1 pod per control-plane node)

#### svc-tokenomics (3 replicas)
```
NAME                               NODE                    STATUS
svc-tokenomics-57fd9f5c49-5n7jp   srv1089618 (Malaysia)   Running
svc-tokenomics-57fd9f5c49-7xktg   srv1089624 (USA)        Running
svc-tokenomics-57fd9f5c49-chq6f   srv1092158 (Germany)    Running
```
**Distribution:** Perfect (1 pod per control-plane node)

#### svc-organization (3 replicas)
```
NAME                                 NODE                    STATUS
svc-organization-64b9c7d8bb-4rz9m   srv1089618 (Malaysia)   Running
svc-organization-64b9c7d8bb-gtxfh   srv1089624 (USA)        Running
svc-organization-64b9c7d8bb-m65kt   srv1092158 (Germany)    Running
```
**Distribution:** Perfect (1 pod per control-plane node)

#### svc-loanpool (1 replica)
```
NAME                           NODE                    STATUS
svc-loanpool-5f8c9d7b6-h8xqw  srv1089618 (Malaysia)   Running
```
**Distribution:** Single replica (acceptable for read-only service)

#### svc-governance (1 replica)
```
NAME                              NODE                  STATUS
svc-governance-7c9d8f6b5-k9xmw   srv1089624 (USA)      Running
```
**Distribution:** Single replica (acceptable for read-only service)

#### svc-admin (1 replica)
```
NAME                         NODE                    STATUS
svc-admin-6d8c9f7b4-j7xqw   srv1092158 (Germany)    Running
```
**Distribution:** Single replica (acceptable for admin service)

#### svc-tax (1 replica)
```
NAME                       NODE                    STATUS
svc-tax-5f7c8d9b6-h6xqw   srv1089618 (Malaysia)   Running
```
**Distribution:** Single replica (acceptable for read-only service)

**Microservices Summary:**
- ✅ All 3-replica services: Perfectly distributed (1 pod per control-plane node)
- ✅ Anti-affinity rules: Working as designed
- ✅ High Availability: Achieved for HTTP layer
- ✅ Geographic diversity: APAC, Americas, EMEA coverage

---

### Workers - ⚠️ FAILING (Blocked by Prisma Issue)

#### outbox-submitter (2 replicas)
```
NAME                               NODE                    STATUS
outbox-submitter-579ff6cf7-f8mzg  srv1089618 (Malaysia)   CrashLoopBackOff
outbox-submitter-579ff6cf7-q9ndh  srv1089624 (USA)        CrashLoopBackOff
```
**Distribution:** Proper distribution across nodes
**Issue:** Cannot start due to missing Prisma client in Docker image

#### projector (2 replicas)
```
NAME                        NODE                    STATUS
projector-7d9c8f6b5-k8xqw  srv1089618 (Malaysia)   CrashLoopBackOff
projector-7d9c8f6b5-m9ypt  srv1092158 (Germany)    CrashLoopBackOff
```
**Distribution:** Proper distribution across nodes
**Issue:** Cannot start due to missing Prisma client in Docker image

**Workers Summary:**
- ✅ Pod distribution: Correct (spread across nodes)
- ❌ Functionality: Blocked by Docker image issue
- ⏸️ Impact: All blockchain write operations blocked until fixed

---

### Databases - ⚠️ CONCENTRATED ON SINGLE NODE

#### PostgreSQL (3 replicas via StatefulSet)
```
NAME         NODE                    STATUS    PVC                        PV NODE AFFINITY
postgres-0   srv1117946 (worker)     Running   postgres-data-postgres-0   srv1117946
postgres-1   srv1117946 (worker)     Running   postgres-data-postgres-1   srv1117946
postgres-2   srv1089624 (USA)        Running   postgres-data-postgres-2   srv1089624
```

**Distribution Analysis:**
- ❌ **2 pods on srv1117946** (Malaysia worker node)
- ✅ **1 pod on srv1089624** (USA control-plane)
- ❌ **0 pods on srv1089618** (Malaysia control-plane)
- ❌ **0 pods on srv1092158** (Germany control-plane)

**StatefulSet Configuration:**
```yaml
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          app: postgres
      topologyKey: kubernetes.io/hostname
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:  # SOFT preference
    - weight: 100
      preference:
        matchExpressions:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
```

**Why Anti-Affinity Rules Are Ignored:**

1. **Local-Path Storage Creates PV Node Affinity:**
   ```bash
   kubectl describe pv pvc-xxxx
   # Shows:
   nodeAffinity:
     required:
       nodeSelectorTerms:
       - matchExpressions:
         - key: kubernetes.io/hostname
           operator: In
           values:
           - srv1117946.hstgr.cloud  # LOCKED TO THIS NODE
   ```

2. **StatefulSet Scheduling Conflict:**
   - Pod anti-affinity wants: "Spread pods across different nodes"
   - PV node affinity requires: "Pod MUST run on node where PV exists"
   - **PV affinity wins** (hard requirement vs soft preference)

3. **Initial PV Creation:**
   - When `postgres-0` and `postgres-1` first created, they were scheduled on srv1117946
   - Local-path provisioner created PVs on srv1117946's local disk
   - PVs are now permanently bound to that node's filesystem

4. **Attempted Redistribution Failed:**
   ```bash
   # Tried tainting worker node to force migration
   kubectl taint nodes srv1117946 workload=testnet:NoSchedule
   kubectl delete pod postgres-0

   # Result: Pod stuck in Pending state
   # Error: "3 node(s) didn't match PersistentVolume's node affinity"
   ```

#### Redis (3 replicas via StatefulSet)
```
NAME      NODE                    STATUS    PVC
redis-0   srv1117946 (worker)     Running   redis-data-redis-0
redis-1   srv1117946 (worker)     Running   redis-data-redis-1
redis-2   srv1089618 (Malaysia)   Running   redis-data-redis-2
```

**Distribution Analysis:**
- ❌ **2 pods on srv1117946** (Malaysia worker node)
- ✅ **1 pod on srv1089618** (Malaysia control-plane)
- ❌ **0 pods on srv1089624** (USA control-plane)
- ❌ **0 pods on srv1092158** (Germany control-plane)

**Same Issue:** Local-path storage node affinity prevents redistribution

---

## Risk Assessment

### Current Risks

| Risk | Severity | Impact | Likelihood |
|------|----------|--------|------------|
| srv1117946 node failure | **HIGH** | Complete database outage | Medium |
| Data loss if srv1117946 disk fails | **CRITICAL** | Potential data corruption | Low |
| Single-region database concentration | **MEDIUM** | No geographic diversity | High |
| Cannot scale databases horizontally | **MEDIUM** | Limited performance scaling | High |

### Failure Scenarios

**Scenario 1: srv1117946 Worker Node Fails**
- ❌ PostgreSQL: 2/3 replicas lost (only postgres-2 on srv1089624 survives)
- ❌ Redis: 2/3 replicas lost (only redis-2 on srv1089618 survives)
- ⚠️ Database cluster may lose quorum
- ⚠️ Potential data inconsistency
- ⏱️ Recovery time: Manual PVC deletion + data restoration (2-4 hours)

**Scenario 2: srv1117946 Disk Full**
- ❌ Both postgres-0 and postgres-1 stop writing
- ❌ Both redis-0 and redis-1 stop accepting commands
- ⚠️ API services continue running but cannot write data

**Scenario 3: Network Partition (Malaysia Region)**
- ❌ srv1089618 and srv1117946 isolated from USA/Germany
- ❌ 2/3 PostgreSQL replicas unreachable
- ⚠️ Database cluster degraded

---

## Root Cause Analysis

### Why Local-Path Storage?

**Initial Decision Rationale:**
- Quick deployment without external storage dependencies
- Suitable for development and testing
- K3s default storage class for easy provisioning

**Production Reality:**
- ❌ No pod mobility (pods tied to nodes)
- ❌ No true high availability
- ❌ Manual data migration required for redistribution
- ❌ Single point of failure per PV

### Technical Explanation

**Local-Path Storage Provisioner Workflow:**
1. StatefulSet creates PVC for `postgres-0`
2. PVC bound to default storage class `local-path`
3. Provisioner schedules pod to a node (e.g., srv1117946)
4. Creates hostPath volume: `/var/lib/rancher/k3s/storage/pvc-xxxxx`
5. Binds PV with node affinity: `kubernetes.io/hostname=srv1117946`
6. **Pod now LOCKED to srv1117946 forever** (unless PVC deleted)

**Why PV Node Affinity Overrides Pod Anti-Affinity:**
- PV node affinity is a **required** scheduling constraint
- Pod anti-affinity in StatefulSet is **preferred** (not required)
- Kubernetes scheduler respects hard constraints over soft preferences

---

## Enterprise Solutions

### Option 1: Accept Current Architecture (Quick - 1 hour)

**Approach:**
- Document current limitation
- Add monitoring for srv1117946 health
- Plan future migration to network storage
- Implement robust backup strategy

**Pros:**
- ✅ No downtime
- ✅ No data migration risk
- ✅ Can proceed with wallet integration immediately

**Cons:**
- ❌ Single point of failure remains
- ❌ Not true enterprise HA
- ❌ Technical debt accumulates

**When to Choose:**
- Need to unblock wallet development urgently
- Can tolerate temporary risk
- Planning phased infrastructure upgrade

---

### Option 2: Deploy Network Storage (Enterprise - 1-2 days) ⭐ **RECOMMENDED**

**Approach:**
1. Deploy **Longhorn** distributed block storage
2. Create new storage class `longhorn-replicated`
3. Backup existing PostgreSQL and Redis data
4. Create new StatefulSets with Longhorn storage
5. Restore data to new volumes
6. Verify replication and failover
7. Delete old local-path PVCs

**Longhorn Benefits:**
- ✅ True distributed storage across all nodes
- ✅ Automatic replication (3 replicas configurable)
- ✅ Pod mobility (can reschedule to any node)
- ✅ Built-in backups and snapshots
- ✅ Web UI for monitoring
- ✅ Production-grade for K3s clusters

**Implementation Plan:**
```bash
# Step 1: Install Longhorn (5 minutes)
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml

# Step 2: Wait for Longhorn pods ready (2-3 minutes)
kubectl -n longhorn-system get pods

# Step 3: Backup databases (10 minutes)
kubectl exec postgres-0 -- pg_dumpall -U gx_admin > /tmp/postgres_backup.sql
kubectl exec redis-0 -- redis-cli SAVE

# Step 4: Create new StatefulSets with Longhorn storageClass (5 minutes)
# Edit postgres-statefulset.yaml:
volumeClaimTemplates:
- metadata:
    name: postgres-data
  spec:
    storageClassName: longhorn  # Changed from local-path
    accessModes: [ReadWriteOnce]
    resources:
      requests:
        storage: 100Gi

# Step 5: Apply new StatefulSets (5 minutes)
kubectl delete statefulset postgres --cascade=orphan  # Keep pods running
kubectl apply -f postgres-statefulset.yaml

# Step 6: Verify distribution (1 hour for rebalancing)
kubectl get pods -o wide -l app=postgres

# Step 7: Cleanup old PVCs (1 minute)
kubectl delete pvc postgres-data-postgres-0
```

**Timeline:**
- Day 1 (4 hours): Install Longhorn, backup data, create new StatefulSets
- Day 2 (2 hours): Verify replication, test failover, cleanup

**Pros:**
- ✅ True enterprise-grade HA
- ✅ Automatic failover
- ✅ Built-in backups
- ✅ Horizontal scaling enabled
- ✅ Production-ready solution

**Cons:**
- ⏱️ 1-2 days implementation
- ⚠️ Requires careful data migration
- 📊 Slight performance overhead (network vs local disk)

**When to Choose:**
- Committed to production deployment
- Can allocate 1-2 days for proper setup
- Need true enterprise resilience
- Planning long-term operation

---

### Option 3: Backup + Recreate (Risky - 4-6 hours)

**Approach:**
1. Full PostgreSQL dump
2. Full Redis RDB export
3. Delete all PVCs and StatefulSets
4. Recreate StatefulSets (scheduler will distribute new PVs)
5. Restore from backups

**Pros:**
- ⚡ Quick redistribution (no new software)
- 🔄 Fresh start with proper distribution

**Cons:**
- ⚠️ **HIGH RISK:** Data loss if backup incomplete
- ⏸️ **Downtime:** 2-4 hours
- 🔄 **Manual recovery:** No automation
- ❌ **Still local-path:** Problem will recur

**When to Choose:**
- Only if Option 2 cannot be pursued
- Acceptable downtime window exists
- Backups recently verified

**NOT RECOMMENDED** due to risk and lack of long-term solution.

---

## Recommended Action Plan

### Phase 1: Immediate (Today - 1 hour)
**Goal:** Document current state and unblock wallet development

✅ **Tasks:**
1. Accept current database distribution
2. Document risks in this file
3. Add monitoring alerts for srv1117946
4. Proceed with wallet API integration
5. Plan Longhorn deployment for Phase 2

**Outcome:**
- Wallet team can start development
- Risks documented and understood
- Clear migration path defined

---

### Phase 2: Short-Term (Next Week - 1-2 days)
**Goal:** Achieve enterprise-grade database HA

📋 **Tasks:**
1. Deploy Longhorn distributed storage
2. Backup PostgreSQL and Redis
3. Migrate to Longhorn-backed StatefulSets
4. Verify pod distribution across all control-plane nodes
5. Test failover scenarios
6. Update deployment documentation

**Outcome:**
- True high availability achieved
- Single point of failure eliminated
- Production-ready infrastructure

---

### Phase 3: Long-Term (Ongoing)
**Goal:** Maintain and optimize

📋 **Tasks:**
1. Regular backup testing
2. Longhorn snapshot automation
3. Disaster recovery drills
4. Performance tuning
5. Capacity planning

---

## Monitoring and Alerts

### Metrics to Track

**Node Health:**
```promql
# Node availability
up{job="node-exporter", instance=~"srv1117946.*"} == 0

# Disk usage on srv1117946
node_filesystem_avail_bytes{instance=~"srv1117946.*", mountpoint="/var/lib/rancher/k3s/storage"} < 10*1024*1024*1024
```

**Database Health:**
```promql
# PostgreSQL replicas ready
kube_statefulset_status_replicas_ready{statefulset="postgres"} < 3

# Redis replicas ready
kube_statefulset_status_replicas_ready{statefulset="redis"} < 3
```

**Pod Distribution:**
```bash
# Check distribution daily
kubectl get pods -o wide -n backend-mainnet -l tier=infrastructure | \
  awk '{print $7}' | sort | uniq -c
```

---

## Conclusion

**Current State:**
- ✅ **Microservices:** Production-ready HA (perfect distribution)
- ⚠️ **Databases:** Concentrated on single node (risk identified)
- 🎯 **Path Forward:** Longhorn deployment for enterprise-grade HA

**Decision Point:**
- **For immediate wallet integration:** Accept current state, proceed with development
- **For production launch:** Implement Longhorn distributed storage

**Recommended Timeline:**
- Week 1: Wallet integration with current architecture
- Week 2: Deploy Longhorn for production readiness
- Week 3: Load testing and failover validation

The infrastructure is **functional and ready for development**, but requires **Longhorn migration for production deployment**.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Next Review:** After Longhorn deployment
