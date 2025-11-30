# LECTURE 17: User Identity & KYC Verification

## Overview

This lecture covers the identity management system in GX Protocol. The IdentityContract manages user creation, biometric verification, social relationships, trust scores, and account recovery - forming the foundation of the permissioned blockchain's identity layer.

## Learning Objectives

By the end of this lecture, you will understand:
1. The separation between Users (individuals) and Organizations (businesses)
2. Biometric hash verification for unique identity
3. The relationship graph and social verification
4. Trust score calculation algorithm
5. Guardian-based social recovery mechanism
6. KYC workflow integration with the blockchain

---

## Part 1: Identity Architecture

### Users vs Organizations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDENTITY ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                         USER                                 │           │
│  │              (Always an Individual Human)                    │           │
│  ├─────────────────────────────────────────────────────────────┤           │
│  │ • One human = One User (verified via biometrics)            │           │
│  │ • Has personal wallet balance                               │           │
│  │ • Can receive genesis distribution                          │           │
│  │ • Can create/join Organizations                             │           │
│  │ • Subject to velocity tax                                   │           │
│  │ • Has Trust Score (affects loan eligibility)                │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                              │                                              │
│                              │ Creates/Joins                                │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      ORGANIZATION                            │           │
│  │            (Business, NGO, or Government)                    │           │
│  ├─────────────────────────────────────────────────────────────┤           │
│  │ • Has multiple stakeholders (User IDs)                      │           │
│  │ • Requires stakeholder endorsement                          │           │
│  │ • Has separate organization wallet                          │           │
│  │ • Multi-sig transaction approval                            │           │
│  │ • Subject to velocity tax                                   │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Key Principle: Users are NEVER businesses.                                │
│  Businesses are Organizations owned by Users.                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Data Structure

```go
// identity_types.go

type User struct {
    DocType       string    `json:"docType"`       // "user"
    UserID        string    `json:"userID"`        // Unique identifier
    BiometricHash string    `json:"biometricHash"` // SHA-256 of biometric data
    Nationality   string    `json:"nationality"`   // ISO 3166-1 alpha-2 code
    Age           int       `json:"age"`           // For genesis eligibility
    Status        string    `json:"status"`        // Lifecycle status
    TrustScore    int       `json:"trustScore"`    // Dynamic reputation score
    Guardians     []string  `json:"guardians"`     // Recovery guardians
    CreatedAt     time.Time `json:"createdAt"`     // Creation timestamp
    GenesisMinted bool      `json:"genesisMinted"` // Genesis distribution flag

    // Velocity Tax Tracking
    VelocityTaxTimerStart time.Time `json:"velocityTaxTimerStart,omitempty"`
    VelocityTaxLastCheck  time.Time `json:"velocityTaxLastCheck,omitempty"`
    VelocityTaxExempt     bool      `json:"velocityTaxExempt,omitempty"`
}
```

### User Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        USER STATUS LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │  Not Registered │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           │ Off-chain KYC + Biometric verification                          │
│           │ Admin approves in backend                                       │
│           │ CreateUser() called                                             │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │     Active      │ ◄──── Default status after creation                   │
│  │                 │       Can transact, receive genesis                    │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│      ┌────┴────────────┐                                                    │
│      │                 │                                                    │
│      ▼                 ▼                                                    │
│ ┌─────────┐      ┌───────────┐                                              │
│ │ Locked  │      │ Deceased  │                                              │
│ └────┬────┘      └───────────┘                                              │
│      │            Permanent                                                 │
│      │            (No recovery)                                             │
│      ▼                                                                      │
│ ┌─────────┐                                                                 │
│ │ Active  │ (After admin unlock)                                           │
│ └─────────┘                                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: User Creation (CreateUser)

### Implementation

