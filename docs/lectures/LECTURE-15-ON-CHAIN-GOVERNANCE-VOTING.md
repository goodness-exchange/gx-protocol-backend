# LECTURE 15: On-Chain Governance & Voting

## Overview

This lecture covers the on-chain governance system in GX Protocol. The governance system enables democratic decision-making for protocol parameter changes through a proposal and voting mechanism, with automatic execution upon approval.

## Learning Objectives

By the end of this lecture, you will understand:
1. System parameters and their on-chain configuration
2. The proposal lifecycle from submission to execution
3. Vote recording and double-vote prevention
4. Time-bounded voting periods
5. Cross-contract execution of approved proposals
6. Rich queries for proposal listing

---

## Part 1: System Parameters

### What Are System Parameters?

System parameters are on-chain configurable values that control protocol behavior. Unlike hardcoded constants, these can be modified through governance.

### SystemParameter Structure

```go
// governance_types.go

type SystemParameter struct {
    DocType     string `json:"docType"`     // "systemParameter"
    ParamID     string `json:"paramID"`     // Unique identifier
    Value       string `json:"value"`       // Current value
    Description string `json:"description"` // Human-readable description
}
```

### Example Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     GOVERNABLE SYSTEM PARAMETERS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Parameter ID            │ Type    │ Example Value │ Description           │
│  ────────────────────────┼─────────┼───────────────┼─────────────────────── │
│  velocityTaxMinBps       │ uint64  │ "250"         │ Min hoarding tax 2.5% │
│  velocityTaxMaxBps       │ uint64  │ "600"         │ Max hoarding tax 6.0% │
│  velocityTaxPeriodDays   │ int     │ "355"         │ Holding period trigger│
│  transactionFeeBps       │ uint64  │ "10"          │ Default tx fee 0.1%   │
│  votingPeriodDays        │ int     │ "14"          │ Proposal voting window│
│  minProposalQuorum       │ int64   │ "1000"        │ Min votes required    │
│  loanInterestRateBps     │ uint64  │ "0"           │ Loan interest (0%)    │
│  maxLoanDurationDays     │ int     │ "365"         │ Maximum loan term     │
│                                                                             │
│  Note: All values stored as strings for flexibility                        │
│        Parsed to appropriate types at runtime                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why On-Chain Parameters?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HARDCODED vs ON-CHAIN PARAMETERS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Hardcoded Constants (consts.go):                                          │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • MaxSupply = 1.25T (IMMUTABLE - never changes)             │           │
│  │ • Precision = 1,000,000 (IMMUTABLE - unit definition)       │           │
│  │ • Phase allocations (IMMUTABLE - economic foundation)       │           │
│  │                                                              │           │
│  │ Change requires: Chaincode upgrade, network consensus       │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  On-Chain Parameters (SystemParameter):                                    │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Fee rates (adjustable based on network conditions)        │           │
│  │ • Tax rates (tunable for economic balance)                  │           │
│  │ • Time periods (adaptable to operational needs)             │           │
│  │                                                              │           │
│  │ Change requires: Governance proposal, vote, execution       │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Design Principle:                                                          │
│  • Fundamental economics = hardcoded (trust guarantee)                     │
│  • Operational parameters = governable (flexibility)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Proposal Structure

### Proposal Data Structure

```go
// governance_types.go

type Proposal struct {
    DocType      string    `json:"docType"`      // "proposal"
    ProposalID   string    `json:"proposalID"`   // Unique ID (PROP_xxx)
    TargetParam  string    `json:"targetParam"`  // Parameter to modify
    NewValue     string    `json:"newValue"`     // Proposed new value
    ProposerID   string    `json:"proposerID"`   // Who submitted
    Status       string    `json:"status"`       // Lifecycle status
    ForVotes     int64     `json:"forVotes"`     // Votes in favor
    AgainstVotes int64     `json:"againstVotes"` // Votes against
    EndTime      time.Time `json:"endTime"`      // Voting deadline
}
```

