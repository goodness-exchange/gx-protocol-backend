# GX Protocol Backend - Deployment Architecture

**Document Version**: 2.0
**Date**: November 16, 2025 (Updated)
**Previous Version**: 1.0 (November 13, 2025)
**Status**: Production Architecture with Global Load Balancing
**Classification**: Internal Technical Documentation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Infrastructure Topology](#2-infrastructure-topology)
3. [Co-Located Architecture Decision](#3-co-located-architecture-decision)
4. [Global Load Balancing Architecture](#4-global-load-balancing-architecture) **[NEW]**
5. [Network Architecture](#5-network-architecture)
6. [Service Deployment Strategy](#6-service-deployment-strategy)
7. [Resource Allocation](#7-resource-allocation)
8. [High Availability Design](#8-high-availability-design)
9. [Security Architecture](#9-security-architecture)
10. [Monitoring and Observability](#10-monitoring-and-observability)
11. [Disaster Recovery](#11-disaster-recovery)
12. [Change Log](#12-change-log) **[NEW]**

---

## 1. Overview

### 1.1 Architecture Summary

The GX Protocol Backend is deployed on a **4-node Kubernetes cluster** co-located with the Hyperledger Fabric blockchain network, with **global load balancing across 3 continents**. This architecture provides ultra-low latency communication (<1ms) between backend services and blockchain nodes, while delivering <50ms API response times to users worldwide through geographic distribution.

**Key Characteristics**:
- **Platform**: Kubernetes (K3s v1.33.5)
- **Deployment Pattern**: Co-located with namespace isolation
- **Global Distribution**: 3 regions (Asia, Americas, Europe)
- **Load Balancing**: GeoDNS with Cloudflare + Nginx reverse proxy
- **Environments**: Mainnet (production), Testnet, Devnet
- **HA Strategy**: Multi-node deployment with pod anti-affinity + geographic redundancy
- **Network**: Kubernetes internal DNS for service discovery
- **External Access**: HTTPS with Let's Encrypt SSL certificates

### 1.2 Design Principles

1. **Performance First**: Co-location with Fabric ensures <1ms latency for blockchain interactions
2. **Security by Default**: Zero-trust network policies with explicit allow rules
3. **Resource Efficiency**: Optimal utilization of existing cluster capacity
4. **Operational Simplicity**: Unified management through single kubectl context
5. **Scalability**: Horizontal scaling within available cluster resources

---

## 2. Infrastructure Topology

### 2.1 Kubernetes Cluster Overview

**Cluster Name**: GX Protocol Production Cluster
**Kubernetes Distribution**: K3s v1.33.5
**Total Nodes**: 4 (3 control-plane, 1 worker)

| Node ID | Hostname | Role | Location | CPU | RAM | Storage | Current Load |
|---------|----------|------|----------|-----|-----|---------|--------------|
| srv1089618 | control-plane-1 | control-plane | Primary DC | 16 cores | 64GB | 1TB SSD | ~60% |
| srv1089624 | control-plane-2 | control-plane | Primary DC | 16 cores | 64GB | 1TB SSD | ~55% |
| srv1092158 | control-plane-3 | control-plane | Primary DC | 16 cores | 64GB | 1TB SSD | ~65% |
| srv1117946 | worker-1 | worker | Secondary DC | 16 cores | 64GB | 1TB SSD | ~50% |

**Total Cluster Capacity**:
- CPU: 64 cores
- Memory: 256 GB
- Storage: 4 TB (local-path StorageClass)

**Current Utilization** (before backend deployment):
- Fabric Network: ~35 cores (55%), ~160GB RAM (62%), ~35 pods
- Available: ~29 cores (45%), ~96GB RAM (38%)

### 2.2 Node Deployment Strategy

#### Control-Plane Nodes (Mainnet)
**Nodes**: srv1089618, srv1089624, srv1092158

**Workloads**:
```
├── Hyperledger Fabric Mainnet
│   ├── 5 Raft Orderers (orderer0-org0 through orderer4-org0)
│   ├── 4 Peers (peer0-org1, peer1-org1, peer0-org2, peer1-org2)
│   ├── 4 CouchDB instances (state databases)
│   └── Fabric CA servers
│
└── GX Protocol Backend Mainnet
    ├── PostgreSQL (3 replicas - 1 per node)
    ├── Redis (3 replicas - 1 per node)
    ├── Outbox Submitter (2 replicas)
    ├── Projector Worker (2 replicas)
    ├── svc-identity (3 replicas)
    ├── svc-wallet (3 replicas)
    ├── svc-tokenomics (3 replicas)
    └── API Gateway (3 replicas)
```

**Rationale**: Co-locating backend services with Fabric mainnet ensures production traffic has minimal latency for blockchain operations.

#### Worker Node (Testnet/Devnet)
**Node**: srv1117946

**Workloads**:
```
├── Hyperledger Fabric Testnet
│   ├── 1 Orderer (orderer0-org0)
│   ├── 2 Peers (peer0-org1, peer0-org2)
│   └── 2 CouchDB instances
│
├── GX Protocol Backend Testnet
│   ├── PostgreSQL (1 replica)
│   ├── Redis (1 replica)
│   ├── Outbox Submitter (1 replica)
│   ├── Projector Worker (1 replica)
│   └── API Services (1 replica each)
│
└── GX Protocol Backend Devnet (Planned)
    └── Minimal deployment for development
```

**Rationale**: Testnet and devnet environments share a worker node to optimize resource utilization for non-production workloads.

---

## 3. Co-Located Architecture Decision

### 3.1 Architecture Options Evaluated

#### Option 1: Separate Backend Cluster ❌
**Description**: Deploy backend services on dedicated cluster(s) separate from Fabric.

**Pros**:
- Complete resource isolation
- Independent scaling decisions
- Blast radius containment

**Cons**:
- **Latency**: 50-200ms cross-datacenter communication
- **Complexity**: Multi-cluster networking (VPN/VPC peering)
- **Cost**: Additional infrastructure provisioning
- **Bandwidth**: Inter-datacenter data transfer costs

**Verdict**: **Rejected** - Latency requirements for CQRS projector (real-time event processing) make this infeasible.

---

#### Option 2: Active-Passive Multi-Cluster ❌
**Description**: Primary cluster active, secondary cluster on standby for disaster recovery.

**Pros**:
- Geographic redundancy
- Disaster recovery capability
- Compliance with business continuity requirements

**Cons**:
- **State Sync**: Blockchain state synchronization complexity
- **Cost**: Underutilized standby cluster
- **Operational Overhead**: Failover testing and management

**Verdict**: **Deferred to Phase 3** - DR planning will be addressed after initial production deployment.

---

#### Option 3: Co-Located with Namespace Isolation ✅
**Description**: Deploy backend services on same cluster as Fabric, using Kubernetes namespaces for isolation.

**Pros**:
- **Ultra-Low Latency**: <1ms pod-to-pod communication
- **Network Efficiency**: No external network hops
- **Resource Optimization**: Leverage existing 40% cluster capacity
- **Operational Simplicity**: Single kubectl context, unified monitoring
- **Cost Efficiency**: No additional infrastructure costs

**Cons**:
- **Shared Fate**: Cluster failure impacts both systems
- **Resource Contention**: Requires careful resource management
- **Security Concerns**: Namespace isolation must be robust

**Mitigation Strategies**:
- Kubernetes NetworkPolicies (zero-trust, explicit allow)
- ResourceQuotas prevent noisy neighbor issues
- PodDisruptionBudgets ensure HA during maintenance
- RBAC isolates permissions
- Separate secrets per namespace

**Verdict**: **Selected** - Performance and operational benefits outweigh risks, with mitigations in place.

---

### 3.2 Co-Location Benefits Analysis

#### Performance Benefits

**1. Ultra-Low Latency Communication**
```
Backend → Fabric (Co-Located):    <1ms
Backend → Fabric (Cross-Cluster):  50-200ms
```

**Impact on CQRS Projector**:
- Fabric emits ~100-500 events/second during peak usage
- Cross-cluster latency would create 5-100 second projection lag
- Co-located: Projection lag <100ms (real-time)

**Impact on Outbox Submitter**:
- Blockchain transaction submission requires multiple round-trips
- Co-located: Transaction submission ~5-10ms end-to-end
- Cross-cluster: Transaction submission ~500-1000ms

**2. Network Efficiency**
- Zero inter-datacenter bandwidth costs
- No VPN/VPC peering overhead
- Kubernetes internal DNS (*.svc.cluster.local) provides instant service discovery
- gRPC connections remain within cluster network fabric

#### Operational Benefits

**1. Unified Management**
```bash
# Single kubectl context for all operations
kubectl config current-context
# Output: gx-protocol-cluster

# Manage both Fabric and Backend
kubectl get pods -n fabric
kubectl get pods -n backend-mainnet
```

**2. Shared Monitoring Stack**
- Prometheus scrapes metrics from both Fabric and Backend
- Grafana dashboards show unified view
- AlertManager handles all alerts
- Centralized logging (Loki/ELK)

**3. Simplified Deployment**
- Single GitOps repository for all manifests
- Kubernetes Operators manage both systems
- No cross-cluster service mesh complexity

#### Cost Benefits

**Estimated Monthly Savings** (vs. separate cluster):
- Infrastructure: $2,000-3,000/month (4 additional nodes avoided)
- Bandwidth: $500-1,000/month (inter-DC transfer costs)
- Operations: 20-30 hours/month (reduced management overhead)

**Total**: $3,000-5,000/month savings

---



## 4. Global Load Balancing Architecture

### 4.1 Geographic Distribution Strategy

**Added**: November 16, 2025

To provide low-latency API access to users worldwide, the GX Protocol Backend implements **GeoDNS load balancing** across 3 continents. Each control-plane node serves as a regional entry point, routing users to the nearest server based on geographic location.

**Regional Deployment:**

| Region | Location | Server | Public IP | Internal IP | Role |
|--------|----------|--------|-----------|-------------|------|
| **Asia-Pacific** | Kuala Lumpur, Malaysia | srv1089618 | 72.60.210.201 | 10.42.0.1 | Regional LB |
| **North America** | Phoenix, USA | srv1089624 | 217.196.51.190 | 10.42.1.1 | Regional LB |
| **Europe** | Frankfurt, Germany | srv1092158 | 72.61.81.3 | 10.42.2.1 | Regional LB |

**Geographic Coverage:**
- **Asia-Pacific**: Serves users in Singapore, Malaysia, India, Japan, Australia
- **North America**: Serves users in USA, Canada, Mexico, Brazil
- **Europe**: Serves users in UK, France, Germany, Spain, Middle East, Africa

### 4.2 Load Balancing Architecture

**DNS Layer (Cloudflare):**
```
api.gxcoin.money (DNS Query)
        ↓
Cloudflare GeoDNS Routing
        ↓
┌───────┼───────┐
↓       ↓       ↓
Asia    USA     EU
72.60   217.196 72.61
.210    .51     .81
.201    .190    .3
```

**Reverse Proxy Layer (Nginx):**
```
Regional Server (Nginx on port 443)
        ↓
HTTPS Termination (TLS 1.2/1.3)
        ↓
Rate Limiting (10 req/sec per IP)
        ↓
Security Headers (HSTS, XSS, etc.)
        ↓
Proxy to Kubernetes NodePort
        ↓
Kubernetes Service (ClusterIP)
        ↓
Backend Pods (3 replicas, distributed)
```

**Complete Request Flow:**
```
1. User in Singapore requests: https://api.gxcoin.money/identity/users
2. DNS query → Cloudflare returns 72.60.210.201 (Malaysia, nearest)
3. HTTPS connection → Nginx on srv1089618:443
4. Cloudflare DDoS check passed
5. SSL/TLS handshake with Let's Encrypt certificate
6. Nginx receives request, applies rate limiting
7. Nginx proxies to localhost:30001 (Kubernetes NodePort)
8. Kubernetes routes to svc-identity pod (via ClusterIP Service)
9. Pod processes request, queries PostgreSQL locally (<1ms)
10. Response flows back through chain
11. User receives response (total ~20-50ms latency)
```

### 4.3 Nginx Configuration

**Deployment:** Each control-plane node runs Nginx as reverse proxy

**Configuration File:** `/etc/nginx/conf.d/api.conf` (per regional server)

**Key Features:**

1. **Upstream Definitions** (per service):
```nginx
upstream identity_backend {
    least_conn;  # Route to server with least connections
    server 127.0.0.1:30001 max_fails=3 fail_timeout=30s;
}
```

2. **HTTPS Termination:**
```nginx
listen 443 ssl http2;
ssl_certificate /etc/letsencrypt/live/api.gxcoin.money/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.gxcoin.money/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

3. **Rate Limiting:**
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req zone=api_limit burst=20 nodelay;
```

4. **Security Headers:**
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

5. **URL Routing:**
```nginx
location /identity {
    proxy_pass http://identity_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 4.4 Service Exposure via NodePort

**Updated:** November 16, 2025

All backend services exposed via Kubernetes NodePort for Nginx connectivity:

| Service | ClusterIP Port | NodePort | URL Path |
|---------|---------------|----------|----------|
| svc-identity | 3001 | 30001 | /identity |
| svc-admin | 3002 | 30002 | /admin |
| svc-tokenomics | 3003 | 30003 | /tokenomics |
| svc-organization | 3004 | 30004 | /organization |
| svc-loanpool | 3005 | 30005 | /loanpool |
| svc-governance | 3006 | 30006 | /governance |
| svc-tax | 3007 | 30007 | /tax |

**NodePort Configuration Example:**
```yaml
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
    protocol: TCP
    port: 3001
    targetPort: 3001
    nodePort: 30001
```

**Accessibility:**
- **Internal**: `svc-identity.backend-mainnet.svc.cluster.local:3001` (from within cluster)
- **External**: `<any-node-ip>:30001` (from Nginx on same node)

### 4.5 Cloudflare Integration

**DNS Configuration:**

Three A records for `api.gxcoin.money`:

```
Type: A
Name: api
Content: 72.60.210.201 (Malaysia)
Proxy: ON (orange cloud) - DDoS protection enabled
TTL: Auto

Type: A
Name: api
Content: 217.196.51.190 (USA)
Proxy: ON (orange cloud) - DDoS protection enabled
TTL: Auto

Type: A
Name: api
Content: 72.61.81.3 (Germany)
Proxy: ON (orange cloud) - DDoS protection enabled
TTL: Auto
```

**Cloudflare Features Enabled:**

1. **GeoDNS Routing** (FREE tier):
   - Automatic routing based on user's geographic location
   - Round-robin DNS for load distribution
   - Manual failover (admin removes failed server's A record)

2. **DDoS Protection** (FREE tier):
   - Unlimited bandwidth protection
   - Layer 3/4 and Layer 7 attack mitigation
   - IP reputation filtering

3. **CDN Caching** (Optional):
   - Cache-Control headers respected
   - Static assets cached at edge
   - API responses can be cached with custom rules

4. **SSL/TLS**:
   - Flexible SSL mode (Cloudflare → Origin HTTPS)
   - Free Universal SSL for public-facing domain
   - Let's Encrypt on origin servers

**Optional Upgrade** ($5/month):
- **Cloudflare Load Balancing**: Active health checks, automatic failover, geo-steering
- **Health Checks**: HTTPS GET to `/health` endpoint every 60 seconds
- **Automatic Failover**: Remove unhealthy servers from rotation

### 4.6 SSL/TLS Certificate Management

**Certificate Authority:** Let's Encrypt (free, automated)

**Deployment:**

Each regional server obtains its own certificate:

```bash
# Malaysia server
certbot certonly --webroot -w /var/www/certbot -d api.gxcoin.money

# USA server
certbot certonly --webroot -w /var/www/certbot -d api.gxcoin.money

# Germany server
certbot certonly --webroot -w /var/www/certbot -d api.gxcoin.money
```

**Certificate Locations:**
- Certificate: `/etc/letsencrypt/live/api.gxcoin.money/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/api.gxcoin.money/privkey.pem`
- Chain: `/etc/letsencrypt/live/api.gxcoin.money/chain.pem`

**Auto-Renewal:**
- Certbot cron job runs twice daily
- Certificates renewed at 30 days before expiry
- Nginx reloaded automatically after renewal

**Validity:** 90 days per certificate

### 4.7 Health Monitoring

**Automated Health Checks:**

Script: `/usr/local/bin/gx-health-monitor`

**Functionality:**
```bash
# Checks all 3 regional servers every 60 seconds
for region in Malaysia USA Germany; do
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 "https://api.gxcoin.money/health" \
    --resolve "api.gxcoin.money:443:$ip")

  if [ "$response" == "200" ]; then
    echo "[$(date)] ✓ $region - HEALTHY"
  else
    echo "[$(date)] ✗ $region - DOWN (HTTP $response)"
    send_alert "$region is DOWN"
  fi
done
```

**Monitoring Metrics:**
- HTTP status code (200 = healthy)
- Response time (<100ms = good, 100-500ms = warning, >500ms = critical)
- SSL certificate expiry (alert at <15 days)

**Alerting:**
- Email notifications for failures
- Slack webhook integration (optional)
- PagerDuty integration (optional)

**Log Location:** `/var/log/gx-health-monitor.log`

### 4.8 Performance Characteristics

**Expected Latency by User Location:**

| User Location | Routes To | Expected Latency | Network Hops |
|---------------|-----------|------------------|--------------|
| Singapore | Malaysia | 5-20ms | 5-10 |
| India | Malaysia | 30-50ms | 8-12 |
| Japan | Malaysia | 80-120ms | 12-15 |
| Australia | Malaysia | 50-100ms | 10-15 |
| USA West Coast | USA | 5-20ms | 5-10 |
| USA East Coast | USA | 50-80ms | 10-12 |
| Canada | USA | 20-50ms | 8-12 |
| UK | Germany | 10-30ms | 6-10 |
| France | Germany | 5-20ms | 5-8 |
| Middle East | Germany | 50-100ms | 10-15 |

**Throughput Capacity:**

Per Regional Server:
- Requests per second: ~1,000 (typical API load)
- Concurrent connections: ~10,000
- Bandwidth: ~100 Mbps

Global Aggregate:
- Total requests per second: ~3,000
- Total concurrent connections: ~30,000

**Bottleneck Analysis:**
- **Network**: Not a bottleneck (1Gbps+ available)
- **Nginx**: Can handle 10,000+ req/sec with minimal CPU
- **Kubernetes NodePort**: Negligible overhead
- **Backend Pods**: Current bottleneck (PostgreSQL queries)
- **Database**: Optimized with connection pooling

### 4.9 Failover Scenarios

**Scenario 1: Single Regional Server Failure**

**Example:** Malaysia server (srv1089618) becomes unavailable

**Detection:**
- Health monitor detects failure within 60 seconds
- Cloudflare (if using paid Load Balancing) removes server from rotation
- FREE tier: Manual intervention required

**Impact:**
- Asian users routed to Germany (next nearest) - latency increases from 20ms to 100-150ms
- Service remains available with degraded performance

**Recovery:**
1. Health monitor sends alert
2. Admin investigates issue (Nginx down, Kubernetes node failure, etc.)
3. Fix issue and restart services
4. Health monitor detects recovery
5. Admin re-adds server to Cloudflare DNS (or automatic with paid tier)
6. Asian users resume low-latency connections

**Mean Time To Detect (MTTD):** 60 seconds
**Mean Time To Recover (MTTR):** 5-30 minutes (depending on failure cause)

**Scenario 2: Complete Datacenter Outage**

**Example:** All 3 control-plane nodes lose connectivity

**Impact:**
- All backend services unavailable
- Fabric blockchain continues (can operate independently)

**Recovery:**
- Restore network connectivity or migrate to backup datacenter
- Kubernetes cluster auto-recovers when nodes rejoin
- Pods restart on available nodes
- DNS propagates (TTL=Auto)

**MTTR:** 1-4 hours (depending on outage cause)

**Mitigation (Phase 5):**
- Deploy active-passive cluster in separate datacenter
- Implement disaster recovery automation

### 4.10 Cost Analysis

**Infrastructure Costs (Load Balancing):**

| Component | Provider | Monthly Cost |
|-----------|----------|--------------|
| GeoDNS Routing | Cloudflare FREE | $0 |
| DDoS Protection | Cloudflare FREE | $0 |
| SSL Certificates | Let's Encrypt | $0 |
| Nginx | Open Source | $0 |
| Health Monitoring | Custom Script | $0 |
| **Total (Current)** | | **$0** |

**Optional Upgrades:**

| Feature | Provider | Monthly Cost | Benefit |
|---------|----------|--------------|---------|
| Active Health Checks | Cloudflare Load Balancing | $5 | Automatic failover |
| Advanced WAF | Cloudflare | $20 | Bot protection, advanced rules |
| Priority Support | Cloudflare | Included in paid tiers | 24/7 support |

**Comparison with Alternatives:**

| Solution | Monthly Cost | Features |
|----------|--------------|----------|
| **Current (GeoDNS + Nginx)** | $0 | GeoDNS, DDoS, SSL, manual failover |
| AWS Route 53 + ALB | ~$50 | GeoDNS, health checks, auto-failover |
| Google Cloud LB | ~$60 | GeoDNS, health checks, auto-failover |
| Azure Traffic Manager | ~$55 | GeoDNS, health checks, auto-failover |

**Verdict:** Current solution provides enterprise-grade features at $0/month, with optional $5/month upgrade path for active health checks.

---

## 5. Network Architecture

### 5.1 Namespace Structure

**Isolation Model**: Namespace-based with NetworkPolicies

```
gx-protocol-cluster
│
├── fabric (namespace)
│   ├── Labels: {environment: mainnet, component: blockchain}
│   └── Network: Default Deny + Explicit Allow
│
├── fabric-testnet (namespace)
│   ├── Labels: {environment: testnet, component: blockchain}
│   └── Network: Default Deny + Explicit Allow
│
├── backend-mainnet (namespace)
│   ├── Labels: {environment: production, component: backend}
│   ├── ResourceQuota: 16 CPU, 32Gi RAM
│   └── Network: Default Deny + DNS + Fabric Egress
│
├── backend-testnet (namespace)
│   ├── Labels: {environment: testnet, component: backend}
│   ├── ResourceQuota: 8 CPU, 16Gi RAM
│   └── Network: Default Deny + DNS + Fabric-Testnet Egress
│
└── backend-devnet (namespace - planned)
    ├── Labels: {environment: development, component: backend}
    ├── ResourceQuota: 4 CPU, 8Gi RAM
    └── Network: Default Deny + DNS + Fabric-Devnet Egress
```

### 5.2 Service Discovery

#### Fabric Service Endpoints (from Backend perspective)

**Orderers** (for transaction submission):
```
orderer0-org0.fabric.svc.cluster.local:7050
orderer1-org0.fabric.svc.cluster.local:7050
orderer2-org0.fabric.svc.cluster.local:7050
orderer3-org0.fabric.svc.cluster.local:7050
orderer4-org0.fabric.svc.cluster.local:7050
```

**Peers** (for chaincode invocation and queries):
```
peer0-org1.fabric.svc.cluster.local:7051
peer1-org1.fabric.svc.cluster.local:7051
peer0-org2.fabric.svc.cluster.local:7051
peer1-org2.fabric.svc.cluster.local:7051
```

**Fabric CA** (for identity enrollment):
```
ca-org1.fabric.svc.cluster.local:7054
ca-org2.fabric.svc.cluster.local:7054
```

#### Backend Service Endpoints (internal)

**Database Services**:
```
postgres-primary.backend-mainnet.svc.cluster.local:5432
postgres-replica.backend-mainnet.svc.cluster.local:5432
redis-master.backend-mainnet.svc.cluster.local:6379
redis-replica.backend-mainnet.svc.cluster.local:6379
```

**API Services**:
```
svc-identity.backend-mainnet.svc.cluster.local:3001
svc-wallet.backend-mainnet.svc.cluster.local:3002
svc-tokenomics.backend-mainnet.svc.cluster.local:3003
api-gateway.backend-mainnet.svc.cluster.local:8080
```

### 5.3 NetworkPolicy Configuration

#### Default Deny Policy (Applied to All Namespaces)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: backend-mainnet
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

**Effect**: All ingress and egress traffic denied by default.

#### DNS Egress Policy (Required for Service Discovery)

```yaml
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

**Effect**: Pods can resolve DNS names via CoreDNS.

#### Fabric Egress Policy (Backend → Fabric Communication)

```yaml
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
      port: 7050  # Orderer gRPC
    - protocol: TCP
      port: 7051  # Peer gRPC
    - protocol: TCP
      port: 7054  # CA
```

**Effect**: Backend services can connect to Fabric orderers, peers, and CA servers.

#### Internal Backend Communication

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-internal
  namespace: backend-mainnet
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - podSelector: {}
  egress:
  - to:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
    - protocol: TCP
      port: 3001  # svc-identity
    - protocol: TCP
      port: 3002  # svc-wallet
```

**Effect**: Backend services can communicate with each other within the namespace.

#### External API Ingress (Production)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-gateway-ingress
  namespace: backend-mainnet
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes: [Ingress]
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
```

**Effect**: Only NGINX Ingress Controller can access API Gateway (public entry point).

---

## 6. Service Deployment Strategy

### 6.1 Mainnet Deployment (backend-mainnet)

#### PostgreSQL StatefulSet

**Configuration**:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: backend-mainnet
spec:
  replicas: 3
  serviceName: postgres-headless
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: postgres
            topologyKey: kubernetes.io/hostname
      containers:
      - name: postgres
        image: postgres:15-alpine
        resources:
          requests: {cpu: 1000m, memory: 2Gi}
          limits: {cpu: 2000m, memory: 4Gi}
        volumeClaimTemplates:
        - metadata:
            name: postgres-data
          spec:
            accessModes: [ReadWriteOnce]
            resources:
              requests:
                storage: 100Gi
```

**Scheduling Strategy**:
- **Node Affinity**: Schedule only on control-plane nodes (srv1089618, srv1089624, srv1092158)
- **Pod Anti-Affinity**: Ensure each replica on different node (1 per node)
- **Result**: 3 PostgreSQL instances spread across 3 control-plane nodes

**Rationale**:
- Co-location with Fabric orderers for low-latency writes
- Pod anti-affinity provides node-level fault tolerance
- Local-path storage on each node for performance

#### Redis StatefulSet

**Configuration**: Similar to PostgreSQL with 3 replicas, 20Gi storage per instance

**Scheduling**: Same node affinity and anti-affinity rules

#### CQRS Workers

**Outbox Submitter**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: outbox-submitter
  namespace: backend-mainnet
spec:
  replicas: 2
  template:
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: node-role.kubernetes.io/control-plane
                operator: Exists
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: outbox-submitter
              topologyKey: kubernetes.io/hostname
```

**Scheduling**: Prefer control-plane nodes, spread across different nodes

**Projector Worker**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: projector
  namespace: backend-mainnet
spec:
  replicas: 2
```

**Scheduling**: Similar to outbox-submitter

**Rationale**:
- 2 replicas for HA (active-active)
- Pod anti-affinity prevents single node failure
- Co-location with Fabric for event stream latency

#### API Services

**svc-identity, svc-wallet, svc-tokenomics**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-identity
  namespace: backend-mainnet
spec:
  replicas: 3
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: svc-identity
              topologyKey: kubernetes.io/hostname
```

**Scheduling**: 3 replicas spread across control-plane nodes

**API Gateway**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: backend-mainnet
spec:
  replicas: 3
```

**Scheduling**: 3 replicas, entry point for external traffic

### 6.2 Testnet Deployment (backend-testnet)

#### Configuration Differences

**Node Affinity** (single worker node):
```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values: [srv1117946]
```

**Replica Counts**:
- PostgreSQL: 1 replica
- Redis: 1 replica
- Workers: 1 replica each
- API Services: 1 replica each

**Storage**:
- PostgreSQL: 100Gi (same as mainnet for realistic testing)
- Redis: 20Gi

**Rationale**:
- Single-node deployment acceptable for testnet (non-critical)
- Resource efficiency on worker node
- Co-location with fabric-testnet for consistent testing

---

## 7. Resource Allocation

### 7.1 Backend Mainnet Resource Plan

**Total Resource Requests**:
- CPU: ~11 cores
- Memory: ~22 Gi
- Storage: ~400 Gi
- Pods: ~20

**Breakdown**:

| Component | Replicas | CPU Request | Memory Request | Storage | Total CPU | Total Memory |
|-----------|----------|-------------|----------------|---------|-----------|--------------|
| PostgreSQL | 3 | 1000m | 2Gi | 100Gi | 3000m | 6Gi |
| Redis | 3 | 500m | 1Gi | 20Gi | 1500m | 3Gi |
| Outbox Submitter | 2 | 500m | 1Gi | - | 1000m | 2Gi |
| Projector | 2 | 500m | 1Gi | - | 1000m | 2Gi |
| svc-identity | 3 | 500m | 1Gi | - | 1500m | 3Gi |
| svc-wallet | 3 | 500m | 1Gi | - | 1500m | 3Gi |
| svc-tokenomics | 3 | 500m | 1Gi | - | 1500m | 3Gi |
| api-gateway | 3 | 500m | 1Gi | - | 1500m | 3Gi |
| **Total** | **22** | **-** | **-** | **400Gi** | **13.5 cores** | **25Gi** |

**Resource Quota** (backend-mainnet namespace):
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

**Cluster Capacity Check**:
- Available: 29 cores, 96Gi RAM (after Fabric)
- Backend Request: 13.5 cores, 25Gi RAM
- **Headroom**: 15.5 cores (53%), 71Gi RAM (74%)
- **Status**: ✅ Sufficient capacity

### 7.2 Backend Testnet Resource Plan

**Total Resource Requests**:
- CPU: ~3.5 cores
- Memory: ~7 Gi
- Storage: ~150 Gi
- Pods: ~8

**Resource Quota** (backend-testnet namespace):
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: backend-testnet-quota
  namespace: backend-testnet
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    persistentvolumeclaims: "5"
    pods: "30"
```

### 7.3 LimitRange Configuration

**Purpose**: Prevent resource-greedy pods, set defaults

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

**Effect**:
- Pods without resource specs get 250m CPU, 256Mi RAM
- Maximum pod size: 4 CPU, 8Gi RAM (prevents runaway pods)

---

## 8. High Availability Design

### 8.1 Component-Level HA Strategy

#### Database Layer (PostgreSQL)

**Current**: 3 independent primary instances
**Phase 2**: Streaming replication (1 primary + 2 read replicas)

**HA Features**:
- **PodDisruptionBudget**: Ensures minimum 2 pods available during maintenance
- **Pod Anti-Affinity**: Spreads replicas across nodes
- **Automated Backups**: Every 6 hours to PVC storage
- **Future**: Patroni operator for automatic failover

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: postgres-pdb
  namespace: backend-mainnet
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: postgres
```

#### Cache Layer (Redis)

**Current**: 3 independent instances
**Phase 2**: Redis Sentinel for automatic failover

**HA Features**:
- **PodDisruptionBudget**: Ensures minimum 2 pods available
- **Pod Anti-Affinity**: Spreads replicas across nodes
- **Automated Backups**: Every 6 hours (RDB + AOF)
- **Future**: Redis Sentinel or operator for automatic failover

#### Worker Processes

**Outbox Submitter**:
- 2 active replicas (competing consumers)
- Database-level locking prevents duplicate submissions
- If 1 replica fails, other continues processing

**Projector**:
- 2 active replicas (event checkpointing prevents duplicates)
- Each replica processes different event partitions
- Checkpoint stored in `projector_state` table

#### API Services

**HA Strategy**:
- 3 replicas per service (svc-identity, svc-wallet, svc-tokenomics)
- Kubernetes Service load balances across replicas (round-robin)
- Readiness probes prevent traffic to unhealthy pods
- Liveness probes restart crashed pods

**Health Checks**:
```yaml
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
```

### 8.2 Node-Level Fault Tolerance

**Scenario**: Control-plane node srv1089618 fails

**Impact**:
- PostgreSQL: 1 of 3 instances offline (67% capacity remains)
- Redis: 1 of 3 instances offline (67% capacity remains)
- API Services: ~1/3 replicas offline (67% capacity remains)
- Workers: ~1/2 replicas offline (50% capacity remains)

**Recovery**:
- Kubernetes reschedules pods from failed node to healthy nodes
- Services continue with reduced capacity
- No data loss (PVCs remain intact, reattach when pod reschedules)

**Mean Time To Recovery (MTTR)**: ~2-5 minutes
- Pod termination grace period: 30 seconds
- Scheduler finds new node: ~10 seconds
- PVC reattachment: ~30-60 seconds
- Pod startup + readiness: ~30-90 seconds

**Service Impact**: Minimal (2/3 capacity maintained during recovery)

### 8.3 Maintenance Windows

**Rolling Updates**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-identity
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
```

**Process**:
1. Create 1 new pod with updated version
2. Wait for readiness probe success
3. Terminate 1 old pod
4. Repeat until all pods updated

**Zero-Downtime**: Yes (always 2-4 pods available during rollout)

---

## 9. Security Architecture

### 9.1 Multi-Layer Security

**Layer 1: Network Isolation**
- Namespace boundaries (backend-mainnet ≠ fabric)
- NetworkPolicies (default deny + explicit allow)
- No direct pod-to-pod communication across namespaces without policy

**Layer 2: RBAC (Role-Based Access Control)**
- Separate ServiceAccounts per deployment
- Least-privilege principle
- No cluster-admin access for application workloads

**Example**:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: postgres-backup
  namespace: backend-mainnet
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: postgres-backup-role
  namespace: backend-mainnet
rules:
- apiGroups: [""]
  resources: ["pods", "pods/exec"]
  verbs: ["get", "list", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: postgres-backup-binding
  namespace: backend-mainnet
subjects:
- kind: ServiceAccount
  name: postgres-backup
roleRef:
  kind: Role
  name: postgres-backup-role
  apiGroup: rbac.authorization.k8s.io
```

**Layer 3: Pod Security**
- Non-root containers (runAsNonRoot: true)
- Read-only root filesystem (where possible)
- Capabilities dropped (no NET_RAW, SYS_ADMIN, etc.)
- seccomp profile: RuntimeDefault

**Layer 4: Secret Management**
- Kubernetes Secrets (base64 encoded)
- Mounted as environment variables or files
- Not exposed in logs or pod specs
- **Phase 2**: Migrate to HashiCorp Vault or AWS Secrets Manager

**Layer 5: Resource Quotas**
- Prevent resource exhaustion attacks
- CPU/memory limits prevent noisy neighbors
- Storage quotas prevent disk exhaustion

### 9.2 Network Security Model

**Zero-Trust Approach**:
1. **Default**: All traffic blocked
2. **DNS**: Explicitly allowed (CoreDNS)
3. **Fabric**: Explicitly allowed (ports 7050, 7051, 7054)
4. **Internal Backend**: Explicitly allowed (PostgreSQL, Redis, APIs)
5. **External Ingress**: Only API Gateway (via NGINX Ingress)

**Traffic Flow**:
```
Internet → NGINX Ingress (ingress-nginx namespace)
         → API Gateway (backend-mainnet namespace)
         → Internal Services (svc-identity, svc-wallet, etc.)
         → Workers (outbox-submitter, projector)
         → Fabric Network (fabric namespace)
```

**Blocked Traffic**:
- backend-mainnet → fabric-testnet ❌
- backend-testnet → backend-mainnet ❌
- backend-mainnet → kube-system (except DNS) ❌
- Direct external access to internal services ❌

### 9.3 Compliance and Audit

**Audit Logging**:
- Kubernetes API server audit logs enabled
- All kubectl commands logged
- RBAC authorization decisions logged

**Application Logging**:
- All API requests logged to `audit_log` table
- Blockchain transaction hashes logged
- User actions tracked in `AuditLog` table

**Security Scanning**:
- Container image scanning (Trivy/Clair)
- Vulnerability patching policy
- Regular security audits

---

## 10. Monitoring and Observability

### 10.1 Metrics Collection

**Prometheus** (shared with Fabric):
- Scrapes metrics from all backend services
- Metrics endpoint: `/metrics` (port 9090)
- Scrape interval: 15 seconds
- Retention: 30 days

**Key Metrics**:

**Infrastructure**:
- `kube_pod_status_phase{namespace="backend-mainnet"}`
- `kube_node_status_condition`
- `container_cpu_usage_seconds_total`
- `container_memory_working_set_bytes`

**Application**:
- `http_requests_total{service="svc-identity"}`
- `http_request_duration_seconds`
- `outbox_command_queue_depth`
- `projector_lag_milliseconds`
- `fabric_sdk_connection_status`

**Database**:
- `pg_stat_activity_count`
- `pg_stat_database_tup_returned`
- `redis_connected_clients`
- `redis_memory_used_bytes`

### 10.2 Dashboards (Grafana)

**Backend Overview Dashboard**:
- Pod health status by namespace
- CPU/memory utilization
- API request rate and latency
- Error rate (5xx responses)

**CQRS Health Dashboard**:
- Outbox queue depth trend
- Projector lag (milliseconds)
- Event processing rate
- Failed transaction count

**Database Dashboard**:
- PostgreSQL connections
- Query latency (p50, p95, p99)
- Redis cache hit rate
- Database size growth

### 10.3 Alerting (AlertManager)

**Critical Alerts** (PagerDuty):
- Pod crash loop (5 restarts in 10 minutes)
- PostgreSQL unavailable (all replicas down)
- Projector lag > 5 seconds
- Fabric connection lost

**Warning Alerts** (Slack):
- High CPU usage (>80% for 10 minutes)
- High memory usage (>85% for 10 minutes)
- Disk space low (<15% free)
- API error rate > 1%

**Example Alert Rule**:
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
```

### 10.4 Logging Strategy

**Log Aggregation**: Loki or ELK Stack

**Log Levels**:
- Production: INFO and above
- Testnet: DEBUG and above
- Devnet: TRACE (all logs)

**Structured Logging** (JSON):
```json
{
  "timestamp": "2025-11-13T10:15:30.123Z",
  "level": "INFO",
  "service": "svc-identity",
  "traceId": "abc123",
  "userId": "user_xyz",
  "message": "User profile retrieved",
  "duration_ms": 15
}
```

**Log Retention**:
- Mainnet: 90 days
- Testnet: 30 days
- Devnet: 7 days

---

## 11. Disaster Recovery

### 11.1 Backup Strategy

**PostgreSQL**:
- **Method**: pg_dump with gzip compression
- **Schedule**: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **Retention**: Last 30 backups (7 days)
- **Storage**: PVC (50Gi), future: S3/MinIO
- **Restore Time**: ~10-30 minutes (depending on database size)

**Redis**:
- **Method**: BGSAVE (RDB) + AOF file copy
- **Schedule**: Every 6 hours
- **Retention**: Last 30 backups
- **Storage**: PVC (20Gi)
- **Restore Time**: ~2-5 minutes

**Application Configuration**:
- Kubernetes manifests: Git repository (version controlled)
- Secrets: Sealed Secrets or external secret store
- **Restore Time**: ~5 minutes (kubectl apply)

### 11.2 Failure Scenarios and Recovery

#### Scenario 1: Single Pod Failure
**Cause**: Application crash, OOM kill
**Detection**: Liveness probe failure
**Automatic Recovery**: Kubernetes restarts pod
**MTTR**: ~30-60 seconds
**Data Loss**: None

#### Scenario 2: Single Node Failure
**Cause**: Hardware failure, network partition
**Detection**: Node NotReady status
**Automatic Recovery**: Pods rescheduled to healthy nodes
**MTTR**: ~2-5 minutes
**Data Loss**: None (PVCs reattach)

#### Scenario 3: Database Corruption
**Cause**: Disk failure, software bug
**Detection**: Health check failure, query errors
**Manual Recovery**: Restore from backup
**MTTR**: ~30-60 minutes
**Data Loss**: Up to 6 hours (since last backup)

**Mitigation**: Implement WAL archiving for PITR (Point-In-Time Recovery)

#### Scenario 4: Complete Cluster Failure
**Cause**: Datacenter outage, catastrophic failure
**Detection**: All nodes unreachable
**Manual Recovery**:
1. Provision new cluster (or restore existing)
2. Restore database from backups
3. Deploy application manifests from Git
4. Verify Fabric blockchain state sync
**MTTR**: ~4-8 hours
**Data Loss**: Up to 6 hours (database), blockchain state preserved

**Mitigation** (Phase 3): Implement active-passive multi-cluster DR

### 11.3 Backup Verification

**Automated Backup Testing**:
- Weekly: Restore backup to test environment
- Monthly: Full DR drill (complete cluster rebuild)
- Quarterly: Cross-region DR test

**Backup Monitoring**:
- CronJob success/failure alerts
- Backup size trending (detect corruption)
- Restore test results logged

---

## Appendix A: Deployment Checklist

**Pre-Deployment**:
- [ ] Verify cluster capacity (kubectl top nodes)
- [ ] Label nodes (node-role.kubernetes.io/control-plane)
- [ ] Create namespaces (backend-mainnet, backend-testnet)
- [ ] Deploy secrets (postgres-secrets, redis-secrets)
- [ ] Deploy ConfigMaps (postgres-config, redis-config)

**Infrastructure Deployment**:
- [ ] Deploy PostgreSQL StatefulSet
- [ ] Verify PVCs bound (kubectl get pvc -n backend-mainnet)
- [ ] Deploy Redis StatefulSet
- [ ] Verify all pods Running (kubectl get pods -n backend-mainnet)

**Database Initialization**:
- [ ] Port-forward to PostgreSQL (kubectl port-forward ...)
- [ ] Run Prisma migrations (npx prisma migrate deploy)
- [ ] Seed initial data (countries, legal tender statuses)
- [ ] Verify schema (psql -c '\dt')

**Application Deployment**:
- [ ] Deploy Workers (outbox-submitter, projector)
- [ ] Deploy API Services (svc-identity, svc-wallet, svc-tokenomics)
- [ ] Deploy API Gateway
- [ ] Configure Ingress

**Post-Deployment Verification**:
- [ ] Health checks pass (kubectl get pods)
- [ ] Metrics scraped (Prometheus targets)
- [ ] Logs flowing (Loki/ELK)
- [ ] API endpoints responding (curl tests)
- [ ] Fabric connectivity verified (chaincode queries)

---

## Appendix B: Troubleshooting Guide

**Pod CrashLoopBackOff**:
```bash
kubectl logs -n backend-mainnet <pod-name> --previous
kubectl describe pod -n backend-mainnet <pod-name>
```

**Database Connection Refused**:
```bash
kubectl exec -n backend-mainnet postgres-0 -- psql -U gx_admin -d gx_protocol -c 'SELECT 1'
kubectl get svc -n backend-mainnet
```

**Fabric Connection Timeout**:
```bash
kubectl exec -n backend-mainnet <backend-pod> -- nc -zv orderer0-org0.fabric.svc.cluster.local 7050
kubectl get networkpolicies -n backend-mainnet
```

**High Projector Lag**:
```bash
kubectl logs -n backend-mainnet <projector-pod> | grep "lag_ms"
psql -c 'SELECT * FROM projector_state ORDER BY last_updated DESC LIMIT 1'
```

---

---

## 12. Change Log

### Version 2.0 (November 16, 2025)

**Major Updates**:
- Added Section 4: Global Load Balancing Architecture
  - Geographic distribution across 3 continents (Asia, Americas, Europe)
  - GeoDNS routing with Cloudflare FREE tier
  - Nginx reverse proxy configuration per regional server
  - NodePort service exposure for all 7 microservices
  - SSL/TLS certificate management with Let's Encrypt
  - Health monitoring and automated alerting
  - Performance characteristics and latency analysis
  - Failover scenarios and disaster recovery
  - Cost analysis ($0/month base cost)

**Architecture Enhancements**:
- Updated Architecture Summary to reflect global distribution
- Updated infrastructure topology with public IP addresses
- Added complete request flow documentation (11-step process)
- Documented rate limiting (10 req/sec per IP)
- Documented security headers (HSTS, XSS protection, etc.)

**Documentation Improvements**:
- Renumbered all sections (old Section 4 is now Section 5, etc.)
- Enhanced Table of Contents with Global Load Balancing section
- Updated document version tracking
- Added comprehensive GeoDNS deployment details

**Rationale**:
- User access from worldwide locations requires low-latency global distribution
- Enterprise-grade load balancing without infrastructure costs
- Future-proof architecture supporting additional regions

### Version 1.0 (November 13, 2025)

**Initial Release**:
- Complete co-located deployment architecture
- Namespace isolation strategy
- Network security policies
- Resource allocation planning
- High availability design
- Disaster recovery procedures

---

**Document End**

**Last Updated**: November 16, 2025
**Next Review**: December 16, 2025
**Owner**: GX Protocol DevOps Team
