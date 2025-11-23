# Projector Fabric Connectivity Fix - Work Record
**Date**: November 23, 2025
**Session**: Projector Connectivity Debugging and svc-admin Readiness Fix

## Executive Summary

Successfully diagnosed and fixed the projector worker's Fabric connectivity issue. The projector was unable to connect to the Fabric event stream due to a missing fabric-wallet volume mount, causing continuous ECONNRESET errors and preventing event projection. After adding the wallet volume and rebuilding the image, both the projector and svc-admin are now operational.

**Key Achievement**: Projector connectivity restored - svc-admin passes readiness checks and countries endpoint returns data.

## Problem Statement

### Initial Symptoms
1. User wanted to access `http://localhost:3006/api/v1/countries` endpoint
2. svc-admin pods showing 0/1 Ready status for ~3 days
3. Readiness checks failing with 503 on `/readyz` endpoint
4. Liveness checks passing (200 OK on `/livez`)

### Root Cause Investigation

**Step 1: Projection Lag Discovery**

```sql
SELECT
  "projectorName",
  "lastBlock",
  "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - "updatedAt")) * 1000 as lag_ms
FROM "ProjectorState";

-- Result:
-- projectorName  | lastBlock | updatedAt              | lag_ms
-- main-projector | 0         | 2025-11-19 12:06:01    | 323,722,280.028
```

**Diagnosis**: Projection lag of ~3.7 days (323,722 seconds) far exceeds the configured threshold of 5,000ms.

**Step 2: Projector Error Pattern**

```json
{"timestamp":"2025-11-22T16:20:27.626Z","level":"info","service":"core-fabric","message":"Starting event listener","startBlock":"1"}
{"timestamp":"2025-11-22T16:54:03.493Z","level":"error","service":"core-fabric","message":"Event listener error","error":"14 UNAVAILABLE: read ECONNRESET"}
{"timestamp":"2025-11-22T16:54:03.493Z","level":"info","service":"core-fabric","message":"Reconnecting event listener in 5 seconds"}
```

**Pattern**: Continuous reconnection loop with gRPC UNAVAILABLE errors. Projector stuck at block 0.

**Step 3: Configuration Comparison**

| Component | `/fabric-wallet` Volume | `FABRIC_WALLET_PATH` Env | Status |
|-----------|-------------------------|--------------------------|--------|
| outbox-submitter | ✅ Mounted | ✅ Set | Working |
| projector | ❌ Missing | ❌ Missing | Failing |

**Root Cause**: Projector deployment lacked the fabric-wallet ConfigMap mount containing org1/org2 admin certificates needed for Fabric connectivity.

## Implementation Steps

### 1. Update Projector Deployment YAML

**File**: `k8s/backend/deployments/projector.yaml`

**Changes**:

#### Added Environment Variable
```yaml
env:
  # ... existing env vars
  - name: FABRIC_WALLET_PATH
    value: "/fabric-wallet"
```

#### Added Volume Mount
```yaml
volumeMounts:
  - name: fabric-wallet
    mountPath: /fabric-wallet
    readOnly: true
  - name: fabric-credentials
    mountPath: /etc/fabric
    readOnly: true
```

#### Added Volume Definition
```yaml
volumes:
  - name: fabric-wallet
    configMap:
      name: fabric-wallet
      defaultMode: 0400  # Read-only for owner
  - name: fabric-credentials
    secret:
      secretName: fabric-credentials
      defaultMode: 0400
```

### 2. Update Projector Dockerfile

**File**: `workers/projector/Dockerfile`

**Issue**: Old v2.0.6 image had Prisma client initialization issues.

**Solution**: Modified builder stage to use pre-built artifacts (matching outbox-submitter pattern):

```dockerfile
# ============================================
# Stage 2: Builder
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./

# Copy Prisma schema
COPY db/prisma ./db/prisma

# Generate Prisma client
RUN npx prisma generate --schema=./db/prisma/schema.prisma

# Copy pre-built packages and worker (must be built locally first)
COPY packages/ ./packages/
COPY workers/projector/dist ./workers/projector/dist
```

