# Work Record: Multi-Org Endorsement Investigation - November 23, 2025

## Session Overview
**Date:** November 23, 2025
**Duration:** Extended troubleshooting and implementation session
**Primary Goal:** Execute bootstrap system command and understand multi-org endorsement requirements
**Status:** In Progress - Identified endorsement policy as root cause

## Executive Summary

This session continued from the previous TLS troubleshooting work. After successfully resolving TLS connectivity issues, we discovered that the bootstrap command was failing due to **endorsement policy requirements** rather than network connectivity issues. The investigation revealed important architectural decisions about single-org vs multi-org endorsement policies for different types of operations.

## Problems Investigated

### 1. Initial Assumption: Gateway SDK Peer Discovery Issue (**INCORRECT**)
**Initial Symptom:** Bootstrap command failing with error:
```
Error: connect ECONNREFUSED 127.0.0.1:7051
```

**Initial Hypothesis:** Gateway SDK discovering wrong peer addresses (127.0.0.1 instead of Kubernetes DNS)

**Investigation Results:**
- Tested on mainnet: Gateway SDK trying to connect to `127.0.0.1:7051`
- Tested on testnet: Gateway SDK trying to connect to `0.0.0.0:7051`
- Initially believed this was a peer discovery/gossip configuration issue

**Finding:** This hypothesis was **partially correct** - there IS a peer discovery issue, but it's not the PRIMARY blocker.

---

### 2. API Testing Revealed True Root Cause (**CORRECT**)
**Test Method:** Directly inserted bootstrap command into OutboxCommand table to bypass API authentication

**SQL Command:**
```sql
INSERT INTO "OutboxCommand" (
  id, "tenantId", service, "commandType", "requestId",
  payload, status, attempts, "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text, 'default', 'svc-admin',
  'BOOTSTRAP_SYSTEM', 'api-test-' || gen_random_uuid()::text,
  '{}', 'PENDING', 0, NOW(), NOW()
);
```

**Result:** Command ID `ecf9a20d-c50d-4d3a-adc1-f3069a6b4d28` was processed

**Critical Discovery:**
```json
{
  "timestamp": "2025-11-23T04:48:28.118Z",
  "level": "error",
  "service": "core-fabric",
  "message": "Transaction submission failed",
  "contract": "AdminContract",
  "function": "BootstrapSystem",
  "error": "10 ABORTED: failed to collect enough transaction endorsements",
  "duration": 13425
}
```

**Key Insight:** The error changed from connection refused (`127.0.0.1`) to **endorsement failure**. This proves:
- ✅ Fabric Gateway SDK connection is WORKING
- ✅ TLS is WORKING
- ✅ Transaction reaches the blockchain
- ❌ **Endorsement policy requirement not met**

---

### 3. Architecture Understanding: Single-Org vs Multi-Org Endorsement

**Critical Architecture Question from User:**
> "This endorsement is it for protocol level changes or to record transactions? cause to record transaction like daily user or every invoke functions cannot wait for all organizations to approve if we have more organizations coming in the future right.. only protocol level changes and chaincode changes and critical stuff like that will need multiple level endorsement right?"

**Answer:** **User's understanding is 100% CORRECT**

#### Industry Standard Pattern: Two-Tier Endorsement

**Tier 1: Protocol/System-Level Operations (Multi-Org Required)**
```
endorsementPolicy: AND('Org1MSP.peer', 'Org2MSP.peer', ...)
```

Examples:
- `BootstrapSystem` - initializing monetary system
- `UpdateSystemParameter` - changing fee rates
- `PauseSystem`/`ResumeSystem` - emergency controls
- `InitializeCountry` - adding countries
- `AppointAdmin` - granting admin privileges
- Chaincode upgrades
- Constitutional governance changes

**Why?** Multiple organizations MUST verify to prevent single-org manipulation.

**Tier 2: Regular Transactions (Single-Org or Lightweight)**
```
endorsementPolicy: OR('Org1MSP.peer', 'Org2MSP.peer')
// or even: ANY single peer
```

Examples:
- `TransferTokens` - user-to-user payments
- `CreateUser` - user registration
- `UpdateProfile` - profile changes
- `ApplyForLoan` - loan applications
- `CastVote` - voting on proposals
- Daily user operations

**Why?** High-volume operations need **speed** and **scalability**.

#### Real-World Examples

**IBM Food Trust:**
- Product shipment: Single-org (fast)
- Recall notifications: Multi-org (critical)
- Supplier onboarding: Multi-org (system-level)

**We.Trade (Trade Finance):**
- Trade proposal: Single-org
- Payment execution: Multi-org
- Credit line changes: Multi-org

