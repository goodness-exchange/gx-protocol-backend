#!/bin/bash
# =============================================================================
# Deployment Promotion CLI Script
# Promotes services from DevNet -> TestNet -> MainNet with approval workflow
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
ADMIN_API_URL="${ADMIN_API_URL:-http://localhost:3032}"
REGISTRY_URL="${REGISTRY_URL:-registry.gxcoin.money}"

# Valid services
VALID_SERVICES=("svc-identity" "svc-admin" "svc-tokenomics" "gx-wallet-frontend" "outbox-submitter" "projector")

# Valid environments
VALID_ENVS=("devnet" "testnet" "mainnet")

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -s, --service SERVICE     Service to deploy (required)"
    echo "  -f, --from ENV            Source environment (devnet|testnet)"
    echo "  -t, --to ENV              Target environment (testnet|mainnet)"
    echo "  -i, --image-tag TAG       Image tag to deploy (required)"
    echo "  -r, --reason REASON       Reason for deployment (required)"
    echo "  --token TOKEN             Admin JWT token (or set ADMIN_TOKEN env var)"
    echo "  --interactive             Interactive mode (prompts for all values)"
    echo "  --list                    List recent deployments"
    echo "  --status ID               Get deployment status by ID"
    echo "  -h, --help                Show this help message"
    echo ""
    echo "Valid services: ${VALID_SERVICES[*]}"
    echo "Valid promotions: devnet->testnet, testnet->mainnet"
    echo ""
    echo "Examples:"
    echo "  $0 -s svc-identity -f devnet -t testnet -i 2.1.10 -r 'New feature release'"
    echo "  $0 --interactive"
    echo "  $0 --list --token \$ADMIN_TOKEN"
    echo "  $0 --status 123e4567-e89b-12d3-a456-426614174000"
}

validate_service() {
    local service=$1
    for valid in "${VALID_SERVICES[@]}"; do
        if [[ "$valid" == "$service" ]]; then
            return 0
        fi
    done
    return 1
}

validate_env() {
    local env=$1
    for valid in "${VALID_ENVS[@]}"; do
        if [[ "$valid" == "$env" ]]; then
            return 0
        fi
    done
    return 1
}

validate_promotion() {
    local from=$1
    local to=$2

    if [[ "$from" == "devnet" && "$to" == "testnet" ]]; then
        return 0
    elif [[ "$from" == "testnet" && "$to" == "mainnet" ]]; then
        return 0
    fi
    return 1
}

# =============================================================================
# API Functions
# =============================================================================

api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [[ -z "$ADMIN_TOKEN" ]]; then
        print_error "No admin token provided. Use --token or set ADMIN_TOKEN env var."
        exit 1
    fi

    local curl_args=("-s" "-X" "$method" "-H" "Authorization: Bearer $ADMIN_TOKEN" "-H" "Content-Type: application/json")

    if [[ -n "$data" ]]; then
        curl_args+=("-d" "$data")
    fi

    curl "${curl_args[@]}" "${ADMIN_API_URL}${endpoint}"
}

create_deployment() {
    local service=$1
    local from_env=$2
    local to_env=$3
    local image_tag=$4
    local reason=$5

    print_info "Creating deployment request..."

    local payload=$(cat <<EOF
{
  "service": "$service",
  "sourceEnv": "$from_env",
  "targetEnv": "$to_env",
  "imageTag": "$image_tag",
  "reason": "$reason"
}
EOF
)

    local response=$(api_call "POST" "/api/v1/admin/deployments/promote" "$payload")
    echo "$response" | jq .

    local success=$(echo "$response" | jq -r '.success // false')
    if [[ "$success" == "true" ]]; then
        local deployment_id=$(echo "$response" | jq -r '.deployment.id')
        local approval_id=$(echo "$response" | jq -r '.approvalRequest.id')

        print_success "Deployment request created!"
        echo ""
        echo -e "${YELLOW}Deployment ID:${NC} $deployment_id"
        echo -e "${YELLOW}Approval ID:${NC} $approval_id"
        echo ""
        print_warning "Awaiting SuperOwner approval..."
        echo ""
        echo "To approve (as SuperOwner):"
        echo "  curl -X POST '${ADMIN_API_URL}/api/v1/admin/approvals/$approval_id/vote' \\"
        echo "    -H 'Authorization: Bearer \$SUPER_OWNER_TOKEN' \\"
        echo "    -H 'Content-Type: application/json' \\"
        echo "    -d '{\"decision\": \"APPROVE\"}'"
        echo ""
        echo "To check status:"
        echo "  $0 --status $deployment_id --token \$ADMIN_TOKEN"
    else
        local error_msg=$(echo "$response" | jq -r '.message // "Unknown error"')
        print_error "Failed to create deployment: $error_msg"
        exit 1
    fi
}

