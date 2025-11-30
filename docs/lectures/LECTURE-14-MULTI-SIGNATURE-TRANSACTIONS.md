# LECTURE 14: Multi-Signature Transaction Approval

## Overview

This lecture covers the multi-signature (multi-sig) transaction approval system in GX Protocol. Organizations (businesses, NGOs, and government treasuries) use configurable authorization rules requiring multiple stakeholder approvals before large transactions can execute.

## Learning Objectives

By the end of this lecture, you will understand:
1. The organization lifecycle from proposal to activation
2. Stakeholder endorsement and verification flow
3. Configurable multi-sig authorization rules
4. The pending transaction approval workflow
5. Cross-contract communication for transaction execution
6. Government treasury as a special organization type

---

## Part 1: Organization Fundamentals

### Organization Types

```go
// consts.go
const (
    OrgTypeBusiness   = "BUSINESS"   // For-profit companies
    OrgTypeNGO        = "NGO"        // Non-profit organizations
    OrgTypeGovernment = "GOVERNMENT" // Country treasury
)
```

### Key Characteristics

| Type | Created By | Purpose | Velocity Tax |
|------|------------|---------|--------------|
| BUSINESS | Users (stakeholders) | Commercial operations | Subject |
| NGO | Users (stakeholders) | Charitable operations | Subject |
| GOVERNMENT | Admins only | Country treasury | Subject |

### Organization Structure

```go
// organization_types.go

type Organization struct {
    DocType      string          `json:"docType"`      // "organization"
    OrgID        string          `json:"orgID"`        // Unique identifier
    OrgName      string          `json:"orgName"`      // Legal name
    AccountType  string          `json:"accountType"`  // BUSINESS, NGO, GOVERNMENT
    Country      string          `json:"country"`      // For fee determination
    Status       string          `json:"status"`       // Lifecycle status
    Stakeholders []string        `json:"stakeholders"` // User IDs of members
    Endorsements map[string]bool `json:"endorsements"` // Stakeholder approvals
    Rules        []Rule          `json:"rules"`        // Multi-sig authorization rules
    CreatedAt    time.Time       `json:"createdAt"`    // Creation timestamp

    // Velocity Tax Tracking
    VelocityTaxTimerStart time.Time `json:"velocityTaxTimerStart,omitempty"`
    VelocityTaxLastCheck  time.Time `json:"velocityTaxLastCheck,omitempty"`
    VelocityTaxExempt     bool      `json:"velocityTaxExempt,omitempty"`
}
```

---

## Part 2: Organization Lifecycle

### State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ORGANIZATION LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │   Not Created   │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            │ ProposeOrganization()                                          │
│            │ (by stakeholder or admin for GOVERNMENT)                       │
│            ▼                                                                │
│   ┌─────────────────────┐                                                   │
│   │ PendingEndorsement  │ ◄──── Initial state                              │
│   └────────┬────────────┘                                                   │
│            │                                                                │
│            │ EndorseMembership() x N                                        │
│            │ (each stakeholder endorses)                                    │
│            ▼                                                                │
│   ┌──────────────────────┐                                                  │
│   │ All Endorsements     │                                                  │
│   │ Complete?            │                                                  │
│   └────────┬─────────────┘                                                  │
│            │                                                                │
│            │ Yes: ActivateOrganization()                                    │
│            ▼                                                                │
│   ┌─────────────────┐                                                       │
│   │    Verified     │ ◄──── Fully operational                              │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            │ Admin action (violation, fraud)                                │
│            ▼                                                                │
│   ┌─────────────────┐                                                       │
│   │     Locked      │ ◄──── Suspended operations                           │
│   └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: ProposeOrganization

