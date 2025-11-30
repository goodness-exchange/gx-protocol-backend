# LECTURE 19: Kubernetes Deployment & Operations

## Overview

This lecture covers the complete Kubernetes deployment architecture for the GX Protocol, including both the Hyperledger Fabric blockchain network and the backend microservices. We explore the co-located deployment strategy, global load balancing, network policies, and operational procedures.

**Prerequisites:**
- LECTURE-11: Smart Contract Architecture
- LECTURE-05: Transactional Outbox Pattern
- Basic understanding of Kubernetes concepts (Pods, Services, Deployments)
- Familiarity with YAML configuration

---

## Learning Objectives

By the end of this lecture, you will be able to:
1. Understand the GX Protocol's global multi-region deployment architecture
2. Explain the co-located architecture decision and its benefits
3. Configure Kubernetes manifests for StatefulSets, Deployments, and Services
4. Implement zero-trust network policies for namespace isolation
5. Perform common operational tasks: scaling, upgrades, monitoring
6. Troubleshoot deployment issues in production

---

## Section 1: Infrastructure Overview

### 1.1 Global Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   GLOBAL INFRASTRUCTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                   Cloudflare GeoDNS                      │  │
│   │               api.gxcoin.money (3 A records)            │  │
│   └────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│            ┌───────────────┼───────────────┐                   │
│            ▼               ▼               ▼                   │
│   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐    │
│   │   ASIA-PACIFIC │ │   AMERICAS     │ │   EUROPE       │    │
│   │  srv1089618    │ │  srv1089624    │ │  srv1092158    │    │
│   │  Malaysia      │ │  Phoenix, USA  │ │  Frankfurt     │    │
│   │  72.60.210.201 │ │  217.196.51.190│ │  72.61.81.3    │    │
│   │  control-plane │ │  control-plane │ │  control-plane │    │
│   └────────────────┘ └────────────────┘ └────────────────┘    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    TESTNET                               │  │
│   │  srv1117946 | Malaysia | 72.61.116.210 | worker         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Node Specifications:**

| Node | Role | Location | Public IP | CPU | RAM | Storage |
|------|------|----------|-----------|-----|-----|---------|
| srv1089618 | control-plane | Kuala Lumpur | 72.60.210.201 | 16 cores | 64GB | 1TB SSD |
| srv1089624 | control-plane | Phoenix, USA | 217.196.51.190 | 16 cores | 64GB | 1TB SSD |
| srv1092158 | control-plane | Frankfurt | 72.61.81.3 | 16 cores | 64GB | 1TB SSD |
| srv1117946 | worker | Kuala Lumpur | 72.61.116.210 | 16 cores | 64GB | 1TB SSD |

**Cluster Totals:**
- 64 CPU cores
- 256 GB RAM
- 4 TB SSD storage
- K3s v1.33.5

### 1.2 Namespace Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    NAMESPACE HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Control-Plane Nodes (3)                                        │
│  ├── fabric (namespace)                                         │
│  │   ├── 5 Raft Orderers (orderer0-org0 through orderer4-org0) │
│  │   ├── 4 Peers (peer0-org1, peer1-org1, peer0-org2, peer1-org2)│
│  │   ├── 4 CouchDB instances                                   │
│  │   ├── 5 Fabric CA servers                                   │
│  │   └── Chaincode containers (CCAAS)                          │
│  │                                                              │
│  └── backend-mainnet (namespace)                                │
│      ├── PostgreSQL (3 replicas)                               │
│      ├── Redis (3 replicas)                                    │
│      ├── outbox-submitter (2 replicas)                         │
│      ├── projector (2 replicas)                                │
│      └── API Services (7 services × 3 replicas = 21 pods)      │
│                                                                 │
│  Worker Node (1)                                                │
│  ├── fabric-testnet (namespace)                                 │
│  │   ├── 1 Orderer                                             │
│  │   ├── 2 Peers                                               │
│  │   └── 2 CouchDB instances                                   │
│  │                                                              │
│  └── backend-testnet (namespace)                                │
│      └── Single replica of each service                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 2: Co-Located Architecture Decision

### 2.1 Why Co-Location?

