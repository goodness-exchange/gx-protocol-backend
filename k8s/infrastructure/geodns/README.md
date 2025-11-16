# GX Protocol GeoDNS Load Balancing

Enterprise-grade global load balancing with automatic geo-routing across 3 continents.

## Architecture Overview

```
                        Global Users
                             ↓
                  Cloudflare GeoDNS + DDoS
                    (FREE Tier + Proxied)
                             ↓
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
    ASIA Region       AMERICAS Region     EUROPE Region
   Malaysia 🇲🇾         USA 🇺🇸           Germany 🇩🇪
 72.60.210.201      217.196.51.190       72.61.81.3
      ↓                    ↓                  ↓
 Nginx + SSL          Nginx + SSL       Nginx + SSL
      ↓                    ↓                  ↓
srv1089618          srv1089624          srv1092158
(K8s control)       (K8s control)       (K8s control)
      ↓                    ↓                  ↓
 Backend Services    Backend Services   Backend Services
 (NodePort 30001-7)  (NodePort 30001-7) (NodePort 30001-7)
```

## Global Infrastructure

| Region | Server | IP Address | Location | Latency |
|--------|--------|------------|----------|---------|
| **Asia-Pacific** | srv1089618 | 72.60.210.201 | Kuala Lumpur, Malaysia | <50ms (Asia users) |
| **North America** | srv1089624 | 217.196.51.190 | Phoenix, USA | <50ms (US users) |
| **Europe** | srv1092158 | 72.61.81.3 | Frankfurt, Germany | <50ms (EU users) |
| **Testnet** | srv1117946 | 72.61.116.210 | Kuala Lumpur, Malaysia | Dev/Test only |

## Features

✅ **Geo-Routing** - Users connect to nearest server automatically
✅ **DDoS Protection** - Cloudflare FREE tier (unlimited bandwidth)
✅ **Free SSL** - Let's Encrypt on all regions
✅ **Rate Limiting** - 10 req/sec per IP
✅ **Health Monitoring** - Manual health checks every 60 seconds
✅ **Automatic Failover** - Via Cloudflare (manual monitoring)
✅ **$0/month** - 100% free solution

## API Endpoints

All accessible via `https://api.gxcoin.money`:

- `/identity` → Identity Service (port 3001)
- `/admin` → Admin Service (port 3002)
- `/tokenomics` → Tokenomics Service (port 3003)
- `/organization` → Organization Service (port 3004)
- `/loanpool` → LoanPool Service (port 3005)
- `/governance` → Governance Service (port 3006)
- `/tax` → Tax Service (port 3007)
- `/health` → Health check endpoint

## Quick Start

### Prerequisites

1. **Cloudflare account** with gxcoin.money domain
2. **SSH access** to all 3 regional servers
3. **Kubernetes services** deployed in backend-mainnet namespace

### Deployment

```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns

# Make script executable
chmod +x DEPLOY_GEODNS.sh

# Deploy to all regions
./DEPLOY_GEODNS.sh
```

**Time:** ~10 minutes

### Cloudflare Configuration

After deployment, configure GeoDNS in Cloudflare:

1. **Login to Cloudflare** → Select gxcoin.money domain
2. **Go to DNS settings**
3. **Delete existing** api.gxcoin.money record (if any)
4. **Add 3 A records** (all with name "api"):

```
Record 1:
  Type: A
  Name: api
  Content: 72.60.210.201
  Proxy status: Proxied (orange cloud)
  TTL: Auto

Record 2:
  Type: A
  Name: api
  Content: 217.196.51.190
  Proxy status: Proxied (orange cloud)
  TTL: Auto

Record 3:
  Type: A
  Name: api
  Content: 72.61.81.3
  Proxy status: Proxied (orange cloud)
  TTL: Auto
```

5. **Enable Load Balancing** (Optional - $5/month for active health checks):
   - Go to Traffic → Load Balancing
   - Create pool with all 3 IPs
   - Enable geo-steering

### Verification

Test from your location:

```bash
# Check which region you're connected to
curl https://api.gxcoin.money/health

# Response shows your region:
{
  "status": "healthy",
  "region": "North America",  # or Asia/Europe
  "server": "217.196.51.190"
}
```

Test specific regions:

```bash
# Force connect to Malaysia
curl https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.60.210.201"

# Force connect to USA
curl https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:217.196.51.190"

# Force connect to Germany
curl https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.61.81.3"
```

