# cert-manager Setup Guide - Automated SSL Certificates

**Date:** November 17, 2025
**Purpose:** Automated Let's Encrypt SSL certificate management for api.gxcoin.money
**Provider:** Let's Encrypt (free, auto-renewing certificates)

---

## Executive Summary

This guide deploys **cert-manager** to:

- **Automatically request** SSL certificates from Let's Encrypt
- **Auto-renew** certificates before expiry (every 90 days)
- **Integrate** with Nginx Ingress for seamless TLS termination
- **Support wildcard** certificates (*.gxcoin.money)
- **Zero manual** intervention required

---

## Step 1: Install cert-manager

**Deploy via Helm:**

```bash
# Add Jetstack Helm repository (cert-manager maintainers)
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Create namespace
kubectl create namespace cert-manager

# Install cert-manager with CRDs
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --version v1.14.0 \
  --set installCRDs=true \
  --set global.leaderElection.namespace=cert-manager

# Wait for pods to be ready
kubectl wait --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --namespace=cert-manager \
  --timeout=120s

# Verify installation
kubectl get pods -n cert-manager
```

**Expected Output:**
```
NAME                                       READY   STATUS    RESTARTS   AGE
cert-manager-xxxxxxxxxx-xxxxx              1/1     Running   0          60s
cert-manager-cainjector-xxxxxxxxxx-xxxxx   1/1     Running   0          60s
cert-manager-webhook-xxxxxxxxxx-xxxxx      1/1     Running   0          60s
```

---

## Step 2: Create ClusterIssuer (Production)

**cert-manager uses "Issuers" to request certificates. Create a ClusterIssuer for Let's Encrypt:**

```bash
cat > /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/letsencrypt-clusterissuer.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    # Let's Encrypt production server
    server: https://acme-v02.api.letsencrypt.org/directory

    # Email for certificate expiry notifications (IMPORTANT: Update this!)
    email: admin@gxcoin.money

    # Secret to store ACME account private key
    privateKeySecretRef:
      name: letsencrypt-prod-account-key

    # Use HTTP-01 challenge (validates via HTTP endpoint)
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Apply ClusterIssuer
kubectl apply -f /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/letsencrypt-clusterissuer.yaml

# Verify ClusterIssuer
kubectl get clusterissuer
kubectl describe clusterissuer letsencrypt-prod
```

**Important:** Update `email` to your actual admin email. Let's Encrypt will send certificate expiry reminders to this address.

---

## Step 3: Create ClusterIssuer (Staging - For Testing)

**Let's Encrypt has rate limits (50 certs/week/domain). Use staging for testing:**

```bash
cat > /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/letsencrypt-staging-clusterissuer.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    # Let's Encrypt staging server (for testing)
    server: https://acme-staging-v02.api.letsencrypt.org/directory

    email: admin@gxcoin.money

    privateKeySecretRef:
      name: letsencrypt-staging-account-key

    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Apply staging ClusterIssuer
kubectl apply -f /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/letsencrypt-staging-clusterissuer.yaml

# Verify both issuers
kubectl get clusterissuer
```

**Expected Output:**
```
NAME                   READY   AGE
letsencrypt-prod       True    30s
letsencrypt-staging    True    10s
```

---

## Step 4: Request Certificate (Automatic via Ingress)

**The Ingress resource already has cert-manager annotation. Update if needed:**

```bash
kubectl edit ingress gx-backend-ingress -n backend-mainnet

# Ensure these annotations exist:
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"  # Use "letsencrypt-staging" for testing
```

**cert-manager will automatically:**
1. Detect the Ingress resource
2. Create a Certificate object
3. Request certificate from Let's Encrypt
4. Validate domain ownership via HTTP-01 challenge
5. Store certificate in Secret `gx-api-tls`
6. Nginx Ingress will use the certificate

**Monitor certificate issuance:**

```bash
# Watch certificate creation
kubectl get certificate -n backend-mainnet -w

# Check certificate status
kubectl describe certificate gx-api-tls -n backend-mainnet

# Check CertificateRequest
kubectl get certificaterequest -n backend-mainnet

# Check Challenge (HTTP-01 validation)
kubectl get challenge -n backend-mainnet
```