### Proposal Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROPOSAL LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   Not Created   │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           │ SubmitProposal() by Admin                                       │
│           │ (Voting period = 14 days)                                       │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │     Active      │ ◄──── Open for voting                                 │
│  │                 │       ForVotes: 0, AgainstVotes: 0                    │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           │ VoteOnProposal() by eligible voters                             │
│           │ (Multiple voters, 14 days)                                      │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  Voting Period  │ ◄──── Votes accumulated                               │
│  │     Ends        │       ForVotes: N, AgainstVotes: M                    │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           │ ExecuteProposal() by Admin                                      │
│           │ (After EndTime)                                                 │
│           ▼                                                                 │
│  ┌────────┴────────┐                                                        │
│  │                 │                                                        │
│  ▼                 ▼                                                        │
│ ForVotes >       ForVotes <=                                                │
│ AgainstVotes     AgainstVotes                                               │
│  │                 │                                                        │
│  ▼                 ▼                                                        │
│ ┌────────────┐  ┌────────────┐                                              │
│ │  Executed  │  │   Failed   │                                              │
│ └────────────┘  └────────────┘                                              │
│       │                                                                     │
│       │ If cross-contract call fails                                        │
│       ▼                                                                     │
│ ┌──────────────────┐                                                        │
│ │ FailedExecution  │ ◄──── Rare: parameter update failed                   │
│ └──────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Submit Proposal

### SubmitProposal Implementation

```go
// governance_contract.go

func (s *GovernanceContract) SubmitProposal(
    ctx contractapi.TransactionContextInterface,
    targetParam string,
    newValue string,
) (string, error) {
    // 1. Authorization: Only admins can submit proposals
    err := requireRole(ctx, RoleAdmin)
    if err != nil {
        return "", err
    }

    submitterID, _ := ctx.GetClientIdentity().GetID()

    // 2. Validate target parameter exists
    paramJSON, _ := ctx.GetStub().GetState(targetParam)
    if paramJSON == nil {
        return "", fmt.Errorf("parameter %s does not exist", targetParam)
    }

    // 3. Check for duplicate active proposals
    queryString := fmt.Sprintf(
        `{"selector":{"docType":"proposal","targetParam":"%s","newValue":"%s","status":"Active"}}`,
        targetParam, newValue,
    )
    resultsIterator, _ := ctx.GetStub().GetQueryResult(queryString)
    defer resultsIterator.Close()

    if resultsIterator.HasNext() {
        return "", fmt.Errorf("active proposal already exists for this change")
    }

    // 4. Create proposal with 14-day voting period
    txTime, _ := getTransactionTimestamp(ctx)
    proposalID := "PROP_" + generateUUID()
    votingPeriod := time.Hour * 24 * 14  // 14 days

    proposal := Proposal{
        DocType:      ProposalDocType,
        ProposalID:   proposalID,
        TargetParam:  targetParam,
        NewValue:     newValue,
        ProposerID:   submitterID,
        Status:       "Active",
        ForVotes:     0,
        AgainstVotes: 0,
        EndTime:      txTime.Add(votingPeriod),
    }

    ctx.GetStub().PutState(proposalID, proposalJSON)
    return proposalID, nil
}
```

### Key Features

1. **Admin-Only Submission**: Prevents spam proposals
2. **Parameter Existence Check**: Cannot propose changes to undefined parameters
3. **Duplicate Prevention**: No two identical active proposals
4. **Fixed Voting Window**: 14 days from submission

---

## Part 4: Voting Mechanism

### VoteOnProposal Implementation

