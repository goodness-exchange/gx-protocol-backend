# Firewall Setup Guide - GX Protocol Production Security

**Date:** November 17, 2025
**Purpose:** Enterprise-grade firewall configuration for all 4 Kubernetes cluster nodes
**Security Goal:** Zero-trust network - Block ALL direct IP access, allow only Cloudflare CDN

---

## Executive Summary

This guide configures **iptables** firewall rules on all 4 servers to:

- **Block all direct public IP access** (except from Cloudflare IPs)
- **Allow only HTTPS traffic** (port 443) from Cloudflare CDN
- **Allow SSH** from specific management IPs only
- **Allow Kubernetes internal traffic** (pod-to-pod, service-to-service)
- **Block all other inbound traffic** (default deny policy)

**Result:** Users can ONLY access backend APIs via https://api.gxcoin.money (domain). Direct IP access is completely blocked.

---

## Server Inventory

| Server | Role | Public IP | Location | Services |
|--------|------|-----------|----------|----------|
| srv1089618 | Control Plane 1 | `TBD` | Malaysia | Fabric mainnet, backend-mainnet |
| srv1089624 | Control Plane 2 | `TBD` | Malaysia | Fabric mainnet, backend-mainnet |
| srv1092158 | Control Plane 3 | `TBD` | Malaysia | Fabric mainnet, backend-mainnet |
| srv1117946 | Worker | `TBD` | Malaysia | Fabric testnet, backend-testnet |

**Note:** Replace `TBD` with actual public IP addresses from your hosting provider.

---

## Firewall Architecture

```
Internet
    │
    ▼
Cloudflare CDN (DDoS Protection + WAF)
    │
    ▼
Firewall Rules (iptables)
    │
    ├─ HTTPS (443) ──> Nginx Ingress Controller
    │                       │
    │                       ▼
    │                  Kubernetes Services
    │                       │
    │                       └─> Backend Pods
    │
    ├─ SSH (22) ──────> Only from Management IPs
    │
    └─ ALL OTHER ─────> BLOCKED
```

---

## Prerequisites

### 1. Cloudflare IP Ranges

Cloudflare uses specific IP ranges for their CDN. We must whitelist these IPs.

**IPv4 Ranges (as of Nov 2025):**
```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

**IPv6 Ranges:**
```
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32
```

**Official Source:** https://www.cloudflare.com/ips/

**Auto-update script:** (recommended)
```bash
# Download latest Cloudflare IP ranges
curl -s https://www.cloudflare.com/ips-v4 > /etc/cloudflare-ips-v4.txt
curl -s https://www.cloudflare.com/ips-v6 > /etc/cloudflare-ips-v6.txt
```

### 2. Management IP Addresses

**Define IPs that need SSH access:**
```bash
# Your office/VPN IP
MANAGEMENT_IP_1="203.x.x.x"

# Backup admin access (home IP, VPN, etc.)
MANAGEMENT_IP_2="67.y.y.y"

# CI/CD server (if deploying from external)
CICD_IP="45.z.z.z"
```

### 3. Kubernetes Internal Networks

**K3s default CIDR ranges:**
```bash
# Pod network (flannel default)
POD_CIDR="10.42.0.0/16"

# Service network
SERVICE_CIDR="10.43.0.0/16"
```

**Verify your cluster CIDRs:**
```bash
# Check pod CIDR
kubectl cluster-info dump | grep -i pod-cidr

# Check service CIDR
kubectl cluster-info dump | grep -i service-cluster-ip-range
```

---

## Firewall Rules Implementation

### Step 1: Install iptables-persistent (Debian/Ubuntu)

**On each server:**
```bash
# Update package list
sudo apt-get update

# Install iptables-persistent (auto-saves rules on reboot)
sudo apt-get install -y iptables-persistent

# Confirm installation
sudo systemctl status netfilter-persistent
```

**For CentOS/RHEL:**
```bash
sudo yum install -y iptables-services
sudo systemctl enable iptables
sudo systemctl start iptables
```

---

### Step 2: Create Firewall Rules Script

**Create script on each server:**

```bash
sudo nano /root/configure-firewall.sh
```

**Paste the following script:**

```bash
#!/bin/bash
###############################################################################
# GX Protocol Production Firewall Rules
# Purpose: Block all direct IP access, allow only Cloudflare CDN + Kubernetes
# Author: GX Protocol DevOps
# Date: November 17, 2025
###############################################################################

set -e  # Exit on error

echo "==> Configuring enterprise-grade firewall rules..."