**Successful certificate issuance:**
```
NAME         READY   SECRET        AGE
gx-api-tls   True    gx-api-tls    2m
```

**If READY = False, check "Events" section in describe output.**

---

## Step 5: Verify SSL Certificate

**Test HTTPS endpoint:**

```bash
# Check SSL certificate details
echo | openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money 2>/dev/null | openssl x509 -noout -text | grep -A 3 "Subject:"

# Expected output:
#   Subject: CN = api.gxcoin.money
#   Issuer: C = US, O = Let's Encrypt, CN = R3

# Check expiry date
echo | openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money 2>/dev/null | openssl x509 -noout -dates

# Expected: Valid for 90 days from issue date

# Test HTTPS request
curl -I https://api.gxcoin.money/health

# Expected: HTTP/2 200 OK
```

**Verify in browser:**
- Visit https://api.gxcoin.money/health
- Click padlock icon → Certificate should show "Let's Encrypt" issuer

---

## Step 6: Configure Auto-Renewal

**cert-manager automatically renews certificates 30 days before expiry (no action required).**

**Verify auto-renewal is configured:**

```bash
# Check cert-manager logs for renewal activity
kubectl logs -n cert-manager deploy/cert-manager | grep -i "renew"

# Check Certificate renewal status
kubectl get certificate gx-api-tls -n backend-mainnet -o yaml | grep renewBefore

# Default: renewBefore = 2160h (30 days)
```

**Manual renewal (for testing):**

```bash
# Force certificate renewal
kubectl delete secret gx-api-tls -n backend-mainnet

# cert-manager will automatically re-issue
kubectl get certificate -n backend-mainnet -w
```

---

## Step 7: Wildcard Certificate (Optional)

**If you want *.gxcoin.money certificate:**

**Requires DNS-01 challenge (not HTTP-01):**

```bash
cat > /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/wildcard-certificate.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: gx-wildcard-tls
  namespace: backend-mainnet
spec:
  secretName: gx-wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - "*.gxcoin.money"
  - "gxcoin.money"

  # DNS-01 challenge (requires DNS provider API token)
  solvers:
  - dns01:
      cloudflare:
        email: admin@gxcoin.money
        apiTokenSecretRef:
          name: cloudflare-api-token
          key: api-token
EOF
```

**Create Cloudflare API token:**

1. Login to Cloudflare → My Profile → API Tokens
2. Create Token → Edit Zone DNS template
3. Permissions: Zone → DNS → Edit
4. Zone Resources: Include → Specific zone → gxcoin.money
5. Copy token

**Create Kubernetes Secret:**

```bash
kubectl create secret generic cloudflare-api-token \
  --namespace=backend-mainnet \
  --from-literal=api-token=<YOUR_CLOUDFLARE_API_TOKEN>

# Apply wildcard certificate
kubectl apply -f /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/ingress/wildcard-certificate.yaml

# Monitor issuance
kubectl get certificate gx-wildcard-tls -n backend-mainnet -w
```

**Update Ingress to use wildcard cert:**

```yaml
spec:
  tls:
  - hosts:
    - api.gxcoin.money
    - "*.api.gxcoin.money"
    secretName: gx-wildcard-tls  # Changed from gx-api-tls
```

---

## Monitoring & Alerts

### Prometheus Metrics

**cert-manager exposes Prometheus metrics:**

```bash
# Enable metrics in cert-manager
kubectl patch deployment cert-manager \
  -n cert-manager \
  --type=json \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--enable-certificate-owner-ref=true"}]'

# Metrics endpoint
kubectl port-forward -n cert-manager svc/cert-manager 9402:9402

curl http://localhost:9402/metrics | grep certmanager_certificate
```

**Key metrics:**
- `certmanager_certificate_expiration_timestamp_seconds` - Certificate expiry time
- `certmanager_certificate_ready_status` - 1 = ready, 0 = not ready

### Grafana Dashboard

**Import cert-manager dashboard:**

1. Grafana → Dashboards → Import
2. Use dashboard ID: **11001** (community cert-manager dashboard)
3. Select Prometheus data source

---

## Troubleshooting