**Build Process**:
```bash
# 1. Build locally with Turborepo
./node_modules/.bin/turbo run build --filter=projector

# 2. Build Docker image with pre-built artifacts
docker build -t gx-protocol/projector:2.0.20 -f workers/projector/Dockerfile .

# 3. Import into k3s containerd
docker save gx-protocol/projector:2.0.20 | sudo /usr/local/bin/k3s ctr images import -
```

### 3. Deploy Updated Configuration

**Update Image Version**:
```yaml
containers:
  - name: projector
    image: gx-protocol/projector:2.0.20  # Updated from 2.0.6
    imagePullPolicy: IfNotPresent
```

**Apply Changes**:
```bash
kubectl apply -f k8s/backend/deployments/projector.yaml
# Note: ServiceMonitor CRD error is benign (Prometheus Operator not installed)

kubectl delete pod -n backend-mainnet -l app=projector
# Force restart to pick up new configuration
```

## Testing Results

### Test 1: Projector Startup

**Command**:
```bash
kubectl logs -n backend-mainnet -l app=projector --tail=50
```

**Result**: ✅ **SUCCESS**

```json
{"timestamp":"2025-11-23T06:07:43.886Z","level":"info","service":"core-fabric","message":"Loaded Fabric configuration from environment"}
{"timestamp":"2025-11-23T06:07:43.924Z","level":"info","service":"core-fabric","message":"Successfully connected to Fabric network"}
{"timestamp":"2025-11-23T06:07:45.265Z","level":"info","service":"projector","workerId":"projector-57bc4b6c79-7wrfk","message":"Loaded checkpoint","lastBlock":"0","lastEventIndex":-1}
{"timestamp":"2025-11-23T06:07:45.265Z","level":"info","service":"core-fabric","message":"Starting event listener","startBlock":"1"}
{"timestamp":"2025-11-23T06:07:45.352Z","level":"info","service":"projector","workerId":"projector-57bc4b6c79-7wrfk","message":"Projector worker started successfully"}
```

**Key Indicators**:
- ✅ Connected to Fabric network (no ECONNRESET errors)
- ✅ Event listener started from block 1
- ✅ Metrics server listening on port 9091

### Test 2: Pod Readiness

**Command**:
```bash
kubectl get pods -n backend-mainnet -l app=projector
kubectl get pods -n backend-mainnet -l app=svc-admin
```

**Result**: ✅ **SUCCESS**

```
# Projector
NAME                         READY   STATUS    RESTARTS   AGE
projector-57bc4b6c79-7wrfk   1/1     Running   0          4m12s

# svc-admin
NAME                         READY   STATUS    RESTARTS   AGE
svc-admin-5c7748f57c-cmckc   1/1     Running   0          2d23h
svc-admin-5c7748f57c-g9r7k   1/1     Running   0          2d23h
svc-admin-5c7748f57c-mqjlp   1/1     Running   0          2d23h
```

**All pods showing 1/1 Ready!**

### Test 3: Countries Endpoint

**Command**:
```bash
kubectl port-forward -n backend-mainnet svc-admin-5c7748f57c-cmckc 3006:3006
curl -i http://localhost:3006/api/v1/countries
```

**Result**: ✅ **SUCCESS**

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 991

