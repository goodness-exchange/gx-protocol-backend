# LECTURE 12: Attribute-Based Access Control (ABAC) in Hyperledger Fabric

## Overview

This lecture covers the Attribute-Based Access Control (ABAC) system implemented in GX Protocol. Unlike traditional Role-Based Access Control (RBAC), ABAC embeds permissions directly into X.509 certificates, enabling cryptographically-enforced authorization at the chaincode level.

## Learning Objectives

By the end of this lecture, you will understand:
1. Why ABAC was chosen over RBAC for blockchain authorization
2. How X.509 certificate attributes enable on-chain access control
3. The role hierarchy in GX Protocol (SuperAdmin, Admin, PartnerAPI)
4. How to register identities with custom attributes via Fabric CA
5. How chaincode enforces access control at transaction time

---

## Part 1: Understanding ABAC vs RBAC

### Traditional RBAC Limitations

In traditional systems, authorization typically works like this:

```
User Request → API Gateway → Check Role in Database → Allow/Deny
```

**Problems with this approach in blockchain:**
1. **Centralized authority**: Database-based role checks can be bypassed
2. **Mutable permissions**: Roles can be changed without audit trail
3. **Off-chain vulnerability**: The check happens outside the immutable ledger
4. **Trust assumptions**: Relies on the API layer to enforce correctly

### ABAC: Cryptographic Enforcement

ABAC embeds permissions directly into the user's X.509 certificate:

```
User Request → X.509 Certificate → Chaincode Reads Attributes → Allow/Deny
```

**Benefits:**
1. **Immutable permissions**: Attributes are signed into the certificate
2. **On-chain enforcement**: Chaincode verifies at transaction time
3. **Audit trail**: Every transaction includes the submitter's identity
4. **Zero trust**: No reliance on external systems for authorization

### The Key Insight

```
┌─────────────────────────────────────────────────────────────────┐
│                    X.509 CERTIFICATE                            │
├─────────────────────────────────────────────────────────────────┤
│ Subject: CN=org1-super-admin                                    │
│ Issuer: CN=ca-org1                                              │
│ Valid From: 2024-01-01                                          │
│ Valid Until: 2025-01-01                                         │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ EXTENSIONS (Custom Attributes)                              │ │
│ │ ─────────────────────────────────────────────────────────── │ │
│ │ gxc_role = gx_super_admin   ← THE MAGIC IS HERE            │ │
│ │ hf.EnrollmentID = org1-super-admin                         │ │
│ │ hf.Type = client                                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Signature: [Fabric CA Digital Signature]                        │
└─────────────────────────────────────────────────────────────────┘
```

The `gxc_role` attribute is cryptographically signed by the Fabric CA. It **cannot be forged** without access to the CA's private key.

---

## Part 2: Role Hierarchy in GX Protocol

### Three Privilege Levels

```go
// access_control.go - Role Constants
const (
    RoleSuperAdmin = "gx_super_admin"
    RoleAdmin      = "gx_admin"
    RolePartnerAPI = "gx_partner_api"
)
```

### Role Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GX PROTOCOL ROLE HIERARCHY                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  gx_super_admin (Highest Privilege)                                     │
│  ├── BootstrapSystem()          - One-time system initialization        │
│  ├── InitializeCountryData()    - Seed country allocations              │
│  ├── PauseSystem()              - Emergency system halt                 │
│  ├── ResumeSystem()             - Resume from emergency halt            │
│  ├── DistributeGenesis()        - Mint genesis tokens                   │
│  └── UpdateSystemParameter()    - Modify protocol constants             │
│                                                                         │
│  gx_admin (Organization Management)                                     │
│  ├── ProposeOrganization()      - Create multi-sig organization         │
│  ├── EndorseMembership()        - Approve organization member           │
│  ├── ActivateOrganization()     - Finalize organization setup           │
│  ├── SubmitProposal()           - Create governance proposals           │
│  ├── ApproveLoan()              - Approve loan applications             │
│  └── Transfer() [fallback]      - Execute transfers if PartnerAPI fails │
│                                                                         │
│  gx_partner_api (User Operations)                                       │
│  ├── CreateUser()               - Register new users                    │
│  ├── Transfer()                 - Execute token transfers               │
│  ├── SetUserRelationship()      - Link parent-child relationships       │
│  └── ApplyForLoan()             - Submit loan applications              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Three Roles?

