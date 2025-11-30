# LECTURE 18: Testing Strategies - Unit, Integration, and End-to-End

## Overview

This lecture covers the comprehensive testing strategies employed across the GX Protocol, spanning both the Hyperledger Fabric chaincode (Go) and the backend microservices (TypeScript/Node.js). Testing is critical for financial infrastructure where bugs can result in lost funds or security breaches.

**Prerequisites:**
- LECTURE-11: Smart Contract Architecture
- LECTURE-17: User Identity & KYC Verification
- Understanding of Go and TypeScript
- Basic knowledge of mocking and test doubles

---

## Learning Objectives

By the end of this lecture, you will be able to:
1. Write unit tests for Hyperledger Fabric chaincode using mocks
2. Understand the mock-based testing pattern for blockchain contracts
3. Design integration tests that verify cross-contract communication
4. Create end-to-end tests that validate the full CQRS workflow
5. Implement test fixtures and helpers for consistent test data

---

## Section 1: The Testing Pyramid in Blockchain Systems

### 1.1 Testing Pyramid Overview

```
                    ┌─────────┐
                    │   E2E   │  ← Slow, Expensive, High Confidence
                    │  Tests  │     Test full system behavior
                    ├─────────┤
                    │ Integra-│  ← Medium Speed, Medium Cost
                    │  tion   │     Test component interactions
                    │  Tests  │
                    ├─────────┤
                    │  Unit   │  ← Fast, Cheap, Low-Level
                    │  Tests  │     Test individual functions
                    └─────────┘
```

**GX Protocol Testing Distribution:**
- **Unit Tests (70%)**: Chaincode functions with mocked context
- **Integration Tests (20%)**: Cross-contract calls, backend-to-fabric
- **E2E Tests (10%)**: Full workflow validation on live network

### 1.2 Why Testing Financial Infrastructure is Different

```
┌─────────────────────────────────────────────────────────────────┐
│                  FINANCIAL SYSTEM RISKS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. IRREVERSIBILITY                                             │
│     • Blockchain transactions cannot be undone                  │
│     • A bug can permanently lose or create funds                │
│                                                                 │
│  2. CONCURRENCY                                                 │
│     • Multiple users transacting simultaneously                 │
│     • Race conditions can cause double-spending                 │
│                                                                 │
│  3. STATE CONSISTENCY                                           │
│     • Balances must always sum correctly                        │
│     • Partial failures must be handled atomically               │
│                                                                 │
│  4. SECURITY                                                    │
│     • Access control must be bulletproof                        │
│     • Edge cases exploited by attackers                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 2: Chaincode Unit Testing with Mocks

### 2.1 The Mock Architecture

Hyperledger Fabric provides interfaces that we mock for testing. The key interfaces are:

```go
// From gx-coin-fabric/chaincode/identity_contract_test.go

// MockTransactionContext mocks the transaction context.
//
// Teaching Moment: What is a Transaction Context?
// In Hyperledger Fabric, every smart contract function receives a "context" object.
// This context contains information about:
// - Who called the function (the client's identity)
// - When the transaction was submitted (timestamp)
// - Access to the ledger (via the stub)
//
// For testing, we create a "fake" context that we can control completely.
type MockTransactionContext struct {
    contractapi.TransactionContext
    mock.Mock
}
```

**The Mock Hierarchy:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOCK ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────────┐                                      │
│   │ MockTransactionContext│ ← Mocks who is calling              │
│   └──────────┬───────────┘                                      │
│              │                                                  │
│              ▼                                                  │
│   ┌──────────────────────┐                                      │
│   │     MockStub         │ ← Mocks blockchain state             │
│   └──────────┬───────────┘                                      │
│              │                                                  │
│              ├──► GetState()    - Read from ledger              │
│              ├──► PutState()    - Write to ledger               │
│              ├──► SetEvent()    - Emit blockchain events        │
│              ├──► GetQueryResult() - Rich queries               │
│              └──► InvokeChaincode() - Cross-contract calls      │
│                                                                 │
│   ┌──────────────────────┐                                      │
│   │  MockClientIdentity  │ ← Mocks caller's X.509 certificate   │
│   └──────────────────────┘                                      │
│              │                                                  │
│              ├──► GetID()             - User identifier         │
│              ├──► GetMSPID()          - Organization MSP        │
│              └──► GetAttributeValue() - ABAC role checks        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 MockStub Implementation

```go
// From gx-coin-fabric/chaincode/identity_contract_test.go

