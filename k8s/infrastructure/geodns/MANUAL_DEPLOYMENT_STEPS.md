# Manual GeoDNS Deployment Steps

This guide provides step-by-step instructions for deploying the GeoDNS load balancing infrastructure across all 3 regional servers.

## Prerequisites

- SSH access to all 3 servers (Malaysia, USA, Germany)
- Root privileges on all servers
- Cloudflare account with gxcoin.money domain
- Kubernetes services exposed as NodePort (already completed)

## Part 1: Install Nginx on All Regional Servers

### Step 1.1: Install on Malaysia Server (72.60.210.201)

```bash
ssh root@72.60.210.201

# Install Nginx and Certbot
dnf install -y nginx certbot python3-certbot-nginx

# Enable Nginx to start on boot
systemctl enable nginx

# Create required directories
mkdir -p /var/www/certbot
mkdir -p /etc/nginx/conf.d

# Exit SSH session
exit
```

### Step 1.2: Install on USA Server (217.196.51.190)

```bash
ssh root@217.196.51.190

# Install Nginx and Certbot
dnf install -y nginx certbot python3-certbot-nginx

# Enable Nginx to start on boot
systemctl enable nginx

# Create required directories
mkdir -p /var/www/certbot
mkdir -p /etc/nginx/conf.d

# Exit SSH session
exit
```

### Step 1.3: Install on Germany Server (72.61.81.3)

```bash
ssh root@72.61.81.3

# Install Nginx and Certbot
dnf install -y nginx certbot python3-certbot-nginx

# Enable Nginx to start on boot
systemctl enable nginx

# Create required directories
mkdir -p /var/www/certbot
mkdir -p /etc/nginx/conf.d

# Exit SSH session
exit
```

## Part 2: Deploy Nginx Configuration Files

### Step 2.1: Prepare Configuration Files Locally

On your local machine (srv1089618):

```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns

# Create customized configs for each region
sed 's/REGION_NAME/Asia/g; s/SERVER_IP/72.60.210.201/g' nginx-regional.conf > nginx-malaysia.conf
sed 's/REGION_NAME/North America/g; s/SERVER_IP/217.196.51.190/g' nginx-regional.conf > nginx-usa.conf
sed 's/REGION_NAME/Europe/g; s/SERVER_IP/72.61.81.3/g' nginx-regional.conf > nginx-germany.conf
```

### Step 2.2: Deploy to Malaysia Server

```bash
# Copy config files
scp nginx-malaysia.conf root@72.60.210.201:/etc/nginx/conf.d/api.conf
scp proxy_params.conf root@72.60.210.201:/etc/nginx/proxy_params.conf

# Add rate limiting to main config
ssh root@72.60.210.201 "cat /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns/rate_limit.conf >> /etc/nginx/nginx.conf"

# Test and start Nginx
ssh root@72.60.210.201 "nginx -t && systemctl restart nginx"
```

### Step 2.3: Deploy to USA Server

```bash
# Copy config files
scp nginx-usa.conf root@217.196.51.190:/etc/nginx/conf.d/api.conf
scp proxy_params.conf root@217.196.51.190:/etc/nginx/proxy_params.conf

# Add rate limiting to main config
ssh root@217.196.51.190 "cat /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns/rate_limit.conf >> /etc/nginx/nginx.conf"

# Test and start Nginx
ssh root@217.196.51.190 "nginx -t && systemctl restart nginx"
```

### Step 2.4: Deploy to Germany Server

```bash
# Copy config files
scp nginx-germany.conf root@72.61.81.3:/etc/nginx/conf.d/api.conf
scp proxy_params.conf root@72.61.81.3:/etc/nginx/proxy_params.conf

# Add rate limiting to main config
ssh root@72.61.81.3 "cat /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns/rate_limit.conf >> /etc/nginx/nginx.conf"

# Test and start Nginx
ssh root@72.61.81.3 "nginx -t && systemctl restart nginx"
```