```go
// organization_contract.go

func (s *OrganizationContract) ProposeOrganization(
    ctx contractapi.TransactionContextInterface,
    orgID string,
    orgName string,
    orgType string,
    stakeholderIDsJSON string,
) error {
    // 1. Authorization check for GOVERNMENT type
    if orgType == OrgTypeGovernment {
        if err := requireRole(ctx, RoleAdmin); err != nil {
            return fmt.Errorf("only admins can create GOVERNMENT organizations")
        }
    }

    // 2. Parse stakeholder IDs
    var stakeholderIDs []string
    json.Unmarshal([]byte(stakeholderIDsJSON), &stakeholderIDs)

    // 3. Validate submitter is in stakeholder list
    submitterID, _ := ctx.GetClientIdentity().GetID()
    isSubmitterAStakeholder := false
    for _, id := range stakeholderIDs {
        if id == submitterID {
            isSubmitterAStakeholder = true
            break
        }
    }
    if !isSubmitterAStakeholder {
        return fmt.Errorf("submitter not in stakeholder list")
    }

    // 4. Cross-contract call to verify all stakeholders exist
    for _, id := range stakeholderIDs {
        invokeArgs := [][]byte{[]byte("UserExists"), []byte(id)}
        response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)
        if response.Status >= 400 {
            return fmt.Errorf("stakeholder %s does not exist", id)
        }
    }

    // 5. Initialize endorsements map (all false)
    endorsementsMap := make(map[string]bool)
    for _, id := range stakeholderIDs {
        endorsementsMap[id] = false
    }

    // 6. Create organization in pending state
    org := Organization{
        DocType:      OrgDocType,
        OrgID:        orgID,
        OrgName:      orgName,
        AccountType:  orgType,
        Status:       "PendingEndorsement",
        Stakeholders: stakeholderIDs,
        Endorsements: endorsementsMap,
    }

    ctx.GetStub().PutState(orgID, orgJSON)
    return nil
}
```

### Step 2: EndorseMembership

```go
// organization_contract.go

func (s *OrganizationContract) EndorseMembership(
    ctx contractapi.TransactionContextInterface,
    orgID string,
) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()
    org, _ := s._getOrg(ctx, orgID)

    // 1. Validate organization is pending
    if org.Status != "PendingEndorsement" {
        return fmt.Errorf("organization not pending endorsement")
    }

    // 2. Validate submitter is a stakeholder
    if _, isStakeholder := org.Endorsements[submitterID]; !isStakeholder {
        return fmt.Errorf("user not a proposed stakeholder")
    }

    // 3. Check for double endorsement
    if org.Endorsements[submitterID] {
        return fmt.Errorf("already endorsed")
    }

    // 4. Record endorsement
    org.Endorsements[submitterID] = true

    ctx.GetStub().PutState(orgID, updatedOrgJSON)
    return nil
}
```

### Step 3: ActivateOrganization

```go
// organization_contract.go

func (s *OrganizationContract) ActivateOrganization(
    ctx contractapi.TransactionContextInterface,
    orgID string,
) error {
    org, _ := s._getOrg(ctx, orgID)

    // 1. Validate all endorsements are complete
    for stakeholderID, hasEndorsed := range org.Endorsements {
        if !hasEndorsed {
            return fmt.Errorf("stakeholder %s has not endorsed", stakeholderID)
        }
    }

    // 2. Activate organization
    org.Status = "Verified"

    ctx.GetStub().PutState(orgID, updatedOrgJSON)
    return nil
}
```

---

## Part 3: Multi-Signature Authorization Rules

### Rule Structure

```go
// organization_types.go

type Rule struct {
    AmountThreshold   uint64   `json:"amountThreshold"`   // Trigger threshold
    RequiredApprovers int      `json:"requiredApprovers"` // Number of approvals needed
    ApproverGroup     []string `json:"approverGroup"`     // Who can approve
}
```

### Example Rule Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXAMPLE: ACME CORP MULTI-SIG RULES                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stakeholders: [CEO, CFO, COO, Treasurer]                                  │
│                                                                             │
│  Rule 1: Small Transactions                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Amount Threshold: 1,000 coins                               │           │
│  │ Required Approvers: 1                                        │           │
│  │ Approver Group: [Treasurer]                                  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│  → Treasurer alone can approve transactions up to 1,000 coins             │
│                                                                             │
│  Rule 2: Medium Transactions                                               │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Amount Threshold: 10,000 coins                              │           │
│  │ Required Approvers: 2                                        │           │
│  │ Approver Group: [CEO, CFO, COO]                              │           │
│  └─────────────────────────────────────────────────────────────┘           │
│  → Any 2 of CEO/CFO/COO must approve 1,000-10,000 coin transactions       │
│                                                                             │
│  Rule 3: Large Transactions                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Amount Threshold: 100,000 coins                             │           │
│  │ Required Approvers: 3                                        │           │
│  │ Approver Group: [CEO, CFO, COO, Treasurer]                   │           │
│  └─────────────────────────────────────────────────────────────┘           │
│  → Any 3 of 4 executives must approve 10,000+ coin transactions           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DefineAuthRule Implementation