// MockStub mocks the chaincode stub.
//
// Teaching Moment: The Stub is Your Database Interface
// The ChaincodeStub is essentially your database interface. In production:
// - GetState reads from the blockchain's world state database
// - PutState writes to the blockchain's world state database
// - These operations are atomic and consistent across the network
//
// In tests, we mock these operations so we can:
// - Control what data exists (for testing different scenarios)
// - Verify that our code writes the correct data
// - Test without needing a real blockchain network
type MockStub struct {
    shim.ChaincodeStub
    mock.Mock
    EmittedEvents []EmittedEvent  // Capture events for assertions
}

// EmittedEvent captures event data for assertions in tests.
type EmittedEvent struct {
    Name    string
    Payload []byte
}

// GetState mocks the GetState function.
func (m *MockStub) GetState(key string) ([]byte, error) {
    args := m.Called(key)
    return args.Get(0).([]byte), args.Error(1)
}

// PutState mocks the PutState function.
func (m *MockStub) PutState(key string, value []byte) error {
    args := m.Called(key, value)
    return args.Error(0)
}

// SetEvent captures emitted events for test assertions.
func (m *MockStub) SetEvent(name string, payload []byte) error {
    m.EmittedEvents = append(m.EmittedEvents, EmittedEvent{Name: name, Payload: payload})
    return nil
}
```

### 2.3 MockClientIdentity for ABAC Testing

```go
// From gx-coin-fabric/chaincode/identity_contract_test.go

// MockClientIdentity mocks the client identity for testing purposes.
type MockClientIdentity struct {
    mock.Mock
    ID    string            // The mock user ID
    Attrs map[string]string // Optional attributes for role-based tests
}

// GetID returns the mock user identifier.
func (m *MockClientIdentity) GetID() (string, error) {
    return m.ID, nil
}

// GetAttributeValue returns mock certificate attributes.
// This is critical for testing ABAC (Attribute-Based Access Control).
func (m *MockClientIdentity) GetAttributeValue(attrName string) (value string, found bool, err error) {
    if m.Attrs != nil {
        if v, ok := m.Attrs[attrName]; ok {
            return v, true, nil
        }
    }
    return "", false, nil
}
```

**Testing Different Roles:**

```go
// Super Admin - can bootstrap system, pause/resume
superAdmin := &MockClientIdentity{
    ID:    "super-admin-001",
    Attrs: map[string]string{"gxc_role": "gx_super_admin"},
}

// Regular Admin - can manage organizations
admin := &MockClientIdentity{
    ID:    "admin-001",
    Attrs: map[string]string{"gxc_role": "gx_admin"},
}

// Partner API - can submit transactions
partnerAPI := &MockClientIdentity{
    ID:    "backend-api",
    Attrs: map[string]string{"gxc_role": "gx_partner_api"},
}

// Regular User - no special attributes
regularUser := &MockClientIdentity{
    ID: "user-001",
    // No Attrs means no special roles
}
```

---

## Section 3: Writing Unit Tests for Chaincode

### 3.1 The Arrange-Act-Assert Pattern

Every unit test follows the AAA pattern:

```go
// From gx-coin-fabric/chaincode/identity_contract_test.go

