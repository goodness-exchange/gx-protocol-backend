#!/bin/bash
#
# Deploy to Mainnet Script
#
# Builds a Docker image and deploys it to all mainnet nodes.
# This performs a rolling update across all 3 regions.
#
# Usage: ./scripts/deploy-mainnet.sh <service-name> <version>
#
# Example: ./scripts/deploy-mainnet.sh svc-identity 2.0.26
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Arguments
SERVICE_NAME=$1
VERSION=$2
NAMESPACE="backend-mainnet"

# Mainnet nodes (3 regions)
MAINNET_NODES=(
    "72.60.210.201"   # Malaysia (control-plane)
    "217.196.51.190"  # USA (Phoenix)
    "72.61.81.3"      # Germany (Frankfurt)
)

if [ -z "$SERVICE_NAME" ] || [ -z "$VERSION" ]; then
    echo "Usage: $0 <service-name> <version>"
    echo "Example: $0 svc-identity 2.0.26"
    exit 1
fi

IMAGE_NAME="gx-protocol/$SERVICE_NAME:$VERSION"

echo ""
echo "============================================"
echo "  Deploying to MAINNET (PRODUCTION)"
echo "============================================"
echo "  Service:   $SERVICE_NAME"
echo "  Version:   $VERSION"
echo "  Namespace: $NAMESPACE"
echo "  Nodes:     ${#MAINNET_NODES[@]} (Malaysia, USA, Germany)"
echo "============================================"
echo ""

# Confirmation prompt for production deployment
read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    log_warn "Deployment cancelled"
    exit 0
fi

# ============================================
# Step 1: Build Docker Image
# ============================================

log_info "Building Docker image..."
cd "$PROJECT_ROOT"

DOCKERFILE="apps/$SERVICE_NAME/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
    log_error "Dockerfile not found: $DOCKERFILE"
    exit 1
fi

docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" .
log_success "Docker image built: $IMAGE_NAME"

# ============================================
# Step 2: Save and Compress Image
# ============================================

log_info "Compressing image..."
TEMP_FILE="/tmp/${SERVICE_NAME}-${VERSION}.tar.gz"
docker save "$IMAGE_NAME" | gzip > "$TEMP_FILE"
log_success "Image compressed: $(du -h $TEMP_FILE | cut -f1)"

# ============================================
# Step 3: Transfer to All Mainnet Nodes
# ============================================

log_info "Transferring image to mainnet nodes..."

for NODE in "${MAINNET_NODES[@]}"; do
    log_info "  Transferring to $NODE..."
    scp -o StrictHostKeyChecking=no "$TEMP_FILE" "root@$NODE:/tmp/" &
done

# Wait for all transfers to complete
wait
log_success "All transfers complete"

# ============================================
# Step 4: Import on All Nodes
# ============================================

log_info "Importing image on all nodes..."

for NODE in "${MAINNET_NODES[@]}"; do
    log_info "  Importing on $NODE..."
    ssh -o StrictHostKeyChecking=no "root@$NODE" \
        "gunzip -c /tmp/${SERVICE_NAME}-${VERSION}.tar.gz | k3s ctr images import - && rm -f /tmp/${SERVICE_NAME}-${VERSION}.tar.gz" &
done

# Wait for all imports to complete
wait
log_success "All imports complete"

# Cleanup local temp file
rm -f "$TEMP_FILE"

# ============================================
# Step 5: Rolling Update
# ============================================

log_info "Starting rolling update..."

kubectl set image "deployment/$SERVICE_NAME" "$SERVICE_NAME=$IMAGE_NAME" -n "$NAMESPACE"

log_info "Waiting for rollout (this may take a few minutes)..."
kubectl rollout status "deployment/$SERVICE_NAME" -n "$NAMESPACE" --timeout=300s

log_success "Rolling update complete!"

# ============================================
# Step 6: Verify Deployment
# ============================================

log_info "Verifying deployment..."
echo ""
kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" -o wide
echo ""

# Check all pods are running
READY_PODS=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" -o jsonpath='{.items[*].status.phase}' | tr ' ' '\n' | grep -c "Running" || echo "0")
TOTAL_PODS=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" --no-headers | wc -l)

if [ "$READY_PODS" -eq "$TOTAL_PODS" ]; then
    log_success "All $TOTAL_PODS pods are running"
else
    log_warn "Only $READY_PODS/$TOTAL_PODS pods are running"
fi

echo ""
echo "============================================"
echo "  MAINNET Deployment Complete!"
echo "============================================"
echo "  Service: $SERVICE_NAME:$VERSION"
echo "  Pods:    $READY_PODS/$TOTAL_PODS running"
echo ""
echo "  View logs:"
echo "    kubectl logs -f deploy/$SERVICE_NAME -n $NAMESPACE"
echo ""
echo "  Monitor:"
echo "    kubectl get pods -n $NAMESPACE -l app=$SERVICE_NAME -w"
echo "============================================"