```go
// organization_contract.go

func (s *OrganizationContract) DefineAuthRule(
    ctx contractapi.TransactionContextInterface,
    orgID string,
    ruleJSON string,
) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()
    org, _ := s._getOrg(ctx, orgID)

    // 1. Authorization: Must be stakeholder or admin
    isStakeholder := false
    for _, id := range org.Stakeholders {
        if id == submitterID {
            isStakeholder = true
            break
        }
    }
    isAdmin, _ := hasRequiredAttribute(ctx, "gxc_role", RoleAdmin)
    if !isStakeholder && !isAdmin {
        return fmt.Errorf("not authorized to define rules")
    }

    // 2. Parse and validate rule
    var newRule Rule
    json.Unmarshal([]byte(ruleJSON), &newRule)

    if newRule.RequiredApprovers <= 0 {
        return fmt.Errorf("requiredApprovers must be > 0")
    }
    if newRule.RequiredApprovers > len(newRule.ApproverGroup) {
        return fmt.Errorf("requiredApprovers exceeds group size")
    }

    // 3. Validate all approvers are stakeholders
    for _, approver := range newRule.ApproverGroup {
        valid := false
        for _, id := range org.Stakeholders {
            if id == approver {
                valid = true
                break
            }
        }
        if !valid {
            return fmt.Errorf("approver %s not a stakeholder", approver)
        }
    }

    // 4. Add rule to organization
    org.Rules = append(org.Rules, newRule)

    ctx.GetStub().PutState(orgID, updatedOrgJSON)
    return nil
}
```

---

## Part 4: Pending Transaction Workflow

### PendingTransaction Structure

```go
// organization_types.go

type PendingTransaction struct {
    DocType           string          `json:"docType"`           // "pendingTx"
    TxID              string          `json:"txID"`              // Unique transaction ID
    OrgID             string          `json:"orgID"`             // Owning organization
    ToID              string          `json:"toID"`              // Recipient
    Amount            uint64          `json:"amount"`            // Transaction amount
    Remark            string          `json:"remark"`            // Description
    Status            string          `json:"status"`            // Pending/Executed/Rejected
    RequiredApprovals int             `json:"requiredApprovals"` // Threshold from rule
    ApproverGroup     []string        `json:"approverGroup"`     // Eligible approvers
    Approvals         map[string]bool `json:"approvals"`         // Who has approved
}
```

### Transaction Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MULTI-SIG TRANSACTION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: Stakeholder initiates transaction                                 │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ InitiateMultiSigTx(orgID, toID, amount=50000, remark)       │           │
│  │                                                              │           │
│  │ → Amount (50,000) triggers Rule 3 (threshold: 10,000)       │           │
│  │ → Creates PendingTransaction with status="Pending"           │           │
│  │ → Initiator automatically approves                          │           │
│  │ → Returns: pendingTxID                                       │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Step 2: Approvers review and approve                                      │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ CFO: ApproveMultiSigTx(pendingTxID)                         │           │
│  │ → Approvals: { CEO: true, CFO: true }                       │           │
│  │ → Approval count: 2 of 3 required                           │           │
│  │ → Status remains "Pending"                                   │           │
│  │                                                              │           │
│  │ COO: ApproveMultiSigTx(pendingTxID)                         │           │
│  │ → Approvals: { CEO: true, CFO: true, COO: true }            │           │
│  │ → Approval count: 3 of 3 required ✓                         │           │
│  │ → THRESHOLD MET!                                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Step 3: Automatic execution                                               │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ → Status = "Executing"                                       │           │
│  │ → Cross-contract call: TransferFromOrganization()           │           │
│  │ → If success: Status = "Executed", emit OrgTxExecuted       │           │
│  │ → If failure: Status = "ExecutionFailed"                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### InitiateMultiSigTx Implementation

