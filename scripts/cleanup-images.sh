#!/bin/bash
#===============================================================================
# Kubernetes Container Image Cleanup Script
# Purpose: Aggressively prune old container images and reclaim disk space
# Schedule: Daily via cron at 5:15 AM UTC
# Updated: 2025-12-24 - Made more aggressive to remove old image versions
#===============================================================================

set -euo pipefail

LOG_FILE="/var/log/image-cleanup.log"
HOSTNAME=$(hostname)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$HOSTNAME] $1" | tee -a "$LOG_FILE"
}

log "=== Starting aggressive container image cleanup ==="

# Get disk usage before cleanup
DISK_BEFORE=$(df / | tail -1 | awk '{print $3}')
DISK_BEFORE_H=$(df -h / | tail -1 | awk '{print $3 " (" $5 ")"}')
IMAGES_BEFORE=$(crictl images 2>/dev/null | wc -l)

log "Before cleanup: Disk used: $DISK_BEFORE_H, Images: $IMAGES_BEFORE"

#-------------------------------------------------------------------------------
# 1. Remove old image versions - keep only latest 2 versions per service
#-------------------------------------------------------------------------------
log "Removing old image versions..."

# Function to clean old versions of a service image
clean_old_versions() {
    local service=$1
    local keep_count=${2:-2}

    # Get all tags for this service, sorted by version (newest first)
    local tags=$(crictl images 2>/dev/null | grep "10.43.75.195:5000/$service" | grep -v "<none>" | awk '{print $2}' | sort -t. -k1,1nr -k2,2nr -k3,3nr 2>/dev/null || true)

    local count=0
    for tag in $tags; do
        count=$((count + 1))
        if [ $count -gt $keep_count ]; then
            log "  Removing old: $service:$tag"
            crictl rmi "10.43.75.195:5000/$service:$tag" 2>/dev/null || true
        fi
    done
}

# Clean old versions for each service (keep latest 2)
for svc in svc-admin svc-identity svc-tokenomics gx-wallet-frontend outbox-submitter projector svc-governance svc-loanpool svc-tax svc-organization; do
    clean_old_versions "$svc" 2
done

#-------------------------------------------------------------------------------
# 2. Remove dangling/untagged images
#-------------------------------------------------------------------------------
log "Removing dangling images..."
crictl images 2>/dev/null | grep "<none>" | awk '{print $3}' | while read img; do
    crictl rmi "$img" 2>/dev/null || true
done

#-------------------------------------------------------------------------------
# 3. Prune unused images (multiple passes)
#-------------------------------------------------------------------------------
log "Running image prune (pass 1)..."
crictl rmi --prune 2>&1 | grep -v "DeadlineExceeded" | head -3 || true

log "Running image prune (pass 2)..."
crictl rmi --prune 2>&1 | grep -v "DeadlineExceeded" | head -3 || true

#-------------------------------------------------------------------------------
# 4. Clean /tmp files older than 3 days
#-------------------------------------------------------------------------------
log "Cleaning /tmp files older than 3 days..."
TMP_COUNT=$(find /tmp -type f -mtime +3 2>/dev/null | wc -l || echo 0)
find /tmp -type f -mtime +3 -delete 2>/dev/null || true
find /tmp -type d -empty -mtime +1 -delete 2>/dev/null || true
log "  Removed $TMP_COUNT temp files"

#-------------------------------------------------------------------------------
# 5. Clean old backup staging files
#-------------------------------------------------------------------------------
if [ -d /root/backups ]; then
    log "Cleaning old backup staging..."
    find /root/backups -name "*.tar.gz" -mtime +2 -delete 2>/dev/null || true
    find /root/backups -name "*.sql" -mtime +2 -delete 2>/dev/null || true
fi

#-------------------------------------------------------------------------------
# 6. Vacuum journal logs
#-------------------------------------------------------------------------------
log "Vacuuming journal logs to 3 days..."
journalctl --vacuum-time=3d --quiet 2>/dev/null || true

#-------------------------------------------------------------------------------
# 7. Delete completed Kubernetes pods/jobs
#-------------------------------------------------------------------------------
if command -v kubectl &>/dev/null; then
    log "Cleaning completed Kubernetes resources..."
    # Delete succeeded pods
    kubectl delete pods -A --field-selector=status.phase=Succeeded 2>/dev/null || true
    # Note: Keep failed pods for debugging - they don't consume much space
fi

#-------------------------------------------------------------------------------
# Results
#-------------------------------------------------------------------------------
DISK_AFTER=$(df / | tail -1 | awk '{print $3}')
DISK_AFTER_H=$(df -h / | tail -1 | awk '{print $3 " (" $5 ")"}')
IMAGES_AFTER=$(crictl images 2>/dev/null | wc -l)
FREED_KB=$((DISK_BEFORE - DISK_AFTER))
FREED_MB=$((FREED_KB / 1024))

log "After cleanup: Disk used: $DISK_AFTER_H, Images: $IMAGES_AFTER"
log "Images removed: $((IMAGES_BEFORE - IMAGES_AFTER))"
log "Space freed: ${FREED_MB} MB"
log "=== Cleanup complete ==="

# Keep log file from growing too large
if [ -f "$LOG_FILE" ]; then
    tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