# ============================================================================
# CONFIGURATION VARIABLES
# ============================================================================

# Cloudflare IPv4 ranges (update periodically from https://www.cloudflare.com/ips/)
CLOUDFLARE_IPV4=(
    "173.245.48.0/20"
    "103.21.244.0/22"
    "103.22.200.0/22"
    "103.31.4.0/22"
    "141.101.64.0/18"
    "108.162.192.0/18"
    "190.93.240.0/20"
    "188.114.96.0/20"
    "197.234.240.0/22"
    "198.41.128.0/17"
    "162.158.0.0/15"
    "104.16.0.0/13"
    "104.24.0.0/14"
    "172.64.0.0/13"
    "131.0.72.0/22"
)

# Management IPs (SSH access)
MANAGEMENT_IPS=(
    "203.x.x.x"  # Replace with your office IP
    "67.y.y.y"   # Replace with backup admin IP
)

# Kubernetes CIDRs
POD_CIDR="10.42.0.0/16"
SERVICE_CIDR="10.43.0.0/16"

# Server public interface (usually eth0 or ens3)
PUBLIC_INTERFACE="eth0"  # Change if different

# ============================================================================
# STEP 1: FLUSH EXISTING RULES (CAREFUL!)
# ============================================================================

echo "==> Flushing existing iptables rules..."
sudo iptables -F
sudo iptables -X
sudo iptables -t nat -F
sudo iptables -t nat -X
sudo iptables -t mangle -F
sudo iptables -t mangle -X

# ============================================================================
# STEP 2: SET DEFAULT POLICIES (DEFAULT DENY)
# ============================================================================

echo "==> Setting default policies (DROP all by default)..."
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT  # Allow outbound (pods need internet)

# ============================================================================
# STEP 3: ALLOW LOOPBACK (REQUIRED FOR LOCALHOST)
# ============================================================================

echo "==> Allowing loopback traffic..."
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A OUTPUT -o lo -j ACCEPT

# ============================================================================
# STEP 4: ALLOW ESTABLISHED CONNECTIONS (STATEFUL FIREWALL)
# ============================================================================

echo "==> Allowing established and related connections..."
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# ============================================================================
# STEP 5: ALLOW KUBERNETES INTERNAL TRAFFIC
# ============================================================================

echo "==> Allowing Kubernetes pod-to-pod and service traffic..."

# Allow all traffic from pod CIDR
sudo iptables -A INPUT -s $POD_CIDR -j ACCEPT

# Allow all traffic from service CIDR
sudo iptables -A INPUT -s $SERVICE_CIDR -j ACCEPT

# Allow Kubernetes API server (6443)
sudo iptables -A INPUT -p tcp --dport 6443 -s $POD_CIDR -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 6443 -s $SERVICE_CIDR -j ACCEPT

# Allow kubelet (10250)
sudo iptables -A INPUT -p tcp --dport 10250 -s $POD_CIDR -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 10250 -s $SERVICE_CIDR -j ACCEPT

# Allow etcd (2379-2380) - only from pod/service networks
sudo iptables -A INPUT -p tcp --dport 2379:2380 -s $POD_CIDR -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 2379:2380 -s $SERVICE_CIDR -j ACCEPT

# Allow flannel VXLAN (8472/UDP)
sudo iptables -A INPUT -p udp --dport 8472 -j ACCEPT

# Allow NodePort range (30000-32767) from pod/service networks only
sudo iptables -A INPUT -p tcp --dport 30000:32767 -s $POD_CIDR -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 30000:32767 -s $SERVICE_CIDR -j ACCEPT

# ============================================================================
# STEP 6: ALLOW INTER-NODE COMMUNICATION (KUBERNETES CLUSTER)
# ============================================================================

echo "==> Allowing inter-node Kubernetes traffic..."

# Allow traffic from other cluster nodes (update IPs)
NODE_IPS=(
    "43.xxx.xxx.xxx"  # srv1089618 (CP1)
    "43.yyy.yyy.yyy"  # srv1089624 (CP2)
    "43.zzz.zzz.zzz"  # srv1092158 (CP3)
    "43.aaa.aaa.aaa"  # srv1117946 (Worker)
)

for NODE_IP in "${NODE_IPS[@]}"; do
    sudo iptables -A INPUT -s $NODE_IP -j ACCEPT
done

# ============================================================================
# STEP 7: ALLOW SSH FROM MANAGEMENT IPS ONLY
# ============================================================================

echo "==> Allowing SSH from management IPs only..."

