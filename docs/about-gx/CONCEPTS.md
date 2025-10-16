# GX Coin Concepts & Glossary

## GX Coin Protocol: Vision & Core Principles

GX Coin 🪙 is a digital currency designed for equity, stability, and intrinsic value, aiming to address the flaws of fiat systems—arbitrary money creation, debt-based issuance, and inflation. Its philosophy is to build a fair, transparent ecosystem insulated from external market volatility.

**Key Features:**
- **Non-interchangeable:** GX Coin cannot be exchanged for fiat, gold, or other cryptocurrencies.
- **Value Calibration:** Initial value is set by a weighted index of 25 global commodities (energy, food, metals, etc.) on “Genesis Day” (04 Sept 2025). 1 GX Coin is divisible into 1 million Qs (Qirat).
- **Proof of Authority Blockchain:** Permissioned PoA consensus with trusted validators, enabling efficient, secure, and recoverable accounts. Immutable chaincode enforces core policies.

## Tokenomics & Distribution

- **Max Supply:** 1 Trillion GX Coins, targeting global transactional liquidity.
- **Genesis Distribution:** Tiered allocation to the first 1 billion users, with additional pools for national treasuries, social benefit, interest-free loans, founders, and maintenance.
- **Ongoing Issuance:** 100 GX Coins per new user, distributed across user, treasury, charity, loan pool, founders, and maintenance.

## Economic Policies & Governance

- **Immutable Rules:** Hard-coded supply, fees, and tax policies.
- **Governmental Access:** Requires legal tender status, identity verification, and GX pricing for public services.
- **Transaction Fees:** 0.1% per transaction (split sender/receiver), only on transfers >3 GX.
- **Hoarding Tax:** 3–6%/year on balances >100 GX held for 360+ days, split 70% to treasury, 30% to charity.

## Regulatory & Ethical Framework

- **No Fiat Peg/Redemption:** GX Coin is not backed by external assets; value is emergent from ecosystem productivity.
- **AML/CFT:** Chaincode bans participation by businesses in weapons, narcotics, alcohol, gambling, tobacco, adult entertainment, and related third parties.
- **Consumer Protection:** Transparent tax and loan protocols, rigorous auditing.

## Protocol vs. Application Layer

- **Foundation Role:** Maintains protocol, monetary policy, open-source wallet, marketplace, productivity rewards, provenance standards, public works templates, and data APIs.
- **Third-Party Ecosystem:** Fintechs, banks, and startups build applications (accounting, commerce, lending, insurance, analytics) under strict licensing, security, and ethical standards.

## Strategic Adoption & Resilience

- **Humanitarian Seeding:** Initial launch partners with global NGOs to create immediate utility and positive impact.
- **Geopolitical Alliances:** Focus on non-aligned, resource-rich nations for early adoption.
- **Decentralized Governance:** Diverse validator nodes, transparent amendment process, and global education modules.

## The Genesis Message

> Welcome, Pioneer.  
> You have received 500 GX—your stake in a new economy.  
> The value of your coins comes from your actions.  
> Use them to build real purchasing power by onboarding businesses and growing your community.  
> This is not just wealth, but a mission to create a fair, inflation-free future.

## Vision Statement

GX Coin is an invitation to a productive, equitable, and stable economic future—where value is created by human effort, not debt or speculation. It offers individuals protection from inflation, businesses access to interest-free capital, and governments transparent tools for public good.

---

*Use this file to document protocol rules, tokenomics, and blockchain concepts as you learn and build.*


## Division of Labor: Protocol vs. Application Layer

To ensure integrity, neutrality, and innovation, the GX Coin ecosystem is structured around a clear separation of responsibilities:

### GX Coin Foundation (Protocol Layer)
The Foundation operates as a non-profit steward, focusing exclusively on public goods and core infrastructure:
- **Blockchain Maintenance:** Secure, performant ledger and consensus mechanism.
- **Monetary Policy & Governance:** Hard-coded supply, distribution, fees, and taxes.
- **Open-Source Marketplace:** Foundational platform for economic activity.
- **Reward Protocols:** Standards for "Proof of Productivity" and related incentives.
- **Official Wallet & Dashboard:** Secure, open-source tools for wealth management.
- **Provenance Standards:** Protocols for supply chain tracking.
- **Public Works Templates:** Smart contract standards for governments.
- **Data APIs:** Aggregated, anonymized public data for ecosystem use.

