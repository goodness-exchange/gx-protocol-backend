# LECTURE 16: Loan Pool & Interest-Free Lending

## Overview

This lecture covers the interest-free loan system in GX Protocol. The loan pool provides accessible credit to verified users without charging interest (riba-free), funded from the pre-minted 312.5B coin allocation (25% of total supply).

## Learning Objectives

By the end of this lecture, you will understand:
1. The philosophical foundation of interest-free lending
2. Loan pool funding and sustainability
3. Trust score requirements for loan eligibility
4. The loan application and approval workflow
5. Collateral verification via hash references
6. Cross-contract communication for disbursement

---

## Part 1: Interest-Free Lending Philosophy

### Why Zero Interest?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEREST-FREE LENDING RATIONALE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Traditional Lending:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Borrow 1,000 coins at 10% interest                          │           │
│  │ Repay: 1,000 + 100 = 1,100 coins                            │           │
│  │                                                              │           │
│  │ Problems:                                                    │           │
│  │ • Debt spiral for vulnerable borrowers                      │           │
│  │ • Wealth concentration to lenders                           │           │
│  │ • Excludes ethical/religious communities                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  GX Protocol Interest-Free Lending:                                        │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Borrow 1,000 coins at 0% interest                           │           │
│  │ Repay: 1,000 coins (principal only)                         │           │
│  │                                                              │           │
│  │ Benefits:                                                    │           │
│  │ • Accessible credit for all verified users                  │           │
│  │ • No debt spiral risk                                       │           │
│  │ • Riba-free (Islamic finance compliant)                     │           │
│  │ • Promotes economic mobility                                │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Sustainability Model:                                                      │
│  • Funded by pre-minted pool (312.5B coins)                               │
│  • Repayments return to pool for re-lending                               │
│  • Velocity tax revenue supplements the pool                              │
│  • Defaulted loans reduce pool but don't affect other users               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Loan Pool Allocation

```go
// consts.go
const (
    // Loan Pool: 312.5B coins (25.00% of total supply)
    LoanPoolTotal     uint64 = 312500000000 * Precision
    LoanPoolAccountID        = "SYSTEM_LOAN_POOL"
)
```

This represents the largest single pool allocation, reflecting the protocol's commitment to accessible credit.

---

## Part 2: Loan Structure

### Loan Data Structure

```go
// loan_types.go

type Loan struct {
    DocType        string    `json:"docType"`        // "loan"
    LoanID         string    `json:"loanID"`         // Unique identifier (LOAN_xxx)
    BorrowerID     string    `json:"borrowerID"`     // User requesting loan
    Amount         uint64    `json:"amount"`         // Loan amount in Qirat
    Status         string    `json:"status"`         // Lifecycle status
    CollateralHash string    `json:"collateralHash"` // SHA-256 of collateral docs
    AppliedAt      time.Time `json:"appliedAt"`      // Application timestamp
    ApprovedAt     time.Time `json:"approvedAt"`     // Approval timestamp
}
```

### Loan Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOAN LIFECYCLE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   Not Applied   │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           │ ApplyForLoan() by borrower                                      │
│           │ (Trust score >= 75 required)                                    │
│           ▼                                                                 │
│  ┌─────────────────────┐                                                    │
│  │  PendingApproval    │ ◄──── Initial state                               │
│  │                     │       Awaiting admin review                        │
│  └────────┬────────────┘                                                    │
│           │                                                                 │
│           │ ApproveLoan() by admin                                          │
│           │ (Funds transferred from pool)                                   │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │     Active      │ ◄──── Funds disbursed to borrower                     │
│  │                 │       Repayment period begins                          │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│      ┌────┴────┐                                                            │
│      │         │                                                            │
│      ▼         ▼                                                            │
│ ┌─────────┐ ┌───────────┐                                                   │
│ │  Paid   │ │ Defaulted │                                                   │
│ └─────────┘ └───────────┘                                                   │
│  Repayment    Missed                                                        │
│  complete     deadline                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Loan Eligibility

### Trust Score Requirement

```go
// loan_pool_contract.go

const minimumTrustScoreForLoan = 75
```

Trust score is a measure of user reliability based on:
- Account age
- Transaction history
- Previous loan repayment
- Organization memberships
- KYC verification level