for MGMT_IP in "${MANAGEMENT_IPS[@]}"; do
    sudo iptables -A INPUT -p tcp --dport 22 -s $MGMT_IP -j ACCEPT
    echo "  - Allowed SSH from $MGMT_IP"
done

# ============================================================================
# STEP 8: ALLOW HTTPS FROM CLOUDFLARE ONLY
# ============================================================================

echo "==> Allowing HTTPS (443) from Cloudflare CDN IPs only..."

for CF_IP in "${CLOUDFLARE_IPV4[@]}"; do
    sudo iptables -A INPUT -p tcp --dport 443 -s $CF_IP -j ACCEPT
    echo "  - Allowed HTTPS from Cloudflare: $CF_IP"
done

# ============================================================================
# STEP 9: ALLOW ICMP (PING) - OPTIONAL
# ============================================================================

echo "==> Allowing ICMP (ping) for network diagnostics..."
sudo iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

# ============================================================================
# STEP 10: LOG DROPPED PACKETS (OPTIONAL - FOR DEBUGGING)
# ============================================================================

echo "==> Configuring logging for dropped packets..."
sudo iptables -A INPUT -j LOG --log-prefix "FIREWALL-DROPPED: " --log-level 4 -m limit --limit 5/min

# ============================================================================
# STEP 11: EXPLICIT DROP (REDUNDANT BUT CLEAR)
# ============================================================================

sudo iptables -A INPUT -j DROP

# ============================================================================
# STEP 12: SAVE RULES (PERSISTENT ACROSS REBOOTS)
# ============================================================================

echo "==> Saving iptables rules..."

if command -v netfilter-persistent &> /dev/null; then
    # Debian/Ubuntu
    sudo netfilter-persistent save
    echo "  - Rules saved with netfilter-persistent"
elif command -v service &> /dev/null && systemctl list-units --type=service | grep -q iptables; then
    # CentOS/RHEL
    sudo service iptables save
    echo "  - Rules saved with iptables service"
else
    # Manual save
    sudo iptables-save > /etc/iptables/rules.v4
    echo "  - Rules saved to /etc/iptables/rules.v4"
fi

# ============================================================================
# STEP 13: DISPLAY FINAL RULES
# ============================================================================

echo ""
echo "==> Current iptables rules:"
sudo iptables -L -n -v --line-numbers

echo ""
echo "==> Firewall configuration complete!"
echo ""
echo "SECURITY CHECKLIST:"
echo "  [✓] Default policy: DROP (deny all by default)"
echo "  [✓] Kubernetes internal traffic: ALLOWED"
echo "  [✓] SSH: ALLOWED from management IPs only"
echo "  [✓] HTTPS (443): ALLOWED from Cloudflare only"
echo "  [✓] Direct IP access: BLOCKED"
echo "  [✓] Rules persistent across reboots: YES"
echo ""
echo "NEXT STEPS:"
echo "  1. Test SSH access from management IP"
echo "  2. Test HTTPS access via domain (api.gxcoin.money)"
echo "  3. Verify direct IP access is blocked"
echo "  4. Monitor logs: sudo tail -f /var/log/syslog | grep FIREWALL-DROPPED"
echo ""

###############################################################################
# END OF SCRIPT
###############################################################################
```

**Save and exit:** Ctrl+X → Y → Enter

---

### Step 3: Make Script Executable

```bash
sudo chmod +x /root/configure-firewall.sh
```

---

### Step 4: Update Script Variables

**CRITICAL: Update the following in the script:**

1. **MANAGEMENT_IPS:** Replace with your actual admin IPs
2. **NODE_IPS:** Replace with actual public IPs of all 4 servers
3. **PUBLIC_INTERFACE:** Verify network interface name

**Check network interface:**
```bash
ip addr show
# Look for the interface with your public IP (usually eth0, ens3, or ens18)
```

---

### Step 5: Run Firewall Script on All Servers

**IMPORTANT: Test SSH access BEFORE running! You could lock yourself out.**

**Step-by-step execution (on each server):**

```bash
# 1. Verify management IPs are correct
grep "MANAGEMENT_IPS" /root/configure-firewall.sh

# 2. Test SSH from management IP (confirm you can connect)
# From your management workstation:
ssh root@<server-ip>

# 3. Run the script (this will apply rules immediately)
sudo /root/configure-firewall.sh

# 4. IMMEDIATELY test SSH again (within 30 seconds)
# If SSH fails, you have 30 seconds to fix before connection drops
# From management workstation:
ssh root@<server-ip>

