# Work Record - December 14, 2025

## Session: Full Backend Infrastructure Rebuild and Deployment

### Session Overview
- **Date:** December 14, 2025
- **Duration:** ~2 hours
- **Focus:** Complete rebuild and deployment of all backend Docker images after Docker cache cleanup

---

## Work Completed

### 1. Initial Assessment

Analyzed infrastructure state after Docker cache cleanup:
- All 4 K8s nodes Ready (control-plane,etcd,master)
- Fabric network fully operational (21 pods)
- Some backend services degraded due to missing images

### 2. Backend Docker Images Built (v2.1.0)

Built all 9 backend service images from source:

| Service | Image Tag | Size |
|---------|-----------|------|
| svc-identity | gx-protocol/svc-identity:2.1.0 | 490MB |
| svc-tokenomics | gx-protocol/svc-tokenomics:2.1.0 | 421MB |
| svc-organization | gx-protocol/svc-organization:2.1.0 | 346MB |
| svc-loanpool | gx-protocol/svc-loanpool:2.1.0 | 346MB |
| svc-governance | gx-protocol/svc-governance:2.1.0 | 346MB |
| svc-admin | gx-protocol/svc-admin:2.1.0 | 421MB |
| svc-tax | gx-protocol/svc-tax:2.1.0 | 480MB |
| projector | gx-protocol/projector:2.1.0 | 421MB |
| outbox-submitter | gx-protocol/outbox-submitter:2.1.0 | 421MB |

**Total compressed archive:** 3.1GB

### 3. Image Distribution to All Nodes

Transferred and imported images to all K8s nodes:

| Node | Hostname | IP | Status |
|------|----------|-----|--------|
| VPS-1 | srv1089618.hstgr.cloud | 72.60.210.201 | Imported |
| VPS-2 | srv1089624.hstgr.cloud | 217.196.51.190 | Imported |
| VPS-3 | srv1092158.hstgr.cloud | 72.61.81.3 | Imported |
| VPS-4 | srv1117946.hstgr.cloud | 72.61.116.210 | Imported |

### 4. Prometheus PVC Fix

**Issue:** Prometheus StatefulSet referenced `prometheus-storage` PVC but actual PVC was named `prometheus-pvc`

**Fix Applied:**
```bash
kubectl patch statefulset prometheus -n monitoring --type='json' \
  -p='[{"op": "replace", "path": "/spec/template/spec/volumes/1/persistentVolumeClaim/claimName", "value": "prometheus-pvc"}]'
```

### 5. Monitoring Stack Migration to VPS-4

Moved monitoring workloads to VPS-4 (testnet node) to conserve resources on mainnet nodes:

```bash
kubectl label node srv1117946.hstgr.cloud monitoring=true
kubectl patch deployment alertmanager -n monitoring -p '{"spec":{"template":{"spec":{"nodeSelector":{"monitoring":"true"}}}}}'
# ... applied to all monitoring deployments
```

**Monitoring pods now on VPS-4:**
- alertmanager
- grafana
- kube-state-metrics
- loki
- postgres-exporter
- prometheus

### 6. svc-tax Dockerfile Fix

**Issue:** Prisma client initialization failure in svc-tax
```
Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.
```

**Root Cause:** Missing monorepo Prisma client copy step

**Fix Applied:**
```dockerfile
# Copy generated Prisma client to root node_modules (monorepo fix)
RUN cp -r /app/packages/core-db/node_modules/.prisma /app/node_modules/
```

### 7. httpd Reverse Proxy Fix

**Issue:** Cloudflare returning 521 (origin down)

**Root Cause:** httpd not running on VPS-2, mod_ssl missing

**Fix Applied:**
```bash
ssh root@217.196.51.190 "dnf install -y mod_ssl && systemctl start httpd && systemctl enable httpd"
```

---

## Challenges Encountered

### 1. Docker Containerd Corruption

**Problem:** After Docker system prune, containerd snapshotter directories were corrupted
**Error:** `stat /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots: no such file or directory`
**Solution:** Restart containerd and docker services

### 2. Image Pull Policy

**Problem:** K8s trying to pull images from Docker Hub instead of using local images
**Error:** `ErrImageNeverPull` or `ImagePullBackOff`
**Solution:** Set `imagePullPolicy: Never` on deployments

### 3. Monorepo Prisma Client

**Problem:** Prisma client generated in `packages/core-db/node_modules/.prisma` not accessible from root
**Solution:** Added copy step in Dockerfile to mirror Prisma client to root `node_modules/`

---

## Final System Status

### Cluster Nodes
| Node | IP | Role | Status |
|------|-----|------|--------|
| VPS-1 | 72.60.210.201 | control-plane,etcd,master | Ready |
| VPS-2 | 217.196.51.190 | control-plane,etcd,master | Ready |
| VPS-3 | 72.61.81.3 | control-plane,etcd,master | Ready |
| VPS-4 | 72.61.116.210 | control-plane,etcd,master | Ready |

### Backend Services (backend-mainnet)
| Deployment | Ready | Version |
|------------|-------|---------|
| svc-identity | 3/3 | 2.1.0 |
| svc-tokenomics | 3/3 | 2.1.0 |
| svc-organization | 3/3 | 2.1.0 |
| svc-loanpool | 3/3 | 2.1.0 |
| svc-governance | 3/3 | 2.1.0 |
| svc-admin | 3/3 | 2.1.0 |
| svc-tax | 2/2 | 2.1.0 |
| projector | 1/1 | 2.1.0 |
| outbox-submitter | 1/1 | 2.1.0 |

### Fabric Network
- 5 CAs: Running
- 5 Orderers: Running
- 4 Peers: Running
- 1 Chaincode: Running
- **Total:** 21 pods running

### Monitoring Stack (VPS-4)
- 14 monitoring pods running
- Prometheus: 1/1
- Grafana: 1/1
- Loki: 1/1
- Alertmanager: 1/1
- Node exporters: 4/4
- Promtail: 4/4

### API Verification
```bash
curl -s https://api.gxcoin.money/api/v1/relationships
# {"error":"Unauthorized","message":"No authorization header provided"}
# ✅ API responding correctly
```

---

## Commits Made

1. **fix(svc-tax):** add Prisma client copy to root node_modules for monorepo compatibility
   - Added `cp -r /app/packages/core-db/node_modules/.prisma /app/node_modules/` to Dockerfile

---

## Key Learnings

1. **Docker Containerd State:** Docker prune can corrupt containerd state; restart services if builds fail
2. **K3s Image Import:** Use `k3s ctr images import` for local images; set `imagePullPolicy: Never`
3. **Monorepo Prisma:** Always copy Prisma client to root `node_modules/` in Docker builds
4. **httpd SSL:** AlmaLinux requires `mod_ssl` package for HTTPS proxy configuration

---

## Deployment Summary

**Images Built:** 9
**Nodes Updated:** 4
**Services Deployed:** 9
**Monitoring Fixed:** Yes
**API Status:** Operational

**All systems operational and ready for use.**

---

*End of Work Record - December 14, 2025*