func TestCreateUser(t *testing.T) {
    // ARRANGE: Set up our test environment
    contract := new(IdentityContract)  // The contract we're testing
    ctx := new(MockTransactionContext) // Fake transaction context
    stub := new(MockStub)              // Fake blockchain stub

    // Link the mock context to the mock stub
    ctx.On("GetStub").Return(stub)

    // Test data
    userID := "test-user-001"

    t.Run("Success - Create a new user", func(t *testing.T) {
        // ARRANGE: Set up mock expectations

        // Mock country stats check (nationality validation)
        countryStats := CountryStats{CountryCode: "LK"}
        countryStatsJSON, _ := json.Marshal(countryStats)
        stub.On("GetState", "stats_LK").Return(countryStatsJSON, nil).Once()

        // User doesn't exist yet
        stub.On("GetState", userID).Return([]byte(nil), nil).Once()

        // Expect user to be saved
        stub.On("PutState", userID, mock.AnythingOfType("[]uint8")).Return(nil).Once()

        // ACT: Call the function we're testing
        err := contract.CreateUser(ctx, userID,
            "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
            "LK", 25)

        // ASSERT: Verify the results
        assert.NoError(t, err)
    })

    t.Run("Failure - User already exists", func(t *testing.T) {
        // ARRANGE
        countryStats := CountryStats{CountryCode: "LK"}
        countryStatsJSON, _ := json.Marshal(countryStats)
        stub.On("GetState", "stats_LK").Return(countryStatsJSON, nil).Once()

        // User already exists
        existingUser := User{UserID: userID}
        userJSON, _ := json.Marshal(existingUser)
        stub.On("GetState", userID).Return(userJSON, nil).Once()

        // ACT
        err := contract.CreateUser(ctx, userID,
            "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
            "LK", 25)

        // ASSERT
        assert.Error(t, err)
        assert.Contains(t, err.Error(), "already exists")
    })
}
```

### 3.2 Testing Idempotency

Idempotency is critical in financial systems - operations should be safe to retry:

```go
// From gx-coin-fabric/chaincode/tokenomics_idempotency_test.go

// Ensures DistributeGenesis is idempotent using the GenesisMinted flag.
func TestDistributeGenesis_IsIdempotent_WithGenesisMintedFlag(t *testing.T) {
    contract := new(TokenomicsContract)
    ctx := new(MockTransactionContext)
    stub := new(MockStub)
    ctx.On("GetStub").Return(stub)

    // Admin identity with required role
    mci := &MockClientIdentity{ID: "admin-1", Attrs: map[string]string{"gxc_role": RoleAdmin}}
    ctx.On("GetClientIdentity").Return(mci).Maybe()

    userID := "user-flag"
    nationality := "NG"

    // User already received genesis mint
    user := User{UserID: userID, Nationality: nationality, GenesisMinted: true}
    userJSON, _ := json.Marshal(user)
    stub.On("GetState", userID).Return(userJSON, nil).Once()

    // ACT - Try to mint again
    err := contract.DistributeGenesis(ctx, userID, nationality)

    // ASSERT - Should fail with clear message
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "already received genesis mint")
}
```

### 3.3 Testing Cross-Contract Calls

Testing interactions between contracts requires mocking `InvokeChaincode`:

```go
// From gx-coin-fabric/chaincode/organization_contract_test.go

func TestApproveMultiSigTx_ExecutesTransferFromOrganization(t *testing.T) {
    orgContract := new(OrganizationContract)
    ctx := new(MockTransactionContext)
    stub := new(MockStub)
    ctx.On("GetStub").Return(stub)

    // Set up pending transaction
    pending := PendingTransaction{
        DocType:           PendingTxDocType,
        TxID:              "PENDING_TX_123",
        OrgID:             "org-1",
        ToID:              "user-9",
        Amount:            100,
        RequiredApprovals: 2,
        ApproverGroup:     []string{"approver-a", "approver-b"},
        Approvals:         map[string]bool{"approver-a": true}, // First approval done
    }
    pendingJSON, _ := json.Marshal(pending)

    // Approver B submits the final approval
    ctx.On("GetClientIdentity").Return(&MockClientIdentity{ID: "approver-b"}, nil).Once()
    stub.On("GetState", "PENDING_TX_123").Return(pendingJSON, nil).Once()

    // Mock the organization lookup
    org := Organization{DocType: OrgDocType, OrgID: pending.OrgID, Status: "Verified"}
    orgJSON, _ := json.Marshal(org)
    stub.On("GetState", pending.OrgID).Return(orgJSON, nil).Once()
    stub.On("GetChannelID").Return("test-channel")

    // CRITICAL: Mock the cross-contract call to TokenomicsContract
    stub.On("InvokeChaincode", "gxtv3", mock.MatchedBy(func(args [][]byte) bool {
        return len(args) == 6 &&
               string(args[0]) == "TransferFromOrganization" &&
               string(args[1]) == pending.OrgID &&
               string(args[2]) == pending.ToID
    }), "test-channel").Return(peerproto.Response{Status: 200, Payload: []byte("ok")}).Once()

    // Expect status update after execution
    stub.On("PutState", "PENDING_TX_123", mock.Anything).Return(nil).Once()

    // ACT
    err := orgContract.ApproveMultiSigTx(ctx, "PENDING_TX_123")

    // ASSERT
    assert.NoError(t, err)
}
```

### 3.4 Testing Event Emission

Events are crucial for backend projections - we must verify they're emitted:

```go
// From gx-coin-fabric/chaincode/identity_contract_test.go