```go
// governance_contract.go

func (s *GovernanceContract) VoteOnProposal(
    ctx contractapi.TransactionContextInterface,
    proposalID string,
    vote bool,  // true = for, false = against
) error {
    submitterID, _ := ctx.GetClientIdentity().GetID()
    proposal, _ := s._getProposal(ctx, proposalID)
    txTime, _ := getTransactionTimestamp(ctx)

    // 1. Validate proposal is active
    if proposal.Status != "Active" {
        return fmt.Errorf("proposal not active for voting")
    }

    // 2. Validate within voting period
    if txTime.After(proposal.EndTime) {
        return fmt.Errorf("voting period has ended")
    }

    // 3. Check for double voting using vote receipts
    voteKey := fmt.Sprintf("vote_%s_%s", proposalID, submitterID)
    voteReceipt, _ := ctx.GetStub().GetState(voteKey)
    if voteReceipt != nil {
        return fmt.Errorf("user has already voted")
    }

    // 4. Record the vote
    if vote {
        proposal.ForVotes++
    } else {
        proposal.AgainstVotes++
    }

    // 5. Save proposal and vote receipt atomically
    ctx.GetStub().PutState(proposalID, proposalJSON)
    ctx.GetStub().PutState(voteKey, []byte("voted"))

    return nil
}
```

### Double-Vote Prevention

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VOTE RECEIPT MECHANISM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Vote Receipt Key Format:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ vote_{proposalID}_{voterID}                                 │           │
│  │                                                              │           │
│  │ Example: vote_PROP_abc123_user-alice-456                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  First Vote by Alice:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ 1. Check: GetState("vote_PROP_abc123_user-alice-456")       │           │
│  │ 2. Result: nil (not found)                                   │           │
│  │ 3. Action: Record vote, create receipt                      │           │
│  │ 4. PutState("vote_PROP_abc123_user-alice-456", "voted")     │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Second Vote Attempt by Alice:                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ 1. Check: GetState("vote_PROP_abc123_user-alice-456")       │           │
│  │ 2. Result: "voted" (found!)                                  │           │
│  │ 3. Action: REJECT - "user has already voted"                │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Benefits:                                                                  │
│  • Permanent record on ledger                                              │
│  • Efficient O(1) lookup                                                   │
│  • No complex list iteration                                               │
│  • Audit trail preserved                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Proposal Execution

### ExecuteProposal Implementation

```go
// governance_contract.go

func (s *GovernanceContract) ExecuteProposal(
    ctx contractapi.TransactionContextInterface,
    proposalID string,
) error {
    // 1. Authorization: Only admins can execute
    err := requireRole(ctx, RoleAdmin)
    if err != nil {
        return err
    }

    proposal, _ := s._getProposal(ctx, proposalID)
    txTime, _ := getTransactionTimestamp(ctx)

    // 2. Validate proposal state
    if proposal.Status != "Active" {
        return fmt.Errorf("proposal not in executable state")
    }

    // 3. Validate voting period has ended
    if txTime.Before(proposal.EndTime) {
        return fmt.Errorf("voting period has not ended")
    }

    // 4. Determine outcome
    if proposal.ForVotes > proposal.AgainstVotes {
        // PASSED - Execute the parameter change

        // Cross-contract call to AdminContract
        invokeArgs := [][]byte{
            []byte("UpdateSystemParameter"),
            []byte(proposal.TargetParam),
            []byte(proposal.NewValue),
        }
        channelName := ctx.GetStub().GetChannelID()
        response := ctx.GetStub().InvokeChaincode(ChaincodeName, invokeArgs, channelName)

        if response.Status >= 400 {
            proposal.Status = "FailedExecution"
            fmt.Printf("ERROR: Proposal %s passed but failed to execute: %s\n",
                proposalID, response.Message)
        } else {
            proposal.Status = "Executed"
        }
    } else {
        // FAILED - Not enough votes
        proposal.Status = "Failed"
    }

    ctx.GetStub().PutState(proposalID, proposalJSON)
    return nil
}
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROPOSAL EXECUTION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ExecuteProposal("PROP_abc123")                                            │
│          │                                                                  │
│          ▼                                                                  │
│  ┌───────────────────┐                                                      │
│  │ Validate Admin    │                                                      │
│  │ Role              │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Check Status =    │                                                      │
│  │ "Active"          │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Check txTime >    │                                                      │
│  │ EndTime           │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ ForVotes >        │──── No ────► Status = "Failed"                      │
│  │ AgainstVotes?     │                                                      │
│  └─────────┬─────────┘                                                      │
│            │ Yes                                                            │
│            ▼                                                                │
│  ┌───────────────────────────────────────────────────────────┐             │
│  │ Cross-Contract Call:                                      │             │
│  │ Admin:UpdateSystemParameter(targetParam, newValue)        │             │
│  └─────────┬─────────────────────────────────────────────────┘             │
│            │                                                                │
│            ▼                                                                │
│  ┌───────────────────┐                                                      │
│  │ Call Succeeded?   │──── No ────► Status = "FailedExecution"             │
│  └─────────┬─────────┘                                                      │
│            │ Yes                                                            │
│            ▼                                                                │
│       Status = "Executed"                                                   │
│       Parameter Updated!                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Querying Proposals

### GetProposalDetails

```go
// governance_contract.go