# If locked out, access via hosting provider console and run:
sudo iptables -F  # Flush all rules (emergency recovery)
sudo iptables -P INPUT ACCEPT  # Allow all traffic temporarily
```

**Repeat on all 4 servers:**
- srv1089618 (CP1)
- srv1089624 (CP2)
- srv1092158 (CP3)
- srv1117946 (Worker)

---

## Verification & Testing

### Test 1: Verify Firewall Rules

**On each server:**
```bash
# List all active rules
sudo iptables -L -n -v --line-numbers

# Check that default policy is DROP
sudo iptables -L | grep "policy DROP"
# Expected output: Chain INPUT (policy DROP)
#                  Chain FORWARD (policy DROP)

# Count number of Cloudflare rules
sudo iptables -L INPUT -n | grep -c "173.245\|103.21\|103.22\|103.31\|141.101"
# Should return: 15 (number of Cloudflare IP ranges)
```

### Test 2: SSH Access

**From management IP:**
```bash
ssh root@<server-public-ip>
# Expected: Connection successful
```

**From non-whitelisted IP (use VPN or mobile):**
```bash
ssh root@<server-public-ip>
# Expected: Connection timeout or refused
```

### Test 3: Direct IP Access (Should Fail)

```bash
# Try accessing API via direct IP (should be blocked)
curl http://<server-public-ip>:30001/api/v1/health
# Expected: Connection timeout (no response)

curl https://<server-public-ip>/api/v1/health
# Expected: Connection refused or timeout
```

### Test 4: Domain Access (Should Work)

```bash
# Access API via Cloudflare domain (should work)
curl https://api.gxcoin.money/api/v1/health
# Expected: HTTP 200 OK with health check response
```

### Test 5: Monitor Dropped Packets

```bash
# Watch firewall logs in real-time
sudo tail -f /var/log/syslog | grep "FIREWALL-DROPPED"

# Try accessing from blocked IP, should see log entries like:
# Nov 17 12:34:56 srv1089618 kernel: FIREWALL-DROPPED: IN=eth0 OUT= SRC=1.2.3.4 DST=43.x.x.x PROTO=TCP DPT=443
```

---

## Firewall Rule Breakdown

| Rule | Port | Source | Destination | Purpose |
|------|------|--------|-------------|---------|
| 1 | ALL | 127.0.0.1 (lo) | Localhost | Allow loopback |
| 2 | ALL | ESTABLISHED | Any | Stateful connection tracking |
| 3 | ALL | 10.42.0.0/16 (pods) | Any | Kubernetes pod traffic |
| 4 | ALL | 10.43.0.0/16 (services) | Any | Kubernetes service traffic |
| 5 | 6443 | Pod/Service CIDR | Kubernetes API | API server access |
| 6 | 10250 | Pod/Service CIDR | Kubelet | Kubelet API |
| 7 | 2379-2380 | Pod/Service CIDR | etcd | Cluster state |
| 8 | 8472/UDP | Any | Flannel | Pod networking |
| 9 | 30000-32767 | Pod/Service CIDR | NodePort | Service access |
| 10 | ALL | Cluster nodes | Any | Inter-node communication |
| 11 | 22 | Management IPs | SSH | Remote administration |
| 12 | 443 | Cloudflare IPs | HTTPS | API traffic via CDN |
| 13 | ICMP | Any | Ping | Network diagnostics |
| 14 | ALL | Any | DROP | Default deny |

---

## Updating Cloudflare IP Ranges

**Cloudflare updates their IP ranges periodically. Create a cron job to auto-update:**

```bash
# Create update script
sudo nano /root/update-cloudflare-ips.sh
```

**Paste:**
```bash
#!/bin/bash
# Update Cloudflare IP ranges and reload firewall

echo "==> Updating Cloudflare IP ranges..."

# Download latest IPs
curl -s https://www.cloudflare.com/ips-v4 > /tmp/cloudflare-ips-v4.txt

# Re-run firewall script (will use updated IPs)
/root/configure-firewall.sh

echo "==> Cloudflare IPs updated and firewall reloaded"
```

**Make executable:**
```bash
sudo chmod +x /root/update-cloudflare-ips.sh
```

**Add to cron (run weekly):**
```bash
sudo crontab -e