### Loan Amount Limits

```go
// loan_pool_contract.go

// Minimum: 100 coins
minLoanAmount := uint64(100 * Precision)

// Maximum: 1,000,000 coins (1 million)
maxLoanAmount := uint64(1000000 * Precision)
```

### Eligibility Check Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOAN ELIGIBILITY CHECK                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Requests Loan                                                         │
│          │                                                                  │
│          ▼                                                                  │
│  ┌───────────────────┐                                                      │
│  │ Amount Validation │                                                      │
│  │ 100 <= amt <= 1M  │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────────────────────────────────────────────┐             │
│  │ Cross-Contract Call: Identity:GetMyProfile(borrowerID)    │             │
│  └─────────┬─────────────────────────────────────────────────┘             │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Trust Score >= 75 │──── No ────► REJECTED                               │
│  └─────────┬─────────┘              "Insufficient trust score"             │
│            │ Yes                                                            │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Collateral Hash   │──── Invalid ──► REJECTED                            │
│  │ Valid (64 chars)  │                 "Invalid hash format"               │
│  └─────────┬─────────┘                                                      │
│            │ Valid                                                          │
│            ▼                                                                │
│       LOAN CREATED                                                          │
│    Status: PendingApproval                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Loan Application

### ApplyForLoan Implementation

```go
// loan_pool_contract.go

func (s *LoanPoolContract) ApplyForLoan(
    ctx contractapi.TransactionContextInterface,
    borrowerID string,
    amount uint64,
    collateralHash string,
) (string, error) {
    // 1. Authorization: Only the borrower can apply for themselves
    submitterID, _ := ctx.GetClientIdentity().GetID()
    if submitterID != borrowerID {
        return "", fmt.Errorf("cannot apply on behalf of another user")
    }

    // 2. Validate loan amount
    minLoanAmount := uint64(100 * Precision)
    maxLoanAmount := uint64(1000000 * Precision)
    if amount < minLoanAmount || amount > maxLoanAmount {
        return "", fmt.Errorf("amount must be between 100 and 1,000,000 coins")
    }

    // 3. Validate collateral hash format (SHA-256)
    if len(collateralHash) != 64 {
        return "", fmt.Errorf("invalid collateralHash: must be 64 hex characters")
    }

    // 4. Cross-contract call to check trust score
    channelName := ctx.GetStub().GetChannelID()
    invokeArgs := [][]byte{[]byte("GetMyProfile"), []byte(borrowerID)}
    response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

    var borrowerProfile Profile
    json.Unmarshal(response.Payload, &borrowerProfile)

    if borrowerProfile.User.TrustScore < 75 {
        return "", fmt.Errorf("trust score %d below minimum 75",
            borrowerProfile.User.TrustScore)
    }

    // 5. Create loan application
    loanID := "LOAN_" + uuid.New().String()
    txTime, _ := getTransactionTimestamp(ctx)

    loan := Loan{
        DocType:        LoanDocType,
        LoanID:         loanID,
        BorrowerID:     borrowerID,
        Amount:         amount,
        Status:         "PendingApproval",
        CollateralHash: collateralHash,
        AppliedAt:      txTime,
    }

    ctx.GetStub().PutState(loanID, loanJSON)
    return loanID, nil
}
```