| Role | Purpose | Identity Count | Access Frequency |
|------|---------|----------------|------------------|
| `gx_super_admin` | System-critical operations | 1-2 per organization | Rarely (emergencies, bootstrap) |
| `gx_admin` | Business operations | 3-5 per organization | Daily (approvals, management) |
| `gx_partner_api` | Automated user ops | 1 per backend service | High frequency (API calls) |

---

## Part 3: Fabric CA Identity Registration

### Creating Identities with Attributes

The Fabric CA is responsible for issuing X.509 certificates with custom attributes.

#### Registration Command

```bash
# Register identity with gxc_role attribute
fabric-ca-client register \
    --caname ca-org1 \
    --id.name org1-super-admin \
    --id.secret superadminpw \
    --id.type client \
    --id.attrs 'gxc_role=gx_super_admin:ecert' \
    --tls.certfiles /etc/hyperledger/fabric-ca-server/ca-cert.pem
```

**Key Parameters:**
- `--id.name`: Unique identity name
- `--id.secret`: Password for enrollment
- `--id.type`: Identity type (`client`, `peer`, `orderer`, etc.)
- `--id.attrs`: Custom attributes in `name=value:flag` format

#### Attribute Flags

```
gxc_role=gx_super_admin:ecert
                        ^^^^
                        |
                        └── "ecert" flag: Include in enrollment certificate

Other flags:
- ecert: Include in enrollment certificate (default)
- hf.Registrar: Can register other identities
- hf.GenCRL: Can generate Certificate Revocation Lists
```

### Enrollment Process

```bash
# After registration, enroll to get the certificate
fabric-ca-client enroll \
    -u https://org1-super-admin:superadminpw@localhost:9054 \
    --caname ca-org1 \
    --tls.certfiles /etc/hyperledger/fabric-ca-server/ca-cert.pem
```

This generates:
```
msp/
├── signcerts/
│   └── cert.pem          # X.509 certificate with gxc_role attribute
├── keystore/
│   └── priv_sk           # Private key for signing transactions
└── cacerts/
    └── ca-org1.pem       # CA certificate for verification
```

### Verifying Attributes in Certificate

```bash
# Decode certificate and check for gxc_role
openssl x509 -in cert.pem -text -noout | grep -A5 "X509v3 extensions"
```

Output includes:
```
X509v3 extensions:
    1.2.3.4.5.6.7.8.1:
        {"attrs":{"gxc_role":"gx_super_admin","hf.EnrollmentID":"org1-super-admin"}}
```

---

## Part 4: Wallet Setup Script Analysis

The `setup-fabric-wallet.sh` script automates identity creation:

```bash
#!/bin/bash
# scripts/setup-fabric-wallet.sh

# Identity definitions
declare -A IDENTITIES
IDENTITIES[super-admin]="org1-super-admin:superadminpw:gx_super_admin"
IDENTITIES[admin]="org1-admin:adminpw:gx_admin"
IDENTITIES[partner-api]="org1-partner-api:partnerapipw:gx_partner_api"
```

