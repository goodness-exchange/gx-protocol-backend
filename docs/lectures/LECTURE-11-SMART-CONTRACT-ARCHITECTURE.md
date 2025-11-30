# Lecture 11: Smart Contract Architecture (7 Contracts, 38 Functions)

**Course:** GX Protocol Blockchain Architecture
**Module:** Smart Contract Design Patterns
**Duration:** 180 minutes
**Level:** Advanced
**Prerequisites:** LECTURE-03 (Hyperledger Fabric), Go programming basics

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Part I: Contract Embedding Pattern](#part-i-contract-embedding-pattern)
3. [Part II: The Seven Contracts Overview](#part-ii-the-seven-contracts-overview)
4. [Part III: IdentityContract (9 Functions)](#part-iii-identitycontract-9-functions)
5. [Part IV: TokenomicsContract (11 Functions)](#part-iv-tokenomicscontract-11-functions)
6. [Part V: OrganizationContract (7 Functions)](#part-v-organizationcontract-7-functions)
7. [Part VI: GovernanceContract (5 Functions)](#part-vi-governancecontract-5-functions)
8. [Part VII: LoanPoolContract (3 Functions)](#part-vii-loanpoolcontract-3-functions)
9. [Part VIII: TaxAndFeeContract (2 Functions)](#part-viii-taxandfeecontract-2-functions)
10. [Part IX: AdminContract (6 Functions)](#part-ix-admincontract-6-functions)
11. [Part X: Cross-Contract Communication](#part-x-cross-contract-communication)
12. [Part XI: Event Emission Patterns](#part-xi-event-emission-patterns)
13. [Exercises](#exercises)
14. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Understand the contract embedding pattern in Go
2. Navigate the 7 contracts and 38+ functions in GX Protocol
3. Explain domain separation in smart contract design
4. Implement cross-contract function calls
5. Design event emission for off-chain synchronization
6. Apply best practices for large-scale chaincode systems

---

## Part I: Contract Embedding Pattern

### 1.1 The Challenge: Organizing Large Chaincode

Enterprise blockchain systems often have many functions. GX Protocol has **38+ functions** across multiple business domains. Without proper organization, this becomes unmanageable.

```
WITHOUT ORGANIZATION:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  chaincode/main.go (3000+ lines)                                        │
│  ├─ CreateUser()                                                        │
│  ├─ GetBalance()                                                        │
│  ├─ Transfer()                                                          │
│  ├─ ProposeOrganization()                                               │
│  ├─ SubmitProposal()                                                    │
│  ├─ ApplyForLoan()                                                      │
│  ├─ ... 30+ more functions                                              │
│  └─ PauseSystem()                                                       │
│                                                                         │
│  Problems:                                                              │
│  ❌ Difficult to navigate                                               │
│  ❌ Hard to test in isolation                                           │
│  ❌ Merge conflicts frequent                                            │
│  ❌ No clear ownership                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 The Solution: Contract Embedding

Go's struct embedding allows us to compose a main contract from specialized sub-contracts:

```go
// contract.go - The main SmartContract embeds all domain contracts

package main

import (
    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract is the main, top-level smart contract that embeds all the other contracts.
// By embedding the contracts, the top-level contract inherits all of their methods.
// This makes all the functions from IdentityContract, TokenomicsContract, etc.,
// directly callable on the main SmartContract.
type SmartContract struct {
    contractapi.Contract
    IdentityContract      // User identity management
    TokenomicsContract    // Token operations
    TaxAndFeeContract     // Fee calculations
    LoanPoolContract      // Lending system
    GovernanceContract    // On-chain governance
    AdminContract         // System administration
}
```

### 1.3 How Embedding Works

```
CONTRACT EMBEDDING VISUALIZATION:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  SmartContract (main)                                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │IdentityContract│  │TokenomicsContract│  │OrganizationContract│ │  │
│  │  │                 │  │                 │  │                 │   │  │
│  │  │ CreateUser()    │  │ Transfer()      │  │ ProposeOrg()    │   │  │
│  │  │ GetUser()       │  │ GetBalance()    │  │ Endorse()       │   │  │
│  │  │ GetProfile()    │  │ Mint()          │  │ Activate()      │   │  │
│  │  │ ...             │  │ ...             │  │ ...             │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │GovernanceContract│ │LoanPoolContract │  │  AdminContract  │   │  │
│  │  │                 │  │                 │  │                 │   │  │
│  │  │ SubmitProposal()│  │ ApplyForLoan() │  │ PauseSystem()   │   │  │
│  │  │ Vote()          │  │ ApproveLoan()  │  │ UpdateParam()   │   │  │
│  │  │ Execute()       │  │ ...            │  │ Bootstrap()     │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  External Client calls: SmartContract.CreateUser()                      │
│  Internally routes to: IdentityContract.CreateUser()                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Benefits of This Pattern

| Benefit | Description |
|---------|-------------|
| **Separation of Concerns** | Each contract handles one domain |
| **Testability** | Test contracts in isolation |
| **Maintainability** | Changes scoped to relevant files |
| **Team Scaling** | Different teams own different contracts |
| **Code Reuse** | Private helpers within each contract |

---

## Part II: The Seven Contracts Overview

### 2.1 Contract Summary Table

| Contract | File | Functions | Purpose |
|----------|------|-----------|---------|
| **IdentityContract** | `identity_contract.go` | 9 | User/relationship management |
| **TokenomicsContract** | `tokenomics_contract.go` | 11 | Transfers, balances, genesis |
| **OrganizationContract** | `organization_contract.go` | 7 | Business accounts, multi-sig |
| **GovernanceContract** | `governance_contract.go` | 5 | Proposals, voting |
| **LoanPoolContract** | `loan_pool_contract.go` | 3 | Interest-free lending |
| **TaxAndFeeContract** | `tax_and_fee_contract.go` | 2 | Velocity tax, fee calculation |
| **AdminContract** | `admin_contract.go` | 6 | Bootstrap, pause, parameters |

### 2.2 File Organization

```
chaincode/
├── contract.go                  # Main SmartContract (embedding)
├── main.go                      # Entry point for CCAAS
│
├── identity_contract.go         # IdentityContract implementation
├── identity_types.go            # User, Profile, Relationship types
│
├── tokenomics_contract.go       # TokenomicsContract implementation
├── tokenomics_types.go          # Transaction, Balance types
│
├── organization_contract.go     # OrganizationContract implementation
├── organization_types.go        # Organization, PendingTx types
│
├── governance_contract.go       # GovernanceContract implementation
├── governance_types.go          # Proposal types
│
├── loan_pool_contract.go        # LoanPoolContract implementation
├── loan_types.go                # Loan types
│
├── tax_and_fee_contract.go      # TaxAndFeeContract implementation
│
├── admin_contract.go            # AdminContract implementation
│
├── access_control.go            # ABAC implementation (shared)
├── consts.go                    # Constants (shared)
├── helpers.go                   # Utility functions (shared)
├── common_types.go              # Shared type definitions
└── genesis_types.go             # Genesis distribution types
```

### 2.3 Domain Responsibility Matrix

```
DOMAIN RESPONSIBILITY:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  WHO CAN DO WHAT?                                                       │
│                                                                         │
│  ┌──────────────────┬──────────┬──────────┬──────────┬─────────────┐   │
│  │ Action           │ SuperAdmin│  Admin  │PartnerAPI│    User     │   │
│  ├──────────────────┼──────────┼──────────┼──────────┼─────────────┤   │
│  │ Bootstrap System │    ✓     │          │          │             │   │
│  │ Pause/Resume     │    ✓     │          │          │             │   │
│  │ Init Countries   │    ✓     │          │          │             │   │
│  │ Freeze Wallet    │    ✓     │          │          │             │   │
│  ├──────────────────┼──────────┼──────────┼──────────┼─────────────┤   │
│  │ Update Params    │          │    ✓     │          │             │   │
│  │ Submit Proposal  │          │    ✓     │          │             │   │
│  │ Execute Proposal │          │    ✓     │          │             │   │
│  ├──────────────────┼──────────┼──────────┼──────────┼─────────────┤   │
│  │ Create User      │          │          │    ✓     │             │   │
│  │ Distribute Gen.  │          │    ✓     │          │             │   │
│  │ Org Transfers    │          │          │    ✓     │             │   │
│  ├──────────────────┼──────────┼──────────┼──────────┼─────────────┤   │
│  │ Transfer Tokens  │          │          │          │      ✓      │   │
│  │ Get Balance      │          │          │          │      ✓      │   │
│  │ Propose Org      │          │          │          │      ✓      │   │
│  │ Vote on Proposal │          │          │          │      ✓      │   │
│  └──────────────────┴──────────┴──────────┴──────────┴─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part III: IdentityContract (9 Functions)

### 3.1 Purpose

The IdentityContract manages user identities, relationships, and trust scores. It is the foundation for all other operations.

### 3.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `CreateUser` | PartnerAPI | Create on-chain user identity |
| `GetUser` | Public | Retrieve user by ID |
| `UserExists` | Public | Check if user exists |
| `GetMyProfile` | Public | Get user with relationships |
| `RequestRelationship` | User | Propose relationship to another user |
| `ConfirmRelationship` | User | Accept relationship request |
| `NominateGuardians` | User | Set recovery guardians |
| `InitiateRecovery` | Guardian | Start account recovery |
| `ConfirmRecovery` | Guardian | Vote on recovery session |

### 3.3 Key Implementation: CreateUser

```go
// CreateUser issues a new identity for a user on the ledger.
//
// Parameters:
//   - ctx: The transaction context
//   - userID: Unique identifier (e.g., "US 234 A12345 0ABCD 5678")
//   - biometricHash: SHA-256 hash of biometric data
//   - nationality: 2-letter country code (ISO 3166-1 alpha-2)
//   - age: User's age (used for genesis eligibility: 13-73 years)
//
// Returns:
//   - An error if the user already exists
func (s *IdentityContract) CreateUser(
    ctx contractapi.TransactionContextInterface,
    userID string,
    biometricHash string,
    nationality string,
    age int,
) error {
    // 1. Input Validation
    if userID == "" {
        return fmt.Errorf("userID cannot be empty")
    }
    if len(biometricHash) != 64 {
        return fmt.Errorf("invalid biometricHash format: must be 64 characters (SHA-256 hex)")
    }
    if len(nationality) != 2 {
        return fmt.Errorf("invalid nationality format: must be 2-letter ISO country code")
    }
    nationality = strings.ToUpper(nationality)

    // 2. Validate country is registered
    countryKey := fmt.Sprintf("stats_%s", nationality)
    countryStatsJSON, err := ctx.GetStub().GetState(countryKey)
    if err != nil || countryStatsJSON == nil {
        return fmt.Errorf("country %s is not registered in the system", nationality)
    }

    // 3. Check user doesn't already exist
    exists, err := s._userExists(ctx, userID)
    if err != nil {
        return err
    }
    if exists {
        return fmt.Errorf("the user %s already exists", userID)
    }

    // 4. Create user object
    user := User{
        DocType:       UserDocType,
        UserID:        userID,
        BiometricHash: biometricHash,
        Nationality:   nationality,
        Age:           age,
        Status:        "Active",
        TrustScore:    10, // Base trust score
        CreatedAt:     time.Now().UTC(),
    }

    // 5. Save to ledger
    userJSON, err := json.Marshal(user)
    if err != nil {
        return fmt.Errorf("failed to marshal user object: %w", err)
    }
    if err := ctx.GetStub().PutState(userID, userJSON); err != nil {
        return err
    }

    // 6. Emit event
    ctx.GetStub().SetEvent(UserCreatedEventName, eventJSON)
    return nil
}
```

### 3.4 Trust Score Algorithm

```go
// Trust Score Breakdown (Total: 100 points max)
const (
    baseScore         = 10  // Everyone starts with 10
    maxFamilyScore    = 80  // Family relationships
    maxBusinessScore  = 10  // Business affiliations
    maxFriendsScore   = 10  // Friend connections
)

// Family Scoring:
// - Parent confirmed:  30 points
// - Spouse confirmed:  25 points
// - Sibling confirmed: 15 points
// - Child confirmed:   10 points
```

---

## Part IV: TokenomicsContract (11 Functions)

### 4.1 Purpose

The TokenomicsContract is the core financial engine, handling all token operations including transfers, genesis distribution, and balance management.

### 4.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `DistributeGenesis` | Admin | Allocate genesis coins to user |
| `Transfer` | User | P2P token transfer |
| `TransferFromOrganization` | PartnerAPI | Org transfer after multi-sig |
| `TransferInternal` | Admin | Fee-exempt system transfer |
| `GetBalance` | Public | Query account balance |
| `GetTransactionHistory` | Public | Query transaction history |
| `Mint` | SuperAdmin | Create new coins (bootstrap) |
| `FreezeWallet` | SuperAdmin | Freeze user wallet |
| `UnfreezeWallet` | SuperAdmin | Unfreeze user wallet |
| `_credit` | Internal | Add to balance |
| `_debit` | Internal | Subtract from balance |

### 4.3 Fee Structure Implementation

```go
// Fee Schedule (in basis points: 100 bps = 1%)
const (
    // Person-to-Person Local
    FeeP2PLocalBelow3     = 0    // Free below 3 coins
    FeeP2PLocal3To100     = 5    // 0.05%
    FeeP2PLocalAbove100   = 10   // 0.1%

    // Person-to-Person Cross-Border
    FeeP2PCrossBorder0To100   = 15  // 0.15%
    FeeP2PCrossBorderAbove100 = 25  // 0.25%

    // Merchant
    FeeMerchantLocal       = 15   // 0.15%
    FeeMerchantCrossBorder = 30   // 0.3%

    // Government
    FeeGovernmentLocal       = 10 // 0.1%
    FeeGovernmentCrossBorder = 20 // 0.2%

    // Business-to-Business
    FeeB2BLocal       = 20  // 0.2%
    FeeB2BCrossBorder = 40  // 0.4%
)
```

### 4.4 Transfer Implementation

```go
func (s *TokenomicsContract) Transfer(
    ctx contractapi.TransactionContextInterface,
    fromID string,
    toID string,
    amount uint64,
    remark string,
) error {
    // 1. System pause check
    if paused, reason, _ := isSystemPaused(ctx); paused {
        return fmt.Errorf("system is paused: %s", reason)
    }

    // 2. Authorization: Submitter must own the 'from' account
    submitterID, _ := ctx.GetClientIdentity().GetID()
    if submitterID != fromID {
        return fmt.Errorf("submitter %s is not authorized to transfer from %s", submitterID, fromID)
    }

    // 3. Validate accounts not frozen
    // ... (check sender and receiver status)

    // 4. Calculate fee based on transaction context
    feeResult, err := s._calculateTransactionFee(ctx, fromID, toID, amount)
    if err != nil {
        return err
    }

    // 5. Check sufficient balance
    fromBalance, _ := s._readBalance(ctx, fromID)
    if fromBalance < (amount + feeResult.SenderFee) {
        return fmt.Errorf("insufficient funds")
    }

    // 6. Execute atomic transfer
    s._debit(ctx, fromID, amount+feeResult.SenderFee)
    s._credit(ctx, toID, amount-feeResult.ReceiverFee)
    s._credit(ctx, OperationsFundAccountID, feeResult.TotalFee)

    // 7. Create audit record and emit event
    s._createTransactionRecord(ctx, fromID, toID, amount, feeResult.TotalFee, TransferTxType, remark)
    s._emitEvent(ctx, TransferEventName, ...)

    return nil
}
```

---

## Part V: OrganizationContract (7 Functions)

### 5.1 Purpose

The OrganizationContract manages business entities with multi-signature transaction approval for enhanced security.

### 5.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `ProposeOrganization` | User | Create org proposal |
| `EndorseMembership` | Stakeholder | Endorse org membership |
| `ActivateOrganization` | Stakeholder | Activate after all endorse |
| `DefineAuthRule` | Stakeholder | Set multi-sig rules |
| `InitiateMultiSigTx` | Stakeholder | Start multi-sig transfer |
| `ApproveMultiSigTx` | Approver | Approve pending transfer |
| `GetOrganization` | Public | Query organization |

### 5.3 Organization Types

```go
const (
    OrgTypeBusiness   = "BUSINESS"   // For-profit companies
    OrgTypeNGO        = "NGO"        // Non-profit organizations
    OrgTypeGovernment = "GOVERNMENT" // Country treasury (admin only)
)
```

### 5.4 Multi-Sig Workflow

```
MULTI-SIGNATURE TRANSACTION FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. DefineAuthRule                                                      │
│     └─ stakeholder sets: amount > 1000 requires 2-of-3 approval         │
│                                                                         │
│  2. InitiateMultiSigTx                                                  │
│     └─ Stakeholder A initiates transfer of 5000 to Vendor X             │
│     └─ PendingTransaction created (status: "Pending")                   │
│     └─ Stakeholder A's vote auto-counted                                │
│                                                                         │
│  3. ApproveMultiSigTx (Stakeholder B)                                   │
│     └─ Stakeholder B approves                                           │
│     └─ Now 2-of-3 threshold met!                                        │
│                                                                         │
│  4. Automatic Execution                                                 │
│     └─ Calls TokenomicsContract.TransferFromOrganization()              │
│     └─ Coins transferred to Vendor X                                    │
│     └─ PendingTransaction status → "Executed"                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part VI: GovernanceContract (5 Functions)

### 6.1 Purpose

The GovernanceContract implements on-chain governance for system parameter changes through proposals and voting.

### 6.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `SubmitProposal` | Admin | Create governance proposal |
| `VoteOnProposal` | User | Cast vote on proposal |
| `ExecuteProposal` | Admin | Execute passed proposal |
| `GetProposalDetails` | Public | Query proposal |
| `ListActiveProposals` | Public | List all active proposals |

### 6.3 Proposal Lifecycle

```
PROPOSAL STATE MACHINE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌────────────┐   14 days    ┌────────────┐                            │
│  │   Active   │─────────────▶│  Voting    │                            │
│  │ (Created)  │   passed     │  Ended     │                            │
│  └────────────┘              └─────┬──────┘                            │
│                                    │                                    │
│                    ┌───────────────┼───────────────┐                   │
│                    │               │               │                   │
│                    ▼               ▼               ▼                   │
│             ┌──────────┐    ┌──────────┐    ┌──────────────┐          │
│             │  Failed  │    │ Executed │    │FailedExecution│          │
│             │(No > Yes)│    │(Yes > No)│    │ (Error)      │          │
│             └──────────┘    └──────────┘    └──────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Vote Receipt Pattern

```go
// Preventing double voting with receipts
func (s *GovernanceContract) VoteOnProposal(
    ctx contractapi.TransactionContextInterface,
    proposalID string,
    vote bool,
) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()

    // Create a unique key for this voter + proposal combination
    voteKey := fmt.Sprintf("vote_%s_%s", proposalID, submitterID)

    // Check if vote receipt already exists
    voteReceiptBytes, err := ctx.GetStub().GetState(voteKey)
    if voteReceiptBytes != nil {
        return fmt.Errorf("user %s has already voted on proposal %s", submitterID, proposalID)
    }

    // Record the vote...

    // Create vote receipt to prevent future double-voting
    return ctx.GetStub().PutState(voteKey, []byte("voted"))
}
```

---

## Part VII: LoanPoolContract (3 Functions)

### 7.1 Purpose

The LoanPoolContract implements interest-free lending backed by the community loan pool.

### 7.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `ApplyForLoan` | User | Submit loan application |
| `ApproveLoan` | Admin | Approve loan application |
| `RepayLoan` | User | Repay outstanding loan |

### 7.3 Loan Lifecycle

```
LOAN LIFECYCLE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. ApplyForLoan                                                        │
│     └─ User: "I need 1000 GX for small business"                        │
│     └─ LoanApplication created (status: "Pending")                      │
│                                                                         │
│  2. Admin Review (Off-chain)                                            │
│     └─ Risk assessment based on trust score                             │
│     └─ Collateral verification                                          │
│                                                                         │
│  3. ApproveLoan                                                         │
│     └─ Admin approves with terms                                        │
│     └─ Coins transferred from LoanPool → User                           │
│     └─ Loan status → "Active"                                           │
│                                                                         │
│  4. RepayLoan                                                           │
│     └─ User repays (no interest!)                                       │
│     └─ Coins returned to LoanPool                                       │
│     └─ Loan status → "Repaid"                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part VIII: TaxAndFeeContract (2 Functions)

### 8.1 Purpose

The TaxAndFeeContract implements the velocity tax (hoarding tax) to encourage currency circulation.

### 8.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `ApplyVelocityTax` | Admin | Calculate and apply hoarding tax |
| `CalculateVelocityTax` | Public | Preview tax without applying |

### 8.3 Velocity Tax Logic

```go
// Velocity Tax Rules:
// 1. Applies to balances > 100 coins
// 2. Timer starts when balance crosses threshold
// 3. After 360 days, 3% tax is applied
// 4. Timer resets when balance drops below threshold

const (
    VelocityTaxThreshold = 100 * Precision  // 100 coins
    VelocityTaxPeriod    = 360              // days
    VelocityTaxRateBps   = 300              // 3%
)
```

---

## Part IX: AdminContract (6 Functions)

### 9.1 Purpose

The AdminContract provides system administration functions for bootstrapping, emergencies, and parameter management.

### 9.2 Function Reference

| Function | Access | Purpose |
|----------|--------|---------|
| `BootstrapSystem` | SuperAdmin | Initialize system with pools |
| `InitializeCountryData` | SuperAdmin | Seed country allocations |
| `UpdateSystemParameter` | Admin | Change governable parameters |
| `PauseSystem` | SuperAdmin | Emergency pause |
| `ResumeSystem` | SuperAdmin | Resume after pause |
| `GetSystemStatus` | Public | Check if system paused |

### 9.3 Bootstrap Sequence

```
SYSTEM BOOTSTRAP SEQUENCE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. Deploy Chaincode                                                    │
│     └─ Network admins install gxtv3 on all peers                        │
│                                                                         │
│  2. BootstrapSystem (one-time)                                          │
│     ├─ Mint 577.5B to User Genesis Pool                                 │
│     ├─ Mint 152.5B to Government Genesis Pool                           │
│     ├─ Create Operations Fund account                                   │
│     ├─ Create Loan Pool account                                         │
│     └─ Initialize global counters                                       │
│                                                                         │
│  3. InitializeCountryData                                               │
│     ├─ Load country populations                                         │
│     ├─ Calculate per-country phase allocations                          │
│     └─ Create CountryStats for each country                             │
│                                                                         │
│  4. ActivateTreasuryAccount (per country)                               │
│     └─ Create government treasury for each country                      │
│                                                                         │
│  5. System Ready                                                        │
│     └─ Users can be created and receive genesis                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part X: Cross-Contract Communication

### 10.1 InvokeChaincode Pattern

Contracts can call functions on other contracts using `InvokeChaincode`:

```go
// OrganizationContract calling TokenomicsContract
func (s *OrganizationContract) ApproveMultiSigTx(...) error {
    // ... approval logic ...

    if approvalCount >= pendingTx.RequiredApprovals {
        // Cross-contract call to execute transfer
        invokeArgs := [][]byte{
            []byte("TransferFromOrganization"),
            []byte(pendingTx.OrgID),
            []byte(pendingTx.ToID),
            []byte(strconv.FormatUint(pendingTx.Amount, 10)),
            []byte(pendingTx.Remark),
            []byte(pendingTx.TxID),
        }

        channelName := ctx.GetStub().GetChannelID()
        response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

        if response.Status >= 400 {
            return fmt.Errorf("transfer failed: %s", response.Message)
        }
    }
    return nil
}
```

### 10.2 Cross-Contract Call Diagram

```
CROSS-CONTRACT CALLS:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  GovernanceContract                                                     │
│       │                                                                 │
│       │ ExecuteProposal() ──────────────▶ AdminContract                 │
│       │                                    UpdateSystemParameter()      │
│       │                                                                 │
│  OrganizationContract                                                   │
│       │                                                                 │
│       │ ProposeOrganization() ──────────▶ IdentityContract              │
│       │                                    UserExists()                  │
│       │                                                                 │
│       │ ApproveMultiSigTx() ────────────▶ TokenomicsContract            │
│       │                                    TransferFromOrganization()    │
│       │                                                                 │
│  IdentityContract                                                       │
│       │                                                                 │
│       │ NominateGuardians() ────────────▶ IdentityContract              │
│                                            UserExists() (self-call)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part XI: Event Emission Patterns

### 11.1 Why Events?

Events allow off-chain systems (like the projector worker) to react to blockchain state changes.

### 11.2 Event Naming Convention

```go
// consts.go - Event name constants

const (
    // Identity Events
    UserCreatedEventName              = "UserCreated"
    RelationshipRequestedEventName    = "RelationshipRequested"
    RelationshipConfirmedEventName    = "RelationshipConfirmed"

    // Tokenomics Events
    TransferEventName                 = "TransferEvent"
    GenesisDistributionEventName      = "GenesisDistributionEvent"

    // Organization Events
    OrgTxApprovedEventName            = "OrgTxApproved"
    OrgTxExecutedEventName            = "OrgTxExecuted"
    OrgTxExecutionFailedEventName     = "OrgTxExecutionFailed"

    // Admin Events
    SystemPausedEventName             = "SystemPaused"
    SystemResumedEventName            = "SystemResumed"
)
```

### 11.3 Event Emission Helper

```go
// helpers.go

func emitEvent(ctx contractapi.TransactionContextInterface, eventName string, payload map[string]interface{}) {
    payloadJSON, err := json.Marshal(payload)
    if err != nil {
        fmt.Printf("Warning: failed to marshal event %s: %v\n", eventName, err)
        return
    }

    err = ctx.GetStub().SetEvent(eventName, payloadJSON)
    if err != nil {
        fmt.Printf("Warning: failed to emit event %s: %v\n", eventName, err)
    }
}
```

### 11.4 Event Consumption (Backend)

```typescript
// workers/projector/src/index.ts

async function handleEvent(event: BlockchainEvent) {
    switch (event.eventName) {
        case 'UserCreated':
            await handleUserCreated(event.payload);
            break;
        case 'TransferEvent':
            await handleTransferEvent(event.payload);
            break;
        // ... handle other events
    }
}
```

---

## Exercises

### Exercise 1: Add New Function

Add a `GetTrustScore` function to IdentityContract that:
1. Takes a userID parameter
2. Returns the user's current trust score
3. Is publicly accessible

### Exercise 2: Cross-Contract Call

Implement a function in TokenomicsContract that:
1. Before transferring, checks the user exists via IdentityContract
2. Uses InvokeChaincode for the cross-contract call

### Exercise 3: New Event

Add a `BalanceChanged` event that:
1. Emits whenever `_credit` or `_debit` is called
2. Includes: accountID, oldBalance, newBalance, changeType

### Exercise 4: New Contract

Design a new `RewardsContract` that:
1. Allows admins to create reward campaigns
2. Users can claim rewards based on criteria
3. Integrates with TokenomicsContract for payouts

---

## Further Reading

### Official Documentation

- **Fabric Contract API Go:** https://github.com/hyperledger/fabric-contract-api-go
- **Fabric Chaincode Lifecycle:** https://hyperledger-fabric.readthedocs.io/en/latest/chaincode_lifecycle.html

### Related GX Protocol Documentation

- **LECTURE-03:** Hyperledger Fabric Blockchain
- **LECTURE-12:** Attribute-Based Access Control (ABAC)
- **chaincode/README.md** (if exists)

---

## Summary

In this lecture, we covered:

1. **Contract Embedding:** Composing a main contract from specialized sub-contracts
2. **Seven Contracts:** Identity, Tokenomics, Organization, Governance, LoanPool, TaxAndFee, Admin
3. **38+ Functions:** Complete function reference with access levels
4. **Domain Separation:** Each contract handles one business domain
5. **Cross-Contract Calls:** Using InvokeChaincode for inter-contract communication
6. **Event Emission:** Enabling off-chain synchronization

**Key Takeaways:**

- Use embedding to organize large chaincode systems
- Separate concerns by business domain
- Each contract has clear access control requirements
- Events bridge on-chain and off-chain systems
- Cross-contract calls enable composable business logic

**Next Lecture:** LECTURE-12 - Attribute-Based Access Control (ABAC)

---

**End of Lecture 11**
