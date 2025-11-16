#!/bin/bash
# GX Protocol GeoDNS Deployment Script
# Deploys Nginx on all 3 regional servers with SSL

set -e

echo "=== GX Protocol GeoDNS Deployment ==="
echo ""

# Regional server configuration
declare -A REGIONS=(
    ["malaysia"]="72.60.210.201:Asia"
    ["usa"]="217.196.51.190:North America"
    ["germany"]="72.61.81.3:Europe"
)

# Step 1: Update Kubernetes services to NodePort
echo "Step 1: Exposing Kubernetes services as NodePort..."
echo ""

for port in 3001 3002 3003 3004 3005 3006 3007; do
    service_name=""
    case $port in
        3001) service_name="svc-identity" ;;
        3002) service_name="svc-admin" ;;
        3003) service_name="svc-tokenomics" ;;
        3004) service_name="svc-organization" ;;
        3005) service_name="svc-loanpool" ;;
        3006) service_name="svc-governance" ;;
        3007) service_name="svc-tax" ;;
    esac

    echo "  Patching $service_name to use NodePort 300${port: -2}..."

    # Check if service exists
    if kubectl get svc "$service_name" -n backend-mainnet &> /dev/null; then
        kubectl patch svc "$service_name" -n backend-mainnet -p "{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"port\":$port,\"targetPort\":$port,\"nodePort\":30${port: -3}}]}}"
    else
        echo "  Warning: $service_name not found, skipping..."
    fi
done

echo ""
echo "Step 2: Installing Nginx on all regional servers..."
echo ""

for region in "${!REGIONS[@]}"; do
    IFS=':' read -r ip location <<< "${REGIONS[$region]}"
    echo "  Installing on $region ($location) - $ip..."

    ssh -o StrictHostKeyChecking=no root@$ip "dnf install -y nginx certbot python3-certbot-nginx" &
done
wait

echo ""
echo "Step 3: Deploying Nginx configurations..."
echo ""

for region in "${!REGIONS[@]}"; do
    IFS=':' read -r ip location <<< "${REGIONS[$region]}"
    echo "  Deploying to $region ($location)..."

    # Customize nginx config for this region
    sed "s/REGION_NAME/$location/g; s/SERVER_IP/$ip/g" nginx-regional.conf > /tmp/nginx-$region.conf

    # Deploy configs
    ssh root@$ip "mkdir -p /etc/nginx/conf.d /var/www/certbot"
    scp /tmp/nginx-$region.conf root@$ip:/etc/nginx/conf.d/api.conf
    scp proxy_params.conf root@$ip:/etc/nginx/proxy_params.conf

    # Add rate limiting to main nginx.conf
    ssh root@$ip "grep -q 'limit_req_zone' /etc/nginx/nginx.conf || cat rate_limit.conf >> /etc/nginx/nginx.conf"

    # Test and reload
    ssh root@$ip "nginx -t && systemctl enable nginx && systemctl restart nginx"

    rm /tmp/nginx-$region.conf
done

echo ""
echo "Step 4: Obtaining SSL certificates..."
echo ""

for region in "${!REGIONS[@]}"; do
    IFS=':' read -r ip location <<< "${REGIONS[$region]}"
    echo "  Obtaining certificate for $region ($location)..."

    ssh root@$ip "certbot certonly --webroot -w /var/www/certbot -d api.gxcoin.money --non-interactive --agree-tos --email admin@gxcoin.money --force-renewal" &
done
wait

echo ""
echo "Step 5: Reloading Nginx with SSL..."
echo ""

for region in "${!REGIONS[@]}"; do
    IFS=':' read -r ip location <<< "${REGIONS[$region]}"
    ssh root@$ip "systemctl reload nginx"
done

echo ""
echo "Step 6: Deploying health monitor..."
echo ""

chmod +x health-monitor.sh
cp health-monitor.sh /usr/local/bin/gx-health-monitor
nohup /usr/local/bin/gx-health-monitor >> /var/log/gx-health-monitor.log 2>&1 &

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Regional Servers:"
echo "  Malaysia (Asia):        72.60.210.201"
echo "  USA (North America):    217.196.51.190"
echo "  Germany (Europe):       72.61.81.3"
echo ""
echo "Next Steps:"
echo ""
echo "1. Configure Cloudflare GeoDNS:"
echo "   - Go to Cloudflare Dashboard → DNS"
echo "   - Delete existing api.gxcoin.money A record"
echo "   - Add 3 new A records (all named 'api'):"
echo ""
echo "     Name: api"
echo "     Type: A"
echo "     Content: 72.60.210.201"
echo "     Proxy: ON (orange cloud)"
echo "     Comment: Malaysia - Asia"
echo ""
echo "     Name: api"
echo "     Type: A"
echo "     Content: 217.196.51.190"
echo "     Proxy: ON (orange cloud)"
echo "     Comment: USA - North America"
echo ""
echo "     Name: api"
echo "     Type: A"
echo "     Content: 72.61.81.3"
echo "     Proxy: ON (orange cloud)"
echo "     Comment: Germany - Europe"
echo ""
echo "2. Enable Cloudflare Load Balancing (FREE):"
echo "   - Go to Traffic → Load Balancing"
echo "   - Create new Load Balancer"
echo "   - Add all 3 IPs as origins"
echo "   - Enable geo-steering (routes by user location)"
echo ""
echo "3. Test from different regions:"
echo "   curl https://api.gxcoin.money/health"
echo ""
echo "Health monitor running in background. Check logs:"
echo "   tail -f /var/log/gx-health-monitor.log"
echo ""