## Part 3: Obtain SSL Certificates

**IMPORTANT:** Complete this step AFTER updating DNS in Cloudflare (Part 4). Certbot needs to verify domain ownership via HTTP.

### Step 3.1: Update Cloudflare DNS FIRST

Before obtaining certificates, configure Cloudflare:

1. Login to Cloudflare Dashboard
2. Select gxcoin.money domain
3. Go to DNS settings
4. Add 3 A records (do NOT enable proxy yet):

```
Type: A
Name: api
Content: 72.60.210.201
Proxy: OFF (gray cloud)
TTL: Auto
```

```
Type: A
Name: api
Content: 217.196.51.190
Proxy: OFF (gray cloud)
TTL: Auto
```

```
Type: A
Name: api
Content: 72.61.81.3
Proxy: OFF (gray cloud)
TTL: Auto
```

Wait 5 minutes for DNS propagation.

### Step 3.2: Obtain Certificate for Malaysia

```bash
ssh root@72.60.210.201

# Obtain certificate
certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.gxcoin.money \
  --non-interactive \
  --agree-tos \
  --email admin@gxcoin.money

# Reload Nginx with SSL
systemctl reload nginx

exit
```

### Step 3.3: Obtain Certificate for USA

```bash
ssh root@217.196.51.190

# Obtain certificate
certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.gxcoin.money \
  --non-interactive \
  --agree-tos \
  --email admin@gxcoin.money

# Reload Nginx with SSL
systemctl reload nginx

exit
```

### Step 3.4: Obtain Certificate for Germany

```bash
ssh root@72.61.81.3

# Obtain certificate
certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.gxcoin.money \
  --non-interactive \
  --agree-tos \
  --email admin@gxcoin.money

# Reload Nginx with SSL
systemctl reload nginx

exit
```

## Part 4: Configure Cloudflare GeoDNS

### Step 4.1: Enable Cloudflare Proxy

Now that SSL is configured, enable Cloudflare proxy for DDoS protection:

1. Go back to Cloudflare DNS settings
2. For each api.gxcoin.money A record:
   - Click "Edit"
   - Toggle "Proxy status" to ON (orange cloud icon)
   - Click "Save"

All 3 records should now show orange cloud icon.

### Step 4.2: Configure Load Balancing (Optional - FREE)

For basic geo-routing without active health checks:

1. Cloudflare uses round-robin DNS by default
2. Users are automatically routed based on proximity
3. No additional configuration needed

For advanced health checks ($5/month):

1. Go to Traffic → Load Balancing
2. Create new Load Balancer
3. Add all 3 origins:
   - Origin 1: 72.60.210.201 (Malaysia)
   - Origin 2: 217.196.51.190 (USA)
   - Origin 3: 72.61.81.3 (Germany)
4. Enable geo-steering
5. Configure health checks (HTTPS /health endpoint)

## Part 5: Deploy Health Monitor

### Step 5.1: Start Health Monitoring Service

On your local machine (srv1089618):

```bash
cd /home/sugxcoin/prod-blockchain/gx-protocol-backend/k8s/infrastructure/geodns

# Make health monitor executable
chmod +x health-monitor.sh

# Copy to system binaries
sudo cp health-monitor.sh /usr/local/bin/gx-health-monitor

# Start in background
nohup /usr/local/bin/gx-health-monitor >> /var/log/gx-health-monitor.log 2>&1 &

# Verify it's running
ps aux | grep gx-health-monitor
```

### Step 5.2: Configure Alerts (Optional)

Edit the health monitor to add email/Slack alerts:

```bash
sudo vi /usr/local/bin/gx-health-monitor

# Update these variables:
ALERT_EMAIL="your-email@gxcoin.money"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

Restart the monitor:

```bash
pkill -f gx-health-monitor
nohup /usr/local/bin/gx-health-monitor >> /var/log/gx-health-monitor.log 2>&1 &
```

## Part 6: Verification

### Step 6.1: Test Each Regional Server

```bash
# Test Malaysia
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.60.210.201"