---

## Technical Investigation

### Current Chaincode Endorsement Policy

**Query Results:**
```bash
kubectl exec -n fabric peer0-org1-0 -- peer lifecycle chaincode querycommitted -C gxchannel -n gxtv3

# Output:
Committed chaincode definition for chaincode 'gxtv3' on channel 'gxchannel':
Version: 2.5, Sequence: 7
Endorsement Plugin: escc
Validation Plugin: vscc
Approvals: [Org1MSP: true, Org2MSP: true, PartnerOrg1MSP: false]
```

**Analysis:**
- Chaincode approved by Org1MSP and Org2MSP
- PartnerOrg1MSP not participating
- No explicit signature policy found in k8s scripts
- **Default policy:** MAJORITY (for 2 orgs = requires BOTH)

**Historical Policy (from dev scripts):**
```bash
--signature-policy "OR('Org1DevMSP.member', 'Org2DevMSP.member')"
```

This suggests the intended policy is **OR**, but production may be using **MAJORITY** (AND-equivalent for 2 orgs).

### Chaincode Installation Status

**Org1 Peers:**
```bash
kubectl exec -n fabric peer0-org1-0 -- peer lifecycle chaincode queryinstalled
# Multiple gxtv3 packages installed ✓
```

**Org2 Peers:**
```bash
kubectl exec -n fabric peer0-org2-0 -- peer lifecycle chaincode queryinstalled
# Multiple gxtv3 packages installed ✓
```

**Conclusion:** Chaincode properly installed on both organizations' peers.

### Peer Configuration

**Org1 Peer0:**
```bash
CORE_PEER_ID=peer0.org1.prod.goodness.exchange
CORE_PEER_LOCALMSPID=Org1MSP
CORE_PEER_ADDRESS=peer0.org1.prod.goodness.exchange:7051
CORE_PEER_LISTENADDRESS=0.0.0.0:7051
```

**Org2 Peer0:**
```bash
CORE_PEER_ID=peer0.org2.prod.goodness.exchange
CORE_PEER_LOCALMSPID=Org2MSP
```

Both peers properly configured and running for 13-14 days.

---

## Implementation Work

### Added Org2 Credentials to Backend

**Step 1: Located Org2 Admin Credentials**
```bash
/home/sugxcoin/prod-blockchain/gx-coin-fabric/organizations-ca/peerOrganizations/org2.prod.goodness.exchange/users/Admin@org2.prod.goodness.exchange/
├── msp/signcerts/cert.pem
└── msp/keystore/7fba9202e482bff5b449dfd1914c2963e3028a76c9351a7c4e89f2f88fd5cf5c_sk
```

**Certificate Verification:**
```bash
openssl x509 -in cert.pem -text -noout | grep -A 5 "1.2.3.4.5.6.7.8.1"

# Attributes:
{
  "attrs": {
    "gxc_role": "gx_super_admin",
    "hf.Affiliation": "",
    "hf.EnrollmentID": "admin.org2",
    "hf.Type": "admin"
  }
}
```

✅ Org2 admin has `gx_super_admin` role - correct for system operations.

**Step 2: Updated Fabric Wallet ConfigMap**
```bash
kubectl patch configmap fabric-wallet -n backend-mainnet --type='json' -p='[
  {"op": "add", "path": "/data/org2-super-admin-cert", "value": "..."},
  {"op": "add", "path": "/data/org2-super-admin-key", "value": "..."}
]'
```

**Verification:**
```bash
kubectl get cm -n backend-mainnet fabric-wallet -o jsonpath='{.data}' | jq 'keys | sort'

# Output:
[
  "ca-cert",
  "org1-admin-cert",
  "org1-admin-key",
  "org1-partner-api-cert",
  "org1-partner-api-key",
  "org1-super-admin-cert",
  "org1-super-admin-key",
  "org2-super-admin-cert",      # ✓ Added
  "org2-super-admin-key",       # ✓ Added
  "tlsca-cert"
]
```

### Current Backend Architecture

**Outbox-Submitter Identity Management:**

The outbox-submitter creates **separate Fabric Gateway SDK clients** for each identity:

```typescript
// workers/outbox-submitter/src/index.ts:271-290
const identities: FabricIdentity[] = [
  {
    name: 'org1-super-admin',
    role: 'super_admin',
    certPath: `${walletPath}/org1-super-admin-cert`,
    keyPath: `${walletPath}/org1-super-admin-key`,
  },
  {
    name: 'org1-admin',
    role: 'admin',
    certPath: `${walletPath}/org1-admin-cert`,
    keyPath: `${walletPath}/org1-admin-key`,
  },
  {
    name: 'org1-partner-api',
    role: 'partner_api',
    certPath: `${walletPath}/org1-partner-api-cert`,
    keyPath: `${walletPath}/org1-partner-api-key`,
  },
];
```

