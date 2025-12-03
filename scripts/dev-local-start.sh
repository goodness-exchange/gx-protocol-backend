#!/bin/bash
#
# Local Development Environment Startup Script
#
# This script sets up the local development environment by:
# 1. Starting local PostgreSQL and Redis (via Docker)
# 2. Port-forwarding Fabric network from testnet
# 3. Creating the development database if needed
#
# Usage: ./scripts/dev-local-start.sh [--use-testnet-db]
#
# Options:
#   --use-testnet-db  Use testnet database instead of local (port-forward)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
USE_TESTNET_DB=false
for arg in "$@"; do
    case $arg in
        --use-testnet-db)
            USE_TESTNET_DB=true
            shift
            ;;
    esac
done

# Configuration
LOCAL_DB_PORT=5432
LOCAL_REDIS_PORT=6379
LOCAL_DB_USER="gx_admin"
LOCAL_DB_PASSWORD="localdevpassword"
LOCAL_DB_NAME="gx_protocol_dev"

TESTNET_NAMESPACE="backend-testnet"
FABRIC_TESTNET_NAMESPACE="fabric-testnet"

# PID file for cleanup
PID_FILE="/tmp/gx-dev-local.pids"

cleanup() {
    log_info "Cleaning up..."
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            kill "$pid" 2>/dev/null || true
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    # Kill any lingering port-forwards
    pkill -f "kubectl port-forward.*backend-testnet" 2>/dev/null || true
    pkill -f "kubectl port-forward.*fabric-testnet" 2>/dev/null || true
}

trap cleanup EXIT

# Clear previous PIDs
rm -f "$PID_FILE"

echo ""
echo "============================================"
echo "  GX Protocol - Local Development Setup"
echo "============================================"
echo ""

# ============================================
# Step 1: Local Database and Redis
# ============================================

if [ "$USE_TESTNET_DB" = true ]; then
    log_info "Using testnet database (port-forwarding)..."

    # Port-forward PostgreSQL from testnet
    kubectl port-forward -n $TESTNET_NAMESPACE svc/postgres-primary $LOCAL_DB_PORT:5432 &
    echo $! >> "$PID_FILE"

    # Port-forward Redis from testnet
    kubectl port-forward -n $TESTNET_NAMESPACE svc/redis-master $LOCAL_REDIS_PORT:6379 &
    echo $! >> "$PID_FILE"

    log_success "Testnet database port-forwarded to localhost:$LOCAL_DB_PORT"
else
    log_info "Starting local PostgreSQL and Redis via Docker..."

    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi

    # Start PostgreSQL if not running
    if ! docker ps | grep -q "gx-dev-postgres"; then
        log_info "Starting local PostgreSQL..."
        docker run -d \
            --name gx-dev-postgres \
            -e POSTGRES_USER=$LOCAL_DB_USER \
            -e POSTGRES_PASSWORD=$LOCAL_DB_PASSWORD \
            -e POSTGRES_DB=$LOCAL_DB_NAME \
            -p $LOCAL_DB_PORT:5432 \
            -v gx-dev-postgres-data:/var/lib/postgresql/data \
            postgres:15-alpine \
            || docker start gx-dev-postgres
    else
        log_info "PostgreSQL already running"
    fi

    # Start Redis if not running
    if ! docker ps | grep -q "gx-dev-redis"; then
        log_info "Starting local Redis..."
        docker run -d \
            --name gx-dev-redis \
            -p $LOCAL_REDIS_PORT:6379 \
            redis:7-alpine \
            || docker start gx-dev-redis
    else
        log_info "Redis already running"
    fi

    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 3

    # Run migrations
    log_info "Running database migrations..."
    cd "$PROJECT_ROOT"
    DATABASE_URL="postgresql://$LOCAL_DB_USER:$LOCAL_DB_PASSWORD@localhost:$LOCAL_DB_PORT/$LOCAL_DB_NAME" \
        npx prisma migrate deploy --schema=./db/prisma/schema.prisma 2>/dev/null || true

    log_success "Local database ready at localhost:$LOCAL_DB_PORT"