### Third-Party Providers (Application Layer)
Competitive, for-profit or non-profit entities build value-added services atop the protocol:
- **Accounting & Compliance Tools:** Automated solutions for businesses.
- **Advanced Commerce Platforms:** Feature-rich marketplaces and retail solutions.
- **Custody & On-Ramping Services:** Secure key management and onboarding.
- **Insurance & Financial Products:** Specialized offerings using GX Coin standards.
- **Economic Analytics:** Commercial dashboards and forecasting tools.
- **Cross-Ecosystem Bridges:** Regulated connections to traditional finance (future-facing).

### Role of Banks
Banks transition from money creators to Virtual Asset Service Providers (VASPs), leveraging their expertise in compliance, security, and customer service to support GX Coin adoption.

**This division of labor preserves the Foundation’s neutrality, fosters innovation, and accelerates adoption by inviting trusted institutions to participate constructively.**

## Trust Score & Relationship Module Specification

### Overview

The GX Coin wallet app features a dynamic Trust Score system, built on verified relationships, business associations, and social connections. This score is used to unlock advanced services and signal user credibility within the ecosystem.

---

### Trust Score Breakdown

| Category           | Max Points | Description                                                                                  |
|--------------------|------------|----------------------------------------------------------------------------------------------|
| Family Tree        | 80         | Verified immediate family relationships (parents, siblings, spouse, children)                |
| Business/Workplace | 10         | Verified business partners/directors or workplace associates                                 |
| Friends            | 10         | Two-way confirmed social connections (max 10 points, 1 per friend)                           |
| **Total**          | **100**    |                                                                                              |

#### Dynamic Re-weighting

- If a relationship type (e.g., spouse, children, siblings) is "Not Applicable," its points are redistributed among applicable categories.
- Parents are split: Father (40%), Mother (40%) if only parents are applicable.
- Siblings/Children: Points divided equally among defined entities; missing entries reduce score proportionally.
- All relationships require two-way confirmation to count toward the score.

#### Status Handling

- **Deceased/Divorced:** Mark status and upload government-issued documentation (death/divorce certificate).
- **Not Applicable:** Select from dropdown; triggers dynamic re-weighting.

---

### Relationship Management Flows

#### 1. Family/Relationship Tree

- **Add Relation:** Scan QR code of registered user, select relationship type.
- **Confirmation:** Added user receives notification; must confirm to establish link.
- **Progress Indicator:** Shows percentage completion toward 80% family score.
- **Deceased/Divorced:** Option to upload supporting documents.

#### 2. Business Account Creation & Management

- **Business Account Setup:** Upload business registration documents for verification.
- **Define Partners/Directors:** Add registered users as partners/directors; each must confirm.
- **Signatory Rules:** Flexible configuration (e.g., "Transactions >1,000 GX require 2 of 3 approvals").
- **Workplace Associates:** For non-business owners, add workplace associates for verification.

#### 3. Beneficiaries & Friends

- **Beneficiaries:** One-way or two-way relationship for frequent transactions; confirmation optional.
- **Friends:** Two-way confirmation required; max 10 points toward trust score.
- **One-off Payments:** QR code-based payments without relationship definition.

---

### Example Trust Score Calculation

- User defines both parents (confirmed): 30 pts
- Has 2 siblings, both confirmed: 10 pts each (20 pts)
- Married, spouse confirmed: 25 pts
- 1 child, confirmed: 20 pts
- 5 friends, all confirmed: 5 pts
- No business, but 2 workplace associates confirmed: 10 pts (re-weighted from business category)
- **Total:** 30 + 20 + 25 + 20 + 5 + 10 = 110 pts (capped at 100%)

---

### Wireframe & API Considerations

- **Progress Bar:** Visual indicator of trust score completion.
- **Relationship Requests:** Notification and confirmation workflow.
- **Document Upload:** Secure handling for status verification.
- **Flexible Business Rules:** UI for configuring signatory mandates.
- **Friend/Beneficiary Management:** Search, add, confirm, and manage contacts.

---

*This module ensures robust identity, trust, and compliance for all GX Coin wallet users, supporting both personal and business use cases.*