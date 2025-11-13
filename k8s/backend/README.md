# GX Protocol Backend - Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the GX Protocol backend services to a production cluster.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Namespace: backend-mainnet                           │  │
│  │                                                         │  │
│  │  ┌────────────────┐     ┌──────────────┐             │  │
│  │  │  svc-identity  │────▶│ PostgreSQL   │             │  │
│  │  │  (API)         │     │  (read model)│             │  │
│  │  │  Replicas: 3   │     └──────────────┘             │  │
│  │  └────────────────┘            │                      │  │
│  │         │                       │                      │  │
│  │         │ writes                │ reads                │  │
│  │         ▼                       ▼                      │  │
│  │  ┌────────────────┐     ┌──────────────┐             │  │
│  │  │ OutboxCommand  │     │ UserProfile  │             │  │
│  │  │ table          │     │ Wallet       │             │  │
│  │  └────────────────┘     │ Transaction  │             │  │
│  │         │                └──────────────┘             │  │
│  │         │ polls                 ▲                      │  │
│  │         ▼                       │ updates              │  │
│  │  ┌────────────────┐            │                      │  │
│  │  │outbox-submitter│            │                      │  │
│  │  │  (worker)      │            │                      │  │
│  │  │  Replicas: 2   │            │                      │  │
│  │  └────────────────┘            │                      │  │
│  │         │                       │                      │  │
│  │         │ submits               │ listens              │  │
│  │         ▼                       │                      │  │
│  │  ┌─────────────────────────────┴──────┐              │  │
│  │  │    Hyperledger Fabric Network       │              │  │
│  │  │    (namespace: fabric)               │              │  │
│  │  └─────────────────────────────────────┘              │  │
│  │                                 ▲                      │  │
│  │                                 │ gRPC stream          │  │
│  │                                 │                      │  │
│  │  ┌────────────────┐             │                      │  │
│  │  │   projector    │─────────────┘                      │  │
│  │  │   (worker)     │                                    │  │
│  │  │   Replicas: 1  │                                    │  │
│  │  └────────────────┘                                    │  │
│  │                                                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Services

### 1. **svc-identity** (HTTP API)
- **Purpose**: User authentication and profile management
- **Endpoints**:
  - `POST /api/v1/auth/login` - User login
  - `POST /api/v1/users` - User registration
  - `GET /api/v1/users/:id` - Get user profile
  - `PATCH /api/v1/users/:id` - Update profile
  - `POST /api/v1/users/:id/kyc` - Submit KYC
- **Replicas**: 3 (auto-scales 3-10 based on CPU)
- **Port**: 3001 (exposed on port 80 via Service)

### 2. **outbox-submitter** (Worker)
- **Purpose**: Submit commands from database to blockchain
- **Pattern**: Transactional Outbox
- **Replicas**: 2 (can scale horizontally)
- **Metrics**: Port 9090

### 3. **projector** (Worker)
- **Purpose**: Build read models from blockchain events
- **Pattern**: Event-Driven Projection
- **Replicas**: 1 (ordered processing required)
- **Metrics**: Port 9091

## Prerequisites

### 1. Kubernetes Cluster
- **Version**: 1.25+
- **Node Requirements**:
  - At least 3 nodes (for pod anti-affinity)
  - 4 CPU cores per node
  - 8 GB RAM per node

### 2. Dependencies (Already Deployed)
- PostgreSQL cluster (namespace: `backend-mainnet`)
- Redis cluster (namespace: `backend-mainnet`)
- Hyperledger Fabric network (namespace: `fabric`)

### 3. Required Tools
```bash
kubectl version --client  # >= 1.25
helm version              # >= 3.0 (optional, for Prometheus)
```

### 4. Optional Components
- **Metrics Server**: For HPA (CPU-based autoscaling)
- **Prometheus Operator**: For metrics collection
- **Ingress Controller**: For external access (nginx, traefik, etc.)

## Deployment Steps

### Step 1: Create Namespace (if not exists)

```bash
kubectl create namespace backend-mainnet
kubectl label namespace backend-mainnet pod-security.kubernetes.io/enforce=restricted
```

### Step 2: Create Fabric Credentials Secret

First, copy Fabric certificates from the Fabric network:

```bash
# From Fabric namespace, extract peer certificates
kubectl exec -n fabric peer0-org1-0 -- cat /etc/hyperledger/fabric/msp/signcerts/cert.pem > /tmp/cert.pem
kubectl exec -n fabric peer0-org1-0 -- cat /etc/hyperledger/fabric/msp/keystore/key.pem > /tmp/key.pem
kubectl exec -n fabric peer0-org1-0 -- cat /etc/hyperledger/fabric/tls/ca.crt > /tmp/ca-cert.pem

# Create secret in backend namespace
kubectl create secret generic fabric-credentials \
  --from-file=cert.pem=/tmp/cert.pem \
  --from-file=key.pem=/tmp/key.pem \
  --from-file=ca-cert.pem=/tmp/ca-cert.pem \
  -n backend-mainnet

# Clean up
rm /tmp/cert.pem /tmp/key.pem /tmp/ca-cert.pem
```

### Step 3: Generate Production Secrets

```bash
# Generate JWT secret (32+ characters)
JWT_SECRET=$(openssl rand -base64 48)

# Update backend-secrets.yaml with real values
kubectl create secret generic backend-secrets \
  --from-literal=DATABASE_USER=gx_admin \
  --from-literal=DATABASE_PASSWORD='<STRONG-PASSWORD-HERE>' \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  -n backend-mainnet
```

**IMPORTANT**: Replace `<STRONG-PASSWORD-HERE>` with a strong database password!

### Step 4: Apply Configuration

```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/backend

# Apply ConfigMap (non-sensitive config)
kubectl apply -f config/backend-config.yaml

# Apply RBAC (ServiceAccounts)
kubectl apply -f config/rbac.yaml
```

### Step 5: Deploy Services

```bash
# Deploy workers
kubectl apply -f deployments/outbox-submitter.yaml
kubectl apply -f deployments/projector.yaml

# Deploy API service
kubectl apply -f deployments/svc-identity.yaml

# Apply HorizontalPodAutoscaler (if Metrics Server installed)
kubectl apply -f deployments/hpa.yaml
```

### Step 6: Verify Deployments

```bash
# Check pod status
kubectl get pods -n backend-mainnet

# Expected output:
# NAME                               READY   STATUS    RESTARTS   AGE
# outbox-submitter-xxxxxxxxx-xxxxx   1/1     Running   0          2m
# outbox-submitter-xxxxxxxxx-xxxxx   1/1     Running   0          2m
# projector-xxxxxxxxx-xxxxx          1/1     Running   0          2m
# svc-identity-xxxxxxxxx-xxxxx       1/1     Running   0          2m
# svc-identity-xxxxxxxxx-xxxxx       1/1     Running   0          2m
# svc-identity-xxxxxxxxx-xxxxx       1/1     Running   0          2m

# Check services
kubectl get svc -n backend-mainnet

# Check logs
kubectl logs -n backend-mainnet -l app=svc-identity --tail=50
kubectl logs -n backend-mainnet -l app=outbox-submitter --tail=50
kubectl logs -n backend-mainnet -l app=projector --tail=50
```

### Step 7: Test Health Endpoints

```bash
# Port-forward to identity service
kubectl port-forward -n backend-mainnet svc/svc-identity 3001:80

# In another terminal:
# Health check
curl http://localhost:3001/health

# Readiness check (includes projection lag)
curl http://localhost:3001/readyz

# Liveness check
curl http://localhost:3001/livez
```

### Step 8: Expose Service Externally (Choose One)

#### Option A: NodePort (Development)

```bash
kubectl patch svc svc-identity -n backend-mainnet -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":3001,"nodePort":30301}]}}'

# Access via: http://<node-ip>:30301
```

#### Option B: LoadBalancer (Cloud)

```bash
kubectl patch svc svc-identity -n backend-mainnet -p '{"spec":{"type":"LoadBalancer"}}'

# Get external IP
kubectl get svc svc-identity -n backend-mainnet
```

#### Option C: Ingress (Production)

Create `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: svc-identity-ingress
  namespace: backend-mainnet
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.gxcoin.com
    secretName: api-gxcoin-tls
  rules:
  - host: api.gxcoin.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: svc-identity
            port:
              number: 80
```

```bash
kubectl apply -f ingress.yaml
```

## Monitoring

### Prometheus Metrics

All services expose Prometheus metrics:

- **svc-identity**: `http://svc-identity:80/metrics`
- **outbox-submitter**: `http://outbox-submitter-metrics:9090/metrics`
- **projector**: `http://projector-metrics:9091/metrics`

### Key Metrics to Monitor

