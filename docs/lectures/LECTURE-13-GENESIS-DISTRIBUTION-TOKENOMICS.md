# LECTURE 13: Genesis Distribution & Tokenomics

## Overview

This lecture covers the economic foundation of GX Protocol - the Genesis Distribution system that allocates 1.25 trillion GX Coins to 5 billion users through a 6-phase declining allocation model with country-wise fairness guarantees.

## Learning Objectives

By the end of this lecture, you will understand:
1. The immutable supply cap and pre-minting architecture
2. The 6-phase declining allocation model
3. Country-wise distribution to prevent hijacking
4. The 6 system pools and their purposes
5. Transaction fees and velocity (hoarding) tax
6. Age eligibility and post-genesis economics

---

## Part 1: Supply Architecture

### Immutable Supply Cap

```go
// consts.go - The Foundation of GX Economics
const (
    // Maximum supply: 1.25 Trillion coins (IMMUTABLE - no new coins ever minted)
    MaxSupply uint64 = 1250000000000 * Precision // 1.25 trillion coins

    // Precision: 1 GX Coin = 1,000,000 Qirat (smallest unit)
    Precision uint64 = 1000000
)
```

**Key Design Decision**: Unlike cryptocurrencies with ongoing inflation, GX Protocol has a **fixed, immutable supply** of 1.25 trillion coins. All coins are **pre-minted at bootstrap** - no new coins can ever be created.

### The Pre-Minting Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRADITIONAL MODEL (Bitcoin-style)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Bootstrap → Empty Supply                                                  │
│       ↓                                                                     │
│   User 1 Joins → Mint 50 coins → Supply = 50                               │
│       ↓                                                                     │
│   User 2 Joins → Mint 50 coins → Supply = 100                              │
│       ↓                                                                     │
│   ...continues minting forever...                                           │
│                                                                             │
│   ❌ Problem: Complex supply tracking, inflation risk                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        GX PROTOCOL MODEL (Pre-Minting)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Bootstrap → Pre-Mint 1.25T coins to system pools                         │
│       ↓                                                                     │
│   User 1 Joins → Transfer 500 from pool → Supply UNCHANGED (still 1.25T)  │
│       ↓                                                                     │
│   User 2 Joins → Transfer 500 from pool → Supply UNCHANGED (still 1.25T)  │
│       ↓                                                                     │
│   Pools empty → New users get 0 (must acquire via circulation)             │
│                                                                             │
│   ✅ Benefits: Simple accounting, fixed supply, natural hard stop          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Distribution Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    1.25 TRILLION COIN ALLOCATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   USER GENESIS POOL                                 │    │
│  │                   577.5B coins (46.20%)                            │    │
│  │                   → Distributed to 5B users via 6 phases           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   LOAN POOL                                         │    │
│  │                   312.5B coins (25.00%)                            │    │
│  │                   → Interest-free loans to verified users          │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   CHARITABLE POOL                                   │    │
│  │                   158B coins (12.64%)                              │    │
│  │                   → Non-profit and humanitarian initiatives        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   GOVERNMENT GENESIS POOL                           │    │
│  │                   152B coins (12.16%)                              │    │
│  │                   → Country treasuries (50 per user phases 1-5)    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   GX POOL                                           │    │
│  │                   31.25B coins (2.50%)                             │    │
│  │                   → Developer and protocol discretion              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   OPERATIONS FUND                                   │    │
│  │                   18.75B coins (1.50%)                             │    │
│  │                   → Platform operations and maintenance            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  TOTAL: 1,250,000,000,000 coins (100.00%)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### System Pool Account IDs

```go
// consts.go - System Account Identifiers
const (
    // Genesis Distribution Pools
    UserGenesisPoolAccountID = "SYSTEM_USER_GENESIS_POOL"   // 577.5B coins
    GovtGenesisPoolAccountID = "SYSTEM_GOVT_GENESIS_POOL"   // 152B coins

    // Institutional Pools
    CharitablePoolAccountID  = "SYSTEM_CHARITABLE_POOL"     // 158B coins
    LoanPoolAccountID        = "SYSTEM_LOAN_POOL"           // 312.5B coins
    GXPoolAccountID          = "SYSTEM_GX_POOL"             // 31.25B coins
    OperationsFundAccountID  = "SYSTEM_OPERATIONS_FUND"     // 18.75B coins
)
```