### Issue: Certificate stuck in "False" state

**Symptom:**
```bash
kubectl get certificate -n backend-mainnet
# READY column shows: False
```

**Debug:**
```bash
# Check certificate details
kubectl describe certificate gx-api-tls -n backend-mainnet

# Look for "Events" section, common errors:
# - "HTTP-01 challenge failed" → Firewall blocking port 80
# - "DNS propagation timeout" → DNS not resolving
# - "Rate limit exceeded" → Switch to staging issuer
```

**Fix:**

```bash
# Delete and recreate
kubectl delete certificate gx-api-tls -n backend-mainnet
kubectl delete secret gx-api-tls -n backend-mainnet

# cert-manager will auto-recreate
```

### Issue: Let's Encrypt rate limit

**Symptom:**
```bash
kubectl describe certificate gx-api-tls -n backend-mainnet
# Error: "too many certificates already issued for exact set of domains"
```

**Rate Limits:**
- 50 certificates per registered domain per week
- 5 duplicate certificates per week

**Fix:**

```bash
# Switch to staging issuer (unlimited rate)
kubectl patch ingress gx-backend-ingress -n backend-mainnet --type=merge -p '{"metadata":{"annotations":{"cert-manager.io/cluster-issuer":"letsencrypt-staging"}}}'

# Delete existing certificate
kubectl delete certificate gx-api-tls -n backend-mainnet

# Wait 1 week or use staging certificates for testing
```

### Issue: HTTP-01 challenge fails

**Symptom:**
```bash
kubectl get challenge -n backend-mainnet
# STATUS: Pending
```

**Cause:** Firewall or Ingress misconfiguration

**Fix:**

```bash
# Ensure port 80 is open (Let's Encrypt needs HTTP for validation)
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Check Ingress is responding on HTTP
curl -I http://api.gxcoin.money/.well-known/acme-challenge/test

# Expected: 404 (not 403 or timeout)
```

---

## Security Best Practices

### 1. Use Production Issuer Only After Testing

**Always test with staging first:**

```bash
# Step 1: Test with staging
kubectl patch ingress gx-backend-ingress -n backend-mainnet --type=merge -p '{"metadata":{"annotations":{"cert-manager.io/cluster-issuer":"letsencrypt-staging"}}}'

# Step 2: Verify certificate works (ignore browser warning about invalid cert)
curl -k https://api.gxcoin.money/health

# Step 3: Switch to production
kubectl patch ingress gx-backend-ingress -n backend-mainnet --type=merge -p '{"metadata":{"annotations":{"cert-manager.io/cluster-issuer":"letsencrypt-prod"}}}'
```

### 2. Backup Account Private Key

**Let's Encrypt account key is stored in Secret:**

```bash
# Backup account key
kubectl get secret letsencrypt-prod-account-key -n cert-manager -o yaml > letsencrypt-account-key-backup.yaml

# Store securely (encrypted, offsite backup)
gpg -c letsencrypt-account-key-backup.yaml
```

### 3. Monitor Certificate Expiry

**Set up alerts 14 days before expiry:**

```yaml
# Prometheus alert rule
- alert: CertificateExpiryWarning
  expr: (certmanager_certificate_expiration_timestamp_seconds - time()) / 86400 < 14
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Certificate {{ $labels.name }} expires in {{ $value }} days"
```

---

## Let's Encrypt Rate Limits

**Production Limits:**
- **50 certificates** per registered domain per week
- **5 duplicate certificates** per week
- **300 new orders** per account per 3 hours
- **10 accounts** per IP per 3 hours

**Staging Limits:**
- **Unlimited** (use for testing)

**Source:** https://letsencrypt.org/docs/rate-limits/

---

## Next Steps

1. ✅ cert-manager installed
2. ✅ ClusterIssuer created (prod + staging)
3. ✅ Certificate auto-requested via Ingress
4. **Test HTTPS access:** https://api.gxcoin.money/health
5. **Update DNS** to point to Ingress IP (if not done)
6. **Enable HSTS** header after 7 days of successful SSL
7. **Monitor auto-renewal** (happens automatically 30 days before expiry)

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol DevOps Team