## How GeoDNS Works

### Cloudflare FREE Tier Routing

Cloudflare uses **Round-Robin DNS** with proximity awareness:

1. User requests api.gxcoin.money
2. Cloudflare DNS returns IP based on user's location:
   - **Asia/Pacific** → 72.60.210.201 (Malaysia)
   - **Americas** → 217.196.51.190 (USA)
   - **Europe/Africa** → 72.61.81.3 (Germany)
3. User connects directly to nearest server
4. Nginx proxies to local Kubernetes services

### Failover Behavior (FREE Tier)

**If Malaysia server fails:**
- Health monitor detects failure (60-second check)
- Manual intervention required to remove from Cloudflare DNS
- Users temporarily routed to Germany (next nearest)

**With Cloudflare Load Balancing ($5/month):**
- Automatic health checks every 60 seconds
- Automatic removal of failed servers
- Zero manual intervention

## Health Monitoring

### Automated Health Checks

Health monitor runs continuously on deployment server:

```bash
# View live monitoring
tail -f /var/log/gx-health-monitor.log

# Check service status
ps aux | grep gx-health-monitor

# Restart monitor
pkill -f gx-health-monitor
nohup /usr/local/bin/gx-health-monitor >> /var/log/gx-health-monitor.log 2>&1 &
```

### Manual Health Checks

Check each region manually:

```bash
# Malaysia
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.60.210.201"

# USA
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:217.196.51.190"

# Germany
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.61.81.3"
```

Expected response:
```
HTTP/2 200
content-type: application/json
{"status":"healthy","region":"...","server":"..."}
```

### Alert Configuration

Edit health monitor to add alerts:

```bash
vi /usr/local/bin/gx-health-monitor

# Add email address
ALERT_EMAIL="your-email@gxcoin.money"

# Add Slack webhook (optional)
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

Restart monitor:
```bash
pkill -f gx-health-monitor
nohup /usr/local/bin/gx-health-monitor >> /var/log/gx-health-monitor.log 2>&1 &
```

## Security Features

### Rate Limiting

**Per IP limits:**
- 10 requests/second (burst 20)
- 10 concurrent connections
- HTTP 429 response when exceeded

**Configure limits:**

Edit `/etc/nginx/nginx.conf` on each server:

```nginx
# Adjust rate
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# Adjust connections
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
```

Reload: `systemctl reload nginx`

### SSL/TLS Configuration

**Enabled protocols:**
- TLS 1.2
- TLS 1.3

**Disabled protocols:**
- TLS 1.0 (vulnerable)
- TLS 1.1 (vulnerable)
- SSLv3 (vulnerable)

**Security headers:**
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy

### DDoS Protection

**Cloudflare FREE tier provides:**
- Unmetered DDoS mitigation
- Layer 3/4 attack protection
- Layer 7 attack mitigation
- IP reputation filtering

**Additional protection:**
- Nginx rate limiting (per IP)
- Connection limits
- Request size limits

## Maintenance

### SSL Certificate Renewal

Certificates auto-renew via certbot (every 90 days).

**Manual renewal:**

```bash
# On each server
ssh root@72.60.210.201 "certbot renew && systemctl reload nginx"
ssh root@217.196.51.190 "certbot renew && systemctl reload nginx"
ssh root@72.61.81.3 "certbot renew && systemctl reload nginx"
```

**Check expiry:**

```bash
ssh root@217.196.51.190 "certbot certificates"
```

### Nginx Configuration Updates

Update config on all regions:

```bash
# Edit config
vi nginx-regional.conf

# Deploy to all servers
for ip in 72.60.210.201 217.196.51.190 72.61.81.3; do
  scp nginx-regional.conf root@$ip:/etc/nginx/conf.d/api.conf
  ssh root@$ip "nginx -t && systemctl reload nginx"
done
```

### Add New Service

1. **Deploy service to Kubernetes**:
```bash
kubectl create deployment svc-newservice --image=gx-protocol/svc-newservice:1.0.0 -n backend-mainnet
kubectl expose deployment svc-newservice --port=3008 --target-port=3008 --type=NodePort -n backend-mainnet
```

2. **Update Nginx config**:

Add to `nginx-regional.conf`:
```nginx
upstream newservice_backend {
    server 127.0.0.1:30008 max_fails=3 fail_timeout=30s;
}

