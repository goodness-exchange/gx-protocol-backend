# Operations Documentation

This directory contains operational guides, runbooks, and procedures for managing the GX Protocol backend infrastructure in production.

---

## High Availability (HA) Documentation

### Multi-Identity Fabric Wallet Integration

The outbox-submitter worker implements multi-identity Fabric client pooling with role-based access control (ABAC) for blockchain operations. The following documents provide comprehensive guidance for deployment and operations:

#### 📘 [HA Deployment Guide](./HA_DEPLOYMENT_GUIDE.md)
**Purpose**: Complete reference for deploying and managing the high-availability outbox-submitter worker configuration.

**Contents**:
- Multi-replica architecture overview
- Pod distribution and failover behavior
- Image building and multi-node distribution procedures
- ConfigMap wallet management and credential rotation
- Rolling update procedures with zero downtime
- Post-deployment verification checklists
- Rollback procedures
- Security considerations and Secret migration path

**When to Use**:
- Deploying new versions of outbox-submitter
- Rotating Fabric wallet credentials
- Understanding HA architecture and load distribution
- Troubleshooting deployment issues

---

#### 📗 [Scaling Runbook](./SCALING_RUNBOOK.md)
**Purpose**: Step-by-step operational procedures for scaling the outbox-submitter deployment up or down.

**Contents**:
- Prerequisites for scaling operations
- Scaling up procedures (increasing replicas)
- Scaling down procedures (decreasing replicas)
- Emergency shutdown (scaling to zero)
- Troubleshooting common scaling issues
- Autoscaling considerations (HPA)
- Monitoring and alerting recommendations
- Capacity planning guidelines
- Common scaling scenarios (maintenance, geographic expansion, high-traffic events)

**When to Use**:
- Adjusting replica count based on transaction volume
- Preparing for planned maintenance or high-traffic events
- Responding to queue depth alerts
- Planning capacity for growth

---

#### 📙 [Phase 3 Deployment Record](../work-records/2025-11/2025-11-20-phase3-wallet-deployment.md)
**Purpose**: Historical record of Phase 3 multi-identity wallet deployment with lessons learned.

**Contents**:
- Complete deployment timeline (3 iterations: v2.0.14, v2.0.15, v2.0.16)
- Technical challenges and solutions (ConfigMap path mismatch, image distribution)
- Infrastructure optimization (node affinity strategy)
- Performance metrics and verification logs
- Build and deployment command reference
- Troubleshooting guide for ConfigMap issues

**When to Use**:
- Understanding deployment evolution and decision rationale
- Learning from past challenges (ConfigMap flat structure, geographic image distribution)
- Reference for troubleshooting similar issues
- Onboarding new team members to HA architecture

---

## Document Relationships

```
┌─────────────────────────────────────────────────────────┐
│          Phase 3 Deployment Record                      │
│  (Historical context and lessons learned)               │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ References
                 ▼
┌─────────────────────────────────────────────────────────┐
│          HA Deployment Guide                            │
│  (Architecture and deployment procedures)               │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Referenced by
                 ▼
┌─────────────────────────────────────────────────────────┐
│          Scaling Runbook                                │
│  (Operational scaling procedures)                       │
└─────────────────────────────────────────────────────────┘
```

**Navigation Flow**:
1. **New Deployment**: Start with HA Deployment Guide → Refer to Phase 3 Record for troubleshooting
2. **Scaling Operations**: Use Scaling Runbook → Reference HA Deployment Guide for prerequisites
3. **Learning/Onboarding**: Read Phase 3 Record → Study HA Deployment Guide → Practice with Scaling Runbook

---

## Quick Reference

### Common Tasks