### Script Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WALLET SETUP WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: Check Prerequisites                                            │
│  ├── Verify kubectl access                                              │
│  └── Verify CA pod is running                                           │
│                                                                         │
│  Step 2: Create Wallet Directory                                        │
│  ├── fabric-wallet/                                                     │
│  │   ├── ca-cert/                                                       │
│  │   ├── org1-super-admin/                                              │
│  │   ├── org1-admin/                                                    │
│  │   └── org1-partner-api/                                              │
│                                                                         │
│  Step 3: Retrieve CA Certificate                                        │
│  └── Copy ca-cert.pem from CA pod                                       │
│                                                                         │
│  Step 4: Enroll CA Admin                                                │
│  └── Get admin credentials for registering new identities               │
│                                                                         │
│  Step 5: Register & Enroll Each Identity                                │
│  ├── For each identity:                                                 │
│  │   ├── Register with gxc_role attribute                               │
│  │   ├── Enroll to get certificate                                      │
│  │   ├── Copy cert.pem and key.pem to wallet                           │
│  │   └── Verify gxc_role attribute in certificate                       │
│                                                                         │
│  Step 6: Create Connection Profile                                      │
│  └── Generate connection-profile.json for SDK                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Output Structure

After running the script:

```
fabric-wallet/
├── ca-cert/
│   └── ca-org1.pem                 # CA root certificate
├── org1-super-admin/
│   ├── cert.pem                    # gxc_role=gx_super_admin
│   └── key.pem                     # Private key
├── org1-admin/
│   ├── cert.pem                    # gxc_role=gx_admin
│   └── key.pem                     # Private key
├── org1-partner-api/
│   ├── cert.pem                    # gxc_role=gx_partner_api
│   └── key.pem                     # Private key
└── connection-profile.json         # Network topology for SDK
```

---

## Part 5: Chaincode Access Control Implementation

### The Core Access Control Function

```go
// access_control.go

// requireRole is a private helper function that acts as a security gate.
// It checks if the identity submitting the transaction has a specific role attribute.
func requireRole(ctx contractapi.TransactionContextInterface, requiredRole string) error {
    // Check if the attribute exists and matches
    hasAttr, err := hasRequiredAttribute(ctx, "gxc_role", requiredRole)
    if err != nil {
        return err
    }
    if hasAttr {
        return nil  // Authorization passed
    }

    // Fallback for Cryptogen-based Networks (development only)
    if requiredRole == RoleSuperAdmin || requiredRole == RoleAdmin {
        err = ctx.GetClientIdentity().AssertAttributeValue("ou", "admin")
        if err == nil {
            return nil  // MSP admin allowed
        }
    }

    // Authorization failed
    submitterID, _ := ctx.GetClientIdentity().GetID()
    return fmt.Errorf("authorization failed: client '%s' does not have the required role '%s'",
        submitterID, requiredRole)
}
```

### Low-Level Attribute Check

```go
// hasRequiredAttribute checks for a specific attribute in the client's certificate
func hasRequiredAttribute(ctx contractapi.TransactionContextInterface,
    attributeName string, expectedValue string) (bool, error) {

    // GetClientIdentity() gives access to the submitter's identity
    attrValue, found, err := ctx.GetClientIdentity().GetAttributeValue(attributeName)
    if err != nil {
        return false, fmt.Errorf("failed to get attribute '%s': %w", attributeName, err)
    }
    if !found {
        return false, nil  // Attribute doesn't exist
    }

    return attrValue == expectedValue, nil
}
```

### Using Access Control in Contract Functions

```go
// admin_contract.go

// InitializeCountryData requires SuperAdmin role
func (s *AdminContract) InitializeCountryData(ctx contractapi.TransactionContextInterface,
    countriesDataJSON string) error {

    // FIRST LINE: Always check authorization
    err := requireRole(ctx, RoleSuperAdmin)
    if err != nil {
        return err  // Transaction rejected immediately
    }

    // ... rest of function only executes if authorized
}
```

### Multi-Role Authorization

Some functions allow multiple roles:

```go
// tokenomics_contract.go

func (tc *TokenomicsContract) Transfer(...) error {
    // Try Admin role first
    if err := requireRole(ctx, RoleAdmin); err != nil {
        // Admin check failed, try PartnerAPI
        if err2 := requireRole(ctx, RolePartnerAPI); err2 != nil {
            // Both failed - reject transaction
            return fmt.Errorf("requires admin or partner-api role")
        }
    }

    // Either Admin or PartnerAPI authorized - proceed
    // ...
}
```

---

## Part 6: Backend Integration

### Outbox-Submitter Identity Selection

The outbox-submitter worker selects the appropriate identity based on command type:

```typescript
// workers/outbox-submitter/src/identity-selector.ts

export function selectIdentityForCommand(commandType: CommandType): string {
    switch (commandType) {
        // SuperAdmin operations
        case 'BOOTSTRAP_SYSTEM':
        case 'INITIALIZE_COUNTRIES':
        case 'PAUSE_SYSTEM':
        case 'RESUME_SYSTEM':
        case 'DISTRIBUTE_GENESIS':
            return 'org1-super-admin';

        // Admin operations
        case 'PROPOSE_ORGANIZATION':
        case 'ENDORSE_MEMBERSHIP':
        case 'ACTIVATE_ORGANIZATION':
        case 'APPROVE_LOAN':
        case 'SUBMIT_PROPOSAL':
            return 'org1-admin';

        // PartnerAPI operations (default for user-facing)
        case 'CREATE_USER':
        case 'TRANSFER':
        case 'SET_RELATIONSHIP':
        case 'APPLY_FOR_LOAN':
        default:
            return 'org1-partner-api';
    }
}
```

### Wallet Loading in Fabric SDK

```typescript
// packages/core-fabric/src/wallet-provider.ts

import { Wallet, Wallets, X509Identity } from '@hyperledger/fabric-gateway';

export async function loadWallet(walletPath: string): Promise<Wallet> {
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    return wallet;
}

export async function loadIdentity(
    wallet: Wallet,
    identityLabel: string
): Promise<X509Identity> {
    const identity = await wallet.get(identityLabel);
    if (!identity) {
        throw new Error(`Identity ${identityLabel} not found in wallet`);
    }
    return identity as X509Identity;
}
```

### Gateway Connection with Identity

```typescript
// Connecting with specific identity
const identity = await loadIdentity(wallet, 'org1-super-admin');

const gateway = connect({
    client,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
});
```

---

## Part 7: Security Considerations

### Certificate Expiration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CERTIFICATE LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Registration        Enrollment          Active Use         Expiration  │
│  ─────────────      ────────────         ──────────         ──────────  │
│       │                  │                   │                  │       │
│       ▼                  ▼                   ▼                  ▼       │
│   [CA stores       [Certificate         [Transactions        [Cert no   │
│    identity]        issued with          submitted            longer    │
│                     1-year validity]     successfully]        valid]    │
│                                                                         │
│  Action Required:                                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  • Monitor certificate expiration dates                                 │
│  • Re-enroll before expiration (fabric-ca-client reenroll)             │
│  • Update wallet with new certificates                                  │
│  • Rotate private keys periodically                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Revocation

If a private key is compromised:

```bash
# Revoke the identity
fabric-ca-client revoke \
    --caname ca-org1 \
    --gencrl \
    --id.name org1-super-admin \
    --reason keycompromise

# Distribute new CRL to all peers
kubectl cp crl.pem peer0-org1:/var/hyperledger/fabric/msp/crls/
```

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-LAYER SECURITY                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 1: Network Security                                              │
│  ├── Kubernetes NetworkPolicies                                         │
│  ├── TLS encryption for all peer/orderer communication                 │
│  └── Namespace isolation                                                │
│                                                                         │
│  Layer 2: Transport Security                                            │
│  ├── Mutual TLS (mTLS) between services                                │
│  └── gRPC with TLS certificates                                         │
│                                                                         │
│  Layer 3: Identity Verification                                         │
│  ├── X.509 certificate validation                                       │
│  ├── MSP membership verification                                        │
│  └── Certificate revocation list (CRL) checking                         │
│                                                                         │
│  Layer 4: Attribute-Based Access Control ← THIS LECTURE                │
│  ├── gxc_role attribute checking                                        │
│  ├── requireRole() at function entry                                    │
│  └── Authorization error on mismatch                                    │
│                                                                         │
│  Layer 5: Business Logic Validation                                     │
│  ├── Balance checks                                                     │
│  ├── Status validation (active, frozen, etc.)                          │
│  └── Domain-specific rules                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Cryptogen vs Fabric CA