The GX Protocol deploys backend services **on the same Kubernetes cluster** as the Hyperledger Fabric network. This architectural decision provides significant performance and operational benefits.

```
┌─────────────────────────────────────────────────────────────────┐
│                 LATENCY COMPARISON                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Co-Located (Same Cluster):                                     │
│  ┌──────────┐  <1ms   ┌──────────┐                             │
│  │  Backend │ ──────► │  Fabric  │                             │
│  │  Pod     │         │  Peer    │                             │
│  └──────────┘         └──────────┘                             │
│                                                                 │
│  Separate Clusters (Cross-Datacenter):                          │
│  ┌──────────┐  50-200ms  ┌──────────┐                          │
│  │  Backend │ ─────────► │  Fabric  │                          │
│  │  Pod     │            │  Peer    │                          │
│  └──────────┘            └──────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Performance Impact:**

| Operation | Co-Located | Separate Clusters |
|-----------|------------|-------------------|
| Chaincode query | 5-10ms | 55-210ms |
| Transaction submission | 10-50ms | 100-500ms |
| Event stream (projector) | <100ms lag | 5-100s lag |
| Fabric SDK round-trips | 3-5ms each | 50-200ms each |

### 2.2 Benefits Analysis

**1. Ultra-Low Latency Communication**
```yaml
# Backend can reach Fabric using internal DNS
orderers:
  - orderer0-org0.fabric.svc.cluster.local:7050
  - orderer1-org0.fabric.svc.cluster.local:7050
peers:
  - peer0-org1.fabric.svc.cluster.local:7051
  - peer0-org2.fabric.svc.cluster.local:7051
```

**2. Network Efficiency**
- Zero inter-datacenter bandwidth costs
- No VPN/VPC peering overhead
- Kubernetes internal DNS for instant service discovery

**3. Operational Simplicity**
```bash
# Single kubectl context for all operations
kubectl get pods -n fabric           # Blockchain
kubectl get pods -n backend-mainnet  # Backend
kubectl get pods -n backend-testnet  # Test environment
```

**4. Cost Efficiency**
- No additional infrastructure provisioning
- Utilizes existing 40% cluster capacity
- Estimated savings: $3,000-5,000/month

### 2.3 Mitigations for Shared Infrastructure

**Risk 1: Shared Fate**
- Mitigation: Multi-node deployment, pod anti-affinity
- Mitigation: Geographic distribution across 3 continents

**Risk 2: Resource Contention**
- Mitigation: ResourceQuotas per namespace
- Mitigation: LimitRanges for container defaults
- Mitigation: PodDisruptionBudgets for maintenance

**Risk 3: Security Isolation**
- Mitigation: Zero-trust NetworkPolicies
- Mitigation: RBAC per namespace
- Mitigation: Separate Secrets per namespace

---

## Section 3: Kubernetes Manifests Deep Dive

### 3.1 StatefulSet for Orderers

```yaml
# From gx-coin-fabric/k8s/base/orderers/orderer0/02-orderer0-statefulset.yaml

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: orderer0
  namespace: fabric
  labels:
    app: orderer
    orderer: orderer0