---

## Part 2: The 6-Phase Distribution Model

### Phase Allocation Summary

| Phase | Users | Coins/User | Govt/User | Total User Coins | Total Govt Coins |
|-------|-------|------------|-----------|------------------|------------------|
| 1 | 100M | 500 | 50 | 50B | 5B |
| 2 | 200M | 400 | 50 | 80B | 10B |
| 3 | 300M | 300 | 50 | 90B | 15B |
| 4 | 400M | 200 | 50 | 80B | 20B |
| 5 | 1,550M | 100 | 50 | 155B | 77.5B |
| 6 | 2,450M | 50 | 10 | 122.5B | 24.5B |
| **Total** | **5,000M** | | | **577.5B** | **152B** |

### Phase Constants in Code

```go
// consts.go - Tiered Genesis Distribution Rules

const (
    // Phase 1: First 100M users × 500 coins = 50B coins
    Phase1UserLimit    int64  = 100000000        // 100 million users
    Phase1CoinsPerUser uint64 = 500 * Precision  // 500 coins
    Phase1GovtPerUser  uint64 = 50 * Precision   // 50 coins to treasury

    // Phase 2: Next 200M users × 400 coins = 80B coins
    Phase2UserLimit    int64  = 200000000        // 200 million users
    Phase2CoinsPerUser uint64 = 400 * Precision
    Phase2GovtPerUser  uint64 = 50 * Precision

    // Phase 3: Next 300M users × 300 coins = 90B coins
    Phase3UserLimit    int64  = 300000000        // 300 million users
    Phase3CoinsPerUser uint64 = 300 * Precision
    Phase3GovtPerUser  uint64 = 50 * Precision

    // Phase 4: Next 400M users × 200 coins = 80B coins
    Phase4UserLimit    int64  = 400000000        // 400 million users
    Phase4CoinsPerUser uint64 = 200 * Precision
    Phase4GovtPerUser  uint64 = 50 * Precision

    // Phase 5: Next 1,550M users × 100 coins = 155B coins
    Phase5UserLimit    int64  = 1550000000       // 1.55 billion users
    Phase5CoinsPerUser uint64 = 100 * Precision
    Phase5GovtPerUser  uint64 = 50 * Precision

    // Phase 6: Last 2,450M users × 50 coins = 122.5B coins
    Phase6UserLimit    int64  = 2450000000       // 2.45 billion users
    Phase6CoinsPerUser uint64 = 50 * Precision
    Phase6GovtPerUser  uint64 = 10 * Precision   // Note: Reduced to 10 coins
)
```

### Why Declining Allocations?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EARLY ADOPTER INCENTIVE CURVE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Coins │                                                                    │
│  per   │  ████                                                              │
│  User  │  ████  ███                                                         │
│   500  │  ████  ███  ██                                                     │
│   400  │  ████  ███  ██   █                                                 │
│   300  │  ████  ███  ██   █                                                 │
│   200  │  ████  ███  ██   █    ▄                                            │
│   100  │  ████  ███  ██   █    ▄    ▀                                       │
│    50  │  ████  ███  ██   █    ▄    ▀                                       │
│        └────────────────────────────────────────────────────────────────    │
│           P1    P2   P3   P4   P5   P6                                      │
│          100M  200M 300M 400M 1.5B 2.5B    (Cumulative Users)               │
│                                                                             │
│  Rationale:                                                                 │
│  • Early adopters take more risk → higher reward                           │
│  • Later users benefit from established network → less incentive needed    │
│  • Gradual decline prevents cliff effects                                  │
│  • Phase 5 & 6 cover 80% of users with lower per-user allocation          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Country-Wise Distribution

### The Hijacking Problem

