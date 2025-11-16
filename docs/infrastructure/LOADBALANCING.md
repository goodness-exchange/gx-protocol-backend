# Load Balancing Infrastructure

This document describes the GX Protocol load balancing architecture and implementation.

## Overview

GX Protocol uses a **geo-distributed load balancing architecture** to provide low-latency API access to users worldwide. The system routes users to the nearest regional server automatically.

## Architecture

### Global Distribution

```
                    Global Internet Users
                            ↓
              Cloudflare GeoDNS + DDoS Protection
                    (api.gxcoin.money)
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
   ASIA REGION      AMERICAS REGION      EUROPE REGION
   🇲🇾 Malaysia         🇺🇸 USA              🇩🇪 Germany
  72.60.210.201     217.196.51.190        72.61.81.3
        ↓                   ↓                   ↓
  Nginx Reverse       Nginx Reverse       Nginx Reverse
     Proxy               Proxy               Proxy
        ↓                   ↓                   ↓
   srv1089618          srv1089624          srv1092158
  (K8s Control)       (K8s Control)       (K8s Control)
        ↓                   ↓                   ↓
  Backend Services    Backend Services    Backend Services
```

### Regional Servers

| Region | Location | IP Address | Server | Role | Continent |
|--------|----------|------------|--------|------|-----------|
| **Asia-Pacific** | Kuala Lumpur, Malaysia | 72.60.210.201 | srv1089618 | Production | Asia |
| **North America** | Phoenix, USA | 217.196.51.190 | srv1089624 | Production | North America |
| **Europe** | Frankfurt, Germany | 72.61.81.3 | srv1092158 | Production | Europe |
| **Testnet** | Kuala Lumpur, Malaysia | 72.61.116.210 | srv1117946 | Development | Asia |

## Components

### 1. Cloudflare GeoDNS

**Purpose:** Route users to nearest server based on geographic location

**Configuration:**
- Domain: `gxcoin.money`
- Subdomain: `api.gxcoin.money`
- DNS Records: 3 A records (one per region)
- Proxy Status: Enabled (orange cloud)

**Features:**
- Geographic routing
- DDoS protection (unlimited)
- SSL/TLS encryption
- CDN caching (optional)
- FREE tier used

### 2. Nginx Reverse Proxy

**Purpose:** Route incoming HTTPS requests to Kubernetes services

**Deployment:**
- Installed on all 3 regional servers
- Configuration: `/etc/nginx/conf.d/api.conf`
- SSL Certificates: Let's Encrypt (auto-renewal)

**Features:**
- HTTPS termination
- HTTP/2 support
- Request proxying to backend services
- Rate limiting (10 req/sec per IP)
- Security headers
- Access logging

### 3. Kubernetes NodePort Services

**Purpose:** Expose backend microservices to Nginx

**Port Mapping:**

| Service | Internal Port | NodePort | URL Path |
|---------|--------------|----------|----------|
| svc-identity | 3001 | 30001 | /identity |
| svc-admin | 3002 | 30002 | /admin |
| svc-tokenomics | 3003 | 30003 | /tokenomics |
| svc-organization | 3004 | 30004 | /organization |
| svc-loanpool | 3005 | 30005 | /loanpool |
| svc-governance | 3006 | 30006 | /governance |
| svc-tax | 3007 | 30007 | /tax |

### 4. Health Monitoring

**Purpose:** Detect regional server failures

**Implementation:**
- Script: `/usr/local/bin/gx-health-monitor`
- Check interval: 60 seconds
- Method: HTTPS GET to /health endpoint
- Alerts: Email, Slack (configurable)

**Monitored metrics:**
- HTTP response code (200 = healthy)
- Response time
- SSL certificate validity

## Request Flow

### Example: User in Singapore Accesses API

```
1. User browser requests: https://api.gxcoin.money/identity/users
2. DNS query to Cloudflare → returns 72.60.210.201 (Malaysia, nearest)
3. HTTPS connection to Malaysia server
4. Cloudflare performs DDoS check
5. SSL/TLS handshake with Let's Encrypt certificate
6. Nginx receives request on port 443
7. Nginx proxies to localhost:30001 (Kubernetes NodePort)
8. Kubernetes routes to svc-identity pod
9. Identity service processes request
10. Response flows back through chain
11. User receives response (total ~50ms latency)
```

### Example: Server Failure Scenario