func (s *GovernanceContract) GetProposalDetails(
    ctx contractapi.TransactionContextInterface,
    proposalID string,
) (*Proposal, error) {
    return s._getProposal(ctx, proposalID)
}
```

### ListActiveProposals

```go
// governance_contract.go

func (s *GovernanceContract) ListActiveProposals(
    ctx contractapi.TransactionContextInterface,
) ([]Proposal, error) {
    // Rich query using CouchDB selector
    queryString := `{"selector":{"docType":"proposal","status":"Active"}}`

    resultsIterator, _ := ctx.GetStub().GetQueryResult(queryString)
    defer resultsIterator.Close()

    var activeProposals []Proposal
    for resultsIterator.HasNext() {
        queryResponse, _ := resultsIterator.Next()

        var proposal Proposal
        json.Unmarshal(queryResponse.Value, &proposal)
        activeProposals = append(activeProposals, proposal)
    }

    return activeProposals, nil
}
```

### Rich Query Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COUCHDB RICH QUERIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GX Protocol uses CouchDB as the state database for each peer.             │
│  This enables rich queries using JSON selectors.                            │
│                                                                             │
│  Query Example:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ {                                                            │           │
│  │   "selector": {                                              │           │
│  │     "docType": "proposal",                                   │           │
│  │     "status": "Active"                                       │           │
│  │   }                                                          │           │
│  │ }                                                            │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Why CouchDB?                                                              │
│  • JSON document storage (natural fit for chaincode data)                  │
│  • Rich query support (filter by any field)                                │
│  • Indexes for performance (on docType, status, etc.)                      │
│  • Full text search capability                                             │
│                                                                             │
│  Note: Rich queries are only available with CouchDB, not LevelDB           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Complete Governance Flow

### Example: Changing Velocity Tax Rate

```
┌─────────────────────────────────────────────────────────────────────────────┐
│        EXAMPLE: PROPOSAL TO CHANGE VELOCITY TAX FROM 2.5% TO 3.0%          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Day 0: Admin Submits Proposal                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  SubmitProposal("velocityTaxMinBps", "300")                                │
│                                                                             │
│  Result:                                                                    │
│  • ProposalID: "PROP_velocity123"                                          │
│  • Status: "Active"                                                         │
│  • EndTime: Day 0 + 14 days                                                │
│  • ForVotes: 0, AgainstVotes: 0                                            │
│                                                                             │
│  Days 1-14: Community Voting                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Day 2: Alice votes FOR                                                    │
│  VoteOnProposal("PROP_velocity123", true)                                  │
│  → ForVotes: 1                                                              │
│                                                                             │
│  Day 3: Bob votes AGAINST                                                  │
│  VoteOnProposal("PROP_velocity123", false)                                 │
│  → AgainstVotes: 1                                                          │
│                                                                             │
│  Day 5: Carol votes FOR                                                    │
│  VoteOnProposal("PROP_velocity123", true)                                  │
│  → ForVotes: 2                                                              │
│                                                                             │
│  Day 7: Dave votes FOR                                                     │
│  VoteOnProposal("PROP_velocity123", true)                                  │
│  → ForVotes: 3                                                              │
│                                                                             │
│  Day 14: Voting Period Ends                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Final Tally: ForVotes: 3, AgainstVotes: 1                                 │
│                                                                             │
│  Day 15: Admin Executes Proposal                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ExecuteProposal("PROP_velocity123")                                       │
│                                                                             │
│  Result:                                                                    │
│  • 3 > 1 → Proposal PASSED                                                 │
│  • Cross-contract: Admin:UpdateSystemParameter("velocityTaxMinBps", "300") │
│  • Status: "Executed"                                                       │
│  • velocityTaxMinBps now = 300 (3.0%)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Backend Integration