Without country-wise allocation, a single country could monopolize early phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WITHOUT COUNTRY-WISE LIMITS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scenario: Country X has aggressive onboarding                             │
│                                                                             │
│  Day 1:   Country X enrolls 50M users  → All in Phase 1 (500 coins)        │
│  Day 10:  Country X enrolls 50M more   → Still Phase 1 (500 coins)        │
│  Day 20:  Phase 1 exhausted by Country X alone                             │
│                                                                             │
│  Result: Country X = 100M users × 500 coins = 50B coins                    │
│          All other countries start at Phase 2 (400 coins)                  │
│                                                                             │
│  ❌ Unfair: One country captured ALL of Phase 1                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Country-Wise Allocation Solution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WITH COUNTRY-WISE LIMITS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1 allocation = Country's Population % × 100M users                  │
│                                                                             │
│  Example (Phase 1, 100M total slots):                                      │
│  ┌──────────────────┬────────────────┬──────────────────┐                  │
│  │ Country          │ Population %   │ Phase 1 Slots    │                  │
│  ├──────────────────┼────────────────┼──────────────────┤                  │
│  │ China (CN)       │ 17.76%         │ 17,760,000       │                  │
│  │ India (IN)       │ 17.51%         │ 17,510,000       │                  │
│  │ USA (US)         │ 4.27%          │ 4,270,000        │                  │
│  │ Indonesia (ID)   │ 3.51%          │ 3,510,000        │                  │
│  │ Nigeria (NG)     │ 2.73%          │ 2,730,000        │                  │
│  │ ...              │ ...            │ ...              │                  │
│  └──────────────────┴────────────────┴──────────────────┘                  │
│                                                                             │
│  Result: Each country progresses through phases independently              │
│  ✅ Fair: All countries get proportional access to each phase              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CountryStats Structure

```go
// genesis_types.go

// CountryStats tracks the distribution progress for a single country
type CountryStats struct {
    DocType       string  `json:"docType"`       // "countryStats"
    CountryCode   string  `json:"countryCode"`   // 2-letter ISO code (e.g., "NG")
    PopulationPct float64 `json:"populationPct"` // Country's % of global population

    // Remaining allocations per phase for this country
    Phase1Allocation int64 `json:"phase1Allocation"` // Remaining Phase 1 slots
    Phase2Allocation int64 `json:"phase2Allocation"` // Remaining Phase 2 slots
    Phase3Allocation int64 `json:"phase3Allocation"` // Remaining Phase 3 slots
    Phase4Allocation int64 `json:"phase4Allocation"` // Remaining Phase 4 slots
    Phase5Allocation int64 `json:"phase5Allocation"` // Remaining Phase 5 slots
    Phase6Allocation int64 `json:"phase6Allocation"` // Remaining Phase 6 slots

    // Track country's current phase
    CurrentPhase int `json:"currentPhase"` // Current phase for this country (1-6)
}
```

### Country Initialization

```go
// admin_contract.go

func (s *AdminContract) InitializeCountryData(ctx contractapi.TransactionContextInterface,
    countriesDataJSON string) error {

    // Authorization: Only super admin
    err := requireRole(ctx, RoleSuperAdmin)
    if err != nil {
        return err
    }

    // Parse input: [{"countryCode": "NG", "percentage": 0.0273}, ...]
    var countries []countryInput
    json.Unmarshal([]byte(countriesDataJSON), &countries)

    for _, country := range countries {
        // Calculate phase allocations based on population percentage
        stats := CountryStats{
            DocType:          "countryStats",
            CountryCode:      country.CountryCode,
            PopulationPct:    country.Percentage,
            Phase1Allocation: int64(float64(Phase1UserLimit) * country.Percentage),
            Phase2Allocation: int64(float64(Phase2UserLimit) * country.Percentage),
            Phase3Allocation: int64(float64(Phase3UserLimit) * country.Percentage),
            Phase4Allocation: int64(float64(Phase4UserLimit) * country.Percentage),
            Phase5Allocation: int64(float64(Phase5UserLimit) * country.Percentage),
            Phase6Allocation: int64(float64(Phase6UserLimit) * country.Percentage),
            CurrentPhase:     1,
        }

        // Save to ledger with key "stats_NG", "stats_US", etc.
        countryKey := fmt.Sprintf("stats_%s", country.CountryCode)
        ctx.GetStub().PutState(countryKey, statsJSON)
    }
}
```

---

