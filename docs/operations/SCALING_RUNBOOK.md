# Scaling Operations Runbook - Outbox Submitter Worker

**Version**: 2.0.16+
**Last Updated**: 2025-11-20
**Target Deployment**: `outbox-submitter` in `backend-mainnet` namespace

---

## Overview

This runbook provides step-by-step procedures for scaling the outbox-submitter worker deployment up or down. The outbox-submitter is a critical component that submits outbox commands to the Hyperledger Fabric blockchain using multi-identity ABAC (Attribute-Based Access Control).

**Key Characteristics**:
- Stateless worker (safe to scale horizontally)
- Each replica maintains 3 Fabric client connections
- Database row-level locking prevents duplicate command processing
- Geographic distribution across global cluster

---

## Scaling Prerequisites

### General Prerequisites (All Scaling Operations)

1. **Kubernetes Access**
   ```bash
   # Verify kubectl context
   kubectl config current-context
   # Should show K3s cluster context

   # Verify access to backend-mainnet namespace
   kubectl get deployments -n backend-mainnet
   ```

2. **Current Deployment Status**
   ```bash
   kubectl get deployment outbox-submitter -n backend-mainnet
   ```

   **Expected Output**:
   ```
   NAME               READY   UP-TO-DATE   AVAILABLE   AGE
   outbox-submitter   2/2     2            2           Xd
   ```

3. **Database Health**
   ```bash
   kubectl get statefulset postgres -n backend-mainnet
   ```

   **Expected**: `3/3` replicas ready

4. **Fabric Network Health**
   ```bash
   kubectl get pods -n fabric | grep -E "(orderer|peer)" | grep -v Running
   ```

   **Expected**: No output (all pods Running)

### Scale-Up Specific Prerequisites

**Critical Requirement**: Container image must be present on all nodes where new pods may be scheduled.

**Image Availability Check**:
```bash
# Check current image version
CURRENT_IMAGE=$(kubectl get deployment outbox-submitter -n backend-mainnet -o jsonpath='{.spec.template.spec.containers[0].image}')
echo "Current image: $CURRENT_IMAGE"

# Extract version tag
VERSION=$(echo $CURRENT_IMAGE | cut -d: -f2)

# Verify image on all control-plane nodes
for node in srv1089618 srv1089624 srv1092158; do
  echo "=== Checking $node ==="
  NODE_IP=$(kubectl get node ${node}.hstgr.cloud -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}')
  ssh root@$NODE_IP "k3s ctr images ls | grep outbox-submitter:$VERSION" || echo "❌ Image NOT found on $node"
done
```

**If image missing on any node**, follow image distribution procedure in HA_DEPLOYMENT_GUIDE.md before scaling up.

---

## Scaling Up (Increasing Replicas)

### Use Cases

- **Increased Transaction Volume**: Outbox table growing faster than current processing rate
- **Geographic Distribution**: Add replicas in additional regions for lower latency
- **High Availability**: Increase fault tolerance beyond 2 replicas

### Decision Criteria

**Scale up when**:
- Outbox table has consistently >100 pending commands
- Command processing lag exceeds 5 seconds
- Planned maintenance requires draining a node
- New geographic region added to cluster

**Do NOT scale up if**:
- Blockchain network is the bottleneck (check peer CPU/memory)
- Database is the bottleneck (check PostgreSQL connections)
- Image not available on all nodes

### Procedure

#### Step 1: Verify Prerequisites

Run all checks from "Scale-Up Specific Prerequisites" section above.

#### Step 2: Determine Target Replica Count

**Current Recommendation**: 2-3 replicas for production workload

**Calculation**:
```
Target Replicas = min(
  Number of control-plane nodes,
  Ceiling(Avg Commands per Second / 100)
)
```

**Example**:
- 3 control-plane nodes
- 150 commands/sec average
- Target: min(3, ceil(150/100)) = min(3, 2) = **2 replicas** (current)
- For 250 commands/sec: min(3, 3) = **3 replicas**