{
  "countries": [
    {"countryCode":"AU","countryName":"Australia","region":"Oceania"},
    {"countryCode":"BR","countryName":"Brazil","region":"South America"},
    {"countryCode":"CA","countryName":"Canada","region":"North America"},
    {"countryCode":"CN","countryName":"China","region":"Asia"},
    {"countryCode":"DE","countryName":"Germany","region":"Europe"},
    {"countryCode":"ES","countryName":"Spain","region":"Europe"},
    {"countryCode":"FR","countryName":"France","region":"Europe"},
    {"countryCode":"GB","countryName":"United Kingdom","region":"Europe"},
    {"countryCode":"IN","countryName":"India","region":"Asia"},
    {"countryCode":"IT","countryName":"Italy","region":"Europe"},
    {"countryCode":"JP","countryName":"Japan","region":"Asia"},
    {"countryCode":"KR","countryName":"South Korea","region":"Asia"},
    {"countryCode":"MX","countryName":"Mexico","region":"North America"},
    {"countryCode":"US","countryName":"United States","region":"North America"},
    {"countryCode":"ZA","countryName":"South Africa","region":"Africa"}
  ]
}
```

**Returned 15 countries** spanning all major regions!

## Architecture Insights

### Readiness Check Logic

**File**: `apps/svc-admin/src/controllers/health.controller.ts:28`

```typescript
const lagMs = Date.now() - projectorState.updatedAt.getTime();
if (lagMs > adminConfig.projectionLagThresholdMs) {  // Threshold: 5000ms
  checks.projectionLag = {
    status: 'unhealthy',
    message: 'Projection lag exceeds threshold',
    value: { lagMs, threshold: adminConfig.projectionLagThresholdMs }
  };
  isReady = false;
}
```

**Why svc-admin Depends on Projector**:
1. svc-admin serves read models (query side of CQRS)
2. Read models are populated by projector from blockchain events
3. If projector lags, read models are stale
4. Readiness check ensures data freshness before serving traffic

### Fabric Wallet Contents

The fabric-wallet ConfigMap contains credentials for both organizations:

**Org1**:
- `org1-admin-cert` / `org1-admin-key` - Regular admin
- `org1-super-admin-cert` / `org1-super-admin-key` - Super admin (system operations)
- `org1-partner-api-cert` / `org1-partner-api-key` - API integration

**Org2**:
- `org2-super-admin-cert` / `org2-super-admin-key` - Super admin

**TLS Certificates**:
- `ca-cert` - Fabric CA root certificate
- `tlsca-cert` - TLS CA certificate

**Why Both Needed**:
- Projector connects to Fabric peer for event streaming
- Requires valid MSP identity with read access to channel
- TLS certificates needed for secure gRPC connections

## Troubleshooting Timeline

| Time | Action | Outcome |
|------|--------|---------|
| 06:02:00 | Checked port-forward status | Port 3002 forwarded (incorrect port) |
| 06:02:30 | Checked svc-admin pod status | 0/1 Ready for 3 days |
| 06:03:00 | Examined readiness check logs | 503 errors on /readyz |
| 06:03:30 | Queried ProjectorState table | Lag: 323,722 seconds (~3.7 days) |
| 06:04:00 | Checked projector logs | ECONNRESET errors in loop |
| 06:04:30 | Compared deployment configs | Missing fabric-wallet volume |
| 06:05:00 | Updated projector.yaml | Added wallet mount + env var |
| 06:05:30 | Built projector:2.0.20 | Build successful |
| 06:06:00 | Imported image to k3s | Import successful |
| 06:06:30 | Applied deployment | Configured successfully |
| 06:07:00 | Deleted old pod | New pod starting |
| 06:07:45 | Checked new pod logs | ✅ Connected to Fabric |
| 06:08:00 | Verified pod readiness | ✅ 1/1 Ready |
| 06:12:00 | Tested countries endpoint | ✅ 200 OK with 15 countries |

## Git Commits

### Commit 1: Fix Projector Deployment
```
commit 191370f
fix(projector): add fabric-wallet volume mount and update to v2.0.20

- Add FABRIC_WALLET_PATH environment variable pointing to /fabric-wallet
- Mount fabric-wallet ConfigMap as read-only volume
- Update image to gx-protocol/projector:2.0.20 with wallet support
- Matches outbox-submitter configuration for Fabric connectivity

Root cause: Projector was missing fabric-wallet volume mount containing
org1/org2 admin certificates needed to connect to Fabric event stream.
This caused continuous ECONNRESET errors and projection lag.
```

### Commit 2: Optimize Projector Build
```
commit 0e6cc69
build(projector): use pre-built artifacts for Docker build