## Part 4: The DistributeGenesis Function

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GENESIS DISTRIBUTION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User completes KYC verification in backend                             │
│     └── Outbox command created: { type: "DISTRIBUTE_GENESIS", userID, ... }│
│                                                                             │
│  2. Outbox-submitter calls: Tokenomics:DistributeGenesis(userID, country)  │
│     └── Uses org1-admin identity (gxc_role=gx_admin)                       │
│                                                                             │
│  3. Chaincode validates:                                                    │
│     ├── Role check: requireRole(ctx, RoleAdmin)                            │
│     ├── User exists and status is Verified/Active                          │
│     ├── User hasn't already received genesis (GenesisMinted flag)          │
│     └── Age eligibility: 13-73 years old                                   │
│                                                                             │
│  4. If age eligible, determine allocation:                                 │
│     ├── Load country stats for user's nationality                          │
│     ├── Check which phase has remaining allocation                         │
│     └── Assign coins based on current phase                                │
│                                                                             │
│  5. Execute transfers:                                                      │
│     ├── Transfer userMintAmount from USER_GENESIS_POOL to user            │
│     ├── Transfer govtMintAmount from GOVT_GENESIS_POOL to treasury_XX     │
│     └── Decrement country's phase allocation                               │
│                                                                             │
│  6. Update state:                                                           │
│     ├── Mark user.GenesisMinted = true                                     │
│     ├── Update globalCounters                                              │
│     └── Emit GenesisDistributed event                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Determination Logic

```go
// tokenomics_contract.go - DistributeGenesis

// Country progresses through phases based on its own allocation exhaustion
if countryStats.Phase1Allocation > 0 {
    phaseAssigned = 1
    userMintAmount = Phase1CoinsPerUser  // 500 coins
    govtMintAmount = Phase1GovtPerUser   // 50 coins
    countryStats.Phase1Allocation--
    globalCounters.Phase1Users++
    countryStats.CurrentPhase = 1

} else if countryStats.Phase2Allocation > 0 {
    phaseAssigned = 2
    userMintAmount = Phase2CoinsPerUser  // 400 coins
    govtMintAmount = Phase2GovtPerUser   // 50 coins
    countryStats.Phase2Allocation--
    globalCounters.Phase2Users++
    countryStats.CurrentPhase = 2

} else if countryStats.Phase3Allocation > 0 {
    // ... Phase 3: 300 coins ...

} else if countryStats.Phase4Allocation > 0 {
    // ... Phase 4: 200 coins ...

} else if countryStats.Phase5Allocation > 0 {
    // ... Phase 5: 100 coins ...

} else if countryStats.Phase6Allocation > 0 {
    phaseAssigned = 6
    userMintAmount = Phase6CoinsPerUser  // 50 coins
    govtMintAmount = Phase6GovtPerUser   // 10 coins (reduced)
    countryStats.Phase6Allocation--
    globalCounters.Phase6Users++
    countryStats.CurrentPhase = 6

} else {
    // All phases exhausted for this country
    phaseAssigned = 0
    userMintAmount = 0
    govtMintAmount = 0
    // User gets 0 coins - must acquire via circulation
}
```

### Idempotency Protection

```go
// tokenomics_contract.go

// Idempotency check - prevent double minting
if user.GenesisMinted {
    return fmt.Errorf("user %s has already received genesis mint", userID)
}

// ... distribution logic ...

// Mark user as having received genesis distribution
user.GenesisMinted = true
updatedUserJSON, _ := json.Marshal(user)
ctx.GetStub().PutState(userID, updatedUserJSON)
```

---

## Part 5: Age Eligibility

### Age Constraints

```go
// consts.go
const (
    MinAgeForGenesis int = 13
    MaxAgeForGenesis int = 73
)
```

### Age Check Implementation

```go
// tokenomics_contract.go

// Check age eligibility (13-73 years for genesis distribution)
ageEligible := user.Age >= MinAgeForGenesis && user.Age <= MaxAgeForGenesis

var userMintAmount uint64 = 0
var govtMintAmount uint64 = 0

if ageEligible {
    // Proceed with distribution...
} else {
    // User is outside age range
    // They receive 0 coins but can still acquire via circulation
    phaseAssigned = 0
    userMintAmount = 0
    govtMintAmount = 0
}
```