#### Step 3: Execute Scaling Command

```bash
# Scale to desired number of replicas
kubectl scale deployment outbox-submitter --replicas=3 -n backend-mainnet
```

**Expected Output**:
```
deployment.apps/outbox-submitter scaled
```

#### Step 4: Monitor Rollout

```bash
# Watch pod creation
kubectl get pods -n backend-mainnet -l app=outbox-submitter -w
```

**Expected Sequence**:
1. New pod appears with `ContainerCreating` status
2. Image pulled (if not cached on node)
3. Pod status changes to `Running`
4. Pod becomes `Ready` (1/1)

**Typical Timeline**:
- Image cached: 2-5 seconds to Ready
- Image pull required: 20-40 seconds to Ready

#### Step 5: Verify Pod Distribution

```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter -o wide
```

**Verify**:
- Each pod on different node (ideal)
- No pods in `ImagePullBackOff` status
- All pods show `1/1` Ready

**Example Output** (3 replicas):
```
NAME                               READY   STATUS    NODE
outbox-submitter-XXXXXXXXXX-aaaaa   1/1     Running   srv1089618.hstgr.cloud
outbox-submitter-XXXXXXXXXX-bbbbb   1/1     Running   srv1089624.hstgr.cloud
outbox-submitter-XXXXXXXXXX-ccccc   1/1     Running   srv1092158.hstgr.cloud
```

#### Step 6: Verify Fabric Client Initialization

**Check each new pod's logs**:
```bash
# Get newly created pod name
NEW_POD=$(kubectl get pods -n backend-mainnet -l app=outbox-submitter --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')

# Check initialization logs
kubectl logs -n backend-mainnet $NEW_POD --tail=50
```

**Expected Output**:
```json
{"message":"Initializing Fabric clients for all identities","identities":[...]}
{"message":"Successfully connected Fabric client for org1-super-admin"}
{"message":"Successfully connected Fabric client for org1-admin"}
{"message":"Successfully connected Fabric client for org1-partner-api"}
{"message":"All Fabric clients initialized successfully","count":3}
{"message":"Outbox submitter worker started successfully"}
```

#### Step 7: Monitor Command Processing Distribution

**Check that new pod is processing commands**:
```bash
# Wait 30 seconds for pod to start polling
sleep 30

# Check recent command processing across all pods
kubectl logs -n backend-mainnet -l app=outbox-submitter --since=1m | grep "Processing command"
```

**Expected**: Commands distributed across all pod names

#### Step 8: Verify Metrics

**Check Prometheus metrics for all replicas**:
```bash
# Port-forward to each pod and check metrics endpoint
for POD in $(kubectl get pods -n backend-mainnet -l app=outbox-submitter -o jsonpath='{.items[*].metadata.name}'); do
  echo "=== $POD ==="
  kubectl exec -n backend-mainnet $POD -- wget -qO- http://localhost:9090/metrics | grep -E "(outbox_submitter|fabric_client)"
done
```

### Troubleshooting Scale-Up Issues

#### Issue: Pod Stuck in ImagePullBackOff

**Symptoms**:
```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter
# Shows: ImagePullBackOff or ErrImagePull
```

**Root Cause**: Image not available on scheduled node

**Resolution**:

Option A - Import image on the node:
```bash
# Identify the problem node
PROBLEM_NODE=$(kubectl get pods -n backend-mainnet -l app=outbox-submitter -o jsonpath='{.items[?(@.status.phase=="Pending")].spec.nodeName}')
echo "Problem node: $PROBLEM_NODE"

# Get node IP
NODE_IP=$(kubectl get node $PROBLEM_NODE -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}')

# Transfer and import image (see HA_DEPLOYMENT_GUIDE.md for full procedure)
VERSION=$(kubectl get deployment outbox-submitter -n backend-mainnet -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)

# Transfer
scp /tmp/outbox-submitter-${VERSION}.tar.gz root@$NODE_IP:/tmp/

# Import
ssh root@$NODE_IP "gunzip < /tmp/outbox-submitter-${VERSION}.tar.gz | k3s ctr images import -"

# Delete and recreate pod
kubectl delete pod -n backend-mainnet -l app=outbox-submitter,status.phase=Pending
```

