# Enterprise DNS & Security Implementation Checklist

**Date:** November 17, 2025
**Purpose:** Step-by-step implementation guide for production DNS and security
**Estimated Time:** 4-6 hours
**Prerequisites:** 4 servers running, Kubernetes cluster operational

---

## Implementation Phases

### Phase 1: DNS Configuration (1-2 hours)

- [ ] **1.1** Log into Cloudflare dashboard
- [ ] **1.2** Point domain nameservers to Cloudflare (ns1/ns2.cloudflare.com)
- [ ] **1.3** Wait for DNS propagation (2-4 hours, can proceed with other tasks)
- [ ] **1.4** Create A records for api.gxcoin.money (3 IPs - Malaysia, USA, Germany)
- [ ] **1.5** Enable "Proxied" mode (orange cloud) for all A records
- [ ] **1.6** Configure SSL/TLS mode to "Full (strict)"
- [ ] **1.7** Enable "Always Use HTTPS"
- [ ] **1.8** Set minimum TLS version to 1.2
- [ ] **1.9** Create WAF rule to block direct IP access
- [ ] **1.10** Enable DDoS protection
- [ ] **1.11** Configure caching rules (bypass for /api/*)

**Verification:**
```bash
dig api.gxcoin.money +short
# Should return Cloudflare IPs (not your origin IPs)
```

---

### Phase 2: Firewall Configuration (2 hours)

**On each server (srv1089618, srv1089624, srv1092158, srv1117946):**

- [ ] **2.1** SSH into server
- [ ] **2.2** Install iptables-persistent: `sudo apt-get install -y iptables-persistent`
- [ ] **2.3** Copy firewall script to /root/configure-firewall.sh
- [ ] **2.4** Update MANAGEMENT_IPS with your actual admin IPs
- [ ] **2.5** Update NODE_IPS with all 4 server public IPs
- [ ] **2.6** Update PUBLIC_INTERFACE (usually eth0)
- [ ] **2.7** Make script executable: `sudo chmod +x /root/configure-firewall.sh`
- [ ] **2.8** Run firewall script: `sudo /root/configure-firewall.sh`
- [ ] **2.9** Verify SSH still works within 30 seconds
- [ ] **2.10** Verify rules with: `sudo iptables -L -n -v`
- [ ] **2.11** Test direct IP access (should fail): `curl http://<server-ip>:30001/health`

**Verification per server:**
```bash
# Should see DROP policy
sudo iptables -L | grep "policy DROP"

# Should see Cloudflare rules
sudo iptables -L INPUT | grep -c "173.245\|103.21"
# Expected: 15 (number of Cloudflare IP ranges)
```

---

### Phase 3: Nginx Ingress Deployment (1 hour)

- [ ] **3.1** Add Nginx Ingress Helm repo: `helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx`
- [ ] **3.2** Install Nginx Ingress Controller (see NGINX_INGRESS_SETUP_GUIDE.md)
- [ ] **3.3** Wait for LoadBalancer to get external IP
- [ ] **3.4** Create Ingress resource for backend services
- [ ] **3.5** Change all backend services from NodePort to ClusterIP
- [ ] **3.6** Verify Ingress is routing traffic: `kubectl get ingress -n backend-mainnet`

**Verification:**
```bash
# Get Ingress IP
kubectl get svc ingress-nginx-controller -n ingress-nginx

# Test routing (before SSL)
INGRESS_IP=<ingress-ip>
curl -H "Host: api.gxcoin.money" http://$INGRESS_IP/health
# Expected: 200 OK
```

---

### Phase 4: cert-manager & SSL (1 hour)

- [ ] **4.1** Install cert-manager via Helm (see CERT_MANAGER_SETUP_GUIDE.md)
- [ ] **4.2** Create Let's Encrypt ClusterIssuer (production)
- [ ] **4.3** Create Let's Encrypt ClusterIssuer (staging - for testing)
- [ ] **4.4** Update Ingress with cert-manager annotation
- [ ] **4.5** Wait for certificate issuance (2-5 minutes)
- [ ] **4.6** Verify certificate: `kubectl get certificate -n backend-mainnet`
- [ ] **4.7** Test HTTPS: `curl https://api.gxcoin.money/health`

**Verification:**
```bash
# Certificate should be READY
kubectl get certificate gx-api-tls -n backend-mainnet
# READY column should show: True

# Check SSL certificate
echo | openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money 2>/dev/null | grep "Verify return code"
# Expected: Verify return code: 0 (ok)
```

---

### Phase 5: Final Testing & Hardening (1 hour)

- [ ] **5.1** Test all API endpoints via HTTPS
- [ ] **5.2** Verify direct IP access is blocked
- [ ] **5.3** Test SSH access from management IP only
- [ ] **5.4** Monitor firewall logs: `sudo tail -f /var/log/syslog | grep FIREWALL-DROPPED`
- [ ] **5.5** Test GeoDNS routing from different regions (use VPN)
- [ ] **5.6** Run security scan: `nmap -p- api.gxcoin.money`
- [ ] **5.7** Enable HSTS header (AFTER 7 days of successful SSL)
- [ ] **5.8** Configure Cloudflare auto-update cron job
- [ ] **5.9** Set up monitoring alerts (SSL expiry, firewall drops)
- [ ] **5.10** Document all IP addresses and credentials in secure vault

**Security Scan (should show only port 443 open):**
```bash
nmap -p- api.gxcoin.money
# Expected:
# PORT    STATE
# 443/tcp open  https
# All other ports: filtered or closed
```

---

## Production Readiness Checklist

### DNS & Cloudflare
- [ ] Nameservers pointing to Cloudflare
- [ ] DNS propagation complete (verified with dig)
- [ ] A records created for all 3 regional servers
- [ ] "Proxied" mode enabled (orange cloud)
- [ ] SSL/TLS mode: Full (strict)
- [ ] Always Use HTTPS: Enabled
- [ ] Minimum TLS version: 1.2
- [ ] DDoS protection: Enabled
- [ ] WAF rules configured
- [ ] Caching rules configured
- [ ] Email alerts configured

### Firewall
- [ ] Firewall script deployed on all 4 servers
- [ ] Default policy: DROP (verified)
- [ ] Cloudflare IPs whitelisted (15 ranges)
- [ ] Management IPs whitelisted for SSH
- [ ] Kubernetes internal traffic allowed
- [ ] Direct IP access blocked (tested)
- [ ] Rules persistent across reboot (tested)
- [ ] Cloudflare IP auto-update cron configured
- [ ] Firewall logs monitored

### Nginx Ingress
- [ ] Ingress Controller deployed
- [ ] LoadBalancer IP assigned
- [ ] All backend services changed to ClusterIP
- [ ] Ingress resource created
- [ ] Path-based routing configured for all 7 services
- [ ] Security headers configured (X-Frame-Options, etc.)
- [ ] Real IP forwarding from Cloudflare configured
- [ ] Rate limiting configured (100 RPS)

### SSL/TLS
- [ ] cert-manager installed
- [ ] ClusterIssuer created (production + staging)
- [ ] SSL certificate issued (Let's Encrypt)
- [ ] Certificate auto-renewal configured (30 days before expiry)
- [ ] HTTPS endpoints accessible (tested)
- [ ] SSL certificate valid (verified with openssl)
- [ ] Certificate expiry alerts configured
- [ ] Wildcard certificate configured (optional)

### Testing
- [ ] HTTPS access via domain works: https://api.gxcoin.money/health
- [ ] Direct IP access blocked (all services)
- [ ] SSH access restricted to management IPs
- [ ] GeoDNS routing verified (different regions)
- [ ] All API endpoints return 200 OK
- [ ] SSL certificate shows "Let's Encrypt" issuer
- [ ] Browser shows green padlock (no warnings)
- [ ] Nmap scan shows only port 443 open

---

## Rollback Plan (Emergency)

**If something breaks:**

### DNS Rollback
```bash
# Point DNS back to direct IPs (bypass Cloudflare)
# In Cloudflare: Disable "Proxied" mode (grey cloud)
# Traffic will go directly to origin IPs
```

### Firewall Rollback
```bash
# SSH into server via hosting provider console
sudo iptables -F
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT
sudo netfilter-persistent save
# WARNING: This removes ALL protection - only use in emergency
```

### Ingress Rollback
```bash
# Change services back to NodePort
kubectl patch svc svc-identity -n backend-mainnet -p '{"spec":{"type":"NodePort","ports":[{"port":3001,"nodePort":30001}]}}'
# Repeat for all services
```

### SSL Rollback
```bash
# Switch to staging issuer (if production fails)
kubectl patch ingress gx-backend-ingress -n backend-mainnet --type=merge -p '{"metadata":{"annotations":{"cert-manager.io/cluster-issuer":"letsencrypt-staging"}}}'
```

---

## Monitoring & Maintenance

### Daily Checks
```bash
# Check SSL certificate status
kubectl get certificate -n backend-mainnet

# Check Ingress status
kubectl get ingress -n backend-mainnet

# Check firewall logs (top 10 blocked IPs)
sudo grep "FIREWALL-DROPPED" /var/log/syslog | awk '{print $10}' | sort | uniq -c | sort -nr | head -10
```

### Weekly Checks
```bash
# Update Cloudflare IPs
/root/update-cloudflare-ips.sh

# Check SSL expiry
echo | openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money 2>/dev/null | openssl x509 -noout -dates

# Review firewall audit
/root/firewall-audit.sh
```

### Monthly Checks
- Review Cloudflare analytics (traffic, attacks, errors)
- Review cert-manager logs (renewal history)
- Update firewall scripts if Cloudflare IPs change
- Test disaster recovery procedures

---

## Support Contacts

**Cloudflare Support:**
- Dashboard: https://dash.cloudflare.com
- Docs: https://developers.cloudflare.com
- Community: https://community.cloudflare.com

**cert-manager Support:**
- Docs: https://cert-manager.io/docs
- GitHub: https://github.com/cert-manager/cert-manager

**Let's Encrypt Support:**
- Status: https://letsencrypt.status.io
- Docs: https://letsencrypt.org/docs
- Rate Limits: https://letsencrypt.org/docs/rate-limits

---

## Appendix: Quick Reference

### Essential Commands

```bash
# DNS
dig api.gxcoin.money +short

# Firewall
sudo iptables -L -n -v
sudo tail -f /var/log/syslog | grep FIREWALL-DROPPED

# Ingress
kubectl get ingress -n backend-mainnet
kubectl describe ingress gx-backend-ingress -n backend-mainnet

# SSL
kubectl get certificate -n backend-mainnet
openssl s_client -connect api.gxcoin.money:443 -servername api.gxcoin.money

# Test HTTPS
curl -I https://api.gxcoin.money/health
```

### IP Addresses (Update with actual IPs)

```
Malaysia (APAC):     72.60.210.201 (srv1089618, srv1089624, srv1092158)
USA (Americas):      217.196.51.190 (TBD)
Germany (EMEA):      72.61.81.3 (TBD)
Management IP 1:     203.xxx.xxx.xxx (Office)
Management IP 2:     217.196.51.190 (Backup)
```

### Domain Structure

```
api.gxcoin.money         → Main API gateway (GeoDNS)
api-apac.gxcoin.money    → APAC region specific
api-us.gxcoin.money      → Americas region specific
api-eu.gxcoin.money      → EMEA region specific
gxcoin.money             → Root domain (docs/marketing)
```

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol DevOps Team
**Next Review:** December 17, 2025
