# Deployment Version Tracker

> **LIVING DOCUMENT**: Update after every deployment.
> Last Updated: 2025-12-24T05:45:00Z

## Current Versions by Environment

### DevNet (backend-devnet)

| Service | Current Version | Previous Version | Last Deployed | Status |
|---------|-----------------|------------------|---------------|--------|
| svc-admin | 2.1.15 | 2.1.14 | 2025-12-24 | Running |
| svc-identity | phase4-v2 | - | 2025-12-20 | Running |
| svc-tokenomics | 2.1.5 | 2.1.4 | 2025-12-18 | Running |
| gx-wallet-frontend | 1.1.0 | 1.0.9 | 2025-12-19 | Running |
| outbox-submitter | 2.1.6 | 2.1.5 | 2025-12-15 | Running |
| projector | 2.1.5 | 2.1.4 | 2025-12-15 | Running |

### TestNet (backend-testnet)

| Service | Current Version | Previous Version | Last Deployed | Status |
|---------|-----------------|------------------|---------------|--------|
| svc-admin | 2.1.15 | 2.1.10 | 2025-12-24 | Running |
| svc-identity | 2.1.9 | 2.1.8 | 2025-12-20 | Running |
| svc-tokenomics | 2.1.5 | 2.1.4 | 2025-12-18 | Running |
| gx-wallet-frontend | 1.2.0 | 1.1.0 | 2025-12-22 | Running |
| outbox-submitter | 2.1.6 | 2.1.5 | 2025-12-15 | Running |
| projector | 2.1.5 | 2.1.4 | 2025-12-15 | Running |

### MainNet (backend-mainnet)

| Service | Current Version | Previous Version | Last Deployed | Status |
|---------|-----------------|------------------|---------------|--------|
| svc-admin | 2.1.10 | 2.1.9 | 2025-12-20 | Running |
| svc-identity | 2.1.9 | 2.1.8 | 2025-12-20 | Running |
| svc-tokenomics | 2.1.5 | 2.1.4 | 2025-12-18 | Running |
| svc-governance | 2.1.5 | 2.1.4 | 2025-12-15 | Running |
| svc-loanpool | 2.1.5 | 2.1.4 | 2025-12-15 | Running |
| svc-tax | 2.1.5 | 2.1.4 | 2025-12-15 | Running |
| svc-organization | 2.1.5 | 2.1.4 | 2025-12-15 | Running |
| gx-wallet-frontend | 1.0.0 | - | 2025-12-10 | Running |
| outbox-submitter | 2.1.6 | 2.1.5 | 2025-12-15 | Running |
| projector | 2.1.5 | 2.1.4 | 2025-12-15 | Running |

---

## Version Compatibility Matrix

| svc-admin | svc-identity | svc-tokenomics | Compatible |
|-----------|--------------|----------------|------------|
| 2.1.15 | 2.1.9 | 2.1.5 | ✓ |
| 2.1.10 | 2.1.9 | 2.1.5 | ✓ |
| 2.1.9 | 2.1.8 | 2.1.4 | ✓ |

---

## Pending Deployments

| Service | Version | From | To | Status | Requested By | Date |
|---------|---------|------|-----|--------|--------------|------|
| svc-admin | 2.1.15 | TestNet | MainNet | PENDING | - | - |

---

## Deployment History

### 2025-12-24

| Time (UTC) | Service | Version | Environment | Action | Result |
|------------|---------|---------|-------------|--------|--------|
| 05:36:33 | svc-admin | 2.1.15 | TestNet | Promote from DevNet | SUCCESS |
| 05:15:00 | svc-admin | 2.1.15 | DevNet | Deploy new build | SUCCESS |

### 2025-12-22

| Time (UTC) | Service | Version | Environment | Action | Result |
|------------|---------|---------|-------------|--------|--------|
| - | gx-wallet-frontend | 1.2.0 | TestNet | Promote from DevNet | SUCCESS |

---

## Registry Image Inventory

### svc-admin
```
Available: 2.1.5, 2.1.6, 2.1.7, 2.1.8, 2.1.9, 2.1.10, 2.1.11, 2.1.12, 2.1.13, 2.1.14, 2.1.15
```

### svc-identity
```
Available: 2.1.5, 2.1.6, 2.1.7, 2.1.8, 2.1.9
```

### svc-tokenomics
```
Available: 2.1.3, 2.1.4, 2.1.5
```

---

## Pre-Deployment Checklist

Before any deployment, verify:

- [ ] Target environment is healthy
- [ ] Database migrations are compatible
- [ ] Redis schema is compatible
- [ ] API contracts are backward compatible
- [ ] Health checks pass in source environment
- [ ] Rollback version is available in registry
- [ ] SUPER_OWNER approval obtained

---

## Rollback Procedures

### Quick Rollback Command
```bash
kubectl set image deployment/<service> <service>=10.43.75.195:5000/<service>:<previous-version> -n backend-<env>
```

### Verify Rollback
```bash
kubectl rollout status deployment/<service> -n backend-<env>
kubectl get pods -n backend-<env> -l app=<service>
```

---

*Update this document after every deployment.*