spec:
  serviceName: orderer0       # Headless service for DNS
  replicas: 1                 # Each orderer is unique
  selector:
    matchLabels:
      app: orderer
      orderer: orderer0
  template:
    metadata:
      labels:
        app: orderer
        orderer: orderer0
    spec:
      containers:
      - name: orderer
        image: hyperledger/fabric-orderer:2.5
        ports:
        - containerPort: 7050   # gRPC (transaction submission)
          name: grpc
        - containerPort: 7053   # Admin (osnadmin CLI)
          name: admin
        - containerPort: 9443   # Operations (metrics, health)
          name: operations

        env:
        # General Configuration
        - name: ORDERER_GENERAL_LISTENADDRESS
          value: "0.0.0.0"
        - name: ORDERER_GENERAL_LOCALMSPID
          value: "OrdererMSP"

        # TLS Configuration (all communication encrypted)
        - name: ORDERER_GENERAL_TLS_ENABLED
          value: "true"
        - name: ORDERER_GENERAL_TLS_PRIVATEKEY
          value: "/var/hyperledger/orderer/tls/server.key"
        - name: ORDERER_GENERAL_TLS_CERTIFICATE
          value: "/var/hyperledger/orderer/tls/server.crt"

        # Raft Cluster Configuration
        - name: ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE
          value: "/var/hyperledger/orderer/tls/server.crt"
        - name: ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY
          value: "/var/hyperledger/orderer/tls/server.key"

        # Prometheus Metrics
        - name: ORDERER_OPERATIONS_LISTENADDRESS
          value: "0.0.0.0:9443"
        - name: ORDERER_METRICS_PROVIDER
          value: "prometheus"

        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"

        livenessProbe:
          httpGet:
            path: /healthz
            port: 9443
          initialDelaySeconds: 60
          periodSeconds: 30

        readinessProbe:
          httpGet:
            path: /healthz
            port: 9443
          initialDelaySeconds: 30
          periodSeconds: 10

        volumeMounts:
        - name: msp
          mountPath: /var/hyperledger/orderer/msp
          readOnly: true
        - name: tls
          mountPath: /var/hyperledger/orderer/tls
          readOnly: true
        - name: orderer-data
          mountPath: /var/hyperledger/production/orderer

      volumes:
      # MSP from Kubernetes Secret
      - name: msp
        projected:
          sources:
          - secret:
              name: orderer0-crypto
              items:
              - key: msp-signcerts-cert.pem
                path: signcerts/cert.pem
              - key: msp-keystore-key.pem
                path: keystore/priv_sk
                mode: 0400

      # TLS from Kubernetes Secret
      - name: tls
        projected:
          sources:
          - secret:
              name: orderer0-crypto
              items:
              - key: tls-server.crt
                path: server.crt
              - key: tls-server.key
                path: server.key
                mode: 0400

  # Persistent storage for ledger data
  volumeClaimTemplates:
  - metadata:
      name: orderer-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 10Gi
```

**Key Concepts:**

1. **StatefulSet vs Deployment**: StatefulSets provide stable network identities (orderer0-0, orderer1-0) and persistent storage

2. **Headless Service**: `serviceName: orderer0` creates DNS entries like `orderer0-0.orderer0.fabric.svc.cluster.local`

3. **Secret Projection**: Crypto materials mounted from Kubernetes Secrets with restricted permissions (`mode: 0400`)

4. **Health Probes**: Fabric's operations endpoint provides health checks for Kubernetes

### 3.2 Deployment for Backend Services

```yaml
# Backend microservice deployment pattern

apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-identity
  namespace: backend-mainnet
spec:
  replicas: 3
  selector:
    matchLabels:
      app: svc-identity
  template:
    metadata:
      labels:
        app: svc-identity
    spec:
      # Pod Scheduling Strategy
      affinity:
        # Spread across nodes
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: svc-identity
              topologyKey: kubernetes.io/hostname

        # Prefer control-plane nodes
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists

      containers:
      - name: svc-identity
        image: gx-protocol/svc-identity:2.0.6
        ports:
        - containerPort: 3001
          name: http

        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: backend-config
              key: redis-url
        - name: FABRIC_PEER_ENDPOINT
          value: "peer0-org1.fabric.svc.cluster.local:7051"

        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "1000m"
            memory: "2Gi"

        readinessProbe:
          httpGet:
            path: /readyz
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 5

        livenessProbe:
          httpGet:
            path: /healthz
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10

---
# Service with NodePort for external access
apiVersion: v1
kind: Service
metadata:
  name: svc-identity
  namespace: backend-mainnet
spec:
  type: NodePort
  selector:
    app: svc-identity
  ports:
  - name: http
    port: 3001
    targetPort: 3001
    nodePort: 30001
```

### 3.3 PostgreSQL StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: backend-mainnet
spec:
  serviceName: postgres-headless
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      affinity:
        # Must be on control-plane nodes
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists

        # One per node
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: postgres
            topologyKey: kubernetes.io/hostname

      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: password
        - name: POSTGRES_DB
          value: "gx_protocol"

        resources:
          requests:
            cpu: "1000m"
            memory: "2Gi"
          limits:
            cpu: "2000m"
            memory: "4Gi"

        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data

  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 100Gi
```