### Submitting Proposals

```typescript
// Service layer for governance
async function submitProposal(dto: SubmitProposalDTO) {
    await prisma.outboxCommand.create({
        data: {
            aggregateId: `proposal-${Date.now()}`,
            commandType: 'SUBMIT_PROPOSAL',
            payload: {
                targetParam: dto.paramId,
                newValue: dto.newValue
            }
        }
    });
}
```

### Projector Handling

```typescript
// Projector handling proposal events
async function handleProposalCreated(event: ProposalCreatedEvent) {
    await prisma.proposal.create({
        data: {
            proposalId: event.proposalId,
            targetParam: event.targetParam,
            newValue: event.newValue,
            proposerId: event.proposerId,
            status: 'Active',
            forVotes: 0,
            againstVotes: 0,
            endTime: new Date(event.endTime)
        }
    });
}

async function handleVoteCast(event: VoteCastEvent) {
    await prisma.proposal.update({
        where: { proposalId: event.proposalId },
        data: {
            forVotes: event.vote ? { increment: 1 } : undefined,
            againstVotes: !event.vote ? { increment: 1 } : undefined
        }
    });

    await prisma.voteRecord.create({
        data: {
            proposalId: event.proposalId,
            voterId: event.voterId,
            vote: event.vote,
            timestamp: new Date()
        }
    });
}
```

### API Endpoints

```typescript
// routes/governance.ts

// List active proposals
router.get('/proposals/active', async (req, res) => {
    const proposals = await prisma.proposal.findMany({
        where: { status: 'Active' }
    });
    res.json(proposals);
});

// Get proposal details with vote breakdown
router.get('/proposals/:id', async (req, res) => {
    const proposal = await prisma.proposal.findUnique({
        where: { proposalId: req.params.id },
        include: { votes: true }
    });
    res.json(proposal);
});

// Cast vote
router.post('/proposals/:id/vote', authenticate, async (req, res) => {
    await prisma.outboxCommand.create({
        data: {
            aggregateId: req.params.id,
            commandType: 'CAST_VOTE',
            payload: {
                proposalId: req.params.id,
                vote: req.body.vote
            }
        }
    });
    res.status(202).json({ message: 'Vote submitted' });
});
```

---

## Part 9: Governance Security

### Authorization Matrix

| Function | SuperAdmin | Admin | PartnerAPI | User |
|----------|:----------:|:-----:|:----------:|:----:|
| SubmitProposal | ❌ | ✅ | ❌ | ❌ |
| VoteOnProposal | ✅ | ✅ | ✅ | ✅ |
| ExecuteProposal | ❌ | ✅ | ❌ | ❌ |
| GetProposalDetails | ✅ | ✅ | ✅ | ✅ |
| ListActiveProposals | ✅ | ✅ | ✅ | ✅ |

