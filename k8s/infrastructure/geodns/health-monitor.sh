#!/bin/bash
# GX Protocol Regional Health Monitor
# Checks health of all 3 regional servers every 60 seconds
# Alerts when a region goes down

REGIONS=(
    "Malaysia:72.60.210.201:AS"
    "USA:217.196.51.190:NA"
    "Germany:72.61.81.3:EU"
)

ALERT_EMAIL="admin@gxcoin.money"  # Change to your email
SLACK_WEBHOOK=""  # Optional: Add Slack webhook URL

check_region() {
    local name=$1
    local ip=$2
    local code=$3

    # Check HTTPS health endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://api.gxcoin.money/health" --resolve "api.gxcoin.money:443:$ip")

    if [ "$response" == "200" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $name ($code) - HEALTHY"
        return 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $name ($code) - DOWN (HTTP $response)"

        # Send alert
        alert_down "$name" "$ip" "$code" "$response"
        return 1
    fi
}

alert_down() {
    local name=$1
    local ip=$2
    local code=$3
    local response=$4

    local message="ALERT: GX Protocol $name server ($ip) is DOWN! HTTP response: $response. Users in $code region may experience issues."

    # Log to file
    echo "$message" >> /var/log/gx-health-alerts.log

    # Send email (requires mailutils)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "GX Protocol Alert: $name Server Down" "$ALERT_EMAIL"
    fi

    # Send Slack notification
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"$message\"}" &> /dev/null
    fi
}

# Main monitoring loop
echo "=== GX Protocol Health Monitor Started ==="
echo "Monitoring regions: Malaysia (AS), USA (NA), Germany (EU)"
echo "Check interval: 60 seconds"
echo ""

while true; do
    healthy_count=0

    for region in "${REGIONS[@]}"; do
        IFS=':' read -r name ip code <<< "$region"
        if check_region "$name" "$ip" "$code"; then
            ((healthy_count++))
        fi
    done

    echo "Status: $healthy_count/3 regions healthy"
    echo ""

    # Sleep 60 seconds
    sleep 60
done