---

## Section 4: Network Security (Zero-Trust)

### 4.1 Default Deny Policy

```yaml
# From gx-coin-fabric/k8s/security/01-network-policy-deny-all.yaml

# Deny all ingress and egress traffic by default
# This is the foundation of zero-trust networking
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: fabric
  labels:
    app: security
    component: network-policy
spec:
  podSelector: {}        # Applies to ALL pods
  policyTypes:
  - Ingress              # Block all incoming
  - Egress               # Block all outgoing
```

**Effect:** After applying this policy, all pods in the namespace are isolated. They cannot communicate with anything until explicit allow rules are added.

### 4.2 DNS Egress Policy

```yaml
# Allow DNS resolution (required for service discovery)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: backend-mainnet
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

### 4.3 Backend to Fabric Communication

```yaml
# Allow backend services to reach Fabric components
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-fabric-egress
  namespace: backend-mainnet
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: fabric
    ports:
    - protocol: TCP
      port: 7050    # Orderer gRPC
    - protocol: TCP
      port: 7051    # Peer gRPC
    - protocol: TCP
      port: 7054    # Fabric CA
```

### 4.4 Network Policy Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    NETWORK POLICY MODEL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │  backend-mainnet │   ───►  │     fabric       │             │
│  │                  │   7050  │                  │             │
│  │  svc-identity    │   7051  │  orderers        │             │
│  │  svc-tokenomics  │   7054  │  peers           │             │
│  │  projector       │         │  ca              │             │
│  └──────────────────┘         └──────────────────┘             │
│           │                            │                        │
│           │                            │                        │
│           ▼                            ▼                        │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │   kube-system    │         │   monitoring     │             │
│  │                  │         │                  │             │
│  │   CoreDNS :53    │         │   Prometheus     │             │
│  │   (UDP only)     │         │   Grafana        │             │
│  └──────────────────┘         └──────────────────┘             │
│                                                                 │
│  BLOCKED:                                                       │
│  ✗ backend-mainnet → backend-testnet                           │
│  ✗ backend-testnet → backend-mainnet                           │
│  ✗ fabric → backend-mainnet (except response traffic)          │
│  ✗ External → Any (except through Ingress)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 5: Global Load Balancing

### 5.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REQUEST FLOW (11 STEPS)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User in Singapore requests: https://api.gxcoin.money/...   │
│                    │                                            │
│                    ▼                                            │
│  2. DNS query → Cloudflare GeoDNS returns 72.60.210.201        │
│     (Malaysia - nearest server)                                 │
│                    │                                            │
│                    ▼                                            │
│  3. HTTPS connection to Nginx on srv1089618:443                │
│                    │                                            │
│                    ▼                                            │
│  4. Cloudflare DDoS protection check (transparent)             │
│                    │                                            │
│                    ▼                                            │
│  5. SSL/TLS handshake (Let's Encrypt certificate)              │
│                    │                                            │
│                    ▼                                            │
│  6. Nginx applies rate limiting (10 req/sec per IP)            │
│                    │                                            │
│                    ▼                                            │
│  7. Nginx proxies to localhost:30001 (NodePort)                │
│                    │                                            │
│                    ▼                                            │
│  8. Kubernetes routes to svc-identity pod (ClusterIP)          │
│                    │                                            │
│                    ▼                                            │
│  9. Pod processes request                                       │
│     - Queries PostgreSQL (<1ms)                                │
│     - Reads from Redis cache                                   │
│                    │                                            │
│                    ▼                                            │
│  10. Response flows back through chain                          │
│                    │                                            │
│                    ▼                                            │
│  11. User receives response (~20-50ms total latency)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Nginx Configuration

```nginx
# /etc/nginx/conf.d/api-proxy-https.conf

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# Upstream definitions
upstream identity_backend {
    least_conn;
    server 127.0.0.1:30001 max_fails=3 fail_timeout=30s;
}

