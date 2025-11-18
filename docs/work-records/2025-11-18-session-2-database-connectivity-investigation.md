# Session 2: Database Connectivity Investigation

**Date:** 2025-11-18  
**Duration:** ~2 hours  
**Status:** Blocked - Systemic network issue identified

## Objective
Resolve database connectivity for backend-testnet worker pods to enable bootstrap command execution.

## Investigation Summary

### Initial Hypothesis: Password URL Encoding
**Theory:** Special characters (+, =) in password causing Prisma connection failures  
**Action:** Changed password from complex to simple (`testnet123456`)  
**Result:** ❌ No change - same connectivity error

### Secondary Hypothesis: DNS Resolution  
**Theory:** DNS name resolving incorrectly  
**Discovery:** `getent hosts postgres-primary.backend-testnet.svc.cluster.local` returns `127.0.0.1`  
**Action:** Tested with direct IP addresses (service IP 10.43.200.221, pod IP 10.42.2.145)  
**Result:** ❌ Still failing with both IPs

### Tertiary Hypothesis: Image/Prisma Version
**Theory:** Worker image v2.0.13 has Prisma client issue  
**Action:** Rolled back to mainnet version v2.0.6  
**Result:** ❌ Same issue - rules out image-specific problem

### Critical Discovery
**ALL pods in backend-testnet namespace cannot connect to PostgreSQL**, including:
- Worker pods (outbox-submitter, projector)
- API services (svc-admin logs showing P1000 Prisma errors)

**BUT:** Fabric connectivity works perfectly from the same pods!

## Evidence

### Working: Fabric Connectivity
```json
{"level":"info","message":"Successfully connected to Fabric network"}
```
- Workers connect to `peer0-org1.fabric-testnet.svc.cluster.local:7051` ✅
- TLS handshake successful ✅
- gRPC communication functional ✅

### Failing: PostgreSQL Connectivity  
```json
{"level":"error","message":"Error processing batch","error":"Can't reach database server at `10.42.2.145:5432`"}
```
- Tried DNS name: ❌
- Tried service IP (10.43.200.221): ❌  
- Tried pod IP (10.42.2.145): ❌
- Prisma error P1000 across all services ❌

### PostgreSQL Validation
```bash
# PostgreSQL is listening and functional
kubectl exec postgres-0 -- netstat -tlnp | grep 5432
# tcp 0 0 0.0.0.0:5432 0.0.0.0:* LISTEN 1/postgres ✅

# Can connect locally
kubectl exec postgres-0 -- psql -U gx_admin -d gx_protocol -c "SELECT 1"
# ?column? = 1 ✅
```

### NetworkPolicy Configuration
```yaml
# allow-internal-backend policy
Spec:
  PodSelector: <none> (all pods)
  Allowing ingress: From PodSelector: <none> ✅
  Allowing egress:
    - To Port: 5432/TCP, To: PodSelector: <none> ✅
    - To Port: 7050-7054/TCP, To: fabric-testnet namespace ✅
```

### DNS Behavior Anomaly
```bash
# Direct kube-dns query works
nslookup postgres-primary.backend-testnet.svc.cluster.local 10.43.0.10
# Address: 10.43.200.221 ✅

# But getent hosts returns localhost
getent hosts postgres-primary.backend-testnet.svc.cluster.local  
# 127.0.0.1 postgres-primary... ❌
```

## Root Cause Hypothesis

Based on the evidence, this appears to be a **node-level networking issue** specific to srv1117946 (testnet worker node):

1. **NOT a password issue** - Simple password failed too
2. **NOT a DNS issue** - Direct IPs failed too  
3. **NOT an image issue** - Multiple versions failed
4. **NOT a NetworkPolicy issue** - Fabric works, policies allow 5432
5. **NOT a PostgreSQL issue** - Local connections work

**Likely causes:**
- CNI (Container Network Interface) plugin misconfiguration on srv1117946
- iptables rules blocking PostgreSQL traffic specifically
- Kernel networking stack issue
- Pod-to-pod routing problem within the node

**Why Fabric works but PostgreSQL doesn't:**
- Fabric peer is on a different node (cross-node communication uses different network path)
- PostgreSQL pod is on the same node (srv1117946) - intra-node routing may be broken

## Next Steps

### Option 1: Node Network Investigation
1. SSH to srv1117946 node
2. Check iptables rules: `sudo iptables -L -n -v`
3. Check CNI configuration: `/etc/cni/net.d/`
4. Test direct connection from node to pod: `curl telnet://10.42.2.145:5432`
5. Check kernel logs: `dmesg | grep -i network`

### Option 2: Alternative PostgreSQL Deployment
1. Deploy PostgreSQL on a different node using nodeSelector
2. Or use external PostgreSQL instance
3. Or investigate K3s-specific networking issues

### Option 3: Workaround
1. Use mainnet PostgreSQL temporarily for testnet testing
2. Cross-namespace database access

## Recommendations

Given time constraints, recommend **Option 3** (temporary workaround) to unblock API testing while investigating the node networking issue in parallel.

## Configuration Changes Made

```bash
# Password simplified
ALTER USER gx_admin WITH PASSWORD 'testnet123456';

# Secret updated  
kubectl patch secret backend-secrets -n backend-testnet \
  --type='json' -p='[{"op": "replace", "path": "/data/DATABASE_PASSWORD", "value": "dGVzdG5ldDEyMzQ1Ng=="}]'

# Tried multiple DATABASE_HOST values
- postgres-primary.backend-testnet.svc.cluster.local (DNS)
- 10.43.200.221 (service IP)
- 10.42.2.145 (pod IP)

# NetworkPolicy recreated
- default-deny-all
- allow-internal-backend (with Fabric ports)
```

## Time Spent
- Password troubleshooting: 30 min
- DNS investigation: 20 min  
- IP address testing: 15 min
- Image version testing: 10 min
- NetworkPolicy debugging: 45 min

**Total:** ~2 hours of focused investigation
