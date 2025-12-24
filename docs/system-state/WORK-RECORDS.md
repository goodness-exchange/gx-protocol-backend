# Work Records

> Chronological record of all work performed on the GX Protocol system.

---

## December 24, 2025

### Session: Deployment Promotion Workflow Testing

**Duration**: ~2 hours
**Objective**: Test end-to-end deployment promotion workflow

#### Work Performed

1. **Bug Fixes Implemented**

   | Issue | Root Cause | Fix Applied |
   |-------|------------|-------------|
   | Health check failing | Using port 80 instead of service-specific ports | Added port mapping (svc-admin:3006, svc-identity:3001, etc.) |
   | kubectl not found in container | kubectl not installed in Docker image | Added kubectl installation to Dockerfile |
   | Deployment status not updating | Approval vote not syncing to DeploymentRecord | Added status sync in approval.service.ts |
   | Registry path incorrect | Using old registry.gxcoin.money | Updated to 10.43.75.195:5000 |

2. **Commits Created**

   | Commit | Message |
   |--------|---------|
   | e2116d8 | fix(svc-admin): add kubectl to Docker image for deployment operations |
   | 85e08b6 | fix(svc-admin): sync deployment status after approval vote |
   | 527f1f2 | fix(svc-admin): correct health check port mapping and registry path |
   | c156f9b | chore(svc-admin): add kubernetes client-node dependency |

3. **Deployments Executed**

   | Service | Version | Environment | Result |
   |---------|---------|-------------|--------|
   | svc-admin | 2.1.15 | DevNet | Success |
   | svc-admin | 2.1.15 | TestNet | Success |
   | svc-admin | 2.1.15 | **MainNet** | **Success** |
   | gx-wallet-frontend | 1.2.0 | **MainNet** | **Success** |

4. **Documentation Created**

   | Document | Purpose |
   |----------|---------|
   | MASTER-SYSTEM-DOCUMENT.md | Complete system reference |
   | ENV-VARIABLES-REFERENCE.md | Environment variables reference |
   | DEPLOYMENT-TRACKER.md | Version tracking across environments |
   | SESSION-CONTEXT.md | Session state for continuity |
   | WORK-RECORDS.md | This file |

#### Challenges Encountered

| Challenge | Solution |
|-----------|----------|
| Shell command substitution being mangled | Used script files instead of inline commands |
| Multiple API field name mismatches | Referenced controller source for exact field names |
| Pod readiness failing due to projectionLag | Proceeded with deployment (unrelated infrastructure issue) |
| Port forwards dying unexpectedly | Used nohup and fuser to manage |
| SELF_APPROVAL_NOT_ALLOWED error | Used two-person workflow: manazir creates, superowner approves |
| ImagePullBackOff on srv1117946 (vps2) | Created /etc/rancher/k3s/registries.yaml on vps2 with insecure registry config |
| MainNet postgres-1/redis-0 Pending | Changed vps2 node-role label from 'secondary' to 'primary' |
| TestNet outbox-submitter restarts | Transient PostgreSQL connectivity - self-healed via K8s restart |
| VPS5 SSH brute-force attacks (1336 attempts) | Permanently blocked 20 attacker IPs via firewalld |
| VPS4 disk at 41% (old images accumulating) | Ran aggressive cleanup, freed 39GB (41% → 31%) |
| Cleanup scripts not aggressive enough | Updated cleanup-images.sh to remove old image versions |

5. **Infrastructure Maintenance**

   | Task | Details | Result |
   |------|---------|--------|
   | Full system health check | All 5 VPSs, all environments | All healthy |
   | Backup verification | Past 5 days on all VPSs | All successful |
   | Security scan verification | All VPSs | Running, no threats |
   | VPS5 attacker IP blocking | 20 IPs permanently blocked | Firewalld rules saved |
   | VPS4 disk cleanup | Old container images removed | 39GB freed |
   | Cleanup script upgrade | Now removes old image versions | Deployed to VPS4 |

#### Lessons Learned

1. **Proactive Knowledge Gathering**: Collecting system state upfront prevents trial-and-error debugging
2. **Source Code as Truth**: Always verify API schemas from controller validation code
3. **Container vs K8S Ports**: K8S service port (80) differs from container port (3006, etc.)
4. **Living Documentation**: System documents must be updated after each change
5. **Aggressive Cleanup**: Default `crictl rmi --prune` doesn't remove old tagged versions - must explicitly remove
6. **Security Monitoring**: Regular failed login audits across all VPSs catch brute-force attacks early

---

## Previous Sessions

### December 22, 2025
- Deployed gx-wallet-frontend 1.2.0 to TestNet
- Fixed Q Send functionality

### December 20, 2025
- Deployed svc-identity 2.1.9 to MainNet
- Fixed MainNet svc-identity file permissions issue

### December 18, 2025
- Deployed svc-tokenomics 2.1.5 across all environments
- Implemented new transfer validation rules

---

## Metrics

### This Month (December 2025)

| Metric | Value |
|--------|-------|
| Deployments to DevNet | 15+ |
| Deployments to TestNet | 8 |
| Deployments to MainNet | 6 |
| Rollbacks | 1 |
| Critical Issues Fixed | 6 |

---

*Update this file after each work session.*