### Attack Vectors & Mitigations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOVERNANCE SECURITY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Attack: Proposal Spam                                                      │
│  Mitigation: Admin-only proposal submission                                │
│                                                                             │
│  Attack: Double Voting                                                      │
│  Mitigation: Vote receipt keys (vote_{proposalID}_{voterID})               │
│                                                                             │
│  Attack: Early Execution                                                   │
│  Mitigation: Time check (txTime must be > EndTime)                         │
│                                                                             │
│  Attack: Parameter Manipulation                                            │
│  Mitigation: Target parameter must exist on ledger                         │
│                                                                             │
│  Attack: Vote After Deadline                                               │
│  Mitigation: Time check (txTime must be < EndTime)                         │
│                                                                             │
│  Attack: Duplicate Proposals                                               │
│  Mitigation: Rich query checks for identical active proposals              │
│                                                                             │
│  Attack: Unauthorized Execution                                            │
│  Mitigation: Admin role required for ExecuteProposal                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 10: Governance Best Practices

### Proposal Guidelines

1. **Clear Scope**: Each proposal should change exactly one parameter
2. **Impact Analysis**: Document expected effects before submission
3. **Community Discussion**: Allow informal discussion before formal proposal
4. **Voting Period**: 14 days allows global participation across time zones

### Parameter Change Considerations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BEFORE PROPOSING CHANGES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Economic Impact Assessment                                             │
│     □ How does this affect user behavior?                                  │
│     □ What are the second-order effects?                                   │
│     □ Are there unintended consequences?                                   │
│                                                                             │
│  2. Stakeholder Analysis                                                   │
│     □ Who benefits from this change?                                       │
│     □ Who is negatively impacted?                                          │
│     □ Is the change fair across user groups?                               │
│                                                                             │
│  3. Technical Validation                                                   │
│     □ Is the new value within valid ranges?                                │
│     □ Does it maintain system integrity?                                   │
│     □ Has it been tested on testnet?                                       │
│                                                                             │
│  4. Rollback Plan                                                          │
│     □ Can this be reversed if needed?                                      │
│     □ What's the process for reversal?                                     │
│     □ What are the monitoring triggers?                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Exercises

### Exercise 1: Design a Proposal

Design a governance proposal to reduce transaction fees from 0.10% to 0.08%:
1. What is the targetParam?
2. What is the newValue?
3. What impact analysis would you perform?
4. How would you monitor the effects?

### Exercise 2: Vote Counting

Given a proposal with:
- EndTime: January 15, 2025
- ForVotes: 145
- AgainstVotes: 143
- Current time: January 16, 2025

1. Can ExecuteProposal be called?
2. What will be the final status?
3. What cross-contract call will be made?

### Exercise 3: Edge Cases

Analyze these scenarios:
1. A proposal passes but UpdateSystemParameter fails
2. Someone tries to vote at exactly EndTime
3. Two admins submit identical proposals simultaneously

---

## Summary

### Key Concepts

1. **System Parameters**: On-chain configurable protocol values
2. **Proposal Lifecycle**: Active → Voting → Executed/Failed
3. **Vote Receipts**: Composite key prevents double voting
4. **Time-Bounded Voting**: 14-day period for participation
5. **Cross-Contract Execution**: GovernanceContract → AdminContract
6. **Rich Queries**: CouchDB enables flexible proposal listing

### Function Reference

| Function | Purpose | Access |
|----------|---------|--------|
| SubmitProposal | Create new proposal | Admin |
| VoteOnProposal | Cast vote on active proposal | Any |
| ExecuteProposal | Finalize and execute | Admin |
| GetProposalDetails | Query single proposal | Any |
| ListActiveProposals | List open proposals | Any |

### Production Checklist

- [ ] All governable parameters initialized at bootstrap
- [ ] Admin identities enrolled with proper attributes
- [ ] CouchDB indexes created for proposal queries
- [ ] Voting period configured appropriately
- [ ] Backend projector handling governance events
- [ ] Notification system for proposal lifecycle
- [ ] Monitoring for parameter changes

---

## Further Reading

- Governance Contract: `/gx-coin-fabric/chaincode/governance_contract.go`
- Governance Types: `/gx-coin-fabric/chaincode/governance_types.go`
- Admin Contract (UpdateSystemParameter): `/gx-coin-fabric/chaincode/admin_contract.go`
- Related: LECTURE-12 on ABAC (admin authorization)
- Related: LECTURE-11 on Cross-Contract Communication