Option B - Apply node affinity to exclude problem node:
```bash
# List nodes WITH image
kubectl get nodes -o wide

# Create affinity patch to exclude problem node
kubectl patch deployment outbox-submitter -n backend-mainnet --type=json -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/affinity",
    "value": {
      "nodeAffinity": {
        "requiredDuringSchedulingIgnoredDuringExecution": {
          "nodeSelectorTerms": [{
            "matchExpressions": [{
              "key": "kubernetes.io/hostname",
              "operator": "NotIn",
              "values": ["'$PROBLEM_NODE'"]
            }]
          }]
        }
      }
    }
  }
]'
```

#### Issue: Pod Running but Fabric Clients Not Initializing

**Symptoms**:
```bash
kubectl logs -n backend-mainnet $POD
# Shows: Error connecting to Fabric network
```

**Diagnostic Steps**:

1. **Check ConfigMap mount**:
   ```bash
   kubectl exec -n backend-mainnet $POD -- ls -la /fabric-wallet/
   ```

   **Expected**: 7 files (ca-cert + 6 identity cert/key pairs)

2. **Check Fabric network connectivity**:
   ```bash
   kubectl exec -n backend-mainnet $POD -- wget -qO- http://peer0-org1.fabric.svc.cluster.local:7051
   ```

   **Expected**: Connection succeeds (even if HTTP error)

3. **Check certificate validity**:
   ```bash
   kubectl exec -n backend-mainnet $POD -- sh -c 'openssl x509 -in /fabric-wallet/org1-super-admin-cert -text -noout | grep "Not After"'
   ```

   **Expected**: Expiry date in future

**Resolution**: See TROUBLESHOOTING_FABRIC_CLIENT.md for detailed fabric client debugging

#### Issue: Database Connection Pool Exhausted

**Symptoms**:
```bash
kubectl logs -n backend-mainnet $POD | grep "connection pool"
# Shows: "Connection pool exhausted" or "Too many clients"
```

**Root Cause**: Total connections (replicas × pool_size) exceeds PostgreSQL max_connections

**Resolution**:

1. **Check current PostgreSQL connections**:
   ```bash
   kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "SELECT count(*) FROM pg_stat_activity;"
   ```

2. **Check max_connections limit**:
   ```bash
   kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "SHOW max_connections;"
   ```

3. **Adjust connection pool size per replica**:
   ```bash
   # If 3 replicas and max_connections=100, set pool_size=30 per replica
   kubectl set env deployment/outbox-submitter DATABASE_POOL_SIZE=30 -n backend-mainnet
   ```

---

## Scaling Down (Decreasing Replicas)

### Use Cases

- **Reduced Transaction Volume**: Outbox queue consistently empty
- **Cost Optimization**: Reduce resource consumption during off-peak
- **Maintenance**: Drain node for maintenance

### Decision Criteria

**Scale down when**:
- Outbox table consistently empty (<10 pending commands)
- Command processing lag under 1 second
- Resource utilization low (<20% CPU across all pods)

**Do NOT scale down if**:
- Only 1 replica remaining (minimum for availability)
- Recent spike in transaction volume
- Planned high-traffic event upcoming

### Procedure

#### Step 1: Verify Safe to Scale Down

**Check current outbox queue depth**:
```bash
kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "SELECT COUNT(*) FROM outbox_commands WHERE status = 'PENDING';"
```

**Expected**: <10 pending commands

**Check processing lag**:
```bash
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=100 | grep "Processing command" | tail -5
```

**Verify**: Recent logs show commands processed within seconds of creation

#### Step 2: Determine Target Replica Count

**Minimum Recommendation**: 2 replicas (for HA)

**Calculation**:
```
Target Replicas = max(
  2,  # Minimum for HA
  Ceiling(Peak Commands per Second / 100)
)
```

