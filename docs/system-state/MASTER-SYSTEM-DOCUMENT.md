# GX Protocol - Master System Document

> **LIVING DOCUMENT**: This document must be updated after every deployment or system change.
> Last Updated: 2025-12-24T05:45:42Z

## Table of Contents
1. [Infrastructure Overview](#1-infrastructure-overview)
2. [Kubernetes Namespaces](#2-kubernetes-namespaces)
3. [Service Deployments by Environment](#3-service-deployments-by-environment)
4. [Service Port Mappings](#4-service-port-mappings)
5. [Environment Variables](#5-environment-variables)
6. [Database Configuration](#6-database-configuration)
7. [Redis Configuration](#7-redis-configuration)
8. [Fabric Network](#8-fabric-network)
9. [Ingress Configuration](#9-ingress-configuration)
10. [Docker Registry](#10-docker-registry)
11. [API Endpoints](#11-api-endpoints)
12. [Deployment Promotion Paths](#12-deployment-promotion-paths)
13. [RBAC Configuration](#13-rbac-configuration)
14. [Change Log](#14-change-log)

---

## 1. Infrastructure Overview

### Cluster Information
```
Kubernetes control plane is running at https://127.0.0.1:6443
CoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
Metrics-server is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/https:metrics-server:https/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.

Kubernetes Version:
```

### Node Information
```
NAME                     STATUS   ROLES                       AGE   VERSION        INTERNAL-IP      EXTERNAL-IP   OS-IMAGE                           KERNEL-VERSION                  CONTAINER-RUNTIME
srv1089618.hstgr.cloud   Ready    control-plane,etcd,master   55d   v1.33.5+k3s1   72.60.210.201    <none>        AlmaLinux 10.1 (Heliotrope Lion)   6.12.0-124.20.1.el10_1.x86_64   containerd://2.1.4-k3s1
srv1089624.hstgr.cloud   Ready    control-plane,etcd,master   55d   v1.33.5+k3s1   217.196.51.190   <none>        AlmaLinux 10.0 (Purple Lion)       6.12.0-124.20.1.el10_1.x86_64   containerd://2.1.4-k3s1
srv1092158.hstgr.cloud   Ready    control-plane,etcd,master   55d   v1.33.5+k3s1   72.61.81.3       <none>        AlmaLinux 10.0 (Purple Lion)       6.12.0-124.20.1.el10_1.x86_64   containerd://2.1.4-k3s1
srv1117946.hstgr.cloud   Ready    control-plane,etcd,master   10d   v1.33.5+k3s1   72.61.116.210    <none>        AlmaLinux 10.0 (Purple Lion)       6.12.0-124.20.1.el10_1.x86_64   containerd://2.1.4-k3s1
```

---

## 2. Kubernetes Namespaces

| Namespace | Purpose | Status |
|-----------|---------|--------|
| backend-devnet | Development/Testing Backend Services | Active |
| backend-testnet | Staging/QA Backend Services | Active |
| backend-mainnet | Production Backend Services | Active |
| fabric | Hyperledger Fabric MainNet Network | Active |
| fabric-devnet | Hyperledger Fabric DevNet Network | Active |
| fabric-testnet | Hyperledger Fabric TestNet Network | Active |
| monitoring | Prometheus, Grafana, Alerting | Active |
| registry | Private Docker Registry | Active |
| ingress-nginx | Ingress Controller | Active |

---

## 3. Service Deployments by Environment

### 3.1 DevNet (backend-devnet)

| Service | Image | Replicas | Ready | Status |
|---------|-------|----------|-------|--------|
| gx-wallet-frontend | `10.43.75.195:5000/gx-wallet-frontend:1.1.0` | 1 | 1 | Running |
| outbox-submitter | `10.43.75.195:5000/outbox-submitter:2.1.6` | 1 | 1 | Running |
| projector | `10.43.75.195:5000/projector:2.1.5` | 1 | 1 | Running |
| svc-admin | `10.43.75.195:5000/svc-admin:2.1.15` | 1 | <none> | Degraded |
| svc-identity | `localhost:30500/gx-svc-identity:phase4-v2` | 1 | <none> | Degraded |
| svc-tokenomics | `10.43.75.195:5000/svc-tokenomics:2.1.5` | 1 | <none> | Degraded |

### 3.2 TestNet (backend-testnet)

| Service | Image | Replicas | Ready | Status |
|---------|-------|----------|-------|--------|
| gx-wallet-frontend | `10.43.75.195:5000/gx-wallet-frontend:1.2.0` | 1 | 1 | Running |
| outbox-submitter | `10.43.75.195:5000/outbox-submitter:2.1.6` | 1 | 1 | Running |
| projector | `10.43.75.195:5000/projector:2.1.5` | 1 | 1 | Running |
| svc-admin | `10.43.75.195:5000/svc-admin:2.1.15` | 1 | 1 | Running |
| svc-identity | `10.43.75.195:5000/svc-identity:2.1.9` | 1 | 1 | Running |
| svc-tokenomics | `10.43.75.195:5000/svc-tokenomics:2.1.5` | 1 | 1 | Running |

### 3.3 MainNet (backend-mainnet)

| Service | Image | Replicas | Ready | Status |
|---------|-------|----------|-------|--------|
| gx-wallet-frontend | `10.43.75.195:5000/gx-wallet-frontend:1.0.0` | 1 | 1 | Running |
| outbox-submitter | `10.43.75.195:5000/outbox-submitter:2.1.6` | 1 | 1 | Running |
| projector | `10.43.75.195:5000/projector:2.1.5` | 1 | 1 | Running |
| redis-sentinel | `redis:7-alpine` | 0 | <none> | Degraded |
| svc-admin | `10.43.75.195:5000/svc-admin:2.1.10` | 2 | 2 | Running |
| svc-governance | `10.43.75.195:5000/svc-governance:2.1.5` | 1 | 1 | Running |
| svc-identity | `10.43.75.195:5000/svc-identity:2.1.9` | 3 | 3 | Running |
| svc-loanpool | `10.43.75.195:5000/svc-loanpool:2.1.5` | 1 | 1 | Running |
| svc-organization | `10.43.75.195:5000/svc-organization:2.1.5` | 1 | 1 | Running |
| svc-tax | `10.43.75.195:5000/svc-tax:2.1.5` | 1 | 1 | Running |
| svc-tokenomics | `10.43.75.195:5000/svc-tokenomics:2.1.5` | 2 | 2 | Running |


---

## 4. Service Port Mappings

### Container Ports (Application Listens On)

| Service | Container Port | Protocol | Notes |
|---------|---------------|----------|-------|
| svc-admin | 3006 | HTTP | Admin API, Deployment Management |
| svc-identity | 3001 | HTTP | User Identity, Authentication |
| svc-tokenomics | 3005 | HTTP | Token Operations, Transfers |
| svc-governance | 3002 | HTTP | Governance Features |
| svc-loanpool | 3003 | HTTP | Loan Pool Management |
| svc-tax | 3004 | HTTP | Tax Calculations |
| svc-organization | 3007 | HTTP | Organization Management |
| gx-wallet-frontend | 3000 | HTTP | Next.js Frontend |
| outbox-submitter | 3003 | HTTP | Event Outbox Processing |
| projector | 3004 | HTTP | Event Projections |

### Kubernetes Service Ports

| Namespace | Service | ClusterIP Port | Target Port | Type |
|-----------|---------|---------------|-------------|------|
| backend-devnet | gx-wallet-frontend | 80 | 3000 | ClusterIP |
| backend-devnet | outbox-submitter-metrics | 9090 | 9090 | ClusterIP |
| backend-devnet | postgres-headless | 5432 | 5432 | ClusterIP |
| backend-devnet | postgres-primary | 5432 | 5432 | ClusterIP |
| backend-devnet | projector-metrics | 9091 | 9091 | ClusterIP |
| backend-devnet | redis | 6379 | 6379 | ClusterIP |
| backend-devnet | redis-headless | 6379 | 6379 | ClusterIP |
| backend-devnet | redis-master | 6379 | 6379 | ClusterIP |
| backend-devnet | svc-admin | 80 | 3006 | ClusterIP |
| backend-devnet | svc-identity | 80 | 3001 | ClusterIP |
| backend-devnet | svc-tokenomics | 80 | 3000 | ClusterIP |
| backend-testnet | gx-wallet-frontend | 80 | 3000 | ClusterIP |
| backend-testnet | outbox-submitter-metrics | 9090 | 9090 | ClusterIP |
| backend-testnet | postgres | 5432 | 5432 | ClusterIP |
| backend-testnet | postgres-headless | 5432 | 5432 | ClusterIP |
| backend-testnet | postgres-primary | 5432 | 5432 | ClusterIP |
| backend-testnet | projector-metrics | 9091 | 9091 | ClusterIP |
| backend-testnet | redis | 6379 | 6379 | ClusterIP |
| backend-testnet | redis-headless | 6379 | 6379 | ClusterIP |
| backend-testnet | redis-master | 6379 | 6379 | ClusterIP |
| backend-testnet | redis-replica | 6379 | 6379 | ClusterIP |
| backend-testnet | svc-admin | 80 | 3006 | ClusterIP |
| backend-testnet | svc-identity | 80 | 3001 | ClusterIP |
| backend-testnet | svc-tokenomics | 80 | 3002 | ClusterIP |
| backend-mainnet | clamav | 3310 | 3310 | ClusterIP |
| backend-mainnet | cm-acme-http-solver-lvp4w | 8089 | 8089 | NodePort |
| backend-mainnet | gx-wallet-frontend | 80 | 3000 | ClusterIP |
| backend-mainnet | outbox-submitter-metrics | 9090 | 9090 | ClusterIP |
| backend-mainnet | postgres | 5432 | 5432 | ClusterIP |
| backend-mainnet | postgres-external | 5432 | 5432 | NodePort |
| backend-mainnet | postgres-headless | 5432 | 5432 | ClusterIP |
| backend-mainnet | postgres-primary | 5432 | 5432 | ClusterIP |
| backend-mainnet | postgres-replica | 5432 | 5432 | ClusterIP |
| backend-mainnet | projector-metrics | 9091 | 9091 | ClusterIP |
| backend-mainnet | redis | 6379 | 6379 | ClusterIP |
| backend-mainnet | redis-headless | 6379 | 6379 | ClusterIP |
| backend-mainnet | redis-master | 6379 | 6379 | ClusterIP |
| backend-mainnet | redis-replica | 6379 | 6379 | ClusterIP |
| backend-mainnet | redis-sentinel | 26379 | 26379 | ClusterIP |
| backend-mainnet | svc-admin | 3006 | 3006 | NodePort |
| backend-mainnet | svc-governance | 3006 | 3006 | NodePort |
| backend-mainnet | svc-identity | 3001 | 3001 | NodePort |
| backend-mainnet | svc-loanpool | 3005 | 3005 | NodePort |
| backend-mainnet | svc-organization | 3004 | 3004 | NodePort |
| backend-mainnet | svc-tax | 3007 | 3007 | NodePort |
| backend-mainnet | svc-tokenomics | 3003 | 3002 | NodePort |


---

## 5. Environment Variables

### 5.1 Common Environment Variables (All Services)

| Variable | DevNet | TestNet | MainNet | Description |
|----------|--------|---------|---------|-------------|
| NODE_ENV | development | production | production | Runtime environment |
| LOG_LEVEL | debug | info | info | Logging verbosity |

### 5.2 Service-Specific Environment Variables

#### svc-admin
```yaml
```

#### svc-identity
```yaml
```

#### svc-tokenomics
```yaml
```

---

## 6. Database Configuration

### PostgreSQL Instances

| Environment | Service | Port | Database | Connection |
|-------------|---------|------|----------|------------|
| DevNet | postgres-primary | 5432 | gx_protocol | postgres-primary.backend-devnet.svc.cluster.local |
| TestNet | postgres-primary | 5432 | gx_protocol | postgres-primary.backend-testnet.svc.cluster.local |
| MainNet | postgres-primary | 5432 | gx_protocol | postgres-primary.backend-mainnet.svc.cluster.local |

### PostgreSQL StatefulSets
```
=== backend-devnet ===
NAME       READY   AGE    CONTAINERS   IMAGES
postgres   1/1     6d3h   postgres     postgres:15-alpine
=== backend-testnet ===
NAME       READY   AGE   CONTAINERS   IMAGES
postgres   1/1     35d   postgres     postgres:15-alpine
=== backend-mainnet ===
NAME       READY   AGE   CONTAINERS   IMAGES
postgres   3/3     41d   postgres     postgres:15-alpine
```

---

## 7. Redis Configuration

### Redis Instances

| Environment | Service | Port | Mode | Connection |
|-------------|---------|------|------|------------|
| DevNet | redis | 6379 | Standalone | redis.backend-devnet.svc.cluster.local |
| TestNet | redis | 6379 | Standalone | redis.backend-testnet.svc.cluster.local |
| MainNet | redis | 6379 | Sentinel (HA) | redis.backend-mainnet.svc.cluster.local |

### Redis StatefulSets
```
=== backend-devnet ===
NAME    READY   AGE    CONTAINERS   IMAGES
redis   1/1     6d3h   redis        redis:7-alpine
=== backend-testnet ===
NAME    READY   AGE   CONTAINERS   IMAGES
redis   1/1     35d   redis        redis:7-alpine
=== backend-mainnet ===
NAME    READY   AGE   CONTAINERS   IMAGES
redis   3/3     41d   redis        redis:7-alpine
```

---

## 8. Fabric Network

### Hyperledger Fabric Components

| Environment | Namespace | Components |
|-------------|-----------|------------|
| DevNet | fabric-devnet | Peers, Orderers, CouchDB |
| TestNet | fabric-testnet | Peers, Orderers, CouchDB |
| MainNet | fabric | Peers, Orderers, CouchDB |

### Fabric Pods
```
=== fabric ===
ca-orderer-0           1/1   Running   0             6d15h
ca-org1-0              1/1   Running   0             6d13h
ca-org2-0              1/1   Running   0             6d15h
ca-root-0              1/1   Running   0             6d15h
ca-tls-0               1/1   Running   0             6d13h
couchdb-peer0-org1-0   1/1   Running   0             5d14h
couchdb-peer0-org2-0   1/1   Running   0             5d14h
couchdb-peer1-org1-0   1/1   Running   0             5d14h
couchdb-peer1-org2-0   1/1   Running   0             5d14h
gxtv3-chaincode-0      1/1   Running   0             2d17h
=== fabric-devnet ===
couchdb-peer0-org1-0       1/1   Running   0     6d2h
couchdb-peer0-org2-0       1/1   Running   0     6d2h
gxtv3-devnet-chaincode-0   1/1   Running   0     6d2h
orderer0-ordererorg-0      1/1   Running   0     6d1h
peer0-org1-0               1/1   Running   0     5d22h
peer0-org2-0               1/1   Running   0     5d22h
=== fabric-testnet ===
couchdb-peer0-org1-0    1/1   Running   0     6d13h
couchdb-peer0-org2-0    1/1   Running   0     6d13h
gxtv3-chaincode-0       1/1   Running   0     6d12h
orderer0-ordererorg-0   1/1   Running   0     6d1h
peer0-org1-0            1/1   Running   0     6d1h
peer0-org2-0            1/1   Running   0     6d1h
```

---

## 9. Ingress Configuration

### Ingress Resources
```
NAMESPACE         NAME                        CLASS    HOSTS                 ADDRESS          PORTS     AGE
backend-mainnet   cm-acme-http-solver-9kc2h   <none>   wallet.gxcoin.money   217.196.51.190   80        2d14h
backend-mainnet   gx-backend-ingress          nginx    api.gxcoin.money      217.196.51.190   80, 443   36d
backend-mainnet   gx-wallet-ingress           nginx    wallet.gxcoin.money   217.196.51.190   80, 443   2d14h
```

### Domain Mappings

| Domain | Service | Namespace | Path |
|--------|---------|-----------|------|
| api.gxcoin.money | svc-identity | backend-mainnet | /api/v1/identity |
| api.gxcoin.money | svc-tokenomics | backend-mainnet | /api/v1/tokenomics |
| api.gxcoin.money | svc-admin | backend-mainnet | /api/v1/admin |
| app.gxcoin.money | gx-wallet-frontend | backend-mainnet | / |


---

## 10. Docker Registry

### Private Registry

| Property | Value |
|----------|-------|
| Registry URL | 10.43.75.195:5000 |
| Protocol | HTTP (internal) |
| Namespace | registry |

### Available Images
```
gx-svc-identity: phase4-v2, phase4-v1, phase3-v2, phase3-v1, phase2-v2
gx-wallet-frontend: 1.2.0, 1.1.0, 1.0.0
gxtv3-chaincode: 1.214, 1.213, 1.212, 1.211
outbox-submitter: 2.1.6
projector: 2.1.5
svc-admin: 2.1.9, 2.1.8, 2.1.7, 2.1.6, 2.1.5
svc-governance: 2.1.5
svc-identity: latest, devnet-latest, 2.3.0, 2.2.0, 2.1.9
svc-loanpool: 2.1.5
svc-organization: 2.1.5
svc-tax: 2.1.5
svc-tokenomics: 2.1.5
```

---

## 11. API Endpoints

### Public Endpoints (via Ingress)

| Endpoint | Method | Service | Description |
|----------|--------|---------|-------------|
| /api/v1/identity/auth/register | POST | svc-identity | User registration |
| /api/v1/identity/auth/login | POST | svc-identity | User login |
| /api/v1/admin/auth/login | POST | svc-admin | Admin login |
| /api/v1/admin/deployments/promote | POST | svc-admin | Create deployment request |
| /api/v1/admin/approvals/:id/vote | POST | svc-admin | Vote on approval |
| /api/v1/tokenomics/transfers | POST | svc-tokenomics | Initiate transfer |

### Health Endpoints (Internal)

| Service | Endpoint | Port |
|---------|----------|------|
| svc-admin | /health, /readyz, /livez | 3006 |
| svc-identity | /health, /readyz, /livez | 3001 |
| svc-tokenomics | /health, /readyz, /livez | 3005 |


---

## 12. Deployment Promotion Paths

### Valid Promotion Paths

```
DevNet (backend-devnet) → TestNet (backend-testnet) → MainNet (backend-mainnet)
```

### Deployable Services

| Service | DevNet → TestNet | TestNet → MainNet | Notes |
|---------|-----------------|-------------------|-------|
| svc-admin | ✓ | ✓ | Requires SUPER_OWNER approval |
| svc-identity | ✓ | ✓ | Requires SUPER_OWNER approval |
| svc-tokenomics | ✓ | ✓ | Requires SUPER_OWNER approval |
| gx-wallet-frontend | ✓ | ✓ | Requires SUPER_OWNER approval |
| outbox-submitter | ✓ | ✓ | Requires SUPER_OWNER approval |
| projector | ✓ | ✓ | Requires SUPER_OWNER approval |

### Deployment Workflow

1. **Create Request**: Admin with `deployment:create` permission creates deployment request
2. **Approval**: SUPER_OWNER reviews and approves/rejects
3. **Execution**: SUPER_OWNER executes the approved deployment
4. **Health Checks**: System verifies pod readiness, health endpoint, restart loop
5. **Auto-Rollback**: If health checks fail, automatic rollback to previous version


---

## 13. RBAC Configuration

### Service Accounts for Deployment

| ServiceAccount | Namespace | Purpose |
|----------------|-----------|---------|
| svc-admin-deployer | backend-devnet | Cross-namespace deployment operations |

### ClusterRoles

| ClusterRole | Permissions |
|-------------|-------------|
| deployment-manager | deployments (get, list, watch, patch, update), pods (get, list, watch), pods/exec (create) |

### Admin Roles

| Role | Permissions |
|------|-------------|
| SUPER_OWNER | Full access, deployment approval/execution |
| SUPER_ADMIN | Admin management, system configuration |
| ADMIN | User management, basic operations |
| SUPPORT | Read-only access, user support |
| AUDITOR | Audit log access, compliance reporting |


---

## 14. Change Log

| Date | Version | Service | Change | Author |
|------|---------|---------|--------|--------|
| 2025-12-24 | 2.1.15 | svc-admin | Added kubectl, fixed health check ports, fixed approval sync | System |

---

## Appendix A: Quick Reference Commands

### Check Deployment Status
```bash
kubectl get deployments -n backend-<env> -o wide
```

### Check Pod Logs
```bash
kubectl logs -n backend-<env> deployment/<service> --tail=100
```

### Port Forward to Service
```bash
kubectl port-forward -n backend-<env> svc/<service> <local>:<remote>
```

### Check Image Version
```bash
kubectl get deployment <service> -n backend-<env> -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### Restart Deployment
```bash
kubectl rollout restart deployment/<service> -n backend-<env>
```

---

*Document generated automatically. Update after each deployment.*
