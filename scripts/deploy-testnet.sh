#!/bin/bash
#
# Deploy to Testnet Script
#
# Builds a Docker image and deploys it to the testnet environment.
#
# Usage: ./scripts/deploy-testnet.sh <service-name> <version>
#
# Example: ./scripts/deploy-testnet.sh svc-identity 2.0.26
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
NAMESPACE="backend-testnet"
TESTNET_NODE="72.61.116.210"

if [ -z "$SERVICE_NAME" ] || [ -z "$VERSION" ]; then
    echo "Usage: $0 <service-name> <version>"
    echo "Example: $0 svc-identity 2.0.26"
    exit 1
fi

IMAGE_NAME="gx-protocol/$SERVICE_NAME:$VERSION"

echo ""
echo "============================================"
echo "  Deploying to Testnet"
echo "============================================"
echo "  Service:   $SERVICE_NAME"
echo "  Version:   $VERSION"
echo "  Namespace: $NAMESPACE"
echo "  Node:      $TESTNET_NODE"
echo "============================================"
echo ""

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
# Step 2: Transfer to Testnet Node
# ============================================

log_info "Transferring image to testnet node..."

# Save and compress
TEMP_FILE="/tmp/${SERVICE_NAME}-${VERSION}.tar.gz"
docker save "$IMAGE_NAME" | gzip > "$TEMP_FILE"

# Transfer to testnet node
scp -o StrictHostKeyChecking=no "$TEMP_FILE" "root@$TESTNET_NODE:/tmp/"

# Import on testnet node
ssh -o StrictHostKeyChecking=no "root@$TESTNET_NODE" "gunzip -c /tmp/${SERVICE_NAME}-${VERSION}.tar.gz | k3s ctr images import -"

# Cleanup
rm -f "$TEMP_FILE"
ssh -o StrictHostKeyChecking=no "root@$TESTNET_NODE" "rm -f /tmp/${SERVICE_NAME}-${VERSION}.tar.gz"

log_success "Image transferred to testnet"

# ============================================
# Step 3: Update Deployment
# ============================================

log_info "Updating deployment..."

kubectl set image "deployment/$SERVICE_NAME" "$SERVICE_NAME=$IMAGE_NAME" -n "$NAMESPACE"

log_info "Waiting for rollout..."
kubectl rollout status "deployment/$SERVICE_NAME" -n "$NAMESPACE" --timeout=180s

log_success "Deployment complete!"

# ============================================
# Step 4: Verify
# ============================================

log_info "Verifying deployment..."
kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME"

echo ""
echo "============================================"
echo "  Testnet Deployment Complete!"
echo "============================================"
echo "  Service: $SERVICE_NAME:$VERSION"
echo "  Status:  Running"
echo ""
echo "  View logs:"
echo "    kubectl logs -f deploy/$SERVICE_NAME -n $NAMESPACE"
echo "============================================"