```go
// organization_contract.go

func (s *OrganizationContract) InitiateMultiSigTx(
    ctx contractapi.TransactionContextInterface,
    orgID string,
    toID string,
    amount uint64,
    remark string,
) (string, error) {
    submitterID, _ := ctx.GetClientIdentity().GetID()
    org, _ := s._getOrg(ctx, orgID)

    // 1. Verify submitter is a stakeholder
    isStakeholder := false
    for _, id := range org.Stakeholders {
        if id == submitterID {
            isStakeholder = true
            break
        }
    }
    if !isStakeholder {
        return "", fmt.Errorf("not a stakeholder")
    }

    // 2. Find applicable rule based on amount
    var applicableRule *Rule
    for _, rule := range org.Rules {
        if amount > rule.AmountThreshold {
            applicableRule = &rule
            break
        }
    }
    if applicableRule == nil {
        return "", fmt.Errorf("no multi-sig rule applies")
    }

    // 3. Create pending transaction
    pendingTxID := "PENDING_TX_" + generateUUID()
    approvalsMap := make(map[string]bool)
    approvalsMap[submitterID] = true  // Initiator auto-approves

    pendingTx := PendingTransaction{
        DocType:           PendingTxDocType,
        TxID:              pendingTxID,
        OrgID:             orgID,
        ToID:              toID,
        Amount:            amount,
        Remark:            remark,
        Status:            "Pending",
        RequiredApprovals: applicableRule.RequiredApprovers,
        ApproverGroup:     applicableRule.ApproverGroup,
        Approvals:         approvalsMap,
    }

    ctx.GetStub().PutState(pendingTxID, pendingTxJSON)
    return pendingTxID, nil
}
```

### ApproveMultiSigTx Implementation

```go
// organization_contract.go

func (s *OrganizationContract) ApproveMultiSigTx(
    ctx contractapi.TransactionContextInterface,
    pendingTxID string,
) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()

    // 1. Load pending transaction
    pendingTxJSON, _ := ctx.GetStub().GetState(pendingTxID)
    var pendingTx PendingTransaction
    json.Unmarshal(pendingTxJSON, &pendingTx)

    // 2. Validate organization is still verified
    org, _ := s._getOrg(ctx, pendingTx.OrgID)
    if org.Status != "Verified" {
        return fmt.Errorf("organization not verified")
    }

    // 3. Verify submitter is in approver group
    isApprover := false
    for _, id := range pendingTx.ApproverGroup {
        if id == submitterID {
            isApprover = true
            break
        }
    }
    if !isApprover {
        return fmt.Errorf("not in approver group")
    }

    // 4. Check not already approved
    if pendingTx.Approvals[submitterID] {
        return fmt.Errorf("already approved")
    }

    // 5. Record approval
    pendingTx.Approvals[submitterID] = true
    emitEvent(ctx, OrgTxApprovedEventName, ...)

    // 6. Count approvals
    approvalCount := 0
    for _, approved := range pendingTx.Approvals {
        if approved {
            approvalCount++
        }
    }

    // 7. Execute if threshold met
    if approvalCount >= pendingTx.RequiredApprovals {
        pendingTx.Status = "Executing"

        // Cross-contract call to execute transfer
        invokeArgs := [][]byte{
            []byte("TransferFromOrganization"),
            []byte(pendingTx.OrgID),
            []byte(pendingTx.ToID),
            []byte(strconv.FormatUint(pendingTx.Amount, 10)),
            []byte(pendingTx.Remark),
            []byte(pendingTx.TxID),
        }
        response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

        if response.Status >= 400 {
            pendingTx.Status = "ExecutionFailed"
            emitEvent(ctx, OrgTxExecutionFailedEventName, ...)
            return fmt.Errorf("execution failed: %s", response.Message)
        }

        pendingTx.Status = "Executed"
        emitEvent(ctx, OrgTxExecutedEventName, ...)
    }

    ctx.GetStub().PutState(pendingTxID, updatedPendingTxJSON)
    return nil
}
```

---

## Part 5: Government Treasury

### Special Case: Country Treasury

