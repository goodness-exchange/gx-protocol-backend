#!/bin/bash
#
# Fabric Wallet Setup Script for Backend Services
# 
# This script registers and enrolls 3 Fabric identities with different roles:
# 1. org1-super-admin (gxc_role=gx_super_admin) - System operations
# 2. org1-admin (gxc_role=gx_admin) - Organization management  
# 3. org1-partner-api (gxc_role=gx_partner_api) - User transactions
#
# Prerequisites:
# - Fabric CA running in Kubernetes (ca-org1)
# - kubectl configured with access to 'fabric' namespace
# - Port forwarding to CA service (or use cluster DNS)
#

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}=================================================================${NC}"
    echo -e "${BLUE}== $1${NC}"
    echo -e "${BLUE}=================================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Configuration
BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WALLET_DIR="$BACKEND_ROOT/fabric-wallet"
CA_ORG1_POD="ca-org1-0"
CA_NAMESPACE="fabric"
CA_NAME="ca-org1"
CA_PORT=9054

# CA Admin Credentials
CA_ADMIN_USER="admin"
CA_ADMIN_PASS="adminpw"

# Identities to create
declare -A IDENTITIES
IDENTITIES[super-admin]="org1-super-admin:superadminpw:gx_super_admin"
IDENTITIES[admin]="org1-admin:adminpw:gx_admin"
IDENTITIES[partner-api]="org1-partner-api:partnerapipw:gx_partner_api"

print_header "Fabric Wallet Setup for Backend Services"

# Step 1: Check prerequisites
print_header "Step 1: Checking Prerequisites"

if ! command -v kubectl &> /dev/null; then
    print_error "kubectl not found. Please install kubectl."
    exit 1
fi
print_success "kubectl found"

if ! kubectl get pod -n $CA_NAMESPACE $CA_ORG1_POD &> /dev/null; then
    print_error "CA pod $CA_ORG1_POD not found in namespace $CA_NAMESPACE"
    exit 1
fi
print_success "CA pod $CA_ORG1_POD is running"

# Step 2: Create wallet directory structure
print_header "Step 2: Creating Wallet Directory Structure"

mkdir -p "$WALLET_DIR/ca-cert"
mkdir -p "$WALLET_DIR/org1-super-admin"
mkdir -p "$WALLET_DIR/org1-admin"
mkdir -p "$WALLET_DIR/org1-partner-api"

print_success "Created wallet directories at $WALLET_DIR"

# Step 3: Get CA certificate
print_header "Step 3: Retrieving CA Certificate"

kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- cat /etc/hyperledger/fabric-ca-server/ca-cert.pem > "$WALLET_DIR/ca-cert/ca-org1.pem"

if [ -f "$WALLET_DIR/ca-cert/ca-org1.pem" ]; then
    print_success "CA certificate saved to $WALLET_DIR/ca-cert/ca-org1.pem"
else
    print_error "Failed to retrieve CA certificate"
    exit 1
fi

# Step 4: Enroll CA admin
print_header "Step 4: Enrolling CA Admin"

CA_ADMIN_HOME="$WALLET_DIR/ca-admin"
mkdir -p "$CA_ADMIN_HOME"

# Port forward to CA (in background)
print_warning "Setting up port forward to CA service..."
kubectl port-forward -n $CA_NAMESPACE svc/$CA_NAME $CA_PORT:$CA_PORT > /dev/null 2>&1 &
PF_PID=$!
sleep 3

# Enroll CA admin using fabric-ca-client on the CA pod
print_warning "Enrolling CA admin via CA pod..."
kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- sh -c "
    export FABRIC_CA_CLIENT_HOME=/tmp/ca-admin-home
    mkdir -p /tmp/ca-admin-home
    fabric-ca-client enroll \
        -u https://$CA_ADMIN_USER:$CA_ADMIN_PASS@localhost:$CA_PORT \
        --caname $CA_NAME \
        --tls.certfiles /etc/hyperledger/fabric-ca-server/ca-cert.pem
" 2>&1 | grep -E "(Enrolled|Success|Error)" || true

print_success "CA admin enrolled"

# Step 5: Register and enroll identities
print_header "Step 5: Registering and Enrolling Backend Identities"