```
1. Malaysia server (72.60.210.201) goes offline
2. Health monitor detects failure within 60 seconds
3. Alert sent to admin team
4. Admin removes Malaysia IP from Cloudflare DNS
5. Asian users automatically routed to Germany (next nearest)
6. Latency increases from 50ms to ~150ms (degraded but operational)
7. Malaysia server brought back online
8. IP re-added to Cloudflare DNS
9. Asian users resume low-latency connections
```

## Configuration Files

### Nginx Configuration

**Location:** `/etc/nginx/conf.d/api.conf`

Key sections:
- Upstream definitions (backend services)
- HTTP → HTTPS redirect
- HTTPS server block
- SSL configuration
- Proxy location blocks
- Rate limiting
- Security headers

**Location:** `/etc/nginx/proxy_params.conf`

Common proxy headers:
- X-Real-IP
- X-Forwarded-For
- X-Forwarded-Proto
- Host header preservation

### Rate Limiting

**Location:** `/etc/nginx/nginx.conf` (http block)

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
```

**Limits:**
- 10 requests per second per IP
- Burst capacity: 20 requests
- Max concurrent connections: 10 per IP
- Response on limit: HTTP 429 (Too Many Requests)

### SSL Certificates

**Provider:** Let's Encrypt (certbot)

**Renewal:** Automatic (cron job runs twice daily)

**Certificate locations:**
- Certificate: `/etc/letsencrypt/live/api.gxcoin.money/fullchain.pem`
- Private key: `/etc/letsencrypt/live/api.gxcoin.money/privkey.pem`
- Chain: `/etc/letsencrypt/live/api.gxcoin.money/chain.pem`

**Validity:** 90 days (auto-renews at 30 days remaining)

## Performance Characteristics

### Latency by Region

| User Location | Routed To | Expected Latency | Hops |
|---------------|-----------|------------------|------|
| Singapore | Malaysia | 5-20ms | 5-10 |
| India | Malaysia | 30-50ms | 8-12 |
| Australia | Malaysia | 50-100ms | 10-15 |
| Japan | Malaysia | 80-120ms | 12-15 |
| USA West | USA | 5-20ms | 5-10 |
| USA East | USA | 50-80ms | 10-12 |
| Canada | USA | 20-50ms | 8-12 |
| Brazil | USA | 100-150ms | 12-18 |
| UK | Germany | 10-30ms | 6-10 |
| France | Germany | 5-20ms | 5-8 |
| Spain | Germany | 20-40ms | 8-12 |
| Middle East | Germany | 50-100ms | 10-15 |

### Capacity

**Per Regional Server:**
- Requests per second: ~1,000 (typical API load)
- Concurrent connections: ~10,000
- Bandwidth: ~100 Mbps
- CPU utilization: ~30% at typical load

**Global Aggregate:**
- Total requests per second: ~3,000
- Total concurrent connections: ~30,000
- Geographic coverage: 3 continents

## Security Features

### DDoS Protection

**Provider:** Cloudflare (FREE tier)

**Protection levels:**
- Layer 3/4: Network/transport layer attacks
- Layer 7: Application layer attacks
- Volumetric: Bandwidth exhaustion attacks
- Protocol: TCP SYN floods, UDP floods

**Mitigation capacity:** Unlimited (Cloudflare infrastructure)

### Rate Limiting

**Implementation:** Nginx limit_req module

**Configuration:**
- Per-IP tracking using binary remote address
- Token bucket algorithm
- Shared memory zone: 10 MB (tracks ~160k unique IPs)

**Bypass mechanisms:**
- None (applies to all traffic)
- Cloudflare can be whitelisted if needed

### SSL/TLS Security

**Protocols enabled:**
- TLS 1.2 (minimum)
- TLS 1.3 (preferred)

**Protocols disabled:**
- SSLv2, SSLv3 (vulnerable)
- TLS 1.0, TLS 1.1 (deprecated)

**Cipher suites:**
- ECDHE-RSA-AES128-GCM-SHA256
- ECDHE-RSA-AES256-GCM-SHA384
- ECDHE-RSA-CHACHA20-POLY1305

**Features:**
- Perfect Forward Secrecy (PFS)
- HSTS enabled (max-age=31536000)
- OCSP stapling (planned)

### HTTP Security Headers

Applied to all responses:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

## Monitoring and Operations

### Health Checks

**Automated monitoring:**
- Script: `/usr/local/bin/gx-health-monitor`
- Interval: 60 seconds
- Method: HTTPS GET requests with host resolution
- Timeout: 10 seconds per region

**Manual checks:**

```bash
# Check Malaysia
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.60.210.201"

# Check USA
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:217.196.51.190"