Government treasuries are a special type of organization:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     GOVERNMENT TREASURY SETUP                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Characteristics:                                                           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Type: GOVERNMENT                                           │           │
│  │ • Created by: Admin only (not regular users)                │           │
│  │ • Stakeholders: Ministry officials (with User IDs)          │           │
│  │ • Receives: Government allocation from genesis distribution │           │
│  │ • Subject to: Velocity tax (like all organizations)         │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Account ID Format: treasury_{countryCode}                                 │
│  Example: treasury_NG (Nigeria), treasury_GH (Ghana)                       │
│                                                                             │
│  Genesis Distribution Flow:                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ 1. Admin creates treasury organization                      │           │
│  │ 2. Ministry officials endorse membership                    │           │
│  │ 3. Admin activates treasury                                  │           │
│  │ 4. DistributeGenesis transfers govt allocation to treasury  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Treasury Account Activation

```go
// admin_contract.go

func (s *AdminContract) ActivateTreasuryAccount(
    ctx contractapi.TransactionContextInterface,
    countryCode string,
) error {
    // Authorization: Only admin
    if err := requireRole(ctx, RoleAdmin); err != nil {
        return err
    }

    treasuryID := fmt.Sprintf("treasury_%s", countryCode)
    account, _ := ctx.GetStub().GetState(treasuryID)

    // Validate status
    if account.Status != "Locked" {
        return fmt.Errorf("treasury not locked")
    }

    // Activate
    account.Status = "Active"
    ctx.GetStub().PutState(treasuryID, updatedAccountJSON)

    emitEvent(ctx, TreasuryAccountActivatedEvent, ...)
    return nil
}
```

---

## Part 6: Event Emission

### Multi-Sig Events

```go
// consts.go

const (
    OrgTxApprovedEventName        = "OrgTxApproved"
    OrgTxExecutedEventName        = "OrgTxExecuted"
    OrgTxExecutionFailedEventName = "OrgTxExecutionFailed"
)
```

### Event Payloads

```typescript
// OrgTxApproved
{
    pendingTxID: "PENDING_TX_abc123",
    orgID: "acme-corp",
    approverID: "user-cfo-456"
}

// OrgTxExecuted
{
    pendingTxID: "PENDING_TX_abc123",
    orgID: "acme-corp",
    toID: "vendor-xyz",
    amount: 50000
}

// OrgTxExecutionFailed
{
    pendingTxID: "PENDING_TX_abc123",
    orgID: "acme-corp",
    error: "insufficient balance"
}
```

---

## Part 7: Backend Integration

### Creating Organization via Backend

```typescript
// Service layer
async function createOrganization(dto: CreateOrgDTO) {
    // 1. Create outbox command for ProposeOrganization
    await prisma.outboxCommand.create({
        data: {
            aggregateId: dto.orgId,
            commandType: 'PROPOSE_ORGANIZATION',
            payload: {
                orgID: dto.orgId,
                orgName: dto.name,
                orgType: dto.type,
                stakeholderIDs: dto.stakeholders
            }
        }
    });

    // 2. Outbox-submitter will call chaincode
}
```

### Tracking Pending Transactions

```typescript
// Projector handling OrgTxApproved
async function handleOrgTxApproved(event: OrgTxApprovedEvent) {
    await prisma.pendingTransaction.update({
        where: { txId: event.pendingTxID },
        data: {
            approvals: {
                push: event.approverID
            },
            lastApprovedAt: new Date()
        }
    });

    // Notify remaining approvers
    await notificationService.sendApprovalRequest(
        event.orgID,
        event.pendingTxID
    );
}
```

---

## Part 8: Security Considerations

### Authorization Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-SIG SECURITY LAYERS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: Organization Membership                                          │
│  ├── Only stakeholders can initiate transactions                          │
│  ├── Stakeholders verified via cross-contract UserExists call             │
│  └── Organization must be in "Verified" status                            │
│                                                                             │
│  Layer 2: Rule Validation                                                  │
│  ├── Transaction amount determines applicable rule                        │
│  ├── Approver group is subset of stakeholders                             │
│  └── RequiredApprovers <= ApproverGroup size                              │
│                                                                             │
│  Layer 3: Approval Authorization                                           │
│  ├── Only approvers in rule's ApproverGroup can approve                   │
│  ├── Double approval by same user prevented                               │
│  └── Approval count verified before execution                             │
│                                                                             │
│  Layer 4: Execution Security                                               │
│  ├── Cross-contract call to TokenomicsContract                           │
│  ├── Balance verification at transfer time                                │
│  └── Atomic transaction with rollback on failure                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Common Attack Vectors