#### Step 3: Execute Scaling Command

```bash
# Scale down to desired number
kubectl scale deployment outbox-submitter --replicas=2 -n backend-mainnet
```

**Expected Output**:
```
deployment.apps/outbox-submitter scaled
```

#### Step 4: Monitor Pod Termination

```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter -w
```

**Expected Sequence**:
1. One pod receives `SIGTERM`
2. Pod enters `Terminating` state
3. Pod completes in-flight transactions
4. Pod removed from list

**Termination Timeline**: 5-30 seconds (depends on in-flight transactions)

#### Step 5: Verify Remaining Pods Continue Processing

**Check remaining pod logs**:
```bash
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=50 | grep -E "(Processing command|Fabric client)"
```

**Expected**: Remaining pods continue processing commands without interruption

#### Step 6: Monitor Queue Depth

**For next 15 minutes, check queue depth every 3 minutes**:
```bash
watch -n 180 'kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "SELECT COUNT(*) FROM outbox_commands WHERE status = '"'"'PENDING'"'"';"'
```

**Expected**: Queue depth remains low (<50)

**Action if queue grows**: Scale back up immediately

### Troubleshooting Scale-Down Issues

#### Issue: Pod Not Terminating (Stuck in Terminating State)

**Symptoms**:
```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter
# Shows pod in Terminating state for >5 minutes
```

**Diagnostic**:
```bash
# Check pod events
kubectl describe pod -n backend-mainnet $STUCK_POD
```

**Resolution**:

Option A - Wait for graceful shutdown (recommended):
```bash
# Check terminationGracePeriodSeconds
kubectl get deployment outbox-submitter -n backend-mainnet -o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}'
# Default: 30 seconds

# Wait for this duration before forcing
```

Option B - Force delete (CAUTION: may cause duplicate command processing):
```bash
# Only use if pod stuck for >10 minutes
kubectl delete pod $STUCK_POD -n backend-mainnet --force --grace-period=0
```

**Post-Force Delete Actions**:
1. Check database for duplicate transactions
2. Review blockchain for duplicate command submissions
3. Check remaining pods for errors

#### Issue: Remaining Pods Overwhelmed After Scale-Down

**Symptoms**:
- Queue depth increasing rapidly
- Pod CPU at 100%
- Processing lag increasing

**Immediate Resolution**:
```bash
# Scale back up immediately
kubectl scale deployment outbox-submitter --replicas=3 -n backend-mainnet

# Monitor recovery
kubectl get pods -n backend-mainnet -l app=outbox-submitter -w
```

**Root Cause Analysis**:
- Transaction volume higher than estimated
- Remaining pod(s) on slow node
- Database connection pool saturation

---

## Scaling to Zero (Emergency Shutdown)

### WARNING

⚠️ **Scaling to zero replicas will STOP all blockchain write operations system-wide.**

Use only in emergency situations:
- Critical security incident requiring immediate blockchain write freeze
- Database corruption requiring immediate isolation
- Fabric network complete failure

### Procedure

#### Step 1: Notify Stakeholders

**Before scaling to zero, notify**:
- Backend API teams (all write endpoints will fail)
- Operations team
- Incident commander (if applicable)

#### Step 2: Enable Read-Only Mode (Optional)

**If API services support read-only mode**:
```bash
# Set environment variable to reject write requests
kubectl set env deployment/svc-identity READ_ONLY=true -n backend-mainnet
kubectl set env deployment/svc-tokenomics READ_ONLY=true -n backend-mainnet
# ... (all API services)
```

#### Step 3: Scale to Zero

```bash
kubectl scale deployment outbox-submitter --replicas=0 -n backend-mainnet
```

#### Step 4: Verify Shutdown

```bash
kubectl get pods -n backend-mainnet -l app=outbox-submitter
```

**Expected**: `No resources found` or all pods in `Terminating`

#### Step 5: Monitor Outbox Queue