### Age Eligibility Rationale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGE ELIGIBILITY: 13-73 YEARS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Under 13 (0 coins):                                                        │
│  • Legal restrictions on financial accounts for minors                     │
│  • Guardian-managed accounts can receive transfers                          │
│  • Can receive full genesis when turning 13 (if phases still active)       │
│                                                                             │
│  Ages 13-73 (Full allocation):                                              │
│  • Active economic participants                                             │
│  • Can manage their own accounts                                            │
│  • Receive phase-appropriate allocation                                     │
│                                                                             │
│  Over 73 (0 coins):                                                         │
│  • Reduced expected remaining economic activity                             │
│  • Can still receive transfers and participate                              │
│  • Prevents gaming by creating accounts for elderly relatives              │
│                                                                             │
│  Key: Age ineligible users are NOT excluded from the system                │
│       They simply don't receive free genesis coins                          │
│       They can fully participate by acquiring coins through circulation    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Transaction Fees

### Fee Categories

```go
// consts.go - Transaction Type Categories
const (
    TxTypePersonToPerson     = "P2P"        // Person-to-Person transfer
    TxTypeMerchant           = "MERCHANT"   // Payment to merchant
    TxTypeGovernment         = "GOVERNMENT" // Government transaction
    TxTypeBusinessToBusiness = "B2B"        // Business-to-Business
)

// Geographic Scope
const (
    TxScopeLocal       = "LOCAL"        // Within same country
    TxScopeCrossBorder = "CROSS_BORDER" // Across countries
)
```

### Fee Schedule (in Basis Points)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSACTION FEE SCHEDULE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PERSON-TO-PERSON (P2P) - LOCAL                                            │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Amount Range        │ Fee Rate   │ Fee Split               │           │
│  ├─────────────────────────────────────────────────────────────┤           │
│  │ Below 3 coins       │ FREE (0%)  │ N/A                     │           │
│  │ 3 to 100 coins      │ 0.05%      │ 50% sender, 50% receiver│           │
│  │ Above 100 coins     │ 0.10%      │ 50% sender, 50% receiver│           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  PERSON-TO-PERSON (P2P) - CROSS-BORDER                                     │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ 0 to 100 coins      │ 0.15%      │ 50% sender, 50% receiver│           │
│  │ Above 100 coins     │ 0.25%      │ 50% sender, 50% receiver│           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  MERCHANT TRANSACTIONS                                                      │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Local               │ 0.15%      │ 100% sender             │           │
│  │ Cross-Border        │ 0.30%      │ 100% sender             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  GOVERNMENT TRANSACTIONS                                                    │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Local               │ 0.10%      │ 100% sender             │           │
│  │ Cross-Border        │ 0.20%      │ 100% sender             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  BUSINESS-TO-BUSINESS (B2B)                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │ Local               │ 0.20%      │ 100% sender             │           │
│  │ Cross-Border        │ 0.40%      │ 100% sender             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fee Constants in Code

```go
// consts.go

// P2P Local Transaction Fees (in basis points, 1 bps = 0.01%)
const (
    FeeP2PLocalBelow3   uint64 = 0   // 0% (Free for micro-transactions)
    FeeP2PLocal3To100   uint64 = 5   // 0.05%
    FeeP2PLocalAbove100 uint64 = 10  // 0.10%
)

// P2P Cross-Border Fees
const (
    FeeP2PCrossBorder0To100   uint64 = 15  // 0.15%
    FeeP2PCrossBorderAbove100 uint64 = 25  // 0.25%
)

// Fee Split (for P2P only)
const (
    FeeDistributionP2PSenderPct   uint64 = 50  // 50% paid by sender
    FeeDistributionP2PReceiverPct uint64 = 50  // 50% paid by receiver
)
```

---

## Part 7: Velocity (Hoarding) Tax

### Purpose

The velocity tax encourages circulation of coins by taxing hoarding behavior. Holding more than 100 coins for 355+ consecutive days triggers progressive taxation.

### Tax Triggers

```go
// consts.go

const (
    // Trigger threshold: 100+ coins held for 355 consecutive days
    VelocityTaxThreshold  uint64 = 100 * Precision
    VelocityTaxPeriodDays int    = 355

    // Tax distribution: 50-50 split
    VelocityTaxGovernmentPct     uint64 = 50  // To Government Treasury
    VelocityTaxRedistributionPct uint64 = 50  // To lowest balance holders
)
```