#### Outbox Submitter:
- `outbox_commands_processed_total{status="success"}` - Commands submitted successfully
- `outbox_queue_depth` - Number of pending commands
- `outbox_processing_duration_seconds` - Time to process each command

#### Projector:
- `projector_events_processed_total{status="success"}` - Events processed
- `projector_blockchain_height` - Current block number
- `projector_lag_blocks` - Blocks behind blockchain tip
- `projector_processing_duration_seconds` - Time per event

#### API Service:
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `nodejs_heap_size_used_bytes` - Memory usage

### Alerting Rules (Prometheus)

```yaml
groups:
- name: backend-alerts
  rules:
  # Outbox queue depth too high
  - alert: OutboxQueueDepthHigh
    expr: outbox_queue_depth > 1000
    for: 5m
    annotations:
      summary: "Outbox queue depth is {{ $value }}"

  # Projector falling behind
  - alert: ProjectorLagging
    expr: projector_lag_blocks > 100
    for: 2m
    annotations:
      summary: "Projector is {{ $value }} blocks behind"

  # API error rate high
  - alert: APIErrorRateHigh
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 2m
    annotations:
      summary: "API 5xx error rate is {{ $value }}"
```

## Scaling

### Manual Scaling

```bash
# Scale identity service
kubectl scale deployment svc-identity -n backend-mainnet --replicas=5

# Scale outbox submitter
kubectl scale deployment outbox-submitter -n backend-mainnet --replicas=4

# Projector should remain at 1 replica (ordered processing)
```

### Auto-Scaling (HPA)

HPA is configured for svc-identity to scale 3-10 replicas based on CPU/memory:

```bash
# Check HPA status
kubectl get hpa -n backend-mainnet

# Describe HPA
kubectl describe hpa svc-identity-hpa -n backend-mainnet
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n backend-mainnet

# Common issues:
# - ImagePullBackOff: Image not found in registry
# - CrashLoopBackOff: Application crashes on startup
# - Pending: Not enough resources or node selector mismatch
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl exec -n backend-mainnet deploy/svc-identity -- sh -c 'echo "SELECT 1" | psql $DATABASE_URL'

# Check if PostgreSQL is running
kubectl get pods -n backend-mainnet -l app=postgres
```

### Fabric Connection Issues

```bash
# Check if Fabric credentials are mounted
kubectl exec -n backend-mainnet deploy/outbox-submitter -- ls -la /etc/fabric/

# Test Fabric peer connectivity
kubectl exec -n backend-mainnet deploy/outbox-submitter -- nc -zv peer0-org1.fabric.svc.cluster.local 7051
```

### High Projection Lag

```bash
# Check projector logs
kubectl logs -n backend-mainnet -l app=projector --tail=100

# Possible causes:
# - Blockchain producing blocks faster than projector can process
# - Database slow (check PostgreSQL metrics)
# - Large event payloads causing JSON parsing overhead

# Solutions:
# - Increase projector CPU/memory
# - Optimize database queries
# - Add database indexes
```

## Rollback

If deployment fails:

```bash
# Rollback to previous version
kubectl rollout undo deployment/svc-identity -n backend-mainnet
kubectl rollout undo deployment/outbox-submitter -n backend-mainnet
kubectl rollout undo deployment/projector -n backend-mainnet

# Check rollout status
kubectl rollout status deployment/svc-identity -n backend-mainnet
```

## Cleanup

To remove all backend services:

```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/backend

# Delete deployments
kubectl delete -f deployments/

# Delete configuration
kubectl delete -f config/

# Delete secrets (optional - BE CAREFUL!)
# kubectl delete secret backend-secrets -n backend-mainnet
# kubectl delete secret fabric-credentials -n backend-mainnet
```

## Next Steps

1. **Setup Ingress Controller**: For production HTTPS access
2. **Configure DNS**: Point domain to LoadBalancer/Ingress IP
3. **Setup TLS Certificates**: Use cert-manager with Let's Encrypt
4. **Configure Monitoring**: Deploy Prometheus + Grafana dashboards
5. **Setup Log Aggregation**: Use Loki, Elasticsearch, or cloud logging
6. **Implement CI/CD**: Automate deployments with GitLab CI, GitHub Actions, etc.
7. **Backup Strategy**: Regular database backups to S3 or similar

## Support

For issues or questions:
- Check logs: `kubectl logs -n backend-mainnet <pod-name>`
- Check events: `kubectl get events -n backend-mainnet --sort-by='.lastTimestamp'`
- Review documentation in `/docs/` directory