list_deployments() {
    print_info "Fetching recent deployments..."

    local response=$(api_call "GET" "/api/v1/admin/deployments?limit=10")

    echo ""
    echo -e "${CYAN}Recent Deployments:${NC}"
    echo "$response" | jq -r '.deployments[] | "\(.status | if . == "COMPLETED" then "\u001b[32m" elif . == "FAILED" or . == "ROLLED_BACK" then "\u001b[31m" elif . == "PENDING_APPROVAL" then "\u001b[33m" else "\u001b[34m" end)\(.status)\u001b[0m  \(.service)  \(.sourceEnv)->\(.targetEnv)  \(.imageTag)  \(.id)"' 2>/dev/null || echo "$response" | jq .
}

get_deployment_status() {
    local deployment_id=$1

    print_info "Fetching deployment status..."

    local response=$(api_call "GET" "/api/v1/admin/deployments/$deployment_id?includeLogs=true")

    local status=$(echo "$response" | jq -r '.status // "Unknown"')
    local service=$(echo "$response" | jq -r '.service // "Unknown"')
    local target_env=$(echo "$response" | jq -r '.targetEnv // "Unknown"')
    local image_tag=$(echo "$response" | jq -r '.imageTag // "Unknown"')

    echo ""
    echo -e "${CYAN}Deployment Details:${NC}"
    echo -e "  ID:          $deployment_id"
    echo -e "  Service:     $service"
    echo -e "  Target:      $target_env"
    echo -e "  Image Tag:   $image_tag"

    case $status in
        "COMPLETED")
            echo -e "  Status:      ${GREEN}$status${NC}"
            ;;
        "FAILED"|"ROLLED_BACK")
            echo -e "  Status:      ${RED}$status${NC}"
            local error_msg=$(echo "$response" | jq -r '.errorMessage // "No error message"')
            echo -e "  Error:       $error_msg"
            ;;
        "PENDING_APPROVAL")
            echo -e "  Status:      ${YELLOW}$status${NC}"
            ;;
        "IN_PROGRESS"|"HEALTH_CHECK")
            echo -e "  Status:      ${BLUE}$status${NC}"
            ;;
        *)
            echo -e "  Status:      $status"
            ;;
    esac

    echo ""
    echo -e "${CYAN}Logs:${NC}"
    echo "$response" | jq -r '.logs[]? | "  [\(.level | ascii_upcase)] \(.message)"' 2>/dev/null || echo "  No logs available"
}