func TestRelationshipFlow(t *testing.T) {
    contract := new(IdentityContract)
    ctx := new(MockTransactionContext)
    stub := new(MockStub)
    ctx.On("GetStub").Return(stub)

    aliceID := "alice-001"
    bobID := "bob-002"
    relationshipID := fmt.Sprintf("%s:FRIEND_OF:%s", aliceID, bobID)

    t.Run("Success - Requesting a relationship", func(t *testing.T) {
        // ... setup mocks ...

        _, err := contract.RequestRelationship(ctx, aliceID, bobID, "FRIEND_OF")
        assert.NoError(t, err)

        // ASSERT: Verify event was emitted
        found := false
        for _, ev := range stub.EmittedEvents {
            if ev.Name == RelationshipRequestedEventName {
                var payload map[string]interface{}
                _ = json.Unmarshal(ev.Payload, &payload)
                assert.Equal(t, relationshipID, payload["relationshipID"])
                assert.Equal(t, "PendingConfirmation", payload["status"])
                found = true
                break
            }
        }
        assert.True(t, found, "expected RelationshipRequested event to be emitted")
    })
}
```

---

## Section 4: Testing Access Control (ABAC)

### 4.1 Testing Role Requirements

```go
// From gx-coin-fabric/chaincode/governance_contract_test.go

func TestSubmitProposal(t *testing.T) {
    t.Run("Failure - Non-admin user", func(t *testing.T) {
        contract := new(GovernanceContract)
        ctx := new(MockTransactionContext)
        stub := new(MockStub)
        ctx.On("GetStub").Return(stub)

        // Mock non-admin user (no gxc_role attribute)
        clientID := &NonAdminClientIdentity{
            ID: "regular-user-001",
        }
        ctx.On("GetClientIdentity").Return(clientID, nil)

        // ACT - Try to submit proposal without admin role
        _, err := contract.SubmitProposal(ctx, "targetParam", "newValue")

        // ASSERT
        assert.Error(t, err)
        assert.Contains(t, err.Error(), "does not have the required role")
    })
}
```

### 4.2 NonAdminClientIdentity for Negative Tests

```go
// NonAdminClientIdentity properly fails authorization checks
type NonAdminClientIdentity struct {
    mock.Mock
    ID string
}

func (m *NonAdminClientIdentity) GetID() (string, error) {
    return m.ID, nil
}

func (m *NonAdminClientIdentity) GetAttributeValue(attrName string) (value string, found bool, err error) {
    // Always return not found - simulates user without any roles
    return "", false, nil
}

func (m *NonAdminClientIdentity) GetMSPID() (string, error) {
    return "TestMSP", nil
}
```

---

## Section 5: Testing Complex Workflows

### 5.1 Testing Multi-Step Processes

The governance contract has a multi-step workflow: Submit → Vote → Execute

```go
// From gx-coin-fabric/chaincode/governance_contract_test.go