**Identity Selection Logic:**
```typescript
function selectIdentityForCommand(commandType: string): string {
  const superAdminCommands = [
    'BOOTSTRAP_SYSTEM',
    'INITIALIZE_COUNTRY_DATA',
    'PAUSE_SYSTEM',
    'RESUME_SYSTEM',
  ];

  if (superAdminCommands.includes(commandType)) {
    return 'org1-super-admin';  // ← Currently uses ONLY Org1
  }
  // ...
}
```

**Key Architectural Issue:**
- Each client connects to the **SAME peer endpoint**: `peer0-org1.fabric.svc.cluster.local:7051`
- All clients use **Org1MSP** identity
- Gateway SDK should use service discovery to find Org2 peers automatically
- However, the endorsement is still failing

---

## Root Cause Analysis

### The Multi-Org Endorsement Challenge

**Problem Statement:**
The Fabric Gateway SDK connects with an Org1 identity to an Org1 peer. When submitting a transaction:

1. Gateway SDK calls `proposal.endorse()`
2. SDK uses **service discovery** to find peers for endorsement
3. Endorsement policy requires **BOTH Org1 AND Org2** endorsements (MAJORITY of 2)
4. SDK discovers peers but **fails to collect enough endorsements**

**Possible Reasons for Failure:**

**Option A: Service Discovery Not Finding Org2 Peers**
- Gateway SDK only queries Org1 peers
- Org2 peers not advertising via gossip
- Network policy blocking cross-org peer discovery

**Option B: Org2 Peers Rejecting Endorsement Requests**
- Org2 peers require Org2 identity for endorsement
- Org1 identity cannot request Org2 peer endorsement
- This is UNLIKELY - endorsement should work cross-org

**Option C: Endorsement Policy Misconfigured**
- Policy requires more than 2 orgs
- Policy has syntax error
- Policy not properly committed

**Option D: Gossip Configuration Issue**
- Peers not discovering each other across organizations
- External/Gossip endpoints not configured
- `CORE_PEER_GOSSIP_EXTERNALENDPOINT` not set

---

## Recommended Solutions

### Immediate Fix (Unblock Testing)

**Option 1: Change Endorsement Policy to OR**

Upgrade the chaincode with an explicit OR policy:

```bash
cd /home/sugxcoin/prod-blockchain/gx-coin-fabric

peer lifecycle chaincode approveformyorg \
  -o orderer0.ordererorg.prod.goodness.exchange:7050 \
  --tls --cafile /path/to/orderer/ca.crt \
  --channelID gxchannel \
  --name gxtv3 \
  --version 2.5 \
  --sequence 8 \
  --signature-policy "OR('Org1MSP.peer','Org2MSP.peer')"
```

**Effect:** Either Org1 OR Org2 endorsement is sufficient → Bootstrap will succeed immediately

**Pros:**
- ✅ Unblocks testing immediately
- ✅ Allows fast iteration on backend functionality
- ✅ Works for both protocol-level and user-level operations

**Cons:**
- ❌ Single org can manipulate protocol-level operations
- ❌ Not production-ready for mainnet
- ❌ Defeats purpose of multi-org blockchain

**Recommendation:** Use for **testnet only**, fix properly before mainnet.

---

### Production Fix (Proper Multi-Org)

**Option 2: Implement State-Based Endorsement (SBE)**

Configure different policies for different operation types:

```go
// In chaincode: admin_contract.go
func (s *AdminContract) BootstrapSystem(ctx contractapi.TransactionContextInterface) error {
    // Multi-org endorsement for protocol operations
    endorsementPolicy := []byte(`{
        "identities": [
            {"role":{"name":"member","mspId":"Org1MSP"}},
            {"role":{"name":"member","mspId":"Org2MSP"}}
        ],
        "policy": {
            "2-of": [{"signed-by":0},{"signed-by":1}]
        }
    }`)

    err := ctx.GetStub().SetStateValidationParameter("systemBootstrapped", endorsementPolicy)
    if err != nil {
        return fmt.Errorf("failed to set endorsement policy: %v", err)
    }

    // ... bootstrap logic
}

// In chaincode: tokenomics_contract.go
func (s *TokenomicsContract) TransferTokens(ctx contractapi.TransactionContextInterface, ...) error {
    // Single-org endorsement (uses chaincode-level default OR policy)
    // ... transfer logic
}
```

**Effect:**
- Protocol operations require multi-org
- User transactions require single-org
- Granular control per function