### Progressive Tax Bands

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VELOCITY TAX PROGRESSIVE BANDS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Balance Range          │ Annual Tax Rate  │ Notes                         │
│  ───────────────────────┼──────────────────┼─────────────────────────────── │
│  Below 100 coins        │ 0%               │ No tax (below threshold)      │
│  100 - 1,000 coins      │ 2.5%             │ Minimum tax band              │
│  1,000 - 5,000 coins    │ 3.0%             │                               │
│  5,000 - 10,000 coins   │ 3.5%             │                               │
│  10,000 - 25,000 coins  │ 4.0%             │                               │
│  25,000 - 50,000 coins  │ 4.5%             │                               │
│  50,000 - 100,000 coins │ 5.5%             │                               │
│  Above 100,000 coins    │ 6.0%             │ Maximum tax band              │
│                                                                             │
│  Timer Reset:                                                               │
│  • If balance drops below 100 coins, the 355-day timer resets              │
│  • Active circulation resets the clock                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tax Band Constants

```go
// consts.go

const (
    VelocityTaxBand1Threshold uint64 = 100 * Precision
    VelocityTaxBand1Rate      uint64 = 0     // 0%

    VelocityTaxBand2Threshold uint64 = 1000 * Precision
    VelocityTaxBand2Rate      uint64 = 250   // 2.5%

    VelocityTaxBand3Threshold uint64 = 5000 * Precision
    VelocityTaxBand3Rate      uint64 = 300   // 3.0%

    VelocityTaxBand4Threshold uint64 = 10000 * Precision
    VelocityTaxBand4Rate      uint64 = 350   // 3.5%

    VelocityTaxBand5Threshold uint64 = 25000 * Precision
    VelocityTaxBand5Rate      uint64 = 400   // 4.0%

    VelocityTaxBand6Threshold uint64 = 50000 * Precision
    VelocityTaxBand6Rate      uint64 = 450   // 4.5%

    VelocityTaxBand7Threshold uint64 = 100000 * Precision
    VelocityTaxBand7Rate      uint64 = 550   // 5.5%

    VelocityTaxBand8Rate      uint64 = 600   // 6.0% (maximum)
)
```

---

## Part 8: Post-Genesis Economics

### After 5 Billion Users

```go
// consts.go

// Post-Genesis Economics (Users beyond 5 billion)
// Note: NO new coins are minted. Users must acquire coins through circulation.
const (
    PostGenesisUserMint           uint64 = 0  // No new minting
    PostGenesisTreasuryMint       uint64 = 0  // No new minting
    PostGenesisNfpFundMint        uint64 = 0  // No new minting
    PostGenesisLoanPoolMint       uint64 = 0  // No new minting
    PostGenesisFoundersPoolMint   uint64 = 0  // No new minting
    PostGenesisOperationsFundMint uint64 = 0  // No new minting
)
```

### Circulation-Only Economy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      POST-GENESIS ECONOMY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Genesis Phase (0 - 5B users):                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  • Users receive free coins via DistributeGenesis           │           │
│  │  • Pools gradually deplete                                   │           │
│  │  • Each phase = fewer coins per user                        │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Post-Genesis Phase (5B+ users):                                           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  • Genesis pools empty                                       │           │
│  │  • New users receive 0 coins                                 │           │
│  │  • Coins acquired only through:                              │           │
│  │    - Receiving transfers from existing holders              │           │
│  │    - Earning through work/services                          │           │
│  │    - Loan pool borrowing                                    │           │
│  │  • Supply remains fixed at 1.25T forever                    │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  Economic Implication:                                                      │
│  • Deflationary pressure as population grows beyond 5B                     │
│  • Coin value increases with adoption                                      │
│  • Velocity tax prevents stagnation                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 9: GlobalCounters and Tracking

### GlobalCounters Structure