```bash
# Queue will grow during zero-replica period
watch 'kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "SELECT COUNT(*), status FROM outbox_commands GROUP BY status;"'
```

### Recovery from Zero Replicas

**When ready to resume operations**:

```bash
# Scale back to minimum HA configuration
kubectl scale deployment outbox-submitter --replicas=2 -n backend-mainnet

# Monitor startup
kubectl get pods -n backend-mainnet -l app=outbox-submitter -w

# Verify processing resumes
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=50
```

**Expect backlog processing**: If scaled to zero for extended period, outbox queue will have accumulated commands. Worker will process in FIFO order.

---

## Autoscaling Considerations

### Horizontal Pod Autoscaler (HPA) - NOT RECOMMENDED

**Why NOT recommended for outbox-submitter**:

1. **Database Locking Coordination**: HPA may scale too aggressively, creating pods faster than database can coordinate
2. **Connection Pool Management**: Rapid scaling can exhaust PostgreSQL connection limits
3. **Fabric Network Load**: Each pod creates 3 Fabric client connections; rapid scaling can overwhelm orderers
4. **Predictable Workload**: Transaction volume is generally predictable and business-driven

**Alternative**: Manual scaling based on business metrics and planned events

### If HPA Required (Advanced Configuration)

**Custom Metrics** (if implementing HPA):
- Metric: `outbox_queue_depth` (pending commands in database)
- Target: 50 pending commands per replica
- Scale-up threshold: >100 pending commands
- Scale-down threshold: <20 pending commands
- Cooldown period: 5 minutes (prevent flapping)

**Example HPA Configuration** (for reference only):
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: outbox-submitter
  namespace: backend-mainnet
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: outbox-submitter
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: External
    external:
      metric:
        name: outbox_queue_depth
      target:
        type: AverageValue
        averageValue: "50"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

**Prerequisites for HPA**:
- Prometheus metrics for queue depth
- Metrics server installed
- Custom metrics API adapter

---

## Monitoring and Alerting

### Key Metrics to Monitor

**1. Replica Count**
```promql
kube_deployment_status_replicas{deployment="outbox-submitter", namespace="backend-mainnet"}
```

**2. Queue Depth**
```sql
-- Run every 60 seconds
SELECT COUNT(*) FROM outbox_commands WHERE status = 'PENDING';
```

**3. Processing Lag**
```sql
-- Age of oldest pending command
SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) AS lag_seconds
FROM outbox_commands
WHERE status = 'PENDING'
ORDER BY created_at ASC
LIMIT 1;
```

**4. Fabric Client Health** (per pod)
```promql
fabric_client_connected{identity=~"org1-.*"} == 1
```

### Recommended Alerts

**Alert: Outbox Queue Growing**
```yaml
- alert: OutboxQueueGrowing
  expr: outbox_queue_depth > 200
  for: 5m
  annotations:
    summary: "Outbox queue has >200 pending commands"
    action: "Consider scaling outbox-submitter replicas"
```

**Alert: All Replicas Down**
```yaml
- alert: OutboxSubmitterDown
  expr: kube_deployment_status_replicas{deployment="outbox-submitter"} == 0
  for: 1m
  annotations:
    summary: "No outbox-submitter replicas running"
    severity: "critical"
    action: "Immediate intervention required - blockchain writes stopped"
```

**Alert: Processing Lag High**
```yaml
- alert: OutboxProcessingLagHigh
  expr: outbox_processing_lag_seconds > 60
  for: 3m
  annotations:
    summary: "Outbox processing lag >60 seconds"
    action: "Check Fabric network health and consider scaling"
```

---

## Capacity Planning

### Current Baseline (2 Replicas)

**Measured Performance**:
- **Throughput**: ~100-150 commands/second (combined)
- **Latency**: <2 seconds from outbox insert to Fabric submission
- **Resource Usage**:
  - CPU: ~200m per replica (20% of 1 core)
  - Memory: ~512Mi per replica
  - Fabric Connections: 3 per replica (6 total)