```go
// identity_contract.go

func (s *IdentityContract) CreateUser(
    ctx contractapi.TransactionContextInterface,
    userID string,
    biometricHash string,
    nationality string,
    age int,
) error {
    // 1. Input validation
    if userID == "" {
        return fmt.Errorf("userID cannot be empty")
    }
    if len(biometricHash) != 64 {
        return fmt.Errorf("invalid biometricHash: must be 64 hex characters (SHA-256)")
    }
    if len(nationality) != 2 {
        return fmt.Errorf("invalid nationality: must be 2-letter ISO code")
    }
    nationality = strings.ToUpper(nationality)

    // 2. Validate country exists in system
    countryKey := fmt.Sprintf("stats_%s", nationality)
    countryStatsJSON, _ := ctx.GetStub().GetState(countryKey)
    if countryStatsJSON == nil {
        return fmt.Errorf("country %s not registered in system", nationality)
    }

    // 3. Check user doesn't already exist
    exists, _ := s._userExists(ctx, userID)
    if exists {
        return fmt.Errorf("user %s already exists", userID)
    }

    // 4. Create user with default values
    txTime, _ := getTransactionTimestamp(ctx)

    user := User{
        DocType:       UserDocType,
        UserID:        userID,
        BiometricHash: biometricHash,
        Nationality:   nationality,
        Age:           age,
        Status:        "Active",  // Created after admin approval
        TrustScore:    10,        // Base trust score
        CreatedAt:     txTime,
    }

    // 5. Save to ledger
    userJSON, _ := json.Marshal(user)
    ctx.GetStub().PutState(userID, userJSON)

    // 6. Emit event
    ctx.GetStub().SetEvent("UserCreated", eventJSON)

    return nil
}
```

### Biometric Hash Verification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BIOMETRIC VERIFICATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Off-Chain (Backend/Mobile App):                                           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ 1. User provides biometric data (fingerprint, face, etc.)   │           │
│  │ 2. KYC provider verifies against government database        │           │
│  │ 3. Biometric template extracted                             │           │
│  │ 4. SHA-256 hash computed from template                      │           │
│  │    biometricHash = SHA256(biometricTemplate)                │           │
│  │ 5. Original biometric data DISCARDED                        │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                              │                                              │
│                              │ Only hash sent to blockchain                 │
│                              ▼                                              │
│  On-Chain (Chaincode):                                                      │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Hash stored in User.BiometricHash                         │           │
│  │ • Used for uniqueness verification                          │           │
│  │ • Original biometric data never touches blockchain          │           │
│  │ • Privacy preserved while preventing duplicate accounts     │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Privacy Benefits:                                                          │
│  • Biometric data stays off-chain                                          │
│  • Hash cannot be reversed to original data                                │
│  • Duplicate detection without exposing personal info                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: KYC Workflow Integration

### Complete Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KYC-TO-BLOCKCHAIN WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: User Registration (Mobile App)                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • User downloads app                                                      │
│  • Enters basic info (name, email, phone)                                  │
│  • Creates local account                                                   │
│  • Status: "Pending KYC"                                                   │
│                                                                             │
│  Step 2: KYC Verification (Third-Party Provider)                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • User submits government ID                                              │
│  • Face verification (liveness check)                                      │
│  • Biometric capture (fingerprint/face template)                           │
│  • Address verification                                                    │
│  • KYC provider returns: PASS/FAIL + verified data                        │
│                                                                             │
│  Step 3: Admin Review (Backend Dashboard)                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Admin reviews KYC results                                               │
│  • Verifies no duplicate biometric hash exists                             │
│  • Approves or rejects application                                         │
│  • On approval: triggers blockchain user creation                          │
│                                                                             │
│  Step 4: On-Chain Creation (Chaincode)                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Outbox command: CREATE_USER                                             │
│  • Outbox-submitter calls: Identity:CreateUser()                           │
│  • User created with Status: "Active"                                      │
│  • UserCreated event emitted                                               │
│                                                                             │
│  Step 5: Genesis Distribution (Chaincode)                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Outbox command: DISTRIBUTE_GENESIS                                      │
│  • Outbox-submitter calls: Tokenomics:DistributeGenesis()                  │
│  • User receives phase-appropriate coins                                   │
│  • User.GenesisMinted = true                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backend KYC Service