# Check Germany
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.61.81.3"
```

### Logging

**Nginx access logs:**
- Location: `/var/log/nginx/api.gxcoin.money.access.log`
- Format: Combined (includes user agent, referer)
- Rotation: Daily (logrotate)

**Nginx error logs:**
- Location: `/var/log/nginx/api.gxcoin.money.error.log`
- Level: Error
- Includes: SSL errors, proxy errors, timeouts

**Health monitor logs:**
- Location: `/var/log/gx-health-monitor.log`
- Includes: Check results, state transitions, alerts

### Metrics (Planned)

Future Prometheus metrics:

- `nginx_http_requests_total` - Total requests by region
- `nginx_http_request_duration_seconds` - Request latency
- `nginx_upstream_response_time` - Backend response time
- `gx_region_health_status` - 1=healthy, 0=down
- `gx_ssl_certificate_expiry_days` - Days until cert expires

## Disaster Recovery

### Regional Server Failure

**Automatic failover:** No (FREE Cloudflare tier)

**Manual failover procedure:**

1. Health monitor detects failure and alerts
2. Admin logs into Cloudflare dashboard
3. Navigate to DNS settings
4. Pause/delete failed server's A record
5. Users automatically route to remaining healthy regions
6. Latency increases but service remains available
7. Investigate and repair failed server
8. Re-enable A record when server healthy

**Recovery time objective (RTO):** <5 minutes
**Recovery point objective (RPO):** N/A (stateless services)

### Complete Cloudflare Outage

**Probability:** Extremely rare (99.99% uptime SLA)

**Fallback:**
- Direct IP access possible: `https://217.196.51.190/identity`
- Update DNS to bypass Cloudflare (requires DNS propagation)
- Estimated recovery: 1-24 hours (DNS cache TTL)

### SSL Certificate Expiry

**Prevention:** Auto-renewal via certbot cron

**Manual renewal:**

```bash
# On each regional server
ssh root@<server-ip> "certbot renew && systemctl reload nginx"
```

**Emergency procedure:**
- Disable HTTPS enforcement (remove redirect)
- Serve over HTTP temporarily
- Obtain new certificate
- Re-enable HTTPS

## Cost Analysis

### Current Setup (FREE)

| Component | Provider | Monthly Cost |
|-----------|----------|--------------|
| GeoDNS | Cloudflare | $0 |
| DDoS Protection | Cloudflare | $0 |
| CDN | Cloudflare | $0 |
| SSL Certificates | Let's Encrypt | $0 |
| Nginx | Open Source | $0 |
| Health Monitoring | Custom | $0 |
| **TOTAL** | | **$0** |

### Optional Paid Upgrades

| Feature | Provider | Monthly Cost | Benefit |
|---------|----------|--------------|---------|
| Active Health Checks | Cloudflare Load Balancing | $5 | Automatic failover |
| Advanced WAF | Cloudflare | $20 | Bot protection, advanced rules |
| Priority Support | Cloudflare | Included | 24/7 support |

## Future Enhancements

### Short Term (1-3 months)

1. **Active health checks** - Upgrade to Cloudflare Load Balancing ($5/month)
2. **Prometheus metrics** - Deploy exporters on all regions
3. **Grafana dashboards** - Visualize latency, requests, errors
4. **Alert automation** - Auto-remove failed servers from DNS

### Medium Term (3-6 months)

1. **Additional regions** - Add servers in South America, Africa
2. **WAF rules** - Protect against OWASP Top 10
3. **API gateway** - Centralized auth, rate limiting, analytics
4. **Cache optimization** - CDN caching for read-heavy endpoints

### Long Term (6-12 months)

1. **Multi-cloud** - Deploy on AWS, GCP, Azure for redundancy
2. **Kubernetes multi-cluster** - Federated clusters across regions
3. **Service mesh** - Istio/Linkerd for advanced traffic management
4. **Edge computing** - Cloudflare Workers for ultra-low latency

## References

- **Deployment Guide:** `/k8s/infrastructure/geodns/README.md`
- **Nginx Config:** `/k8s/infrastructure/geodns/nginx-regional.conf`
- **Deployment Script:** `/k8s/infrastructure/geodns/DEPLOY_GEODNS.sh`
- **Cloudflare Docs:** https://developers.cloudflare.com/load-balancing/
- **Let's Encrypt:** https://letsencrypt.org/docs/

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-16 | 1.0 | Initial GeoDNS deployment across 3 regions |

---

**Document Owner:** Infrastructure Team
**Last Updated:** 2025-11-16
**Review Frequency:** Quarterly