### Scaling Recommendations by Load

| Daily Transactions | Recommended Replicas | Rationale |
|--------------------|---------------------|-----------|
| <10,000 | 2 | Baseline HA configuration |
| 10,000 - 50,000 | 2 | Current capacity sufficient |
| 50,000 - 100,000 | 3 | Add 1 for peak handling |
| 100,000 - 200,000 | 4 | Geographic distribution + load |
| >200,000 | 5+ | Consider sharding or architecture review |

### Growth Planning

**Quarterly Review Checklist**:
1. Review average daily transaction count (last 90 days)
2. Identify peak transaction hours/days
3. Check outbox queue depth metrics during peaks
4. Review Fabric network capacity (orderer/peer resources)
5. Adjust replica count if needed (use table above)

**Scaling Event Examples**:
- **Product Launch**: Scale up 24 hours before, scale down 7 days after
- **Marketing Campaign**: Scale up during campaign period
- **Geographic Expansion**: Add 1 replica per new region
- **Regulatory Reporting**: Scale up during monthly/quarterly reporting cycles

---

## Common Scaling Scenarios

### Scenario 1: Planned Maintenance on Node

**Situation**: Node srv1089618 (Malaysia) requires OS updates

**Procedure**:
1. Verify 2+ replicas running on other nodes
2. Cordon node to prevent new pods:
   ```bash
   kubectl cordon srv1089618.hstgr.cloud
   ```
3. Delete pod on target node:
   ```bash
   kubectl delete pod -n backend-mainnet -l app=outbox-submitter --field-selector spec.nodeName=srv1089618.hstgr.cloud
   ```
4. Kubernetes creates replacement on available node
5. Perform maintenance
6. Uncordon node:
   ```bash
   kubectl uncordon srv1089618.hstgr.cloud
   ```

### Scenario 2: Geographic Expansion (New Region)

**Situation**: Adding new worker node in Sydney, Australia (APAC)

**Procedure**:
1. Ensure image available on new node (see HA_DEPLOYMENT_GUIDE.md)
2. Label new node for geographic awareness:
   ```bash
   kubectl label node sydney-worker-01 region=apac zone=sydney
   ```
3. Scale up by 1:
   ```bash
   kubectl scale deployment outbox-submitter --replicas=3 -n backend-mainnet
   ```
4. Verify pod scheduled on new node
5. Add pod anti-affinity to spread across regions (optional):
   ```yaml
   spec:
     template:
       spec:
         affinity:
           podAntiAffinity:
             preferredDuringSchedulingIgnoredDuringExecution:
             - weight: 100
               podAffinityTerm:
                 topologyKey: region
                 labelSelector:
                   matchLabels:
                     app: outbox-submitter
   ```

### Scenario 3: Black Friday / High Traffic Event

**Situation**: Expecting 10x normal transaction volume for 48 hours

**Before Event (T-24 hours)**:
1. Scale up to 4 replicas:
   ```bash
   kubectl scale deployment outbox-submitter --replicas=4 -n backend-mainnet
   ```
2. Verify all replicas healthy
3. Increase database connection pool limits
4. Set up enhanced monitoring

**During Event**:
- Monitor queue depth every 15 minutes
- Check processing lag
- Scale to 5 replicas if queue depth >500

**After Event (T+48 hours)**:
- Wait for queue to drain (<50 pending)
- Scale back to 2 replicas gradually (1 replica every 6 hours)

---

## Related Documentation

- **HA Deployment Guide**: `docs/operations/HA_DEPLOYMENT_GUIDE.md`
- **Troubleshooting Fabric Client**: `docs/troubleshooting/FABRIC_CLIENT.md`
- **Monitoring Guide**: `docs/observability/MONITORING.md`
- **Incident Response**: `docs/operations/INCIDENT_RESPONSE.md`

---

**Document Owner**: Backend Operations Team
**Review Cycle**: Quarterly
**Last Scaling Event**: 2025-11-20 (v2.0.16 deployment, scaled to 2 replicas)
