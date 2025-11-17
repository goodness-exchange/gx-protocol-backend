# Nginx Ingress Controller Setup Guide - GX Protocol

**Date:** November 17, 2025
**Purpose:** Enterprise-grade Ingress controller for HTTPS routing and TLS termination
**Target:** Kubernetes cluster (all 4 nodes)

---

## Executive Summary

This guide deploys **Nginx Ingress Controller** to:

- **Route HTTPS traffic** from api.gxcoin.money to backend services
- **Terminate TLS/SSL** at the edge (certificates from cert-manager)
- **Path-based routing** to microservices (/identity/*, /tokenomics/*, etc.)
- **Load balance** across 3 replicas per service
- **Expose single LoadBalancer** on port 443 (HTTPS only)

---

## Prerequisites

- Kubernetes cluster running (K3s v1.33.5)
- kubectl configured and working
- Firewall rules configured (see FIREWALL_SETUP_GUIDE.md)
- DNS records created (see DNS_CONFIGURATION_GUIDE.md)

---

## Step 1: Install Nginx Ingress Controller

**Deploy Nginx Ingress via Helm:**

```bash
# Add Nginx Ingress Helm repository
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Create namespace
kubectl create namespace ingress-nginx

# Install Nginx Ingress Controller
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.kind=DaemonSet \
  --set controller.service.type=LoadBalancer \
  --set controller.service.externalTrafficPolicy=Local \
  --set controller.service.ports.http=null \
  --set controller.service.ports.https=443 \
  --set controller.config.use-forwarded-headers="true" \
  --set controller.config.compute-full-forwarded-for="true" \
  --set controller.config.use-proxy-protocol="true" \
  --set controller.metrics.enabled=true \
  --set controller.podAnnotations."prometheus\.io/scrape"="true" \
  --set controller.podAnnotations."prometheus\.io/port"="10254"

# Wait for deployment
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Verify installation
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

**Expected Output:**
```
NAME                                        READY   STATUS    RESTARTS   AGE
ingress-nginx-controller-xxxxx              1/1     Running   0          60s

NAME                                 TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)         AGE
ingress-nginx-controller             LoadBalancer   10.43.x.x      <public-ip>     443:30443/TCP   60s
```

**Note:** EXTERNAL-IP should show your server's public IP. This is the IP Cloudflare will connect to.

---

## Step 2: Configure Ingress Resource

**Create Ingress manifest for backend services:**

```bash
# Create manifests directory
mkdir -p /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress

# Create Ingress resource
cat > /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/backend-ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gx-backend-ingress
  namespace: backend-mainnet
  annotations:
    # Use cert-manager to automatically request Let's Encrypt certificate
    cert-manager.io/cluster-issuer: "letsencrypt-prod"

    # Nginx-specific annotations
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "300"

    # CORS headers (if needed for web clients)
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://gxcoin.money, https://www.gxcoin.money"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Authorization, Content-Type, X-Idempotency-Key"

    # Rate limiting (additional layer on top of application-level)
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "5"

    # Security headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "X-XSS-Protection: 1; mode=block";
      more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";
      more_set_headers "Permissions-Policy: geolocation=(), microphone=(), camera=()";

    # Real IP from Cloudflare
    nginx.ingress.kubernetes.io/use-forwarded-headers: "true"
    nginx.ingress.kubernetes.io/forwarded-for-header: "CF-Connecting-IP"
spec:
  ingressClassName: nginx

  tls:
  - hosts:
    - api.gxcoin.money
    secretName: gx-api-tls  # cert-manager will create this Secret

  rules:
  - host: api.gxcoin.money
    http:
      paths:
      # ============================================
      # IDENTITY SERVICE
      # ============================================
      - path: /api/v1/auth
        pathType: Prefix
        backend:
          service:
            name: svc-identity
            port:
              number: 3001

      - path: /api/v1/users
        pathType: Prefix
        backend:
          service:
            name: svc-identity
            port:
              number: 3001

      # ============================================
      # TOKENOMICS SERVICE
      # ============================================
      - path: /api/v1/wallets
        pathType: Prefix
        backend:
          service:
            name: svc-tokenomics
            port:
              number: 3002

      - path: /api/v1/transactions
        pathType: Prefix
        backend:
          service:
            name: svc-tokenomics
            port:
              number: 3002

      - path: /api/v1/balances
        pathType: Prefix
        backend:
          service:
            name: svc-tokenomics
            port:
              number: 3002

      # ============================================
      # ORGANIZATION SERVICE
      # ============================================
      - path: /api/v1/organizations
        pathType: Prefix
        backend:
          service:
            name: svc-organization
            port:
              number: 3003

      # ============================================
      # LOANPOOL SERVICE
      # ============================================
      - path: /api/v1/loans
        pathType: Prefix
        backend:
          service:
            name: svc-loanpool
            port:
              number: 3004

      # ============================================
      # GOVERNANCE SERVICE
      # ============================================
      - path: /api/v1/proposals
        pathType: Prefix
        backend:
          service:
            name: svc-governance
            port:
              number: 3005

      - path: /api/v1/votes
        pathType: Prefix
        backend:
          service:
            name: svc-governance
            port:
              number: 3005

      # ============================================
      # ADMIN SERVICE
      # ============================================
      - path: /api/v1/admin
        pathType: Prefix
        backend:
          service:
            name: svc-admin
            port:
              number: 3006

      # ============================================
      # TAX SERVICE
      # ============================================
      - path: /api/v1/fees
        pathType: Prefix
        backend:
          service:
            name: svc-tax
            port:
              number: 3007

      - path: /api/v1/velocity-tax
        pathType: Prefix
        backend:
          service:
            name: svc-tax
            port:
              number: 3007

      # ============================================
      # HEALTH CHECK (PUBLIC)
      # ============================================
      - path: /health
        pathType: Exact
        backend:
          service:
            name: svc-identity  # Can use any service
            port:
              number: 3001
EOF

# Apply Ingress resource
kubectl apply -f /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/backend-ingress.yaml

# Verify Ingress
kubectl get ingress -n backend-mainnet
kubectl describe ingress gx-backend-ingress -n backend-mainnet
```

---

## Step 3: Update Backend Services to ClusterIP

**Currently, services use NodePort. Change to ClusterIP for security.**

**For each service, update the manifest:**

```bash
# Example: svc-identity
kubectl patch svc svc-identity -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'

# Repeat for all services
kubectl patch svc svc-tokenomics -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'
kubectl patch svc svc-organization -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'
kubectl patch svc svc-loanpool -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'
kubectl patch svc svc-governance -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'
kubectl patch svc svc-admin -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'
kubectl patch svc svc-tax -n backend-mainnet -p '{"spec":{"type":"ClusterIP"}}'

# Verify all services are ClusterIP
kubectl get svc -n backend-mainnet
```

**Expected Output:**
```
NAME               TYPE        CLUSTER-IP       PORT(S)    AGE
svc-identity       ClusterIP   10.43.x.x        3001/TCP   5d
svc-tokenomics     ClusterIP   10.43.y.y        3002/TCP   5d
...
```

**Why?**
- NodePort exposes services on all nodes (security risk)
- ClusterIP only exposes within cluster
- Nginx Ingress is the ONLY public entry point

---

## Step 4: Test Ingress (Without SSL - Temporary)

**Before cert-manager SSL:**

```bash
# Get Ingress Controller LoadBalancer IP
INGRESS_IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "Ingress IP: $INGRESS_IP"

# Test health endpoint
curl -H "Host: api.gxcoin.money" http://$INGRESS_IP/health

# Expected: 200 OK with health check response
```

**If successful, proceed to Step 5 (cert-manager).**

---

## Security Configuration

### 1. Enable ModSecurity WAF (Optional - Advanced)

**Install ModSecurity module:**

```bash
helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --reuse-values \
  --set controller.config.enable-modsecurity="true" \
  --set controller.config.enable-owasp-modsecurity-crs="true" \
  --set controller.config.modsecurity-snippet=|
    SecRuleEngine On
    SecAuditLog /dev/stdout
    SecAuditLogType Serial
```

### 2. Custom Error Pages

**Create custom 404/500 error pages:**

```yaml
# Add to Ingress annotations:
nginx.ingress.kubernetes.io/custom-http-errors: "404,503"
nginx.ingress.kubernetes.io/default-backend: custom-error-backend
```

### 3. IP Whitelisting (If Needed)

**Restrict access to specific IPs:**

```yaml
# Add to Ingress annotations:
nginx.ingress.kubernetes.io/whitelist-source-range: "203.x.x.x/32,67.y.y.y/32"
```

---

## Monitoring & Metrics

### Prometheus Metrics

**Nginx Ingress exposes metrics on port 10254:**

```bash
# Check metrics endpoint
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller-metrics 10254:10254

# Access metrics
curl http://localhost:10254/metrics
```

**Key metrics:**
- `nginx_ingress_controller_requests` - Total requests
- `nginx_ingress_controller_request_duration_seconds` - Latency
- `nginx_ingress_controller_bytes_sent` - Bandwidth
- `nginx_ingress_controller_ssl_expire_time_seconds` - SSL expiry

### Grafana Dashboard

**Import Nginx Ingress dashboard:**

1. Grafana → Dashboards → Import
2. Use dashboard ID: **9614** (official Nginx Ingress dashboard)
3. Select Prometheus data source
4. Import

---

## Troubleshooting

### Issue: Ingress shows no IP address

**Symptom:**
```bash
kubectl get ingress -n backend-mainnet
# ADDRESS column is empty
```

**Fix:**
```bash
# Check Ingress Controller status
kubectl get svc -n ingress-nginx

# If EXTERNAL-IP is <pending>, K3s LoadBalancer might not be configured
# For K3s, use built-in ServiceLB or MetalLB

# Option 1: Use K3s built-in ServiceLB (should work by default)
kubectl get svc -n kube-system | grep svclb

# Option 2: Install MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.0/config/manifests/metallb-native.yaml
```

### Issue: SSL certificate not auto-issued

**Symptom:**
```bash
kubectl describe ingress gx-backend-ingress -n backend-mainnet
# Events show: "Waiting for certificate"
```

**Fix:**
```bash
# Check cert-manager logs
kubectl logs -n cert-manager deploy/cert-manager

# Check Certificate status
kubectl get certificate -n backend-mainnet
kubectl describe certificate gx-api-tls -n backend-mainnet

# If rate-limited by Let's Encrypt, wait 1 hour or use staging
```

### Issue: 502 Bad Gateway

**Symptom:**
```bash
curl https://api.gxcoin.money/api/v1/users
# Returns: 502 Bad Gateway
```

**Fix:**
```bash
# Check backend service is running
kubectl get pods -n backend-mainnet

# Check service endpoints
kubectl get endpoints svc-identity -n backend-mainnet
# Should show pod IPs

# Check Ingress controller logs
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller | tail -50
```

---

## Next Steps

1. **Install cert-manager** (see CERT_MANAGER_SETUP_GUIDE.md)
2. **Request SSL certificate** for api.gxcoin.money
3. **Test HTTPS endpoint** (https://api.gxcoin.money)
4. **Update DNS** to point to Ingress IP
5. **Enable HSTS** header after 7 days of successful SSL

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol DevOps Team