| Task | Document | Section |
|------|----------|---------|
| Deploy new version | [HA Deployment Guide](./HA_DEPLOYMENT_GUIDE.md) | Deployment Procedures |
| Scale up for traffic spike | [Scaling Runbook](./SCALING_RUNBOOK.md) | Scaling Up |
| Scale down after event | [Scaling Runbook](./SCALING_RUNBOOK.md) | Scaling Down |
| Rotate wallet credentials | [HA Deployment Guide](./HA_DEPLOYMENT_GUIDE.md) | ConfigMap Wallet Management |
| Troubleshoot image pull failures | [Phase 3 Deployment Record](../work-records/2025-11/2025-11-20-phase3-wallet-deployment.md) | Challenge 2 |
| Fix ConfigMap path issues | [Phase 3 Deployment Record](../work-records/2025-11/2025-11-20-phase3-wallet-deployment.md) | Challenge 1 |
| Node maintenance | [Scaling Runbook](./SCALING_RUNBOOK.md) | Scenario 1 |
| Add new geographic region | [Scaling Runbook](./SCALING_RUNBOOK.md) | Scenario 2 |
| Prepare for Black Friday | [Scaling Runbook](./SCALING_RUNBOOK.md) | Scenario 3 |
| Rollback deployment | [HA Deployment Guide](./HA_DEPLOYMENT_GUIDE.md) | Rollback Procedures |
| Verify pod health | [HA Deployment Guide](./HA_DEPLOYMENT_GUIDE.md) | Post-Deployment Verification |
| Monitor queue depth | [Scaling Runbook](./SCALING_RUNBOOK.md) | Monitoring and Alerting |

---

## Current Production Configuration

**As of 2025-11-20**:

### Outbox Submitter Deployment
- **Version**: `gx-protocol/outbox-submitter:2.0.16`
- **Replicas**: 2
- **Namespaces**: `backend-mainnet`
- **Pod Distribution**:
  - Pod 1: srv1089618.hstgr.cloud (Kuala Lumpur, Malaysia)
  - Pod 2: srv1092158.hstgr.cloud (Frankfurt am Main, Germany)

### Multi-Identity Configuration
Each pod maintains 3 Fabric client connections:
1. **org1-super-admin** (gx_super_admin role): BOOTSTRAP_SYSTEM, INITIALIZE_COUNTRY_DATA, PAUSE_SYSTEM, RESUME_SYSTEM
2. **org1-admin** (gx_admin role): APPOINT_ADMIN, ACTIVATE_TREASURY
3. **org1-partner-api** (gx_partner_api role): All standard transactions

**Total Fabric Connections**: 6 (3 identities × 2 replicas)

### Performance Baseline
- **Throughput**: ~100-150 commands/second (combined)
- **Latency**: <2 seconds (outbox insert to Fabric submission)
- **Initialization Time**: ~271ms per pod (all 3 Fabric clients)
- **Resource Usage**: ~200m CPU, ~512Mi memory per replica

---

## Operations Workflow

### Daily Operations

**Morning Checks** (every workday):
```bash
# 1. Verify all pods healthy
kubectl get pods -n backend-mainnet -l app=outbox-submitter

# 2. Check queue depth
kubectl exec -n backend-mainnet postgres-0 -- \
  psql -U gx_admin -d gx_protocol \
  -c "SELECT COUNT(*) FROM outbox_commands WHERE status = 'PENDING';"

# 3. Review recent logs for errors
kubectl logs -n backend-mainnet -l app=outbox-submitter --since=24h | grep -i error
```

**Expected Results**:
- All pods: `1/1 Running`
- Queue depth: <50 pending commands
- No critical errors in logs

### Weekly Maintenance

**Every Monday**:
1. Review Prometheus dashboards for capacity trends
2. Check queue depth metrics for past week
3. Review pod restart counts
4. Verify Fabric client connection health
5. Update capacity planning spreadsheet

### Monthly Reviews

**First Monday of Month**:
1. Review past 30 days transaction volume
2. Compare against capacity planning projections
3. Check for any recurring errors or patterns
4. Update runbooks based on incidents
5. Review image distribution across all nodes
6. Verify ConfigMap wallet credential expiry dates

---

## Incident Response

### Severity Levels