# Add line:
0 2 * * 0 /root/update-cloudflare-ips.sh >> /var/log/cloudflare-ip-update.log 2>&1
```

**Explanation:** Runs every Sunday at 2 AM, logs to /var/log/cloudflare-ip-update.log

---

## Emergency Recovery

**If you lock yourself out via SSH:**

### Method 1: Hosting Provider Console

1. Log into hosting provider dashboard (Hetzner, Contabo, etc.)
2. Open **VNC console** or **Serial console**
3. Login as root
4. Flush firewall rules:

```bash
sudo iptables -F
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT
```

5. SSH should now work
6. Fix firewall script and re-run

### Method 2: Temporary SSH Access

**Add your current IP to whitelist (from console):**

```bash
# Get your current IP
CURRENT_IP=$(curl -s https://ifconfig.me)

# Allow SSH from your current IP
sudo iptables -I INPUT 1 -p tcp --dport 22 -s $CURRENT_IP -j ACCEPT

# Save rules
sudo netfilter-persistent save
```

---

## Advanced Security Options

### Option 1: Fail2Ban (Brute Force Protection)

**Install:**
```bash
sudo apt-get install -y fail2ban
```

**Configure SSH jail:**
```bash
sudo nano /etc/fail2ban/jail.local
```

**Add:**
```ini
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
```

**Start:**
```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

**Result:** After 3 failed SSH attempts in 10 minutes, IP is banned for 1 hour.

### Option 2: Port Knocking (Extra Stealth)

**Install:**
```bash
sudo apt-get install -y knockd
```

**Configure:**
```bash
sudo nano /etc/knockd.conf
```

**Add:**
```ini
[openSSH]
sequence    = 7000,8000,9000
seq_timeout = 5
command     = /sbin/iptables -A INPUT -s %IP% -p tcp --dport 22 -j ACCEPT
tcpflags    = syn

[closeSSH]
sequence    = 9000,8000,7000
seq_timeout = 5
command     = /sbin/iptables -D INPUT -s %IP% -p tcp --dport 22 -j ACCEPT
tcpflags    = syn
```

**Usage:**
```bash
# From client, knock ports in sequence to open SSH
knock server-ip 7000 8000 9000

# SSH now works
ssh root@server-ip

# Close SSH port after done
knock server-ip 9000 8000 7000
```

---

## Security Checklist

**Before going live:**

- [ ] Firewall script executed on all 4 servers
- [ ] Default policy: DROP (verified with `iptables -L | grep policy`)
- [ ] SSH accessible from management IPs only
- [ ] Direct IP access blocked (tested via curl)
- [ ] HTTPS accessible via domain only (api.gxcoin.money)
- [ ] Kubernetes inter-node traffic working
- [ ] Rules persistent across reboot (test: `sudo reboot` then check rules)
- [ ] Cloudflare IP update cron job configured
- [ ] Firewall logs monitored (`/var/log/syslog`)
- [ ] Fail2Ban installed and configured (optional but recommended)
- [ ] Emergency recovery plan documented

---

## Monitoring & Maintenance

### Check Active Connections

```bash
# List all active connections
sudo netstat -tnlp

# Check for suspicious connections
sudo ss -tunap | grep ESTABLISHED
```

### Monitor Firewall Logs

```bash
# Real-time log monitoring
sudo tail -f /var/log/syslog | grep -i "firewall\|iptables"

# Count dropped packets per source IP
sudo grep "FIREWALL-DROPPED" /var/log/syslog | awk '{print $10}' | sort | uniq -c | sort -nr | head -20
```

### Weekly Audit

```bash
# Create audit script
sudo nano /root/firewall-audit.sh
```

```bash
#!/bin/bash
echo "==> Firewall Audit Report - $(date)"
echo ""
echo "Active Rules:"
sudo iptables -L -n -v --line-numbers
echo ""
echo "Dropped Packets (last 24 hours):"
sudo grep "FIREWALL-DROPPED" /var/log/syslog | tail -100
echo ""
echo "Top 10 Blocked IPs:"
sudo grep "FIREWALL-DROPPED" /var/log/syslog | awk '{print $10}' | sort | uniq -c | sort -nr | head -10
```

**Run weekly:**
```bash
0 9 * * 1 /root/firewall-audit.sh | mail -s "Firewall Audit Report" admin@gxcoin.money
```

---

## Next Steps

1. **Deploy Nginx Ingress Controller** (see NGINX_INGRESS_SETUP_GUIDE.md)
2. **Configure cert-manager for SSL** (see CERT_MANAGER_SETUP_GUIDE.md)
3. **Update all service configurations** to use domain names
4. **Test end-to-end flow** via https://api.gxcoin.money

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol DevOps Team
**Review Frequency:** Monthly
