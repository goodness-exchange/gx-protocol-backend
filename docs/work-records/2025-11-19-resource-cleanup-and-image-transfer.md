# Resource Cleanup and Image Transfer - Session 2025-11-19

**Date:** November 19, 2025
**Duration:** ~1 hour
**Objective:** Analyze server resources, clean up unnecessary pods, and transfer backend images to testnet server

## Resource Analysis Summary

### Server Resource Usage
| Server | CPU | RAM | Status |
|--------|-----|-----|--------|
| srv1089618 (Control-Plane) | 467m (5%) | 12917Mi (40%) | ✅ NORMAL - 32 pods running |
| srv1089624 (Control-Plane) | 481m (6%) | 4430Mi (13%) | ✅ NORMAL |
| srv1092158 (Control-Plane) | 315m (3%) | 3167Mi (9%) | ✅ NORMAL |
| srv1117946 (Testnet Worker) | 230m (2%) | 3640Mi (11%) | ✅ NORMAL |

**Finding:** srv1089618's 40% RAM usage is **NORMAL** - it's running 32 pods including mainnet backend services.

### Docker Images
- srv1089618: 237 images (many old versions retained for rollback capability)
- Image retention is acceptable for production environment

## Cleanup Actions

### 1. Completed/Failed Pods Deleted (11 total)
**backend-mainnet:**
- 7 completed backup pods (postgres-backup-*, redis-backup-*)
- 2 failed migration pods (prisma-migrate-*)

**backend-testnet:**
- 2 completed helper pods (image-exporter, image-transfer)

### 2. Backend-testnet Crash-looping Pods (11 scaled down)
All backend-testnet deployments scaled to 0 replicas:
- outbox-submitter (3 pods removed - ImagePullBackOff + CrashLoopBackOff)
- projector (1 pod removed)
- svc-admin (2 pods removed)
- svc-identity (2 pods removed)
- svc-tokenomics (2 pods removed)

**Reason:** Pods were crash-looping due to:
- Missing images on srv1117946 (ImagePullBackOff)
- Wrong nodeSelector (deployed on control-plane nodes instead of testnet server)
- Database authentication issues

### 3. Backend-mainnet Optimization
- Scaled down redis-sentinel deployment to 0 (was crashing with 797 restarts)
- **Note:** Redis sentinels not needed in current setup (using StatefulSet)

## Total Cleanup
- **22 pods removed** (11 completed/failed + 11 crash-looping)
- **126 old ReplicaSets deleted** (51 backend-testnet + 75 backend-mainnet)
- **1 deployment scaled down** (redis-sentinel with 797 crash restarts)
- **Freed resources:** Significant - removed 126 dormant replica sets

### ReplicaSet Cleanup Details
**Backend-testnet:** 51 old ReplicaSets removed
- outbox-submitter: 11 old versions
- projector: 12 old versions
- svc-admin: 8 old versions
- svc-identity: 10 old versions
- svc-tokenomics: 10 old versions

**Backend-mainnet:** 75 old ReplicaSets removed
- All services had 5-15 old ReplicaSets from previous deployments
- Kept only currently active ReplicaSets

## Image Transfer Plan

### Images to Transfer to srv1117946
```
docker.io/gx-protocol/svc-admin:2.0.14
docker.io/gx-protocol/svc-identity:2.0.14
docker.io/gx-protocol/svc-tokenomics:2.0.14
docker.io/gx-protocol/outbox-submitter:2.0.13
docker.io/gx-protocol/projector:2.0.11
```

### Transfer Method
1. Created helper pods on source (srv1092158) and destination (srv1117946)
2. Export images using `ctr images export` on source
3. Transfer via `kubectl cp` (source → local → destination)
4. Import using `ctr images import` on destination

### Helper Pods Created
- `img-src` on srv1092158.hstgr.cloud
- `img-dst` on srv1117946.hstgr.cloud

## Next Steps

1. ✅ Complete image transfer to srv1117946
2. ⏳ Update backend-testnet deployments with correct nodeSelector:
   ```yaml
   nodeSelector:
     kubernetes.io/hostname: srv1117946.hstgr.cloud
   ```
3. ⏳ Scale up backend-testnet deployments (1 replica each)
4. ⏳ Verify database connectivity on testnet server
5. ⏳ Execute bootstrap command

## Architecture Decision

**Confirmed:** backend-testnet should be deployed on **srv1117946 (testnet server)** alongside fabric-testnet for:
- Ultra-low latency (<1ms vs 50-200ms cross-node)
- Proper namespace isolation
- Simplified troubleshooting
- Consistent testnet environment

## Pod Distribution Issue Identified

**Current Problem:** Pods are not evenly distributed across control-plane nodes.

- srv1089618: 32 pods (42% RAM usage)
- srv1089624: ~15 pods (13% RAM usage)
- srv1092158: ~10 pods (9% RAM usage)
- srv1117946: fabric-testnet only (10% RAM usage)

**Root Cause:** No pod anti-affinity rules or topology spread constraints configured.

**Recommendation for Next Session:**
1. Add `topologySpreadConstraints` to backend-mainnet deployments
2. Distribute pods evenly across all 3 control-plane nodes
3. Keep backend-testnet isolated on srv1117946

## Status

- Resource analysis: ✅ Complete - srv1089618 RAM usage is NORMAL
- Pod cleanup: ✅ Complete - 22 pods + 126 ReplicaSets removed
- Redis-sentinel: ✅ Scaled down (was crash-looping)
- Image transfer: ⏳ Partial (1/5 started, timed out)
- Pod distribution: ❌ Needs topology spread constraints
- Backend-testnet deployment: ⏳ Pending for next session
- Bootstrap testing: ⏳ Pending for next session

## Next Session Tasks

1. Complete image transfer to srv1117946
2. Configure topology spread constraints for backend-mainnet
3. Deploy backend-testnet to srv1117946 with correct nodeSelector
4. Test database connectivity on testnet server
5. Execute bootstrap command and verify CQRS flow