interactive_mode() {
    print_header "Deployment Promotion - Interactive Mode"

    # Select service
    echo "Available services:"
    for i in "${!VALID_SERVICES[@]}"; do
        echo "  $((i+1)). ${VALID_SERVICES[$i]}"
    done
    read -p "Select service (1-${#VALID_SERVICES[@]}): " service_idx
    SERVICE="${VALID_SERVICES[$((service_idx-1))]}"

    if ! validate_service "$SERVICE"; then
        print_error "Invalid service selection"
        exit 1
    fi

    # Select source environment
    echo ""
    echo "Source environment:"
    echo "  1. devnet"
    echo "  2. testnet"
    read -p "Select source (1-2): " from_idx
    case $from_idx in
        1) FROM_ENV="devnet" ;;
        2) FROM_ENV="testnet" ;;
        *) print_error "Invalid source selection"; exit 1 ;;
    esac

    # Select target environment
    echo ""
    echo "Target environment:"
    if [[ "$FROM_ENV" == "devnet" ]]; then
        echo "  1. testnet"
        read -p "Select target (1): " to_idx
        TO_ENV="testnet"
    else
        echo "  1. mainnet"
        read -p "Select target (1): " to_idx
        TO_ENV="mainnet"
    fi

    if ! validate_promotion "$FROM_ENV" "$TO_ENV"; then
        print_error "Invalid promotion path: $FROM_ENV -> $TO_ENV"
        exit 1
    fi

    # Enter image tag
    echo ""
    read -p "Enter image tag (e.g., 2.1.10): " IMAGE_TAG
    if [[ -z "$IMAGE_TAG" ]]; then
        print_error "Image tag is required"
        exit 1
    fi

    # Enter reason
    echo ""
    read -p "Enter deployment reason (min 10 chars): " REASON
    if [[ ${#REASON} -lt 10 ]]; then
        print_error "Reason must be at least 10 characters"
        exit 1
    fi

    # Enter token if not set
    if [[ -z "$ADMIN_TOKEN" ]]; then
        echo ""
        read -p "Enter admin JWT token: " ADMIN_TOKEN
        export ADMIN_TOKEN
    fi

    # Confirm
    echo ""
    print_header "Deployment Summary"
    echo -e "  Service:     ${CYAN}$SERVICE${NC}"
    echo -e "  From:        ${CYAN}$FROM_ENV${NC}"
    echo -e "  To:          ${CYAN}$TO_ENV${NC}"
    echo -e "  Image Tag:   ${CYAN}$IMAGE_TAG${NC}"
    echo -e "  Reason:      ${CYAN}$REASON${NC}"
    echo ""
    read -p "Proceed with deployment request? (y/N): " confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        print_warning "Deployment cancelled"
        exit 0
    fi

    create_deployment "$SERVICE" "$FROM_ENV" "$TO_ENV" "$IMAGE_TAG" "$REASON"
}

# =============================================================================
# Main Script
# =============================================================================

# Parse arguments
SERVICE=""
FROM_ENV=""
TO_ENV=""
IMAGE_TAG=""
REASON=""
INTERACTIVE=false
LIST_DEPLOYMENTS=false
STATUS_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--service)
            SERVICE="$2"
            shift 2
            ;;
        -f|--from)
            FROM_ENV="$2"
            shift 2
            ;;
        -t|--to)
            TO_ENV="$2"
            shift 2
            ;;
        -i|--image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -r|--reason)
            REASON="$2"
            shift 2
            ;;
        --token)
            ADMIN_TOKEN="$2"
            export ADMIN_TOKEN
            shift 2
            ;;
        --interactive)
            INTERACTIVE=true
            shift
            ;;
        --list)
            LIST_DEPLOYMENTS=true
            shift
            ;;
        --status)
            STATUS_ID="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Handle different modes
if [[ "$INTERACTIVE" == true ]]; then
    interactive_mode
    exit 0
fi

if [[ "$LIST_DEPLOYMENTS" == true ]]; then
    list_deployments
    exit 0
fi

if [[ -n "$STATUS_ID" ]]; then
    get_deployment_status "$STATUS_ID"
    exit 0
fi

# Validate required parameters for non-interactive mode
if [[ -z "$SERVICE" || -z "$FROM_ENV" || -z "$TO_ENV" || -z "$IMAGE_TAG" || -z "$REASON" ]]; then
    print_error "Missing required parameters"
    usage
    exit 1
fi

# Validate service
if ! validate_service "$SERVICE"; then
    print_error "Invalid service: $SERVICE"
    echo "Valid services: ${VALID_SERVICES[*]}"
    exit 1
fi

# Validate environments
if ! validate_env "$FROM_ENV"; then
    print_error "Invalid source environment: $FROM_ENV"
    exit 1
fi

if ! validate_env "$TO_ENV"; then
    print_error "Invalid target environment: $TO_ENV"
    exit 1
fi

# Validate promotion path
if ! validate_promotion "$FROM_ENV" "$TO_ENV"; then
    print_error "Invalid promotion path: $FROM_ENV -> $TO_ENV"
    echo "Valid paths: devnet->testnet, testnet->mainnet"
    exit 1
fi

# Create deployment
print_header "Creating Deployment Request"
echo -e "  Service:     ${CYAN}$SERVICE${NC}"
echo -e "  From:        ${CYAN}$FROM_ENV${NC}"
echo -e "  To:          ${CYAN}$TO_ENV${NC}"
echo -e "  Image Tag:   ${CYAN}$IMAGE_TAG${NC}"
echo -e "  Reason:      ${CYAN}$REASON${NC}"
echo ""

create_deployment "$SERVICE" "$FROM_ENV" "$TO_ENV" "$IMAGE_TAG" "$REASON"