func TestVoteOnProposal(t *testing.T) {
    proposalID := "PROP_test_001"
    voterID := "voter-001"

    // Create active proposal with valid end time
    proposal := Proposal{
        DocType:      ProposalDocType,
        ProposalID:   proposalID,
        TargetParam:  "hoardingTaxRateBps",
        NewValue:     "400",
        ProposerID:   "admin-001",
        Status:       "Active",
        ForVotes:     0,
        AgainstVotes: 0,
        EndTime:      time.Now().UTC().Add(24 * time.Hour), // Still active
    }
    proposalJSON, _ := json.Marshal(proposal)

    t.Run("Success - Vote for proposal", func(t *testing.T) {
        contract := new(GovernanceContract)
        ctx := new(MockTransactionContext)
        stub := new(MockStub)
        ctx.On("GetStub").Return(stub)

        clientID := &MockClientIdentity{ID: voterID}
        ctx.On("GetClientIdentity").Return(clientID, nil)

        // Proposal exists
        stub.On("GetState", proposalID).Return(proposalJSON, nil).Once()

        // No previous vote (prevents double voting)
        voteKey := fmt.Sprintf("vote_%s_%s", proposalID, voterID)
        stub.On("GetState", voteKey).Return([]byte(nil), nil).Once()

        // Save updated proposal and vote receipt
        stub.On("PutState", proposalID, mock.AnythingOfType("[]uint8")).Return(nil).Once()
        stub.On("PutState", voteKey, []byte("voted")).Return(nil).Once()

        // ACT
        err := contract.VoteOnProposal(ctx, proposalID, true)

        // ASSERT
        assert.NoError(t, err)
    })

    t.Run("Failure - Already voted", func(t *testing.T) {
        contract := new(GovernanceContract)
        ctx := new(MockTransactionContext)
        stub := new(MockStub)
        ctx.On("GetStub").Return(stub)

        clientID := &MockClientIdentity{ID: voterID}
        ctx.On("GetClientIdentity").Return(clientID, nil)

        stub.On("GetState", proposalID).Return(proposalJSON, nil).Once()

        // Vote receipt already exists
        voteKey := fmt.Sprintf("vote_%s_%s", proposalID, voterID)
        stub.On("GetState", voteKey).Return([]byte("voted"), nil).Once()

        // ACT
        err := contract.VoteOnProposal(ctx, proposalID, true)

        // ASSERT
        assert.Error(t, err)
        assert.Contains(t, err.Error(), "already voted")
    })
}
```

### 5.2 Testing Time-Based Logic

```go
func TestExecuteProposal(t *testing.T) {
    t.Run("Failure - Voting period not ended", func(t *testing.T) {
        contract := new(GovernanceContract)
        ctx := new(MockTransactionContext)
        stub := new(MockStub)
        ctx.On("GetStub").Return(stub)

        // Proposal with future end time
        proposal := Proposal{
            ProposalID:   "PROP_001",
            Status:       "Active",
            ForVotes:     10,
            AgainstVotes: 3,
            EndTime:      time.Now().UTC().Add(24 * time.Hour), // Still active!
        }
        proposalJSON, _ := json.Marshal(proposal)

        clientID := &MockClientIdentity{
            ID:    "admin-001",
            Attrs: map[string]string{"gxc_role": RoleAdmin},
        }
        ctx.On("GetClientIdentity").Return(clientID, nil)
        stub.On("GetState", "PROP_001").Return(proposalJSON, nil).Once()

        // ACT
        err := contract.ExecuteProposal(ctx, "PROP_001")

        // ASSERT
        assert.Error(t, err)
        assert.Contains(t, err.Error(), "has not yet ended")
    })
}
```

---

## Section 6: Running Chaincode Tests

### 6.1 Command Reference

```bash
# Navigate to chaincode directory
cd gx-coin-fabric/chaincode

# Run all tests
go test -v

# Run tests with coverage
go test -v -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

# Run specific test
go test -v -run TestDistributeGenesis_HappyPath

# Run tests matching a pattern
go test -v -run "TestIdentity.*"

# Run tests for a specific contract
go test -v -run "TestGovernance.*"

# Run with race detection (for concurrency bugs)
go test -v -race

