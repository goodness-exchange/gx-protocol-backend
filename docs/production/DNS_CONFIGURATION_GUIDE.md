# DNS Configuration Guide - GX Protocol Production Deployment

**Date:** November 17, 2025
**Domain:** gxcoin.money
**Purpose:** Enterprise-grade DNS setup for GX Protocol backend services and Fabric network
**Target:** 3 regional servers with GeoDNS load balancing

---

## Executive Summary

This guide provides step-by-step instructions for configuring DNS records at your domain provider (Cloudflare recommended) to enable:

- **HTTPS-only access** to all backend APIs
- **Geographic load balancing** across 3 regional servers
- **Automatic SSL certificate renewal** via Let's Encrypt
- **DDoS protection** and CDN caching (Cloudflare)
- **Zero exposure of IP addresses** to public internet

**Security Goal:** All direct IP access will be blocked via firewall rules. Only HTTPS traffic through domain names will be permitted.

---

## Infrastructure Overview

### Regional Deployment

| Region | Server Location | Public IP | Role | Services |
|--------|----------------|-----------|------|----------|
| **APAC** | Kuala Lumpur, Malaysia | `TBD` | Primary | All services (3 replicas) |
| **Americas** | Dallas, USA | `TBD` | Secondary | All services (3 replicas) |
| **EMEA** | Frankfurt, Germany | `TBD` | Tertiary | All services (3 replicas) |

### Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     api.gxcoin.money                        │
│                  (GeoDNS Load Balancer)                     │
└─────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   Malaysia (APAC)      USA (Americas)      Germany (EMEA)
   43.x.x.x (TBD)       67.x.x.x (TBD)      78.x.x.x (TBD)
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                             ▼
                   Nginx Ingress Controller
                   (Kubernetes LoadBalancer)
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   svc-identity      svc-tokenomics       svc-admin
   svc-organization  svc-loanpool         svc-tax
   svc-governance
```

---

## DNS Records Configuration

### Prerequisites

1. **Domain Registrar Access:** Admin access to gxcoin.money DNS management
2. **Cloudflare Account:** (Recommended) For GeoDNS, DDoS protection, and SSL
3. **Server IPs:** Public IPv4 addresses for all 3 regional servers
4. **SSL Certificates:** Will be auto-generated via Let's Encrypt + cert-manager

### Recommended Provider: Cloudflare

**Why Cloudflare?**
- Free GeoDNS (geographic routing)
- Free DDoS protection (unlimited)
- Free SSL/TLS certificates
- CDN with 330+ global PoPs
- 100% uptime SLA
- Web Application Firewall (WAF)

**Alternative Providers:**
- AWS Route 53 (GeoDNS via latency-based routing)
- Google Cloud DNS (GeoDNS via geoproximity)
- Cloudflare is **strongly recommended** for enterprise production

---

## Step-by-Step DNS Configuration

### Step 1: Point Domain Nameservers to Cloudflare

**At Your Domain Registrar:**

1. Log into your domain registrar (e.g., Namecheap, GoDaddy, etc.)
2. Navigate to domain management for `gxcoin.money`
3. Update nameservers to Cloudflare:

```
ns1.cloudflare.com
ns2.cloudflare.com
```

4. Wait 24-48 hours for DNS propagation (usually faster: 2-4 hours)

**Verification:**
```bash
dig gxcoin.money NS +short
# Should return: ns1.cloudflare.com, ns2.cloudflare.com
```

---

### Step 2: Create DNS Records in Cloudflare

**Login to Cloudflare Dashboard:**
1. Go to https://dash.cloudflare.com
2. Select `gxcoin.money` domain
3. Navigate to **DNS** → **Records**

**Add the following records:**

#### A. Main API Gateway (GeoDNS Load Balancing)

**Record 1: APAC Region (Malaysia)**
```
Type:     A
Name:     api
Content:  <MALAYSIA_PUBLIC_IP>  # e.g., 43.xxx.xxx.xxx
Proxy:    ✅ Proxied (Orange cloud)
TTL:      Auto
```

**Record 2: Americas Region (USA)**
```
Type:     A
Name:     api
Content:  <USA_PUBLIC_IP>  # e.g., 67.xxx.xxx.xxx
Proxy:    ✅ Proxied (Orange cloud)
TTL:      Auto
```

**Record 3: EMEA Region (Germany)**
```
Type:     A
Name:     api
Content:  <GERMANY_PUBLIC_IP>  # e.g., 78.xxx.xxx.xxx
Proxy:    ✅ Proxied (Orange cloud)
TTL:      Auto
```

**Important:** All 3 A records use the **same name** (`api`). Cloudflare will automatically perform geographic load balancing based on user location.

#### B. Regional-Specific Endpoints (Optional - For Testing)

**Malaysia (APAC):**
```
Type:     A
Name:     api-apac
Content:  <MALAYSIA_PUBLIC_IP>
Proxy:    ✅ Proxied
TTL:      Auto
```

**USA (Americas):**
```
Type:     A
Name:     api-us
Content:  <USA_PUBLIC_IP>
Proxy:    ✅ Proxied
TTL:      Auto
```

**Germany (EMEA):**
```
Type:     A
Name:     api-eu
Content:  <GERMANY_PUBLIC_IP>
Proxy:    ✅ Proxied
TTL:      Auto
```

**Purpose:** Allows testing specific regions independently.

#### C. Service-Specific Subdomains (Optional - Microservices Routing)

**If you want dedicated subdomains per service:**

```
Type:     CNAME
Name:     identity
Content:  api.gxcoin.money
Proxy:    ✅ Proxied
TTL:      Auto