```typescript
// services/kyc.service.ts

interface KYCResult {
    status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
    biometricHash: string;
    nationality: string;
    dateOfBirth: Date;
    verifiedName: string;
}

async function processKYCApplication(userId: string, kycData: KYCResult) {
    // 1. Check for duplicate biometric hash
    const existingUser = await prisma.user.findFirst({
        where: { biometricHash: kycData.biometricHash }
    });

    if (existingUser) {
        throw new Error('Biometric already registered');
    }

    // 2. Calculate age from DOB
    const age = calculateAge(kycData.dateOfBirth);

    // 3. Store in database (pending blockchain sync)
    await prisma.user.update({
        where: { id: userId },
        data: {
            biometricHash: kycData.biometricHash,
            nationality: kycData.nationality,
            age: age,
            kycStatus: 'APPROVED',
            kycApprovedAt: new Date()
        }
    });

    // 4. Create outbox command for blockchain
    await prisma.outboxCommand.create({
        data: {
            aggregateId: userId,
            commandType: 'CREATE_USER',
            payload: {
                userID: userId,
                biometricHash: kycData.biometricHash,
                nationality: kycData.nationality,
                age: age
            }
        }
    });

    // 5. Queue genesis distribution (after user created)
    await prisma.outboxCommand.create({
        data: {
            aggregateId: userId,
            commandType: 'DISTRIBUTE_GENESIS',
            payload: {
                userID: userId,
                nationality: kycData.nationality
            }
        }
    });
}
```

---

## Part 4: Social Relationships

### Relationship Structure

```go
// identity_types.go

type Relationship struct {
    DocType        string    `json:"docType"`        // "relationship"
    RelationshipID string    `json:"relationshipID"` // Format: {subjectID}:{type}:{objectID}
    SubjectID      string    `json:"subjectID"`      // Who initiated
    ObjectID       string    `json:"objectID"`       // Who was invited
    Type           string    `json:"type"`           // Relationship type
    Status         string    `json:"status"`         // Pending/Confirmed
    CreatedAt      time.Time `json:"createdAt"`
}
```

### Relationship Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP TYPES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Family Relationships (Higher Trust Score Impact):                         │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ FATHER_OF, MOTHER_OF, PARENT_OF  → +30 to trust score      │           │
│  │ SPOUSE_OF                         → +25 to trust score      │           │
│  │ SIBLING_OF                        → +15 to trust score      │           │
│  │ CHILD_OF                          → +10 to trust score      │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Social Relationships (Lower Trust Score Impact):                          │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ FRIEND_OF                         → +1 per friend (max 10)  │           │
│  │ COLLEAGUE_OF                      → Future implementation   │           │
│  │ NEIGHBOR_OF                       → Future implementation   │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Relationship ID Format:                                                   │
│  {subjectID}:{type}:{objectID}                                             │
│  Example: "user-alice:SPOUSE_OF:user-bob"                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Relationship Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP WORKFLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: Request (by Subject)                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Alice: RequestRelationship("alice", "bob", "SPOUSE_OF")                   │
│                                                                             │
│  Validation:                                                               │
│  • Submitter must be the subject (alice)                                   │
│  • Both users must exist                                                   │
│  • Cannot self-reference                                                   │
│  • Relationship must not already exist                                     │
│                                                                             │
│  Result:                                                                    │
│  • RelationshipID: "alice:SPOUSE_OF:bob"                                   │
│  • Status: "PendingConfirmation"                                           │
│  • Event: RelationshipRequested                                            │
│                                                                             │
│  Step 2: Confirmation (by Object)                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Bob: ConfirmRelationship("alice:SPOUSE_OF:bob")                           │
│                                                                             │
│  Validation:                                                               │
│  • Submitter must be the object (bob)                                      │
│  • Relationship must be pending                                            │
│                                                                             │
│  Result:                                                                    │
│  • Status: "Confirmed"                                                      │
│  • Trust scores updated for both users                                     │
│  • Event: RelationshipConfirmed                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Trust Score System