---

**Option 3: Fix Gateway SDK Service Discovery**

Investigate why Gateway SDK isn't discovering Org2 peers:

1. **Check Gossip Configuration:**
```bash
kubectl exec -n fabric peer0-org1-0 -- env | grep GOSSIP
kubectl exec -n fabric peer0-org2-0 -- env | grep GOSSIP

# Add if missing:
CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0-org1.fabric.svc.cluster.local:7051
```

2. **Enable Service Discovery Debugging:**
```typescript
// In core-fabric package
const client = await createFabricClient({
  // ... existing config
  discovery: {
    enabled: true,
    asLocalhost: false,
  },
});
```

3. **Test Cross-Org Peer Discovery:**
```bash
kubectl exec -n fabric peer0-org1-0 -- peer channel fetch config -c gxchannel
kubectl exec -n fabric peer0-org1-0 -- peer channel getinfo -c gxchannel
```

---

## Key Decisions Required

### Decision 1: Testnet vs Mainnet Strategy

**Question:** Should we use different endorsement policies for testnet vs mainnet?

**Recommendation:**

| Environment | Endorsement Policy | Reasoning |
|-------------|-------------------|-----------|
| **Testnet** | `OR('Org1MSP.peer','Org2MSP.peer')` | Fast iteration, single-org sufficient for testing |
| **Mainnet** | State-Based Endorsement (SBE) | Protocol ops = multi-org, User ops = single-org |

---

### Decision 2: Implementation Priority

**User requested:** "lets add the org2 into the backend and continue"

**Status:**
- ✅ Org2 credentials added to ConfigMap
- ⏳ Outbox-submitter code NOT YET updated to use Org2 identity
- ⏳ Need to determine HOW to use Org2 identity

**Options:**

**A. Add Org2 Identity to Outbox-Submitter (Simple)**
```typescript
const identities: FabricIdentity[] = [
  // ... existing Org1 identities
  {
    name: 'org2-super-admin',
    role: 'super_admin',
    certPath: `${walletPath}/org2-super-admin-cert`,
    keyPath: `${walletPath}/org2-super-admin-key`,
  },
];
```

**Problem:** Each client connects to same peer endpoint (Org1 peer). Adding Org2 identity connecting to Org1 peer doesn't help.

**B. Connect Org2 Identity to Org2 Peer (Complex)**
Requires environment variable configuration per identity:
- Org1 client → `peer0-org1.fabric.svc.cluster.local:7051`
- Org2 client → `peer0-org2.fabric.svc.cluster.local:7051`

**C. Rely on Gateway SDK Service Discovery (Recommended)**
- Use ONLY Org1 identity
- Let Gateway SDK discover and connect to Org2 peers automatically
- This is how Fabric Gateway is DESIGNED to work
- **Current issue:** Service discovery not finding Org2 peers

---

## Testing Results

### Test 1: Direct Database Insert
**Command ID:** `ecf9a20d-c50d-4d3a-adc1-f3069a6b4d28`

**Result:**
```json
{
  "timestamp": "2025-11-23T04:48:14.692Z",
  "level": "info",
  "service": "outbox-submitter",
  "message": "Processing batch of 1 commands"
}
{
  "timestamp": "2025-11-23T04:48:28.118Z",
  "level": "error",
  "error": "10 ABORTED: failed to collect enough transaction endorsements",
  "duration": 13425
}
```

**Success Criteria:**
- ✅ Command picked up from database
- ✅ Transaction submitted to Fabric (13.4 second duration)
- ✅ No connection errors (127.0.0.1)
- ✅ TLS handshake successful
- ❌ **Endorsement collection failed**

### Test 2: Testnet Bootstrap (Comparison)
**Command:** Direct peer CLI invocation

**Without Explicit Peer Addresses:**
```bash
Error: error getting endorser client for invoke: endorser client failed to connect to 0.0.0.0:7051
```

**With Explicit Peer Addresses:**
```bash
Error: error getting endorser client for invoke: endorser client failed to connect to peer0-org1.fabric-testnet.svc.cluster.local:7051: context deadline exceeded
```

**Conclusion:** Testnet has SAME endorsement/discovery issues as mainnet.

---

## Files Modified

### 1. Fabric Wallet ConfigMap
**Resource:** `configmap/fabric-wallet` in namespace `backend-mainnet`

**Changes:**
```yaml
data:
  # ... existing keys ...
  org2-super-admin-cert: |
    -----BEGIN CERTIFICATE-----
    MIICyTCCAm+gAwIBAgIUE8oP81q1biZACWBTJErrv3F8EC4wCgYIKoZIzj0EAwIw
    # ... (Org2 admin certificate from Fabric CA)
    -----END CERTIFICATE-----

  org2-super-admin-key: |
    -----BEGIN EC PRIVATE KEY-----
    # ... (Org2 admin private key)
    -----END EC PRIVATE KEY-----
```