# Benchmark tests
go test -bench=. -benchmem
```

### 6.2 Test Organization

```
chaincode/
├── identity_contract_test.go           # Identity tests + mock definitions
├── tokenomics_contract_test.go         # Tokenomics happy path tests
├── tokenomics_idempotency_test.go      # Idempotency tests
├── tokenomics_post_genesis_test.go     # Post-genesis phase tests
├── tokenomics_pause_test.go            # System pause tests
├── tokenomics_org_transfer_insufficient_funds_test.go
├── organization_contract_test.go       # Organization tests
├── organization_contract_failure_test.go
├── organization_define_auth_rule_test.go
├── organization_events_test.go
├── governance_contract_test.go         # Governance tests
├── loan_pool_contract_test.go          # Loan tests
├── tax_and_fee_contract_test.go        # Tax calculation tests
├── admin_bootstrap_test.go             # Bootstrap tests
└── admin_pause_test.go                 # Pause/resume tests
```

---

## Section 7: Integration Testing on Kubernetes

### 7.1 The Manual Testing Guide

For integration testing, we use the comprehensive testing guide:

```
gx-coin-fabric/docs/operations/TESTING_GUIDE.md
```

This guide provides step-by-step commands for testing each contract on a live network.

### 7.2 Integration Test Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 INTEGRATION TEST WORKFLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Admin Contract                                        │
│  ├── GetSystemStatus                                            │
│  ├── InitializeCountryData (USA, CAN)                          │
│  ├── ActivateTreasuryAccount                                    │
│  └── UpdateSystemParameter                                      │
│                                                                 │
│  Phase 2: Identity Contract                                     │
│  ├── CreateUser (Alice, Bob, Charlie)                          │
│  ├── UserExists check                                          │
│  ├── GetMyProfile                                              │
│  ├── RequestRelationship                                       │
│  └── ConfirmRelationship                                       │
│                                                                 │
│  Phase 3: Tokenomics Contract                                   │
│  ├── DistributeGenesis (to all users)                          │
│  ├── GetBalance verification                                   │
│  └── Transfer (Alice → Bob)                                    │
│                                                                 │
│  Phase 4: Organization Contract                                 │
│  ├── ProposeOrganization                                       │
│  ├── EndorseMembership (2 endorsers)                           │
│  ├── ActivateOrganization                                      │
│  ├── DefineAuthRule (2-of-3 multisig)                         │
│  ├── InitiateMultiSigTx                                       │
│  └── ApproveMultiSigTx (triggers execution)                   │
│                                                                 │
│  Phase 5: Loan Pool Contract                                    │
│  ├── ApplyForLoan                                              │
│  ├── ApproveLoan                                               │
│  └── GetMyLoans                                                │
│                                                                 │
│  Phase 6: Governance Contract                                   │
│  ├── SubmitProposal                                            │
│  ├── VoteOnProposal (multiple voters)                          │
│  ├── GetProposalDetails                                        │
│  └── ExecuteProposal                                           │
│                                                                 │
│  Phase 7: Tax and Fee Contract                                  │
│  ├── CalculateTransactionFee                                   │
│  └── TriggerHoardingTaxCycle                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Executing Integration Tests

```bash
# Check network status
kubectl get pods -n fabric

# Check chaincode version
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer lifecycle chaincode querycommitted -C gxchannel -n gxtv3
'

# Execute chaincode query
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer chaincode query \
    -C gxchannel -n gxtv3 \
    -c '"'"'{"function":"Admin:GetSystemStatus","Args":[]}'"'"'
'

# Execute chaincode invoke (requires endorsement from both orgs)
kubectl exec -n fabric peer0-org1-0 -- sh -c '
  export CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp
  peer chaincode invoke \
    -C gxchannel -n gxtv3 \
    --orderer orderer0-org0:7050 --tls \
    --cafile /tmp/orderer-tls-ca.crt \
    --peerAddresses peer0-org1:7051 \
    --tlsRootCertFiles /tmp/peer0-org1-tls-ca.crt \
    --peerAddresses peer0-org2:7051 \
    --tlsRootCertFiles /tmp/peer0-org2-tls-ca.crt \
    -c '"'"'{"function":"Identity:CreateUser","Args":["user-123","biometric-hash","US",25]}'"'"'
'
```

---

## Section 8: Backend Testing Strategies

### 8.1 Backend Test Configuration

```json
// From gx-protocol-backend/package.json