fi

# ============================================
# Step 2: Port-forward Fabric Network
# ============================================

log_info "Setting up Fabric network port-forwards..."

# Check if fabric-testnet namespace exists
if kubectl get namespace $FABRIC_TESTNET_NAMESPACE > /dev/null 2>&1; then
    # Port-forward peer
    log_info "Port-forwarding Fabric peer..."
    kubectl port-forward -n $FABRIC_TESTNET_NAMESPACE svc/peer0-org1 7051:7051 &
    echo $! >> "$PID_FILE"

    # Port-forward orderer
    log_info "Port-forwarding Fabric orderer..."
    kubectl port-forward -n $FABRIC_TESTNET_NAMESPACE svc/orderer0-org0 7050:7050 &
    echo $! >> "$PID_FILE"

    log_success "Fabric network port-forwarded"
else
    log_warn "Fabric testnet namespace not found. Skipping Fabric port-forwards."
    log_warn "Backend will work but blockchain operations will fail."
fi

# ============================================
# Step 3: Create environment file
# ============================================

ENV_LOCAL_FILE="$PROJECT_ROOT/.env.local"

if [ ! -f "$ENV_LOCAL_FILE" ]; then
    log_info "Creating .env.local file..."
    cat > "$ENV_LOCAL_FILE" << EOF
# Local Development Environment
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://$LOCAL_DB_USER:$LOCAL_DB_PASSWORD@localhost:$LOCAL_DB_PORT/$LOCAL_DB_NAME

# Redis
REDIS_URL=redis://localhost:$LOCAL_REDIS_PORT

# Fabric Network (port-forwarded from testnet)
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_ORDERER_ENDPOINT=localhost:7050
FABRIC_CHANNEL_NAME=gxchannel
FABRIC_CHAINCODE_NAME=gxtv3

# JWT Secret (for local development only)
JWT_SECRET=local-dev-secret-change-in-production
JWT_REFRESH_SECRET=local-dev-refresh-secret

# Service Ports
SVC_IDENTITY_PORT=3001
SVC_TOKENOMICS_PORT=3003
SVC_ADMIN_PORT=3006
SVC_ORGANIZATION_PORT=3004
SVC_LOANPOOL_PORT=3007
SVC_GOVERNANCE_PORT=3008
SVC_TAX_PORT=3009
EOF
    log_success "Created .env.local"
else
    log_info ".env.local already exists"
fi

# ============================================
# Summary
# ============================================

echo ""
echo "============================================"
echo "  Local Development Environment Ready!"
echo "============================================"
echo ""
echo "  Services:"
if [ "$USE_TESTNET_DB" = true ]; then
    echo "    PostgreSQL: localhost:$LOCAL_DB_PORT (testnet)"
    echo "    Redis:      localhost:$LOCAL_REDIS_PORT (testnet)"
else
    echo "    PostgreSQL: localhost:$LOCAL_DB_PORT (local Docker)"
    echo "    Redis:      localhost:$LOCAL_REDIS_PORT (local Docker)"
fi
echo "    Fabric:     localhost:7050/7051 (testnet)"
echo ""
echo "  Next Steps:"
echo "    1. Open a new terminal"
echo "    2. cd $PROJECT_ROOT"
echo "    3. npm run dev"
echo ""
echo "  Frontend:"
echo "    1. cd $(dirname "$PROJECT_ROOT")/gx-wallet-frontend"
echo "    2. Update .env.local with NEXT_PUBLIC_IDENTITY_API_URL=http://localhost:3001"
echo "    3. npm run dev"
echo ""
echo "  Press Ctrl+C to stop port-forwards"
echo "============================================"
echo ""

# Keep script running to maintain port-forwards
wait