Type:     CNAME
Name:     tokenomics
Content:  api.gxcoin.money
Proxy:    ✅ Proxied
TTL:      Auto

Type:     CNAME
Name:     admin
Content:  api.gxcoin.money
Proxy:    ✅ Proxied
TTL:      Auto
```

**Note:** With Nginx Ingress, path-based routing (`api.gxcoin.money/identity/*`) is preferred over subdomain routing. Service-specific subdomains are **optional**.

#### D. Root Domain (Optional - Documentation/Marketing Site)

```
Type:     A
Name:     @  (root domain)
Content:  <STATIC_SITE_IP or CDN>
Proxy:    ✅ Proxied
TTL:      Auto
```

**Purpose:** Serves https://gxcoin.money (documentation, marketing site, etc.)

#### E. Wildcard SSL Certificate (For Future Flexibility)

**No DNS record needed.** cert-manager will automatically request a wildcard certificate:
```
*.gxcoin.money
gxcoin.money
```

---

### Step 3: Configure SSL/TLS Settings in Cloudflare

**Navigate to:** SSL/TLS → Overview

**Select Encryption Mode:**
```
Full (strict)
```

**Why?**
- **Full (strict):** Cloudflare validates the origin server's SSL certificate
- End-to-end encryption from user → Cloudflare → Kubernetes Ingress
- Origin server must have valid SSL cert (cert-manager will provide)

**Other Options (NOT recommended):**
- ❌ **Flexible:** Cloudflare-to-origin uses HTTP (insecure!)
- ❌ **Full:** Doesn't validate origin cert (MITM risk)

**Navigate to:** SSL/TLS → Edge Certificates

**Enable the following:**
- ✅ **Always Use HTTPS** (force HTTP → HTTPS redirect)
- ✅ **Minimum TLS Version:** TLS 1.2
- ✅ **Opportunistic Encryption** (improve performance)
- ✅ **TLS 1.3** (enabled by default, fastest protocol)
- ✅ **Automatic HTTPS Rewrites**
- ✅ **Certificate Transparency Monitoring**

**Disable:**
- ❌ **HTTP Strict Transport Security (HSTS)** (enable AFTER successful deployment)

**Why defer HSTS?**
- HSTS locks browsers to HTTPS-only for 1 year
- Enable only after confirming SSL works 100%
- Once enabled, cannot easily rollback

---

### Step 4: Configure Firewall Rules in Cloudflare

**Navigate to:** Security → WAF

**Create the following rules:**

#### Rule 1: Block Direct IP Access
```
Rule Name: Block Direct IP Access
Field:     (http.host eq "<MALAYSIA_IP>") or (http.host eq "<USA_IP>") or (http.host eq "<GERMANY_IP>")
Action:    Block
```

**Why:** Prevents users from bypassing domain and accessing via IP directly.

#### Rule 2: Allow Only API Paths
```
Rule Name: Allow API Endpoints
Field:     (http.request.uri.path starts_with "/api/v1/") or (http.request.uri.path eq "/health") or (http.request.uri.path eq "/metrics")
Action:    Allow
```

#### Rule 3: Block Common Attack Patterns
```
Rule Name: Block SQL Injection
Field:     (http.request.uri contains "' OR 1=1") or (http.request.uri contains "UNION SELECT")
Action:    Block
```

#### Rule 4: Rate Limiting (Additional Layer)
```
Rule Name: Global Rate Limit
Field:     (http.host eq "api.gxcoin.money")
When:      More than 100 requests per minute from same IP
Action:    Challenge (CAPTCHA)
```

**Note:** Application-level rate limiting (already implemented in svc-identity) takes precedence. This is a backup layer.

---

### Step 5: Enable DDoS Protection

**Navigate to:** Security → DDoS

**Settings:**
- ✅ **HTTP DDoS Attack Protection:** Enabled (default)
- ✅ **Network DDoS Attack Protection:** Enabled (default)
- ✅ **Advanced TCP Protection:** Enabled

**Sensitivity:** Medium (adjust to High if under active attack)

**Why Cloudflare for DDoS?**
- Free unlimited DDoS protection
- 330+ Tbps network capacity
- Automatic mitigation (no manual intervention)
- Protects all DNS records with orange cloud (proxied)

---

### Step 6: Configure Caching Rules

**Navigate to:** Caching → Configuration

**Cache Level:** Standard

**Browser Cache TTL:** 4 hours

**Custom Cache Rules:**

```yaml
# Cache static assets
Cache Rule 1:
  If: (http.request.uri.path matches "^/api/v1/health$")
  Then: Cache TTL = 5 minutes

# Do NOT cache API responses (dynamic data)
Cache Rule 2:
  If: (http.request.uri.path starts_with "/api/v1/")
  Then: Bypass cache
```

**Why bypass cache for API?**
- API responses are dynamic (user-specific data)
- Caching would serve stale data to users
- Only cache static resources (health checks, public docs)

---

### Step 7: Configure Page Rules (URL Redirects)

**Navigate to:** Rules → Page Rules

**Rule 1: Force HTTPS**
```
URL:      http://*gxcoin.money/*
Setting:  Always Use HTTPS
```

**Rule 2: Root Domain Redirect (Optional)**
```
URL:      gxcoin.money/*
Setting:  Forwarding URL (301 Permanent)
Target:   https://www.gxcoin.money/$1
```

**Why?** Standardize on `www` or non-`www` version (choose one).

---

## DNS Record Summary

**After completing all steps, your DNS should look like:**

```
# Cloudflare DNS Records (gxcoin.money)

# Main API Gateway (GeoDNS)
api              A      43.xxx.xxx.xxx   Proxied   Auto
api              A      67.xxx.xxx.xxx   Proxied   Auto
api              A      78.xxx.xxx.xxx   Proxied   Auto

# Regional Testing Endpoints (Optional)
api-apac         A      43.xxx.xxx.xxx   Proxied   Auto
api-us           A      67.xxx.xxx.xxx   Proxied   Auto
api-eu           A      78.xxx.xxx.xxx   Proxied   Auto

# Root Domain (Optional - Documentation)
@                A      <CDN_IP>         Proxied   Auto
www              CNAME  gxcoin.money     Proxied   Auto
```

---

## Verification Steps

### 1. DNS Propagation Check

```bash
# Check DNS resolution
dig api.gxcoin.money +short
# Should return Cloudflare proxy IPs (not your origin IPs)

# Check from different regions
dig @1.1.1.1 api.gxcoin.money +short  # Cloudflare DNS
dig @8.8.8.8 api.gxcoin.money +short  # Google DNS

# Verify HTTPS
curl -I https://api.gxcoin.money/health
# Should return HTTP/2 200 OK with SSL certificate
```

### 2. SSL Certificate Validation

```bash
# Check SSL certificate
openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money < /dev/null | grep "Verify return code"
# Should return: Verify return code: 0 (ok)

# Check certificate details
echo | openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money 2>/dev/null | openssl x509 -noout -text | grep -A 3 "Subject:"
# Should show: CN=*.gxcoin.money or CN=gxcoin.money
```

### 3. GeoDNS Testing

```bash
# Test from different regions using VPN or proxy

# From Malaysia (should route to APAC server)
curl https://api.gxcoin.money/api/v1/health -v 2>&1 | grep "Connected to"

# From USA (should route to Americas server)
curl https://api.gxcoin.money/api/v1/health -v 2>&1 | grep "Connected to"

# From Germany (should route to EMEA server)
curl https://api.gxcoin.money/api/v1/health -v 2>&1 | grep "Connected to"
```

### 4. Firewall Rule Testing

```bash
# Test direct IP access (should be blocked)
curl http://43.xxx.xxx.xxx/api/v1/health
# Expected: Connection refused or Cloudflare block page

# Test domain access (should work)
curl https://api.gxcoin.money/api/v1/health
# Expected: HTTP 200 OK
```

---

## Security Checklist

**Before going live:**

- [ ] All DNS records use **Proxied** mode (orange cloud)
- [ ] SSL/TLS mode set to **Full (strict)**
- [ ] **Always Use HTTPS** enabled
- [ ] Minimum TLS version: **TLS 1.2**
- [ ] WAF rules created (block direct IP access)
- [ ] DDoS protection enabled
- [ ] Rate limiting configured (Cloudflare + application layer)
- [ ] Direct IP access blocked via firewall rules (see FIREWALL_SETUP_GUIDE.md)
- [ ] SSL certificates auto-renewed via cert-manager (see below)
- [ ] Health check endpoints return 200 OK
- [ ] API endpoints return valid JSON responses
- [ ] HSTS header added (only AFTER confirming SSL works)

---

## HSTS Configuration (Final Step - After SSL Confirmation)

**Only enable AFTER confirming HTTPS works perfectly for 7+ days.**

**Navigate to:** SSL/TLS → Edge Certificates

**Enable HSTS:**
```
Max Age:              31536000 (1 year)
Include Subdomains:   ✅ Yes
Preload:              ✅ Yes (optional, but recommended)
No-Sniff Header:      ✅ Yes
```

**What HSTS does:**
- Forces browsers to ALWAYS use HTTPS (no HTTP fallback)
- Protects against SSL-stripping attacks
- Prevents downgrade attacks

**Why wait 7 days?**
- HSTS cannot be easily undone (1-year cache in browsers)
- If SSL breaks, users cannot access site for 1 year
- Always test thoroughly before enabling

---

## Monitoring & Alerts

**Cloudflare Dashboard:**
1. Go to **Analytics** → **Traffic**
2. Monitor:
   - Requests per second
   - Bandwidth usage
   - Cache hit ratio
   - Error rate (4xx, 5xx)
   - Attack detection

**Set up Email Alerts:**
1. Navigate to **Notifications**
2. Enable alerts for:
   - DDoS attacks detected
   - High error rates (>5% 5xx errors)
   - SSL certificate expiration (30 days before)
   - DNS changes

---

## Troubleshooting

### Issue: "Too many redirects" error

**Cause:** SSL/TLS mode mismatch

**Solution:**
1. Go to Cloudflare SSL/TLS settings
2. Change mode to **Full (strict)**
3. Ensure origin server has valid SSL certificate

### Issue: DNS not resolving

**Cause:** DNS propagation delay

**Solution:**
```bash
# Flush local DNS cache
sudo systemd-resolve --flush-caches  # Linux
dscacheutil -flushcache  # macOS

# Check propagation globally
https://www.whatsmydns.net/#A/api.gxcoin.money
```

### Issue: "Certificate not valid" error

**Cause:** cert-manager not configured or Let's Encrypt rate limit

**Solution:**
1. Check cert-manager logs: `kubectl logs -n cert-manager deploy/cert-manager`
2. Verify ClusterIssuer: `kubectl describe clusterissuer letsencrypt-prod`
3. Check rate limits: https://letsencrypt.org/docs/rate-limits/

---

## Next Steps

1. **Complete Nginx Ingress setup** (see NGINX_INGRESS_SETUP_GUIDE.md)
2. **Configure firewall rules on all servers** (see FIREWALL_SETUP_GUIDE.md)
3. **Deploy cert-manager for SSL automation** (see CERT_MANAGER_SETUP_GUIDE.md)
4. **Update all backend service configurations** to use domain names
5. **Test end-to-end HTTPS flow** from client → Cloudflare → Ingress → Pods

---

## Support & Documentation

**Cloudflare Documentation:**
- DNS: https://developers.cloudflare.com/dns/
- SSL/TLS: https://developers.cloudflare.com/ssl/
- DDoS: https://developers.cloudflare.com/ddos-protection/
- WAF: https://developers.cloudflare.com/waf/

**cert-manager Documentation:**
- https://cert-manager.io/docs/

**Let's Encrypt Rate Limits:**
- https://letsencrypt.org/docs/rate-limits/

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol DevOps Team
**Review Frequency:** Quarterly