**Critical (P0)**: All outbox-submitter pods down, blockchain writes stopped
- **Response Time**: Immediate (15 minutes)
- **Escalation**: Incident Commander + Backend Lead
- **Runbook**: [Scaling Runbook - Troubleshooting Scale-Down Issues](./SCALING_RUNBOOK.md#troubleshooting-scale-down-issues)

**High (P1)**: Single pod down, degraded performance
- **Response Time**: 1 hour
- **Escalation**: On-call engineer
- **Runbook**: [HA Deployment Guide - Post-Deployment Verification](./HA_DEPLOYMENT_GUIDE.md#post-deployment-verification)

**Medium (P2)**: Queue depth growing, potential capacity issue
- **Response Time**: 4 hours
- **Escalation**: Operations team
- **Runbook**: [Scaling Runbook - Scaling Up](./SCALING_RUNBOOK.md#scaling-up-increasing-replicas)

**Low (P3)**: Intermittent errors, no impact on processing
- **Response Time**: Next business day
- **Escalation**: None
- **Runbook**: Review logs, document for weekly review

### Common Incidents

#### Incident: All Pods Failing to Start
**Symptoms**: `CrashLoopBackOff` or `Error` status on all pods

**Investigation**:
1. Check ConfigMap exists: `kubectl get configmap fabric-wallet -n backend-mainnet`
2. Check Fabric network: `kubectl get pods -n fabric`
3. Check database: `kubectl get statefulset postgres -n backend-mainnet`
4. Review pod logs: `kubectl logs -n backend-mainnet -l app=outbox-submitter`

**Resolution**: See [HA Deployment Guide - Post-Deployment Verification](./HA_DEPLOYMENT_GUIDE.md#post-deployment-verification)

#### Incident: Queue Depth Continuously Growing
**Symptoms**: Outbox table has >500 pending commands, growing by >50/min

**Investigation**:
1. Check pod count: `kubectl get deployment outbox-submitter -n backend-mainnet`
2. Check processing logs: `kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=100`
3. Check Fabric network latency
4. Check database connection pool

**Resolution**: See [Scaling Runbook - Scaling Up](./SCALING_RUNBOOK.md#scaling-up-increasing-replicas)

#### Incident: Image Pull Failures on New Deployment
**Symptoms**: `ImagePullBackOff` or `ErrImagePull` on pod

**Investigation**:
1. Identify node: `kubectl get pods -n backend-mainnet -l app=outbox-submitter -o wide`
2. Check image on node: SSH to node, run `k3s ctr images ls | grep outbox-submitter`

**Resolution**: See [Scaling Runbook - Troubleshooting Scale-Up Issues](./SCALING_RUNBOOK.md#issue-pod-stuck-in-imagepullbackoff)

---

## Contact and Escalation

**Primary Contacts**:
- **Operations Lead**: [Configure contact info]
- **Backend Lead**: [Configure contact info]
- **On-Call Engineer**: [Configure PagerDuty/OpsGenie integration]

**Escalation Path**:
1. On-call engineer (P1-P3 incidents)
2. Backend lead (P0 incidents, or P1 not resolved in 2 hours)
3. Operations lead (Multi-system impact)
4. Incident commander (Critical system-wide outage)

---

## Additional Resources

### Related Documentation
- **Deployment Architecture**: `../architecture/DEPLOYMENT_ARCHITECTURE.md`
- **CQRS Pattern**: `../patterns/OUTBOX_PATTERN.md`
- **Multi-Identity Fabric Client**: `../../packages/core-fabric/README.md`
- **Monitoring Guide**: `../observability/MONITORING.md`

### External Resources
- [Kubernetes Rolling Updates](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/)
- [Hyperledger Fabric Operations Guide](https://hyperledger-fabric.readthedocs.io/en/latest/operations_service.html)
- [K3s Container Runtime](https://docs.k3s.io/advanced#using-cri-tools)

---

## Document Maintenance

**Review Schedule**: Quarterly

**Owners**:
- HA Deployment Guide: Backend Operations Team
- Scaling Runbook: Backend Operations Team
- This README: Backend Operations Team

**Change Process**:
1. Propose changes via pull request
2. Review by operations team
3. Test procedures in staging environment
4. Update documentation
5. Communicate changes to team

**Version History**:
- 2025-11-20: Initial comprehensive HA documentation suite created
- [Future versions will be logged here]

---

**Last Updated**: 2025-11-20
**Document Version**: 1.0