# Expected: HTTP/2 200
# Response: {"status":"healthy","region":"Asia","server":"72.60.210.201"}

# Test USA
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:217.196.51.190"

# Expected: HTTP/2 200
# Response: {"status":"healthy","region":"North America","server":"217.196.51.190"}

# Test Germany
curl -I https://api.gxcoin.money/health --resolve "api.gxcoin.money:443:72.61.81.3"

# Expected: HTTP/2 200
# Response: {"status":"healthy","region":"Europe","server":"72.61.81.3"}
```

### Step 6.2: Test Geo-Routing

```bash
# Test from your current location
curl https://api.gxcoin.money/health

# Response will show the region closest to you
```

### Step 6.3: Test All API Endpoints

```bash
# Identity service
curl https://api.gxcoin.money/identity/health

# Admin service
curl https://api.gxcoin.money/admin/health

# Tokenomics service
curl https://api.gxcoin.money/tokenomics/health

# Organization service
curl https://api.gxcoin.money/organization/health

# LoanPool service
curl https://api.gxcoin.money/loanpool/health

# Governance service
curl https://api.gxcoin.money/governance/health

# Tax service
curl https://api.gxcoin.money/tax/health
```

### Step 6.4: Monitor Health Checks

```bash
# View live health monitoring
tail -f /var/log/gx-health-monitor.log

# Check for any failures
grep "DOWN" /var/log/gx-health-monitor.log
```

## Troubleshooting

### Nginx Won't Start

```bash
# Check configuration syntax
nginx -t

# View error logs
tail -f /var/log/nginx/error.log

# Check if port 80/443 are in use
ss -tulpn | grep -E ":80|:443"
```

### SSL Certificate Issues

```bash
# Check certificate status
certbot certificates

# Test SSL connection
openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money

# Manual renewal
certbot renew --force-renewal
```

### Backend Services Not Responding

```bash
# Check if NodePort is accessible locally
curl http://localhost:30001/health

# Check Kubernetes services
kubectl get svc -n backend-mainnet

# Check pod status
kubectl get pods -n backend-mainnet
```

### DNS Not Resolving

```bash
# Check DNS propagation
dig api.gxcoin.money +short

# Expected: Should return one of the 3 IPs based on your location
# 72.60.210.201 (if you're in Asia)
# 217.196.51.190 (if you're in Americas)
# 72.61.81.3 (if you're in Europe)
```

## Completion Checklist

- [ ] Nginx installed on all 3 servers
- [ ] Nginx configurations deployed to all servers
- [ ] SSL certificates obtained for all servers
- [ ] Cloudflare DNS configured with 3 A records
- [ ] Cloudflare proxy enabled (orange cloud)
- [ ] Health monitor running
- [ ] All regional servers responding to /health
- [ ] All 7 API endpoints accessible via HTTPS
- [ ] Geo-routing working (users connect to nearest server)

## Next Steps

1. **Test with Postman**: Import API collection and test all endpoints
2. **Monitor Performance**: Watch health monitor logs for any issues
3. **Set Up Alerts**: Configure email/Slack notifications
4. **Review Logs**: Check Nginx access logs for traffic patterns
5. **Plan Scaling**: Consider adding more regions if needed

## Support

If you encounter issues:

1. Check logs: `/var/log/nginx/api.gxcoin.money.error.log`
2. Check health monitor: `/var/log/gx-health-monitor.log`
3. Verify Kubernetes pods are running: `kubectl get pods -n backend-mainnet`
4. Test NodePort accessibility: `curl http://localhost:30001/health`

---

**Estimated Total Time:** 30-45 minutes
**Difficulty Level:** Intermediate
**Prerequisites:** Basic Linux, Nginx, DNS knowledge