### Trust Score Calculation

```go
// identity_contract.go

func (s *IdentityContract) _updateTrustScore(
    ctx contractapi.TransactionContextInterface,
    userID string,
) error {
    profile, _ := s.GetMyProfile(ctx, userID)

    // Scoring weights
    const baseScore = 10
    const maxFamilyScore = 80
    const maxBusinessScore = 10
    const maxFriendsScore = 10

    var familyScore, businessScore, friendsScore int

    // Family relationships
    var parentCount, spouseCount, siblingCount, childCount int
    for _, rel := range profile.Relationships {
        switch rel.Type {
        case "FATHER_OF", "MOTHER_OF", "PARENT_OF":
            parentCount++
        case "SPOUSE_OF":
            spouseCount++
        case "SIBLING_OF":
            siblingCount++
        case "CHILD_OF":
            childCount++
        }
    }

    // Calculate family score
    if parentCount > 0 { familyScore += 30 }
    if spouseCount > 0 { familyScore += 25 }
    if siblingCount > 0 { familyScore += 15 }
    if childCount > 0 { familyScore += 10 }
    if familyScore > maxFamilyScore {
        familyScore = maxFamilyScore
    }

    // Friends score (1 point per friend, max 10)
    friendCount := 0
    for _, rel := range profile.Relationships {
        if rel.Type == "FRIEND_OF" {
            friendCount++
        }
    }
    friendsScore = min(friendCount, maxFriendsScore)

    // Final score
    finalScore := baseScore + familyScore + businessScore + friendsScore

    // Update user
    userToUpdate := profile.User
    userToUpdate.TrustScore = finalScore
    ctx.GetStub().PutState(userID, userJSON)

    return nil
}
```

### Trust Score Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRUST SCORE COMPOSITION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Maximum Possible Score: 110                                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Component       │ Points  │ Notes                           │           │
│  ├─────────────────┼─────────┼─────────────────────────────────┤           │
│  │ Base Score      │ 10      │ Everyone starts here            │           │
│  │                 │         │                                 │           │
│  │ Family Score    │ 0-80    │ Cap at 80 total                 │           │
│  │   - Parents     │ +30     │ Having verified parents         │           │
│  │   - Spouse      │ +25     │ Having verified spouse          │           │
│  │   - Siblings    │ +15     │ Having verified siblings        │           │
│  │   - Children    │ +10     │ Having verified children        │           │
│  │                 │         │                                 │           │
│  │ Friends Score   │ 0-10    │ +1 per friend, max 10           │           │
│  │                 │         │                                 │           │
│  │ Business Score  │ 0-10    │ Organization memberships        │           │
│  │                 │         │ (Future implementation)         │           │
│  └─────────────────┴─────────┴─────────────────────────────────┘           │
│                                                                             │
│  Trust Score Uses:                                                          │
│  • Loan eligibility (minimum 75 required)                                  │
│  • Future: Transaction limits                                              │
│  • Future: Governance voting weight                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Profile Query

### GetMyProfile Implementation

```go
// identity_contract.go

func (s *IdentityContract) GetMyProfile(
    ctx contractapi.TransactionContextInterface,
    userID string,
) (*Profile, error) {
    // 1. Get user data
    userJSON, _ := ctx.GetStub().GetState(userID)
    if userJSON == nil {
        return nil, fmt.Errorf("user %s does not exist", userID)
    }

    var user User
    json.Unmarshal(userJSON, &user)

    // 2. Rich query for confirmed relationships
    queryString := fmt.Sprintf(
        `{"selector":{
            "docType":"relationship",
            "status":"Confirmed",
            "$or":[
                {"subjectID":"%s"},
                {"objectID":"%s"}
            ]
        }}`,
        userID, userID,
    )

    resultsIterator, _ := ctx.GetStub().GetQueryResult(queryString)
    defer resultsIterator.Close()

    var relationships []Relationship
    for resultsIterator.HasNext() {
        queryResponse, _ := resultsIterator.Next()
        var rel Relationship
        json.Unmarshal(queryResponse.Value, &rel)
        relationships = append(relationships, rel)
    }

    // 3. Return combined profile
    return &Profile{
        User:          user,
        Relationships: relationships,
    }, nil
}
```