{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check"
  }
}
```

### 8.2 Testing the CQRS Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND TEST FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   API Test (Write Path):                                        │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   HTTP      │ ──► │   Outbox    │ ──► │   Verify    │      │
│   │   Request   │     │   Insert    │     │   Row       │      │
│   └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                 │
│   Worker Test (Processing):                                     │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   Outbox    │ ──► │   Fabric    │ ──► │   Update    │      │
│   │   Poll      │     │   Submit    │     │   Status    │      │
│   └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                 │
│   Projector Test (Read Path):                                   │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   Fabric    │ ──► │   Process   │ ──► │   Update    │      │
│   │   Event     │     │   Event     │     │   Read DB   │      │
│   └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Testing Idempotency Keys

```typescript
// Example test for idempotency middleware
describe('Idempotency Middleware', () => {
  it('should return cached response for duplicate request', async () => {
    const idempotencyKey = 'unique-key-123';
    const payload = { userId: 'user-001', amount: 100 };

    // First request - should process
    const response1 = await request(app)
      .post('/api/v1/transfers')
      .set('X-Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(response1.status).toBe(202);

    // Second request - should return cached
    const response2 = await request(app)
      .post('/api/v1/transfers')
      .set('X-Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(response2.status).toBe(202);
    expect(response2.body).toEqual(response1.body);
  });
});
```

### 8.4 Testing Event Validation

```typescript
import { EventValidator, SchemaRegistry } from '@gx/core-events';

describe('Event Validation', () => {
  it('should validate UserCreated event', () => {
    const validEvent = {
      userId: 'user-123',
      nationality: 'US',
      age: 25,
      timestamp: '2024-01-15T10:30:00Z'
    };

    const isValid = EventValidator.validate('UserCreated', validEvent);
    expect(isValid).toBe(true);
  });

  it('should reject invalid UserCreated event', () => {
    const invalidEvent = {
      userId: 'user-123',
      // Missing required fields: nationality, age, timestamp
    };

    const isValid = EventValidator.validate('UserCreated', invalidEvent);
    expect(isValid).toBe(false);
  });
});
```

---

## Section 9: End-to-End Testing

### 9.1 Full Workflow Test Example

```typescript
describe('E2E: User Registration and Genesis Distribution', () => {
  it('should complete full user onboarding flow', async () => {
    // 1. Create user via API
    const createResponse = await request(app)
      .post('/api/v1/users')
      .set('X-Idempotency-Key', 'create-user-001')
      .send({
        userId: 'e2e-user-001',
        biometricHash: 'abc123...',
        nationality: 'US',
        age: 30
      });

    expect(createResponse.status).toBe(202);

    // 2. Wait for outbox-submitter to process
    await waitForOutboxProcessing('e2e-user-001');

    // 3. Wait for projector to update read model
    await waitForProjection('UserCreated', 'e2e-user-001');

    // 4. Verify user in read model
    const userResponse = await request(app)
      .get('/api/v1/users/e2e-user-001');

    expect(userResponse.status).toBe(200);
    expect(userResponse.body.userId).toBe('e2e-user-001');
    expect(userResponse.body.status).toBe('Verified');

    // 5. Distribute genesis
    const genesisResponse = await request(app)
      .post('/api/v1/tokenomics/distribute-genesis')
      .set('X-Idempotency-Key', 'genesis-e2e-user-001')
      .send({
        userId: 'e2e-user-001',
        nationality: 'US'
      });

    expect(genesisResponse.status).toBe(202);

    // 6. Wait for balance update
    await waitForProjection('GenesisDistributed', 'e2e-user-001');

    // 7. Verify balance
    const balanceResponse = await request(app)
      .get('/api/v1/wallets/e2e-user-001/balance');

    expect(balanceResponse.status).toBe(200);
    expect(balanceResponse.body.balance).toBeGreaterThan(0);
  });
});
```

### 9.2 Helper Functions for E2E Tests

```typescript
// Wait for outbox command to be processed
async function waitForOutboxProcessing(aggregateId: string, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const command = await prisma.outboxCommand.findFirst({
      where: { aggregateId, status: 'COMPLETED' }
    });

    if (command) return command;
    await sleep(500);
  }

  throw new Error(`Outbox processing timeout for ${aggregateId}`);
}

// Wait for event to be projected
async function waitForProjection(eventType: string, entityId: string, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const projectorState = await prisma.projectorState.findFirst({
      where: { lastEventType: eventType }
    });

    if (projectorState) return projectorState;
    await sleep(500);
  }

  throw new Error(`Projection timeout for ${eventType}:${entityId}`);
}
```

---

## Section 10: Security Testing

### 10.1 Access Control Tests

```go
// Test unauthorized access attempts
func TestUnauthorizedAccess(t *testing.T) {
    testCases := []struct {
        name     string
        function string
        role     string
        expected string
    }{
        {
            name:     "Regular user cannot bootstrap",
            function: "BootstrapSystem",
            role:     "",  // No role
            expected: "does not have the required role",
        },
        {
            name:     "Admin cannot bootstrap (needs super_admin)",
            function: "BootstrapSystem",
            role:     "gx_admin",
            expected: "does not have the required role",
        },
        {
            name:     "Regular user cannot pause system",
            function: "PauseSystem",
            role:     "",
            expected: "does not have the required role",
        },
    }

    for _, tc := range testCases {
        t.Run(tc.name, func(t *testing.T) {
            // Setup with the specified role
            ctx, stub := setupMockContext(tc.role)

            // Attempt the operation
            err := executeFunction(ctx, tc.function)

            // Verify unauthorized
            assert.Error(t, err)
            assert.Contains(t, err.Error(), tc.expected)
        })
    }
}
```

### 10.2 Input Validation Tests

```go
func TestInputValidation(t *testing.T) {
    testCases := []struct {
        name     string
        userID   string
        biometric string
        nation   string
        age      int
        expected string
    }{
        {
            name:     "Empty user ID",
            userID:   "",
            biometric: "valid-hash",
            nation:   "US",
            age:      25,
            expected: "userID cannot be empty",
        },
        {
            name:     "Invalid nationality",
            userID:   "user-001",
            biometric: "valid-hash",
            nation:   "INVALID",
            age:      25,
            expected: "country not initialized",
        },
        {
            name:     "Age below minimum",
            userID:   "user-001",
            biometric: "valid-hash",
            nation:   "US",
            age:      17,
            expected: "must be at least 18",
        },
    }

    for _, tc := range testCases {
        t.Run(tc.name, func(t *testing.T) {
            contract := new(IdentityContract)
            ctx, stub := setupMockContext("gx_admin")

            // Setup country stats for valid nationalities
            if tc.nation == "US" {
                setupCountryStats(stub, "US")
            }

            err := contract.CreateUser(ctx, tc.userID, tc.biometric, tc.nation, tc.age)

            assert.Error(t, err)
            assert.Contains(t, err.Error(), tc.expected)
        })
    }
}
```

---

## Section 11: Exercises

### Exercise 1: Write a Unit Test for Loan Application

Create a test for the `ApplyForLoan` function that verifies:
1. User must exist and be verified
2. User cannot have an existing active loan
3. Loan amount must be within limits
4. Event is emitted correctly

### Exercise 2: Test Double-Voting Prevention

Write a test that verifies users cannot vote twice on the same proposal:
1. First vote should succeed
2. Second vote should fail with appropriate error

### Exercise 3: Create an Integration Test Script

Write a shell script that executes the following workflow on a live network:
1. Create a new user
2. Distribute genesis
3. Verify balance
4. Transfer funds to another user
5. Verify both balances after transfer

### Exercise 4: Test Race Conditions

Design a test that simulates concurrent transfers from the same account and verifies:
1. Balance never goes negative
2. All transactions are either completed or rejected
3. Final balance is consistent

---

## Section 12: Production Checklist

### Test Coverage Requirements

- [ ] **Unit Tests**: >80% coverage for all contracts
- [ ] **Happy Path Tests**: All 38 chaincode functions have success tests
- [ ] **Failure Tests**: All error conditions have negative tests
- [ ] **ABAC Tests**: All role requirements are tested
- [ ] **Idempotency Tests**: All state-changing operations are idempotent
- [ ] **Event Tests**: All events are captured and validated
- [ ] **Integration Tests**: Full workflow tested on testnet
- [ ] **E2E Tests**: Critical paths tested with real network latency

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
name: Test Chaincode
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - name: Run tests
        run: |
          cd gx-coin-fabric/chaincode
          go test -v -coverprofile=coverage.out
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./gx-coin-fabric/chaincode/coverage.out
```

---

## Summary

In this lecture, we covered:

1. **Testing Pyramid**: Unit → Integration → E2E distribution
2. **Mock Architecture**: MockTransactionContext, MockStub, MockClientIdentity
3. **AAA Pattern**: Arrange-Act-Assert for structured tests
4. **ABAC Testing**: Verifying role-based access control
5. **Event Testing**: Capturing and asserting on emitted events
6. **Cross-Contract Testing**: Mocking InvokeChaincode
7. **Idempotency Testing**: Ensuring safe retries
8. **Integration Testing**: Live network validation
9. **E2E Testing**: Full workflow verification
10. **Security Testing**: Input validation and access control

---

## References

- [Go Testing Package](https://golang.org/pkg/testing/)
- [Testify Framework](https://github.com/stretchr/testify)
- [Hyperledger Fabric Contract API](https://pkg.go.dev/github.com/hyperledger/fabric-contract-api-go)
- LECTURE-11: Smart Contract Architecture
- LECTURE-12: Attribute-Based Access Control
- `gx-coin-fabric/docs/operations/TESTING_GUIDE.md`