# In server {} block:
location /newservice {
    proxy_pass http://newservice_backend;
    include /etc/nginx/proxy_params.conf;
}
```

3. **Deploy to all regions**:
```bash
for ip in 72.60.210.201 217.196.51.190 72.61.81.3; do
  scp nginx-regional.conf root@$ip:/etc/nginx/conf.d/api.conf
  ssh root@$ip "nginx -t && systemctl reload nginx"
done
```

## Troubleshooting

### Server Not Responding

**Check Nginx status:**
```bash
ssh root@72.60.210.201 "systemctl status nginx"
```

**Check Nginx logs:**
```bash
ssh root@72.60.210.201 "tail -f /var/log/nginx/api.gxcoin.money.error.log"
```

**Check backend services:**
```bash
kubectl get pods -n backend-mainnet
curl http://localhost:30001/health  # From server
```

### SSL Certificate Issues

**Test SSL:**
```bash
curl -vI https://api.gxcoin.money
openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money
```

**Renew certificate:**
```bash
ssh root@217.196.51.190 "certbot renew --force-renewal"
```

### Geo-Routing Not Working

**Verify Cloudflare proxy is enabled:**
- Go to Cloudflare DNS
- Ensure orange cloud icon is ON for all api records

**Check which server you're connecting to:**
```bash
curl https://api.gxcoin.money/health
# Should show region closest to you
```

**Test specific region:**
```bash
curl https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.61.81.3"
# Forces connection to Germany
```

### Rate Limiting Too Strict

**Adjust limits:**

Edit `/etc/nginx/nginx.conf`:
```nginx
# Increase from 10r/s to 50r/s
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=50r/s;
```

Edit `/etc/nginx/conf.d/api.conf`:
```nginx
# Increase burst from 20 to 100
limit_req zone=api_limit burst=100 nodelay;
```

Reload: `systemctl reload nginx`

## Performance Metrics

### Expected Latency

| User Location | Nearest Server | Expected Latency |
|---------------|----------------|------------------|
| Singapore | Malaysia | 5-20ms |
| India | Malaysia | 30-50ms |
| Australia | Malaysia | 50-100ms |
| USA West Coast | USA | 5-20ms |
| USA East Coast | USA | 50-80ms |
| Canada | USA | 20-50ms |
| UK | Germany | 10-30ms |
| France | Germany | 5-20ms |
| Middle East | Germany | 50-100ms |

### Throughput

**Per server:**
- ~1000 requests/second (typical API load)
- ~10,000 concurrent connections
- ~100 Mbps bandwidth

**Global capacity:**
- ~3000 requests/second across all regions
- ~30,000 concurrent connections

## Cost Breakdown

| Component | Provider | Monthly Cost |
|-----------|----------|--------------|
| GeoDNS Routing | Cloudflare FREE | $0 |
| DDoS Protection | Cloudflare FREE | $0 |
| SSL Certificates | Let's Encrypt | $0 |
| Nginx Load Balancer | Open Source | $0 |
| Health Monitoring | Custom Script | $0 |
| **TOTAL** | | **$0/month** |

**Optional Upgrades:**
- Cloudflare Load Balancing (active health checks): $5/month
- Cloudflare WAF Advanced: $20/month

## Files Reference

```
geodns/
├── nginx-regional.conf       # Main Nginx config (deploy to all servers)
├── proxy_params.conf         # Proxy headers config
├── rate_limit.conf          # Rate limiting rules
├── health-monitor.sh        # Health monitoring script
├── DEPLOY_GEODNS.sh        # Automated deployment script
└── README.md               # This file
```

## Next Steps

1. ✅ Deploy GeoDNS setup
2. ⏳ Configure Cloudflare
3. ⏳ Test from multiple regions
4. ⏳ Set up monitoring alerts
5. ⏳ Add Prometheus metrics (optional)
6. ⏳ Configure WAF rules (optional)

## Support Resources

**Logs:**
- Nginx: `/var/log/nginx/api.gxcoin.money.{access,error}.log`
- Health Monitor: `/var/log/gx-health-monitor.log`
- Certbot: `/var/log/letsencrypt/`

**Configs:**
- Nginx: `/etc/nginx/conf.d/api.conf`
- Proxy params: `/etc/nginx/proxy_params.conf`
- Main config: `/etc/nginx/nginx.conf`

**Commands:**
- Test config: `nginx -t`
- Reload: `systemctl reload nginx`
- Restart: `systemctl restart nginx`
- View status: `systemctl status nginx`