### Profile Data Structure

```go
// identity_types.go

type Profile struct {
    User          User           `json:"user"`
    Relationships []Relationship `json:"relationships"`
}
```

---

## Part 7: Social Recovery

### Guardian System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SOCIAL RECOVERY SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Setup Phase:                                                               │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ User nominates guardians (minimum 3 required)               │           │
│  │                                                              │           │
│  │ NominateGuardians(["guardian1", "guardian2", "guardian3"])  │           │
│  │                                                              │           │
│  │ Validation:                                                  │           │
│  │ • At least 3 guardians                                      │           │
│  │ • All guardians must be registered users                    │           │
│  │ • Guardians stored in User.Guardians array                  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Recovery Phase:                                                            │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Step 1: Guardian initiates recovery                         │           │
│  │ InitiateRecovery(lostAccountID, newPublicKey)               │           │
│  │ → Creates RecoverySession with 7-day expiry                 │           │
│  │ → Initiator's vote counts as first confirmation             │           │
│  │                                                              │           │
│  │ Step 2: Other guardians confirm                             │           │
│  │ ConfirmRecovery(sessionID)                                  │           │
│  │ → Each guardian votes once                                  │           │
│  │                                                              │           │
│  │ Step 3: Threshold met (simple majority)                     │           │
│  │ If confirmations > 50% of guardians:                        │           │
│  │ → Session status = "Confirmed"                              │           │
│  │ → Account ownership transferred to new key                  │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### RecoverySession Structure

```go
// identity_types.go

type RecoverySession struct {
    DocType       string          `json:"docType"`       // "recoverySession"
    SessionID     string          `json:"sessionID"`     // RECOVERY_xxx
    LostAccountID string          `json:"lostAccountID"` // Account being recovered
    NewPublicKey  string          `json:"newPublicKey"`  // Proposed new owner
    Status        string          `json:"status"`        // Pending/Confirmed/Rejected
    Confirmations map[string]bool `json:"confirmations"` // Guardian votes
    CreatedAt     time.Time       `json:"createdAt"`
    ExpiresAt     time.Time       `json:"expiresAt"`     // 7-day expiry
}
```

### Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOVERY FLOW EXAMPLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Setup: Alice has guardians [Bob, Carol, Dave]                             │
│                                                                             │
│  Day 1: Alice loses her private key                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Day 2: Bob initiates recovery                                             │
│  Bob: InitiateRecovery("alice", "alice-new-pubkey")                        │
│  Result:                                                                    │
│  • SessionID: "RECOVERY_abc123"                                            │
│  • Confirmations: { Bob: true, Carol: false, Dave: false }                 │
│  • Status: "Pending"                                                        │
│  • ExpiresAt: Day 9                                                         │
│                                                                             │
│  Day 3: Carol confirms                                                     │
│  Carol: ConfirmRecovery("RECOVERY_abc123")                                 │
│  Result:                                                                    │
│  • Confirmations: { Bob: true, Carol: true, Dave: false }                  │
│  • 2/3 = 66% > 50% → THRESHOLD MET                                         │
│  • Status: "Confirmed"                                                      │
│  • Alice's account now owned by "alice-new-pubkey"                         │
│                                                                             │
│  Note: Dave's confirmation is no longer needed                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Backend Integration

### User Profile Read Model