### Collateral Hash Explanation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COLLATERAL HASH MECHANISM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Off-Chain Documents (stored in backend/IPFS):                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Property deed                                              │           │
│  │ • Vehicle registration                                       │           │
│  │ • Business inventory list                                    │           │
│  │ • Bank statements                                            │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                         │                                                   │
│                         │ SHA-256 Hash                                      │
│                         ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Hash: a1b2c3d4e5f6...                                        │           │
│  │ (64 character hex string)                                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                         │                                                   │
│                         │ Stored on blockchain                              │
│                         ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Loan.CollateralHash = "a1b2c3d4e5f6..."                     │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Benefits:                                                                  │
│  • Documents stay private (off-chain)                                      │
│  • Hash proves documents existed at loan time                              │
│  • Tampering detection (hash won't match if docs changed)                  │
│  • Minimal on-chain storage                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Loan Approval

### ApproveLoan Implementation

```go
// loan_pool_contract.go

func (s *LoanPoolContract) ApproveLoan(
    ctx contractapi.TransactionContextInterface,
    loanID string,
) error {
    // 1. Authorization: Only admins can approve
    err := requireRole(ctx, RoleAdmin)
    if err != nil {
        return err
    }

    // 2. Load and validate loan
    loan, _ := s._getLoan(ctx, loanID)
    if loan.Status != "PendingApproval" {
        return fmt.Errorf("loan not pending approval")
    }

    // 3. Re-verify trust score at approval time
    channelName := ctx.GetStub().GetChannelID()
    invokeArgs := [][]byte{[]byte("GetMyProfile"), []byte(loan.BorrowerID)}
    response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

    var borrowerProfile Profile
    json.Unmarshal(response.Payload, &borrowerProfile)

    if borrowerProfile.User.TrustScore < 75 {
        return fmt.Errorf("trust score dropped below minimum")
    }

    // 4. Cross-contract call to transfer funds
    loanPoolAccountID := "SYSTEM_LOAN_POOL"
    transferArgs := [][]byte{
        []byte("Transfer"),
        []byte(loanPoolAccountID),        // From: Loan Pool
        []byte(loan.BorrowerID),          // To: Borrower
        []byte(strconv.FormatUint(loan.Amount, 10)),
        []byte(fmt.Sprintf("Loan Disbursement for %s", loanID)),
    }

    transferResponse := ctx.GetStub().InvokeChaincode(
        ChaincodeName, transferArgs, channelName)

    if transferResponse.Status >= 400 {
        return fmt.Errorf("fund transfer failed: %s", transferResponse.Message)
    }

    // 5. Update loan status
    loan.Status = "Active"
    loan.ApprovedAt, _ = getTransactionTimestamp(ctx)

    ctx.GetStub().PutState(loanID, loanJSON)
    return nil
}
```

### Approval Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOAN APPROVAL FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin calls ApproveLoan(loanID)                                           │
│          │                                                                  │
│          ▼                                                                  │
│  ┌───────────────────┐                                                      │
│  │ requireRole(Admin)│                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Load Loan from    │                                                      │
│  │ Ledger            │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Status ==         │──── No ────► ERROR                                  │
│  │ "PendingApproval" │              "Not pending"                          │
│  └─────────┬─────────┘                                                      │
│            │ Yes                                                            │
│            ▼                                                                │
│  ┌───────────────────────────────────────────────────────────┐             │
│  │ Cross-Contract: Identity:GetMyProfile(borrowerID)         │             │
│  │ Re-verify trust score >= 75                               │             │
│  └─────────┬─────────────────────────────────────────────────┘             │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────────────────────────────────────────────┐             │
│  │ Cross-Contract: Tokenomics:Transfer(                      │             │
│  │   from: SYSTEM_LOAN_POOL,                                 │             │
│  │   to: borrowerID,                                         │             │
│  │   amount: loan.Amount                                     │             │
│  │ )                                                         │             │
│  └─────────┬─────────────────────────────────────────────────┘             │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Update Loan:      │                                                      │
│  │ Status = "Active" │                                                      │
│  │ ApprovedAt = now  │                                                      │
│  └───────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Querying Loans

### GetLoan - Single Loan Query

```go
// loan_pool_contract.go

func (lpc *LoanPoolContract) GetLoan(
    ctx contractapi.TransactionContextInterface,
    loanID string,
) (*Loan, error) {
    if loanID == "" {
        return nil, fmt.Errorf("loanID cannot be empty")
    }

    loanJSON, err := ctx.GetStub().GetState(loanID)
    if err != nil || loanJSON == nil {
        return nil, fmt.Errorf("loan not found: %s", loanID)
    }

    var loan Loan
    json.Unmarshal(loanJSON, &loan)
    return &loan, nil
}
```

### GetMyLoans - Borrower's Loan History

```go
// loan_pool_contract.go

func (s *LoanPoolContract) GetMyLoans(
    ctx contractapi.TransactionContextInterface,
    borrowerID string,
) ([]Loan, error) {
    // Rich query using CouchDB selector
    queryString := fmt.Sprintf(
        `{"selector":{"docType":"loan","borrowerID":"%s"}}`,
        borrowerID,
    )

    resultsIterator, _ := ctx.GetStub().GetQueryResult(queryString)
    defer resultsIterator.Close()

    var loans []Loan
    for resultsIterator.HasNext() {
        queryResponse, _ := resultsIterator.Next()

        var loan Loan
        json.Unmarshal(queryResponse.Value, &loan)
        loans = append(loans, loan)
    }

    return loans, nil
}
```

---

## Part 7: Cross-Contract Communication

### Communication Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              LOAN POOL CROSS-CONTRACT DEPENDENCIES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                      ┌─────────────────────┐                               │
│                      │  LoanPoolContract   │                               │
│                      └──────────┬──────────┘                               │
│                                 │                                           │
│              ┌──────────────────┼──────────────────┐                       │
│              │                  │                  │                       │
│              ▼                  ▼                  ▼                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │IdentityContract │  │TokenomicsContract│  │  AdminContract  │            │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤            │
│  │ GetMyProfile()  │  │ Transfer()       │  │ (Future:        │            │
│  │ → Trust Score   │  │ → Disbursement   │  │  RepayLoan)     │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
│  Call Sequence for ApproveLoan:                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  1. LoanPool → Identity:GetMyProfile(borrowerID)                           │
│     ← Returns: Profile { User: { TrustScore: 82 } }                        │
│                                                                             │
│  2. LoanPool → Tokenomics:Transfer(pool, borrower, amount, remark)         │
│     ← Returns: Success (funds transferred)                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### InvokeChaincode Pattern

```go
// Standard cross-contract call pattern
invokeArgs := [][]byte{
    []byte("FunctionName"),   // Function to call
    []byte("arg1"),           // First argument
    []byte("arg2"),           // Second argument
}

channelName := ctx.GetStub().GetChannelID()
response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

if response.Status >= 400 {
    // Handle error
    return fmt.Errorf("cross-contract call failed: %s", response.Message)
}

// Parse response payload
var result SomeType
json.Unmarshal(response.Payload, &result)
```

---

## Part 8: Backend Integration

### Loan Application via Backend

```typescript
// Service layer
async function applyForLoan(dto: LoanApplicationDTO) {
    // 1. Hash collateral documents
    const collateralHash = await hashDocuments(dto.collateralDocuments);

    // 2. Create outbox command
    await prisma.outboxCommand.create({
        data: {
            aggregateId: dto.userId,
            commandType: 'APPLY_FOR_LOAN',
            payload: {
                borrowerID: dto.userId,
                amount: dto.amount * 1000000, // Convert to Qirat
                collateralHash: collateralHash
            }
        }
    });

    return { status: 'pending', collateralHash };
}
```

### Projector Handling

```typescript
// Projector handling loan events
async function handleLoanCreated(event: LoanCreatedEvent) {
    await prisma.loan.create({
        data: {
            loanId: event.loanId,
            borrowerId: event.borrowerId,
            amount: BigInt(event.amount),
            status: 'PendingApproval',
            collateralHash: event.collateralHash,
            appliedAt: new Date(event.appliedAt)
        }
    });

    // Notify admin for review
    await notificationService.notifyAdmins({
        type: 'LOAN_APPLICATION',
        loanId: event.loanId,
        amount: event.amount
    });
}

async function handleLoanApproved(event: LoanApprovedEvent) {
    await prisma.loan.update({
        where: { loanId: event.loanId },
        data: {
            status: 'Active',
            approvedAt: new Date(event.approvedAt)
        }
    });

    // Update borrower's wallet balance (via separate transfer event)
    // Notify borrower
    await notificationService.notifyUser(event.borrowerId, {
        type: 'LOAN_APPROVED',
        loanId: event.loanId,
        amount: event.amount
    });
}
```

---

## Part 9: Loan Pool Economics

### Pool Sustainability

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOAN POOL CASH FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Initial State:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ SYSTEM_LOAN_POOL = 312,500,000,000 coins                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Outflows (Reduce Pool):                                                   │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Loan disbursements (on approval)                          │           │
│  │ • Pool operational costs (if any)                           │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Inflows (Increase Pool):                                                  │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Loan repayments (principal only, no interest)             │           │
│  │ • Velocity tax redistribution (portion of collected tax)    │           │
│  │ • Charitable donations designated for lending               │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Default Impact:                                                           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Defaulted loans reduce pool permanently                   │           │
│  │ • Collateral recovery may partially offset                  │           │
│  │ • Trust score of defaulter decreases significantly          │           │
│  │ • Defaulter excluded from future loans                      │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Sustainability Strategy:                                                  │
│  • Conservative approval (trust score >= 75)                              │
│  • Collateral requirements for larger loans                               │
│  • Velocity tax supplements pool over time                                │
│  • No interest means no compounding debt pressure                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Trust Score Impact

| Action | Trust Score Impact |
|--------|-------------------|
| Loan application approved | +5 |
| Loan repaid on time | +10 |
| Loan repaid early | +15 |
| Late payment (< 30 days) | -10 |
| Late payment (30-90 days) | -25 |
| Default (> 90 days) | -50 |
| Repeated defaults | Permanent ban |

---

## Part 10: Security Considerations

### Attack Vectors & Mitigations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOAN POOL SECURITY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Attack: Identity Spoofing                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt: Apply for loan on behalf of another user                        │
│  Mitigation: submitterID must equal borrowerID                            │
│                                                                             │
│  Attack: Trust Score Manipulation                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt: Inflate trust score before applying                             │
│  Mitigation: Trust score verified at both application AND approval        │
│                                                                             │
│  Attack: Collateral Fraud                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt: Submit fake collateral documents                                │
│  Mitigation: Hash stored on-chain, admin verifies off-chain docs          │
│                                                                             │
│  Attack: Pool Drainage                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt: Create many accounts to drain pool                              │
│  Mitigation: KYC verification, trust score requirement, max loan limits   │
│                                                                             │
│  Attack: Unauthorized Approval                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Attempt: Non-admin approves loan                                         │
│  Mitigation: requireRole(RoleAdmin) check                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Exercises

### Exercise 1: Calculate Loan Eligibility

A user has:
- Trust Score: 72
- Account age: 6 months
- Previous loans: 1 (repaid on time)

1. Is this user eligible for a loan? Why/why not?
2. What actions could increase their trust score?

### Exercise 2: Trace Loan Flow

Trace the complete flow for a 10,000 coin loan:
1. User submits application
2. Outbox command created
3. Chaincode function called
4. Cross-contract calls made
5. Loan state changes
6. Events emitted
7. Projector updates

### Exercise 3: Pool Sustainability Analysis

Given:
- Initial pool: 312.5B coins
- Average loan: 5,000 coins
- Default rate: 2%
- Velocity tax contribution: 1B coins/year

Calculate:
1. How many loans can be issued initially?
2. What's the annual pool reduction from defaults?
3. Is the pool sustainable long-term?

---

## Summary

### Key Concepts

1. **Interest-Free**: Principal-only repayment (riba-free)
2. **Trust Score**: Minimum 75 required for eligibility
3. **Collateral Hash**: SHA-256 reference to off-chain documents
4. **Cross-Contract**: Calls to Identity and Tokenomics contracts
5. **Pool Sustainability**: Repayments + velocity tax inflows
6. **Admin Approval**: Dual verification at apply and approve

### Function Reference

| Function | Purpose | Access |
|----------|---------|--------|
| ApplyForLoan | Submit loan application | Borrower |
| ApproveLoan | Approve and disburse | Admin |
| GetLoan | Query single loan | Any |
| GetMyLoans | Query borrower's loans | Any |

### Production Checklist

- [ ] Loan pool funded at bootstrap (312.5B coins)
- [ ] Trust score calculation implemented in Identity contract
- [ ] Off-chain collateral document storage configured
- [ ] Admin approval workflow established
- [ ] Default detection and handling procedures
- [ ] Pool balance monitoring alerts

---

## Further Reading

- Loan Pool Contract: `/gx-coin-fabric/chaincode/loan_pool_contract.go`
- Loan Types: `/gx-coin-fabric/chaincode/loan_types.go`
- Related: LECTURE-13 on Tokenomics (pool allocation)
- Related: LECTURE-12 on ABAC (admin authorization)