```go
// genesis_types.go

type GlobalCounters struct {
    DocType     string `json:"docType"`     // "globalCounters"
    TotalUsers  int64  `json:"totalUsers"`  // Total distributed users
    Phase1Users int64  `json:"phase1Users"` // Users in Phase 1 (500 coins)
    Phase2Users int64  `json:"phase2Users"` // Users in Phase 2 (400 coins)
    Phase3Users int64  `json:"phase3Users"` // Users in Phase 3 (300 coins)
    Phase4Users int64  `json:"phase4Users"` // Users in Phase 4 (200 coins)
    Phase5Users int64  `json:"phase5Users"` // Users in Phase 5 (100 coins)
    Phase6Users int64  `json:"phase6Users"` // Users in Phase 6 (50 coins)
}
```

### Initialization at Bootstrap

```go
// BootstrapSystem pre-mints all coins and initializes counters
func (s *TokenomicsContract) BootstrapSystem(ctx ...) error {
    // ... pre-mint to pools ...

    // Initialize global counters
    globalCounters := GlobalCounters{
        DocType:     "globalCounters",
        TotalUsers:  0,
        Phase1Users: 0,
        Phase2Users: 0,
        Phase3Users: 0,
        Phase4Users: 0,
        Phase5Users: 0,
        Phase6Users: 0,
    }
    ctx.GetStub().PutState(GlobalCountersKey, countersJSON)
}
```

---

## Part 10: Backend Integration

### Outbox Command for Genesis

```typescript
// When user completes KYC verification
await prisma.outboxCommand.create({
    data: {
        aggregateId: userId,
        commandType: 'DISTRIBUTE_GENESIS',
        payload: {
            userID: userId,
            nationality: user.countryCode
        },
        status: 'PENDING'
    }
});
```

### Projector Handling Genesis Events

```typescript
// workers/projector/src/handlers/genesis.handler.ts

async function handleGenesisDistributed(event: GenesisDistributedEvent) {
    // Update user's balance in read model
    await prisma.wallet.update({
        where: { userId: event.userId },
        data: {
            balance: event.userAmount,
            genesisPhase: event.phase,
            genesisReceivedAt: new Date()
        }
    });

    // Update country stats read model
    await prisma.countryStats.update({
        where: { countryCode: event.nationality },
        data: {
            [`phase${event.phase}Remaining`]: {
                decrement: 1
            }
        }
    });
}
```

---

## Exercises

### Exercise 1: Calculate Phase Allocation

Given a country with 2.5% of global population:
1. How many Phase 1 slots does this country get?
2. How many Phase 5 slots?
3. What's the total coins this country's citizens can receive?

### Exercise 2: Edge Cases

Analyze these scenarios:
1. A user turns 13 the day after genesis pools are exhausted
2. A country exhausts Phase 3 while other countries are still in Phase 1
3. A user's nationality is "XX" (not initialized)

### Exercise 3: Fee Calculation

Calculate the fees for:
1. 50 GX local P2P transfer
2. 500 GX cross-border merchant payment
3. 2 GX local transfer (micro-transaction)

---

## Summary

### Key Concepts

1. **Fixed Supply**: 1.25T coins pre-minted at bootstrap, no inflation
2. **6-Phase Model**: Declining allocations from 500 to 50 coins
3. **Country-Wise Distribution**: Population-proportional phase allocations
4. **Pool Architecture**: 6 system pools for different purposes
5. **Age Eligibility**: 13-73 years for genesis coins
6. **Transaction Fees**: Tiered by type, scope, and amount
7. **Velocity Tax**: Progressive tax on hoarding (2.5% - 6.0%)

### Distribution Guarantees

- Every country gets proportional access to each phase
- No single entity can monopolize early phases
- Natural hard stop when pools deplete
- Idempotency prevents double-minting

### Production Checklist

- [ ] Bootstrap system executed by super admin
- [ ] All 190+ countries initialized with population percentages
- [ ] GlobalCounters tracking distribution progress
- [ ] Pool balances monitored for depletion warnings
- [ ] Phase transition events captured in projector

---

## Further Reading

- GX Protocol Whitepaper: `/gx-coin-fabric/docs/protocol/WHITEPAPER.md`
- Tokenomics Contract: `/gx-coin-fabric/chaincode/tokenomics_contract.go`
- Constants Definition: `/gx-coin-fabric/chaincode/consts.go`
- Genesis Types: `/gx-coin-fabric/chaincode/genesis_types.go`