```typescript
// Prisma schema for user read model
model UserProfile {
    id              String    @id
    userId          String    @unique
    biometricHash   String    @unique
    nationality     String
    age             Int
    status          String
    trustScore      Int
    kycStatus       String
    kycApprovedAt   DateTime?
    createdAt       DateTime
    updatedAt       DateTime  @updatedAt

    relationships   Relationship[]
    guardians       Guardian[]
}
```

### Projector Handling

```typescript
// Projector for identity events
async function handleUserCreated(event: UserCreatedEvent) {
    await prisma.userProfile.upsert({
        where: { userId: event.userID },
        create: {
            userId: event.userID,
            nationality: event.nationality,
            status: 'Active',
            trustScore: 10,
            createdAt: new Date(event.timestamp * 1000)
        },
        update: {
            status: 'Active'
        }
    });
}

async function handleRelationshipConfirmed(event: RelationshipConfirmedEvent) {
    await prisma.relationship.update({
        where: { relationshipId: event.relationshipID },
        data: { status: 'Confirmed' }
    });

    // Trigger trust score recalculation
    await recalculateTrustScore(event.subjectID);
    await recalculateTrustScore(event.objectID);
}
```

---

## Part 9: Security Considerations

### Identity Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDENTITY SECURITY                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Sybil Attack Prevention:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Biometric hash ensures one human = one account            │           │
│  │ • KYC verification against government databases             │           │
│  │ • Admin approval required before blockchain creation        │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Relationship Fraud Prevention:                                            │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Both parties must confirm relationship                    │           │
│  │ • Only object can confirm (prevents self-confirmation)      │           │
│  │ • Trust score capped to prevent gaming                      │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Recovery Attack Prevention:                                               │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ • Minimum 3 guardians required                              │           │
│  │ • Majority confirmation needed                              │           │
│  │ • 7-day expiry prevents stale sessions                      │           │
│  │ • Each guardian can only vote once                          │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Exercises

### Exercise 1: Trust Score Calculation

Calculate the trust score for a user with:
- 2 parents confirmed
- 1 spouse confirmed
- 3 siblings confirmed
- 5 friends confirmed
- 0 business affiliations

### Exercise 2: Recovery Threshold

A user has 5 guardians. How many confirmations are needed for recovery?
What if they have 4 guardians?

### Exercise 3: KYC Flow Design

Design the off-chain KYC flow including:
- Document verification steps
- Biometric capture process
- Duplicate detection logic
- Error handling

---

## Summary

### Key Concepts

1. **User = Individual**: Users are always humans, businesses are Organizations
2. **Biometric Hash**: Privacy-preserving unique identity verification
3. **Relationships**: Social graph for trust score calculation
4. **Trust Score**: 10 (base) + family (0-80) + friends (0-10) + business (0-10)
5. **Social Recovery**: Guardian-based account recovery with majority vote

### Function Reference

| Function | Purpose | Access |
|----------|---------|--------|
| CreateUser | Register new user | Partner API |
| RequestRelationship | Initiate relationship | Subject |
| ConfirmRelationship | Confirm relationship | Object |
| GetMyProfile | Query profile + relationships | Any |
| NominateGuardians | Set recovery guardians | User |
| InitiateRecovery | Start recovery process | Guardian |
| ConfirmRecovery | Vote on recovery | Guardian |
| UserExists | Check user existence | Any |
| GetUser | Get user details | Any |

### Production Checklist

- [ ] KYC provider integration configured
- [ ] Biometric hash uniqueness enforced
- [ ] Country data initialized
- [ ] Trust score calculation verified
- [ ] Recovery flow tested
- [ ] Event handlers in projector

---

## Further Reading

- Identity Contract: `/gx-coin-fabric/chaincode/identity_contract.go`
- Identity Types: `/gx-coin-fabric/chaincode/identity_types.go`
- Related: LECTURE-16 on Loan Pool (trust score usage)
- Related: LECTURE-13 on Genesis Distribution (user creation trigger)