upstream tokenomics_backend {
    least_conn;
    server 127.0.0.1:30003 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name api.gxcoin.money;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.gxcoin.money/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.gxcoin.money/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req zone=api_limit burst=20 nodelay;

    # Identity Service
    location /identity {
        proxy_pass http://identity_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Tokenomics Service
    location /tokenomics {
        proxy_pass http://tokenomics_backend;
        # ... same proxy headers ...
    }

    # Health check endpoint
    location /health {
        return 200 'healthy';
        add_header Content-Type text/plain;
    }
}
```

### 5.3 NodePort Service Mapping

| Service | ClusterIP Port | NodePort | URL Path |
|---------|---------------|----------|----------|
| svc-identity | 3001 | 30001 | /identity |
| svc-admin | 3002 | 30002 | /admin |
| svc-tokenomics | 3003 | 30003 | /tokenomics |
| svc-organization | 3004 | 30004 | /organization |
| svc-loanpool | 3005 | 30005 | /loanpool |
| svc-governance | 3006 | 30006 | /governance |
| svc-tax | 3007 | 30007 | /tax |

---

## Section 6: Resource Management

### 6.1 ResourceQuota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: backend-mainnet-quota
  namespace: backend-mainnet
spec:
  hard:
    requests.cpu: "16"
    requests.memory: 32Gi
    limits.cpu: "32"
    limits.memory: 64Gi
    persistentvolumeclaims: "10"
    pods: "50"
```

### 6.2 LimitRange

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: backend-mainnet-limits
  namespace: backend-mainnet
spec:
  limits:
  - max:
      cpu: "4"
      memory: 8Gi
    min:
      cpu: 100m
      memory: 128Mi
    default:
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 250m
      memory: 256Mi
    type: Container
```

### 6.3 Resource Allocation Summary

**Mainnet (backend-mainnet):**

| Component | Replicas | CPU Request | Memory Request | Storage |
|-----------|----------|-------------|----------------|---------|
| PostgreSQL | 3 | 1000m | 2Gi | 100Gi |
| Redis | 3 | 500m | 1Gi | 20Gi |
| Outbox Submitter | 2 | 500m | 1Gi | - |
| Projector | 2 | 500m | 1Gi | - |
| svc-identity | 3 | 500m | 1Gi | - |
| svc-tokenomics | 3 | 500m | 1Gi | - |
| Other services | 15 | 500m | 1Gi | - |
| **Total** | **31** | **~13.5 cores** | **~25Gi** | **~400Gi** |

**Cluster Capacity After Fabric:**
- Available: 29 cores, 96Gi RAM
- Backend Request: 13.5 cores, 25Gi RAM
- **Headroom**: 15.5 cores (53%), 71Gi RAM (74%)

---

## Section 7: High Availability

### 7.1 PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: postgres-pdb
  namespace: backend-mainnet
spec:
  minAvailable: 2      # At least 2 of 3 must be running
  selector:
    matchLabels:
      app: postgres
```

### 7.2 Rolling Updates

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-identity
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1    # Only 1 pod down at a time
      maxSurge: 1          # Create 1 extra pod during update
```

**Update Process:**
1. Create 1 new pod with updated image
2. Wait for readiness probe success
3. Terminate 1 old pod
4. Repeat until all pods updated

**Zero-Downtime**: Always 2-4 pods available during rollout

### 7.3 Node Failure Recovery

**Scenario:** Control-plane node fails

**Impact:**
- PostgreSQL: 1 of 3 offline (67% capacity)
- Redis: 1 of 3 offline (67% capacity)
- API Services: ~1/3 replicas offline (67% capacity)

**Recovery:**
- Kubernetes reschedules pods to healthy nodes
- PVCs reattach when pods restart
- MTTR: ~2-5 minutes

---

## Section 8: Operational Commands

### 8.1 Monitoring Commands

```bash
# Check all pods across namespaces
kubectl get pods -A | grep -E "fabric|backend"

# Check node resource usage
kubectl top nodes

# Check pod resource usage
kubectl top pods -n backend-mainnet

# View logs for a service
kubectl logs -n backend-mainnet -l app=svc-identity --tail=100

# Follow logs in real-time
kubectl logs -n backend-mainnet -l app=projector -f

# Check events (useful for debugging)
kubectl get events -n backend-mainnet --sort-by='.lastTimestamp'
```

### 8.2 Scaling Operations

```bash
# Scale a deployment
kubectl scale deployment svc-identity -n backend-mainnet --replicas=5

# Check scaling status
kubectl rollout status deployment/svc-identity -n backend-mainnet

# Autoscaling (HPA)
kubectl autoscale deployment svc-identity -n backend-mainnet \
  --min=3 --max=10 --cpu-percent=80
```

### 8.3 Deployment Operations

```bash
# Update image version
kubectl set image deployment/svc-identity \
  svc-identity=gx-protocol/svc-identity:2.0.7 \
  -n backend-mainnet

# Watch rollout progress
kubectl rollout status deployment/svc-identity -n backend-mainnet

# Rollback if needed
kubectl rollout undo deployment/svc-identity -n backend-mainnet

# View rollout history
kubectl rollout history deployment/svc-identity -n backend-mainnet
```

### 8.4 Database Operations

```bash
# Port-forward to PostgreSQL for local access
kubectl port-forward -n backend-mainnet svc/postgres-primary 5432:5432

# Execute SQL directly
kubectl exec -n backend-mainnet postgres-0 -- \
  psql -U gx_admin -d gx_protocol -c "SELECT count(*) FROM users"

# Run Prisma migrations
kubectl exec -n backend-mainnet deploy/svc-identity -- \
  npx prisma migrate deploy
```

### 8.5 Chaincode Operations

```bash
# Check chaincode version
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer lifecycle chaincode querycommitted -C gxchannel -n gxtv3
'

# Invoke chaincode
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer chaincode invoke \
    -C gxchannel -n gxtv3 \
    --orderer orderer0-org0:7050 --tls \
    --cafile /tmp/orderer-tls-ca.crt \
    -c '"'"'{"function":"Admin:GetSystemStatus","Args":[]}'"'"'
'
```

---

## Section 9: Monitoring & Alerting

### 9.1 Prometheus Metrics

**Key Metrics to Monitor:**

```yaml
# Infrastructure Metrics
- kube_pod_status_phase{namespace="backend-mainnet"}
- container_cpu_usage_seconds_total
- container_memory_working_set_bytes
- node_disk_io_time_seconds_total

# Application Metrics
- http_requests_total{service="svc-identity"}
- http_request_duration_seconds
- outbox_command_queue_depth
- projector_lag_milliseconds
- fabric_sdk_connection_status

# Database Metrics
- pg_stat_activity_count
- redis_connected_clients
- redis_memory_used_bytes
```

### 9.2 Alert Rules

```yaml
groups:
- name: backend-alerts
  rules:
  - alert: ProjectorLagHigh
    expr: projector_lag_milliseconds > 5000
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Projector lag exceeds 5 seconds"
      description: "Projector is falling behind on processing Fabric events"

  - alert: PodCrashLooping
    expr: rate(kube_pod_container_status_restarts_total{namespace="backend-mainnet"}[15m]) > 0.5
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Pod {{ $labels.pod }} is crash looping"

  - alert: HighCPUUsage
    expr: sum(rate(container_cpu_usage_seconds_total{namespace="backend-mainnet"}[5m])) by (pod) > 0.8
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "High CPU usage on {{ $labels.pod }}"
```

### 9.3 Grafana Dashboards

**Backend Overview Dashboard:**
- Pod health status by namespace
- CPU/memory utilization
- API request rate and latency
- Error rate (5xx responses)

**CQRS Health Dashboard:**
- Outbox queue depth trend
- Projector lag (milliseconds)
- Event processing rate
- Failed transaction count

---

## Section 10: Troubleshooting Guide

### 10.1 Pod Won't Start

```bash
# Check pod status
kubectl describe pod -n backend-mainnet <pod-name>

# Common issues:
# - ImagePullBackOff: Check image name and registry access
# - Pending: Check node resources (kubectl describe nodes)
# - CrashLoopBackOff: Check logs (kubectl logs --previous)
```

### 10.2 Database Connection Refused

```bash
# Verify PostgreSQL is running
kubectl get pods -n backend-mainnet -l app=postgres

# Check service endpoint
kubectl get endpoints -n backend-mainnet postgres-primary

# Test connectivity from a pod
kubectl exec -n backend-mainnet deploy/svc-identity -- \
  nc -zv postgres-primary 5432
```

### 10.3 Fabric Connection Timeout

```bash
# Check network policy
kubectl get networkpolicies -n backend-mainnet

# Test connectivity to Fabric
kubectl exec -n backend-mainnet deploy/svc-identity -- \
  nc -zv peer0-org1.fabric.svc.cluster.local 7051

# Check Fabric peer is running
kubectl get pods -n fabric -l app=peer
```

### 10.4 High Projector Lag

```bash
# Check projector logs
kubectl logs -n backend-mainnet -l app=projector | grep "lag"

# Check event processing state
kubectl exec -n backend-mainnet postgres-0 -- \
  psql -U gx_admin -d gx_protocol -c \
  "SELECT * FROM projector_state ORDER BY last_updated DESC LIMIT 1"

# Check Fabric block height
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer channel getinfo -c gxchannel
'
```

---

## Section 11: Exercises

### Exercise 1: Deploy a New Microservice

Create Kubernetes manifests for a new `svc-notifications` service:
- 3 replicas
- NodePort 30008
- Health checks at /healthz and /readyz
- Resource limits: 500m CPU, 1Gi memory

### Exercise 2: Add a Network Policy

Write a NetworkPolicy that:
- Allows `svc-identity` to access PostgreSQL
- Blocks `svc-identity` from accessing Redis
- Allows ingress from Nginx only on port 3001

### Exercise 3: Configure Horizontal Pod Autoscaler

Set up HPA for `svc-tokenomics`:
- Minimum replicas: 3
- Maximum replicas: 10
- Scale up when CPU > 70%
- Scale down when CPU < 30%

### Exercise 4: Implement Blue-Green Deployment

Design a blue-green deployment strategy for `svc-governance`:
- Two versions running simultaneously
- Traffic switch via Service selector
- Instant rollback capability

---

## Section 12: Production Checklist

### Pre-Deployment

- [ ] Verify cluster capacity: `kubectl top nodes`
- [ ] Create namespaces with proper labels
- [ ] Deploy Secrets (postgres, redis, fabric)
- [ ] Deploy ConfigMaps (service config)
- [ ] Apply NetworkPolicies (default deny first)
- [ ] Create ResourceQuotas and LimitRanges

### Deployment

- [ ] Deploy StatefulSets (postgres, redis)
- [ ] Verify PVCs are bound
- [ ] Deploy Workers (outbox-submitter, projector)
- [ ] Deploy API Services
- [ ] Configure NodePort services
- [ ] Set up Nginx reverse proxy
- [ ] Obtain SSL certificates

### Post-Deployment

- [ ] All pods Running: `kubectl get pods -n backend-mainnet`
- [ ] Health checks passing
- [ ] Metrics scraped by Prometheus
- [ ] Logs flowing to aggregator
- [ ] API endpoints responding
- [ ] Fabric connectivity verified

---

## Summary

In this lecture, we covered:

1. **Global Architecture**: 4-node K3s cluster across 3 continents
2. **Co-Located Design**: Backend + Fabric on same cluster for <1ms latency
3. **Kubernetes Manifests**: StatefulSets, Deployments, Services
4. **Zero-Trust Networking**: Default deny + explicit allow policies
5. **Global Load Balancing**: Cloudflare GeoDNS + Nginx reverse proxy
6. **Resource Management**: Quotas, limits, and capacity planning
7. **High Availability**: PDBs, rolling updates, node failure recovery
8. **Operational Commands**: Monitoring, scaling, deployments
9. **Troubleshooting**: Common issues and solutions

---

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [K3s Lightweight Kubernetes](https://k3s.io/)
- [Hyperledger Fabric Kubernetes Deployment](https://hyperledger-fabric.readthedocs.io/)
- `/home/sugxcoin/prod-blockchain/gx-protocol-backend/docs/architecture/DEPLOYMENT_ARCHITECTURE.md`
- `/home/sugxcoin/prod-blockchain/gx-coin-fabric/k8s/` - Kubernetes manifests
- LECTURE-05: Transactional Outbox Pattern
- LECTURE-11: Smart Contract Architecture