### Development: Cryptogen

```bash
# Quick setup for development/testing
cryptogen generate --config=crypto-config.yaml
```

**Characteristics:**
- Pre-generates all certificates at once
- No custom attributes support
- Uses `OU=admin` for admin detection
- Suitable for: development, testing, demos

### Production: Fabric CA

```bash
# Production setup with dynamic enrollment
fabric-ca-server start
fabric-ca-client register/enroll
```

**Characteristics:**
- Dynamic identity registration
- Custom attribute support (`gxc_role`)
- Certificate revocation capability
- Suitable for: production, multi-org deployments

### The Fallback Mechanism

The access control includes a fallback for cryptogen networks:

```go
// If no gxc_role attribute, check for MSP admin
if requiredRole == RoleSuperAdmin || requiredRole == RoleAdmin {
    err = ctx.GetClientIdentity().AssertAttributeValue("ou", "admin")
    if err == nil {
        return nil  // MSP admin allowed during bootstrap
    }
}
```

This allows:
- Development networks to work without Fabric CA
- Bootstrap operations before Fabric CA is fully configured
- Graceful transition from cryptogen to Fabric CA

---

## Part 9: Common Patterns and Best Practices

### Pattern 1: Authorization First

```go
func (c *Contract) SensitiveOperation(ctx contractapi.TransactionContextInterface) error {
    // ALWAYS check authorization as the first line
    if err := requireRole(ctx, RoleSuperAdmin); err != nil {
        return err
    }

    // Only proceed if authorized
    // ... business logic
}
```

### Pattern 2: Graceful Error Messages

```go
func requireRole(ctx contractapi.TransactionContextInterface, requiredRole string) error {
    // ... checks ...

    // Provide helpful error message
    submitterID, _ := ctx.GetClientIdentity().GetID()
    return fmt.Errorf("authorization failed: client '%s' does not have required role '%s'",
        submitterID, requiredRole)
}
```

### Pattern 3: Role Escalation Prevention

```go
// Never allow role checks to be bypassed
func (c *Contract) DangerousOperation(ctx contractapi.TransactionContextInterface) error {
    // BAD: Optional authorization
    // if config.AuthEnabled {
    //     requireRole(ctx, RoleSuperAdmin)
    // }

    // GOOD: Always enforce
    if err := requireRole(ctx, RoleSuperAdmin); err != nil {
        return err
    }
}
```

### Pattern 4: Least Privilege

```go
// Use the minimum required role
func (c *Contract) RegularUserOperation(ctx contractapi.TransactionContextInterface) error {
    // BAD: Requiring higher privilege than needed
    // if err := requireRole(ctx, RoleSuperAdmin); err != nil {

    // GOOD: Use the appropriate role level
    if err := requireRole(ctx, RolePartnerAPI); err != nil {
        return err
    }
}
```

---

## Part 10: Debugging Access Control Issues

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `authorization failed: client 'x509::/CN=...' does not have required role 'gx_super_admin'` | Wrong identity used | Verify wallet identity selection |
| `failed to get attribute 'gxc_role'` | Certificate missing attribute | Re-enroll with correct attributes |
| `identity not found in wallet` | Missing certificate files | Run wallet setup script |

### Verification Commands