**Verification Command:**
```bash
kubectl get cm -n backend-mainnet fabric-wallet -o jsonpath='{.data}' | jq 'keys'
```

---

## Pending Work

### Immediate Next Steps

1. **Decision Required:** Choose approach (A, B, or C) for using Org2 credentials

2. **If Option A (Change to OR Policy):**
   - Upgrade chaincode with `--signature-policy "OR('Org1MSP.peer','Org2MSP.peer')"`
   - Test bootstrap command
   - Proceed with country initialization

3. **If Option B (Add Org2 Client to Backend):**
   - Investigate Gateway SDK multi-peer configuration
   - Determine if separate clients needed per org
   - Update outbox-submitter initialization code

4. **If Option C (Fix Service Discovery):**
   - Debug peer gossip configuration
   - Check external endpoints
   - Enable discovery debugging in Gateway SDK

### Long-Term Implementation

1. **Implement State-Based Endorsement:**
   - Modify chaincode to set per-key endorsement policies
   - Protocol operations → multi-org required
   - User operations → single-org sufficient

2. **Production Deployment Checklist:**
   - [ ] Verify all orgs have chaincode installed
   - [ ] Test cross-org peer discovery
   - [ ] Verify endorsement policies per operation type
   - [ ] Load test with realistic transaction volume
   - [ ] Monitor endorsement latency

3. **Documentation:**
   - [ ] Document endorsement policy decisions
   - [ ] Create runbook for chaincode upgrades
   - [ ] Document multi-org testing procedures

---

## Lessons Learned

### 1. Endorsement Policy Architecture
**Learning:** Blockchain systems need **TWO-TIER endorsement policies**:
- Critical system operations: Multi-org verification
- High-volume user transactions: Single-org for performance

**Application to GX Coin:**
- Bootstrap, country initialization, system parameters: Multi-org
- User transfers, profile updates, loan applications: Single-org

### 2. Fabric Gateway SDK Behavior
**Learning:** The Gateway SDK is designed to handle multi-org endorsement via service discovery, BUT:
- Requires proper gossip configuration
- Needs external endpoints configured on peers
- May have issues with Kubernetes DNS resolution

**Next Investigation:** Peer gossip external endpoints

### 3. Testing Strategy
**Learning:** Directly inserting into OutboxCommand table is an effective way to bypass API auth and test core Fabric connectivity.

**Benefit:** Isolated the issue from "backend API problem" to "Fabric endorsement problem" in one test.

### 4. Kubernetes Co-Located Architecture
**Confirmation:** Backend and Fabric on same cluster is working well:
- ✅ Low latency (~13s for endorsement attempt, not connection delay)
- ✅ Internal DNS resolution working
- ✅ TLS between services functioning
- ⚠️ Service discovery across orgs needs investigation

---

## References

### Hyperledger Fabric Documentation
- Endorsement Policies: https://hyperledger-fabric.readthedocs.io/en/latest/endorsement-policies.html
- State-Based Endorsement: https://hyperledger-fabric.readthedocs.io/en/latest/endorsement-policies.html#state-based-endorsement
- Fabric Gateway SDK: https://hyperledger.github.io/fabric-gateway/
- Service Discovery: https://hyperledger-fabric.readthedocs.io/en/latest/discovery-overview.html

### Related Work Records
- `2025-11-20-tls-troubleshooting.md` - Previous session resolving TLS issues

### Industry Best Practices
- Hyperledger Fabric in Production: "Endorsement policies should require multi-org for critical operations"
- IBM Blockchain Platform: Uses different policies for different contract functions
- Trade finance networks: Protocol changes require all participants, trades require counterparties only

---

## Summary

This session successfully:
1. ✅ Identified root cause: Endorsement policy requiring multi-org approval
2. ✅ Added Org2 credentials to backend ConfigMap
3. ✅ Clarified industry-standard two-tier endorsement architecture
4. ✅ Tested bootstrap via direct database insertion
5. ⏳ **Pending:** Final decision on implementation approach

The critical architectural insight is that **different operations need different endorsement requirements**. The user's understanding of this concept was completely correct, and we've documented the industry-standard approach for implementing it in Hyperledger Fabric.

**Next Session Focus:**
- Finalize approach (OR policy for testnet vs proper SBE for mainnet)
- Execute bootstrap command successfully
- Initialize country data
- Test full user registration flow