| Attack | Prevention |
|--------|------------|
| Fake stakeholder | Cross-contract UserExists check |
| Double approval | Approval map tracks per-user status |
| Rule bypass | Amount threshold strictly enforced |
| Unauthorized execution | Approval count checked before transfer |
| Replay attack | Unique pendingTxID, status transitions |

---

## Part 9: Complete Example Flow

### Scenario: Business Payment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│          ACME CORP PAYS VENDOR XYZ 50,000 COINS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Organization: ACME Corp (orgID: "acme-corp")                              │
│  Stakeholders: [Alice (CEO), Bob (CFO), Carol (COO)]                       │
│  Rule: Transactions > 10,000 require 2 of 3 approvals                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  1. Alice initiates transaction:                                           │
│     InitiateMultiSigTx("acme-corp", "vendor-xyz", 50000, "Q4 supplies")   │
│                                                                             │
│     Result:                                                                 │
│     - pendingTxID = "PENDING_TX_abc123"                                    │
│     - Approvals = { alice: true }                                          │
│     - Status = "Pending"                                                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  2. Bob reviews and approves:                                              │
│     ApproveMultiSigTx("PENDING_TX_abc123")                                 │
│                                                                             │
│     Result:                                                                 │
│     - Approvals = { alice: true, bob: true }                               │
│     - Approval count: 2 >= Required: 2 ✓                                   │
│     - Status = "Executing" → "Executed"                                    │
│     - 50,000 coins transferred from acme-corp to vendor-xyz               │
│     - Event: OrgTxExecuted emitted                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Exercises

### Exercise 1: Design Authorization Rules

Design multi-sig rules for a charity (NGO) with:
- 5 board members
- Executive Director, Treasurer, Secretary, 2 general members
- Small grants (< 5,000): Treasurer alone
- Medium grants (5,000 - 50,000): Treasurer + 1 board member
- Large grants (> 50,000): 3 of 5 board members including Executive Director

### Exercise 2: State Transitions

Trace the state transitions when:
1. Organization is proposed with 4 stakeholders
2. 3 stakeholders endorse
3. Activation is attempted
4. 4th stakeholder endorses
5. Activation succeeds

### Exercise 3: Edge Cases

Analyze these scenarios:
1. Approver leaves organization mid-transaction
2. Rule is modified while transaction is pending
3. Organization is locked before transaction executes

---

## Summary

### Key Concepts

1. **Organization Types**: BUSINESS, NGO, GOVERNMENT
2. **Lifecycle**: PendingEndorsement → Verified → (Locked)
3. **Stakeholder Endorsement**: All must approve before activation
4. **Authorization Rules**: Amount-based, configurable M-of-N
5. **Pending Transactions**: Collect approvals, auto-execute
6. **Cross-Contract Execution**: TokenomicsContract handles transfers

### Function Reference

| Function | Purpose |
|----------|---------|
| ProposeOrganization | Create organization in pending state |
| EndorseMembership | Stakeholder approval of membership |
| ActivateOrganization | Finalize organization creation |
| DefineAuthRule | Configure multi-sig rules |
| InitiateMultiSigTx | Start pending transaction |
| ApproveMultiSigTx | Cast approval vote |
| GetOrganization | Query organization details |

### Production Checklist

- [ ] All stakeholders are verified users
- [ ] Rules cover all transaction amount ranges
- [ ] Approver groups are properly sized
- [ ] Government treasuries created by admins
- [ ] Event handlers update read models
- [ ] Notification system alerts pending approvers

---

## Further Reading

- Organization Contract: `/gx-coin-fabric/chaincode/organization_contract.go`
- Organization Types: `/gx-coin-fabric/chaincode/organization_types.go`
- Related: LECTURE-12 on ABAC (authorization)
- Related: LECTURE-13 on Genesis Distribution (treasury allocation)