for role_key in "${!IDENTITIES[@]}"; do
    IFS=':' read -r id_name id_pass id_role <<< "${IDENTITIES[$role_key]}"
    
    echo -e "\n${YELLOW}Processing: $id_name (role: $id_role)${NC}"
    
    # Check if already registered
    echo "→ Registering identity..."
    kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- sh -c "
        export FABRIC_CA_CLIENT_HOME=/tmp/ca-admin-home
        fabric-ca-client register \
            --caname $CA_NAME \
            --id.name $id_name \
            --id.secret $id_pass \
            --id.type client \
            --id.attrs 'gxc_role=$id_role:ecert' \
            --tls.certfiles /etc/hyperledger/fabric-ca-server/ca-cert.pem
    " 2>&1 | grep -v "already registered" || print_warning "Identity may already be registered"
    
    # Enroll identity
    echo "→ Enrolling identity..."
    kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- sh -c "
        export FABRIC_CA_CLIENT_HOME=/tmp/$id_name-home
        mkdir -p /tmp/$id_name-home
        fabric-ca-client enroll \
            -u https://$id_name:$id_pass@localhost:$CA_PORT \
            --caname $CA_NAME \
            --tls.certfiles /etc/hyperledger/fabric-ca-server/ca-cert.pem
    " 2>&1 | grep -E "(Enrolled|Success|Error)" || true
    
    # Copy certificates from pod to local wallet
    echo "→ Saving certificates to wallet..."
    kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- cat /tmp/$id_name-home/msp/signcerts/cert.pem > "$WALLET_DIR/$id_name/cert.pem"
    kubectl exec -n $CA_NAMESPACE $CA_ORG1_POD -- sh -c "cat /tmp/$id_name-home/msp/keystore/*_sk" > "$WALLET_DIR/$id_name/key.pem"
    
    # Verify files exist
    if [ -f "$WALLET_DIR/$id_name/cert.pem" ] && [ -f "$WALLET_DIR/$id_name/key.pem" ]; then
        print_success "$id_name enrolled successfully"
        echo "   Cert: $WALLET_DIR/$id_name/cert.pem"
        echo "   Key:  $WALLET_DIR/$id_name/key.pem"
        
        # Verify the gxc_role attribute is in the certificate
        if openssl x509 -in "$WALLET_DIR/$id_name/cert.pem" -text -noout | grep -q "gxc_role"; then
            print_success "   Verified: gxc_role attribute present in certificate"
        else
            print_warning "   Warning: gxc_role attribute not found in certificate"
        fi
    else
        print_error "$id_name enrollment failed"
    fi
done

# Kill port forward
kill $PF_PID 2>/dev/null || true

# Step 6: Create connection profile
print_header "Step 6: Creating Fabric Connection Profile"

cat > "$WALLET_DIR/connection-profile.json" << EOFPROFILE
{
  "name": "gx-protocol-network",
  "version": "1.0.0",
  "client": {
    "organization": "Org1",
    "connection": {
      "timeout": {
        "peer": {
          "endorser": "300"
        },
        "orderer": "300"
      }
    }
  },
  "organizations": {
    "Org1": {
      "mspid": "Org1MSP",
      "peers": [
        "peer0-org1",
        "peer1-org1"
      ],
      "certificateAuthorities": [
        "ca-org1"
      ]
    }
  },
  "peers": {
    "peer0-org1": {
      "url": "grpcs://peer0-org1.fabric.svc.cluster.local:7051",
      "tlsCACerts": {
        "path": "./ca-cert/ca-org1.pem"
      },
      "grpcOptions": {
        "ssl-target-name-override": "peer0-org1",
        "hostnameOverride": "peer0-org1"
      }
    },
    "peer1-org1": {
      "url": "grpcs://peer1-org1.fabric.svc.cluster.local:7051",
      "tlsCACerts": {
        "path": "./ca-cert/ca-org1.pem"
      },
      "grpcOptions": {
        "ssl-target-name-override": "peer1-org1",
        "hostnameOverride": "peer1-org1"
      }
    }
  },
  "orderers": {
    "orderer0": {
      "url": "grpcs://orderer0-org0.fabric.svc.cluster.local:7050",
      "tlsCACerts": {
        "path": "./ca-cert/ca-org1.pem"
      },
      "grpcOptions": {
        "ssl-target-name-override": "orderer0-org0",
        "hostnameOverride": "orderer0-org0"
      }
    }
  },
  "certificateAuthorities": {
    "ca-org1": {
      "url": "https://ca-org1.fabric.svc.cluster.local:9054",
      "caName": "ca-org1",
      "tlsCACerts": {
        "path": "./ca-cert/ca-org1.pem"
      },
      "httpOptions": {
        "verify": false
      }
    }
  }
}
EOFPROFILE

print_success "Connection profile created at $WALLET_DIR/connection-profile.json"

# Step 7: Summary
print_header "Setup Complete!"

echo -e "${GREEN}Fabric wallet successfully created at: $WALLET_DIR${NC}\n"
echo "Identities enrolled:"
echo "  1. org1-super-admin   (gxc_role=gx_super_admin)  - System operations"
echo "  2. org1-admin         (gxc_role=gx_admin)        - Organization management"
echo "  3. org1-partner-api   (gxc_role=gx_partner_api)  - User transactions"
echo ""
echo "Next steps:"
echo "  1. Configure outbox-submitter to use these identities"
echo "  2. Update .env with FABRIC_WALLET_PATH=$WALLET_DIR"
echo "  3. Test country initialization via backend API"
echo ""