- Copy pre-built packages/ and workers/projector/dist instead of building
- Remove source code copy and build step from builder stage
- Requires local build before Docker build (same as outbox-submitter)

Rationale: TypeScript monorepo dependencies are complex. Local builds
leverage Turborepo cache effectively for faster iteration.
```

### Commit 3: Fix Schema Command Type
```
commit 6439f4c
fix(schema): correct command type to INITIALIZE_COUNTRY_DATA

- Rename INITIALIZE_COUNTRY to INITIALIZE_COUNTRY_DATA
- Matches chaincode function name InitializeCountryData in AdminContract
- Ensures proper command routing in outbox pattern
```

## Remaining Work

### Immediate Next Steps

1. **Monitor Projection Progress**:
   ```bash
   # Check if projector processes historical blocks
   kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c "
   SELECT \"projectorName\", \"lastBlock\", \"updatedAt\" FROM \"ProjectorState\";"
   ```
   - Blockchain currently at block 34
   - Projector starting from block 1
   - Should process all 34 blocks if event emission working correctly

2. **Verify Event Processing**:
   - Bootstrap command (block 32) should emit SystemBootstrapped event
   - Country initialization (block 33) should emit CountryInitialized events
   - Check projector logs for event processing messages

3. **Image Distribution to Mainnet** (if needed for other nodes):
   - Current: Image built on srv1089618 and imported to local containerd
   - Required: If pods schedule on srv1089624 or srv1092158, import image there
   - Method: `docker save` → transfer → `ctr images import`

### Future Enhancements

1. **Centralized Image Registry**:
   - Set up Harbor or Docker Registry on one control-plane node
   - Push images to registry instead of manual distribution
   - Update deployments to pull from registry

2. **Automated Projection Lag Alerts**:
   - Add Prometheus alert rule for projection lag > 30 seconds
   - Alert when projector fails to make progress for 5 minutes
   - Dashboard panel showing projection lag over time

3. **Event Processing Monitoring**:
   - Add projector metrics for events processed per second
   - Track event processing errors and validation failures
   - Monitor checkpoint save frequency

4. **Projector High Availability**:
   - Current: Single replica (ordered processing requirement)
   - Future: Implement leader election for HA
   - Allow multiple replicas with only leader processing events

## Lessons Learned

1. **Volume Mount Parity**: When two workers share the same Fabric integration code, they must have identical volume mounts. Always compare deployment configurations when debugging connectivity issues.

2. **Readiness vs Liveness**:
   - Liveness checks: "Is the process alive?"
   - Readiness checks: "Is the service ready to serve traffic?"
   - svc-admin correctly uses readiness to ensure data freshness before accepting requests

3. **CQRS Dependency Chain**:
   ```
   Fabric Chaincode → Events → Projector → Read Models → API Services
   ```
   - If projector is down, entire read path is stale
   - Readiness checks propagate health downstream
   - Critical to monitor projection lag metrics

4. **Docker Build Patterns for Monorepos**:
   - TypeScript monorepos with interdependent packages are complex to build in Docker
   - Pre-building locally and copying artifacts is pragmatic
   - Trade-off: Requires local build step, but faster iteration and simpler Dockerfile

5. **K3s Image Distribution**:
   - K3s uses containerd, not Docker daemon
   - Must import images with `k3s ctr images import`
   - Images built locally need distribution to all nodes (or use registry)

## Conclusion

Projector connectivity has been fully restored. The root cause was a missing fabric-wallet volume mount that prevented the projector from authenticating to the Fabric network. After adding the wallet volume and rebuilding the image with pre-built artifacts, both the projector and svc-admin are operational.

**Status**: ✅ **OPERATIONAL**

**Verification**:
- ✅ Projector pod 1/1 Ready
- ✅ svc-admin pods 1/1 Ready
- ✅ Countries endpoint returns 200 OK with 15 countries
- ✅ No ECONNRESET errors in projector logs

**Next Session**: Monitor projector's processing of historical blocks 1-34, then proceed with frontend user registration flow testing.