```bash
# Check identity in wallet
ls -la fabric-wallet/org1-super-admin/

# Verify gxc_role in certificate
openssl x509 -in fabric-wallet/org1-super-admin/cert.pem -text -noout | grep gxc_role

# Test chaincode with specific identity
kubectl exec -n fabric peer0-org1-0 -- sh -c '
    export CORE_PEER_MSPCONFIGPATH=/path/to/super-admin-msp
    peer chaincode invoke -C gxchannel -n gxtv3 \
        -c '\''{"function":"Admin:GetSystemStatus","Args":[]}'\''
'
```

### Logging for Debugging

```go
// Add logging in development
func requireRole(ctx contractapi.TransactionContextInterface, requiredRole string) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()
    fmt.Printf("DEBUG: Checking role '%s' for client '%s'\n", requiredRole, submitterID)

    attrValue, found, _ := ctx.GetClientIdentity().GetAttributeValue("gxc_role")
    fmt.Printf("DEBUG: Found attribute: %v, Value: '%s'\n", found, attrValue)

    // ... rest of function
}
```

---

## Exercises

### Exercise 1: Trace Authorization Flow

Given this chaincode call:
```bash
peer chaincode invoke -C gxchannel -n gxtv3 \
    -c '{"function":"Admin:InitializeCountryData","Args":["{...}"]}'
```

Trace the authorization flow:
1. Which function is called?
2. What role is required?
3. Where is the role checked?
4. What happens if the check fails?

### Exercise 2: Add a New Role

Design a new role `gx_auditor` that can:
- Read all balances
- Read all transaction history
- Read system parameters
- But CANNOT modify anything

1. What constant would you add to `access_control.go`?
2. Which functions would use this role?
3. How would you register this identity?

### Exercise 3: Multi-Org ABAC

In a multi-organization setup:
- Org1 has its own CA (ca-org1)
- Org2 has its own CA (ca-org2)
- Both issue `gxc_role` attributes

Questions:
1. Can Org1's `gx_super_admin` pause the system?
2. Can Org2's `gx_admin` approve an Org1 user's loan?
3. How does the chaincode handle cross-org authorization?

---

## Summary

### Key Concepts

1. **ABAC vs RBAC**: ABAC embeds permissions in X.509 certificates for cryptographic enforcement
2. **Certificate Attributes**: `gxc_role` attribute determines authorization level
3. **Role Hierarchy**: SuperAdmin > Admin > PartnerAPI
4. **Fabric CA**: Dynamic identity registration with custom attributes
5. **requireRole()**: Chaincode function for authorization checks
6. **Defense in Depth**: ABAC is one layer in a multi-layer security model

### Authorization Matrix

| Function | SuperAdmin | Admin | PartnerAPI |
|----------|:----------:|:-----:|:----------:|
| BootstrapSystem | ✅ | ❌ | ❌ |
| InitializeCountryData | ✅ | ❌ | ❌ |
| PauseSystem | ✅ | ❌ | ❌ |
| ProposeOrganization | ❌ | ✅ | ❌ |
| ApproveLoan | ❌ | ✅ | ❌ |
| CreateUser | ❌ | ❌ | ✅ |
| Transfer | ❌ | ✅ | ✅ |

### Production Checklist

- [ ] All identities registered via Fabric CA (not cryptogen)
- [ ] `gxc_role` attribute verified in all certificates
- [ ] Private keys stored in Kubernetes Secrets
- [ ] Certificate expiration monitoring in place
- [ ] CRL distribution mechanism configured
- [ ] Wallet setup automated in deployment pipeline

---

## Further Reading

- [Hyperledger Fabric CA User Guide](https://hyperledger-fabric-ca.readthedocs.io/)
- [ABAC in Fabric Documentation](https://hyperledger-fabric.readthedocs.io/en/release-2.5/access_control.html)
- GX Protocol Chaincode: `/gx-coin-fabric/chaincode/access_control.go`
- Wallet Setup Script: `/gx-protocol-backend/scripts/setup-fabric-wallet.sh`
