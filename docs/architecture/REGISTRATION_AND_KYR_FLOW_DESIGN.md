# GX Coin Registration & KYR Flow Design

**Version:** 1.0
**Date:** 2025-11-26
**Status:** Design Document

## Overview

Design a modern, progressive registration and KYR (Know Your Relationship) verification flow for the **GX Coin Protocol** - a blockchain-based Productivity-Based Currency system.

### GX Protocol Requirements (from Whitepaper)

| Requirement | Description | Impact on Registration/KYR |
|-------------|-------------|---------------------------|
| **One Human, One Account** | Biometric verification prevents Sybil attacks | Must collect biometric hash (placeholder for now) |
| **Genesis Eligibility** | Ages 13-73 qualify for genesis coin distribution | Must verify date of birth accurately |
| **Identity-Based Architecture** | Fabric User ID generated deterministically | Requires: nationality, DOB, gender |
| **Trust Networks (KYR)** | Relationship-based trust scoring (max 100 points) | Family/business relationships tracked |
| **Regulatory Compliance** | KYC/AML with admin approval gates | Document verification, PEP screening |

### Design Goals
- Each step is a focused modal/screen collecting one piece of information
- Data is validated and saved to database progressively (no lost data on browser close)
- OTP verification for email/phone authenticity
- Smooth user experience with minimal friction
- **Collect all data required for Fabric User ID generation before KYR completion**

---

## Part 1: Registration Flow

### Current Flow (Problems)
```
Single Form → Submit All → Create Account → Redirect to Dashboard
```
- All-or-nothing: User loses data if they abandon
- No progressive saving
- No email verification before account creation
- No phone verification

### Proposed Flow (Wise-style Progressive)

```
Step 1: Email → Step 2: Email OTP → Step 3: Name & Country → Step 4: DOB & Gender → Step 5: Password → Step 6: Phone → Step 7: Phone OTP → Done
```

**Design Decisions:**
- ✅ **Basic info (name, country, DOB, gender) collected during registration** - User profile is complete early
- ✅ **OTP Provider TBD** - Design abstract interface, implement provider later
- ✅ **ID Verification** - Manual admin verification initially, AI/ML verification planned for future

#### Step 1: Email Address
**Screen:** Single input field for email
**Actions:**
- Validate email format (client-side)
- Check if email already exists (API call)
- If new: Generate OTP, send to email, create temporary session
- If exists: Show "Already registered? Log in"

**Database:** Create `PendingRegistration` record with:
- `sessionId` (UUID)
- `email`
- `otpHash`
- `otpExpiresAt`
- `step` = 'EMAIL_SENT'
- `createdAt`
- `expiresAt` (24 hours)

---

#### Step 2: Email OTP Verification
**Screen:** 6-digit OTP input with resend option
**Actions:**
- Validate OTP against hash
- Mark email as verified
- Allow max 3 attempts, then regenerate

**Database Update:**
- `emailVerified` = true
- `emailVerifiedAt` = now
- `step` = 'EMAIL_VERIFIED'

---

#### Step 3: Name & Country
**Screen:** First name, Last name, and Country dropdown

**Fields:**
- First Name (text, required)
- Last Name (text, required)
- Country of Residence (dropdown/search)

**UI Design:**
```
┌─────────────────────────────────────────┐
│  What's your name?                      │
│                                         │
│  First Name *                           │
│  ┌─────────────────────────────────┐    │
│  │ John                             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Last Name *                            │
│  ┌─────────────────────────────────┐    │
│  │ Doe                              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Where do you live? *                   │
│  ┌─────────────────────────────────┐    │
│  │ 🔍 Search country...         ▼  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Continue →]                           │
└─────────────────────────────────────────┘
```

**Database Update:**
- `firstName` = entered first name
- `lastName` = entered last name
- `countryCode` = selected country
- `step` = 'NAME_COUNTRY_SET'

---

#### Step 4: Date of Birth & Gender
**Screen:** DOB picker + Gender selection
**Purpose:** Required for Fabric User ID generation + Genesis eligibility check

**Fields:**
- Date of Birth (date picker)
  - Validation: Must be 13-100 years old
  - Show genesis eligibility immediately after selection
- Gender (select: Male / Female)
  - Required exactly as "male" or "female" for Fabric ID encoding

**UI Design:**
```
┌─────────────────────────────────────────┐
│  When were you born?                    │
│                                         │
│  Date of Birth *                        │
│  ┌─────────────────────────────────┐    │
│  │ DD / MM / YYYY                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ✅ You're eligible for genesis coins!  │  ← Show if age 13-73
│  ─── or ───                             │
│  ⚠️ Age outside 13-73: Not eligible     │  ← Show if outside range
│     for genesis distribution            │
│                                         │
│  What's your gender? *                  │
│  ○ Male    ○ Female                     │
│                                         │
│  [Continue →]                           │
└─────────────────────────────────────────┘
```

**Database Update:**
- `dateOfBirth` = selected date
- `gender` = "male" or "female"
- `step` = 'DOB_GENDER_SET'

---

#### Step 5: Create Password
**Screen:** Password + Confirm password fields
**Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

**Database Update:**
- `passwordHash` = bcrypt hash
- `step` = 'PASSWORD_SET'

---

#### Step 6: Phone Number
**Screen:** Country code selector + phone input
**Actions:**
- Validate phone format
- Check if phone already exists
- Generate OTP, send via SMS

**Database Update:**
- `phoneNum` = full phone number
- `phoneOtpHash` = hash
- `phoneOtpExpiresAt` = now + 10 minutes
- `step` = 'PHONE_SENT'

---

#### Step 7: Phone OTP Verification
**Screen:** 6-digit OTP input
**Actions:**
- Validate OTP
- Complete registration
- Move data from `PendingRegistration` to `UserProfile`
- Generate JWT tokens
- Redirect to dashboard

**Database:**
- Create `UserProfile` with all collected data
- Delete `PendingRegistration` record
- Set `status` = 'REGISTERED'

---

### Registration Database Schema

```prisma
model PendingRegistration {
  sessionId          String   @id @default(uuid())

  // Step 1-2: Email verification
  email              String   @unique
  emailOtpHash       String?
  emailOtpExpiresAt  DateTime?
  emailVerified      Boolean  @default(false)
  emailVerifiedAt    DateTime?

  // Step 3: Name & Country
  firstName          String?
  lastName           String?
  countryCode        String?

  // Step 4: DOB & Gender
  dateOfBirth        DateTime?
  gender             String?    // "male" or "female"

  // Step 5: Password
  passwordHash       String?

  // Step 6-7: Phone verification
  phoneNum           String?
  phoneOtpHash       String?
  phoneOtpExpiresAt  DateTime?
  phoneVerified      Boolean  @default(false)
  phoneVerifiedAt    DateTime?

  // Progress tracking
  currentStep        RegistrationStep @default(EMAIL_PENDING)

  // Security/audit
  ipAddress          String?
  userAgent          String?

  createdAt          DateTime @default(now())
  expiresAt          DateTime // 24 hours from creation

  @@index([email])
  @@index([expiresAt])
}

enum RegistrationStep {
  EMAIL_PENDING       // Initial state
  EMAIL_SENT          // OTP sent to email
  EMAIL_VERIFIED      // Email OTP verified
  NAME_COUNTRY_SET    // First name, last name, country collected
  DOB_GENDER_SET      // Date of birth and gender collected
  PASSWORD_SET        // Password created
  PHONE_SENT          // OTP sent to phone
  PHONE_VERIFIED      // Phone OTP verified - registration complete
  COMPLETED           // Migrated to UserProfile
}
```

---

## Part 2: KYR (Know Your Relationship) Flow

### What is KYR?
KYR = **Know Your Relationship** - GX Protocol's identity verification system that combines:
1. **KYC (Know Your Customer)** - Standard identity document verification
2. **Relationship Mapping** - Building trust networks through confirmed relationships

### Why KYR Matters for GX Protocol

| Purpose | Description |
|---------|-------------|
| **Genesis Eligibility** | Only verified users (age 13-73) receive genesis coin distribution |
| **Fabric User ID** | Generated from: `Country + DOB + Gender + AccountType + RandomSuffix` |
| **Trust Score** | Relationships contribute to user's trust score (max 100 points) |
| **Loan Eligibility** | Higher trust score = better loan terms from zero-interest pool |
| **Sybil Prevention** | Biometric hash ensures one human = one account |

### Trust Score Calculation (from GX Whitepaper)
```
Base Score: 10 points
+ Family relationships: up to 80 points
  - Parent confirmed: +30 each (max 60)
  - Spouse confirmed: +25
  - Sibling confirmed: +15 each (capped)
  - Child confirmed: +10 each (capped)
+ Friends: up to 10 points (1 per confirmed friend, max 10)
+ Business: up to 10 points (verified organizations)
= Total: Max 100 points
```

### When Does KYR Happen?
After successful registration, user lands on dashboard with limited functionality.
- Banner: "Complete your KYR verification to unlock all features"
- Button: "Start Verification" → Opens KYR wizard

### KYR Steps (7 Steps)

```
Step 1: Personal Details → Step 2: National ID (Mandatory) → Step 3: Passport (Optional) → Step 4: Work/Company → Step 5: Address → Step 6: Biometric → Step 7: Review & Submit
```

**Key Features:**
- ✅ **National ID Card** - Mandatory, separate tab
- ✅ **Passport** - Optional, separate tab (skip if not available)
- ✅ **Work/Company Details** - New tab for future organization sync
- ❌ **Source of Funds** - Removed (not needed for GX Protocol's independent monetary system)

**Post-KYR (Future):** Relationship verification to build trust score

---

#### KYR Step 1: Personal Details

**Critical for Fabric User ID Generation:**
The following fields are REQUIRED to generate the deterministic Fabric User ID:
- Nationality (2-letter ISO code) → First 2 chars of ID
- Date of Birth → Encoded into ID (AANNNN format)
- Gender (male/female) → Encoded into ID

**Fabric User ID Format:**
```
CC CCC AANNNN TCCCC NNNN
├── CC       = 2-letter country code (e.g., "US", "LK")
├── CCC      = 3-char SHA-1 checksum
├── AANNNN   = DOB + Gender encoded (3 letters + 3 digits)
├── T        = Account type (0=Individual, 1-5=Business, 6-9=Government)
└── CCCC NNNN = Random suffix (8 chars for uniqueness)

Example: "US A3F HBF934 0ABCD 1234"
```

**Fields to Collect:**

| Field | Type | Required | Fabric ID | Notes |
|-------|------|----------|-----------|-------|
| First Name | text | Yes | No | Pre-filled from registration |
| Middle Name | text | No | No | Optional |
| Last Name | text | Yes | No | Pre-filled |
| Date of Birth | date | **Yes** | **Yes** | Pre-filled from registration |
| Gender | select | **Yes** | **Yes** | Pre-filled from registration |
| Place of Birth | text | Yes | No | City, Country |
| Nationality | select | **Yes** | **Yes** | Pre-filled from registration |

**Genesis Eligibility Check:**
- If user age is 13-73: Eligible for genesis distribution
- If user age < 13 or > 73: Can use system but NO genesis coins
- Display eligibility status to user during this step

**Database:** Update `UserProfile` progressively after each sub-step

---

#### KYR Step 2: National ID Card (MANDATORY)

**Purpose:** Primary identity document - REQUIRED for all users.

**Fields to Collect:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| **National ID Number** | text | **Yes** | Primary identifier, must match document |
| Issuing Country | select | Yes | Country dropdown |
| Issue Date | date | Yes | Cannot be future |
| Expiry Date | date | Conditional | If applicable (some IDs don't expire) |
| Front Image | file | **Yes** | Max 10MB, JPG/PNG/PDF |
| Back Image | file | **Yes** | Most national IDs have info on both sides |

**UI Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: National ID Card (Required)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Your National ID Number *                                      │
│  ┌──────────────────────────────────────┐                       │
│  │ 200012345678                          │                       │
│  └──────────────────────────────────────┘                       │
│  ℹ️ This will be verified against your uploaded document         │
│                                                                  │
│  Upload National ID Card *                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │                     │  │                     │               │
│  │    FRONT SIDE *     │  │     BACK SIDE *     │               │
│  │                     │  │                     │               │
│  │  [📷 Upload Photo]  │  │  [📷 Upload Photo]  │               │
│  │                     │  │                     │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
│  Issuing Country *      Issue Date *        Expiry Date         │
│  [Sri Lanka ▼]          [DD/MM/YYYY]        [DD/MM/YYYY]        │
│                                              □ No expiry date   │
│                                                                  │
│  [← Back]                                   [Continue →]         │
└─────────────────────────────────────────────────────────────────┘
```

**Validation:**
- National ID Number: Required, format validation per country where possible
- Both front and back images required
- Document not expired (if expiry date provided)
- File size < 10MB, valid image format

**ID Verification Process (Phased):**

| Phase | Method | Description |
|-------|--------|-------------|
| **MVP** | Manual Admin Review | Admin visually verifies ID number matches document |
| **Phase 2** | OCR Extraction | Extract text from document, compare with entered ID |
| **Phase 3** | AI/ML Verification | Document authenticity check, tampering detection |
| **Phase 4** | Third-party API | Integration with ID verification services |

**Database:**
- Update `UserProfile.identityNum` with National ID Number
- Create `KYCDocument` record with type = 'NATIONAL_ID'

---

#### KYR Step 3: Passport (OPTIONAL)

**Purpose:** Secondary identity document - Optional for international verification.

**UI Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Passport (Optional)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Do you have a valid passport?                                  │
│                                                                  │
│  ○ Yes, I have a passport                                       │
│  ○ No, I don't have a passport  → [Skip to Next Step]           │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  If Yes:                                                        │
│                                                                  │
│  Passport Number *                                              │
│  ┌──────────────────────────────────────┐                       │
│  │ N1234567                              │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
│  Upload Passport Bio Page *                                     │
│  ┌─────────────────────────────────────┐                        │
│  │                                     │                        │
│  │    PASSPORT BIO PAGE                │                        │
│  │    (Photo & Details Page)           │                        │
│  │                                     │                        │
│  │       [📷 Upload Photo]             │                        │
│  │                                     │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  Issuing Country *      Issue Date *        Expiry Date *       │
│  [Sri Lanka ▼]          [DD/MM/YYYY]        [DD/MM/YYYY]        │
│                                                                  │
│  [← Back]              [Skip]              [Continue →]         │
└─────────────────────────────────────────────────────────────────┘
```

**Fields (if user has passport):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Passport Number | text | Yes* | *Required if user selects "Yes" |
| Issuing Country | select | Yes* | Country dropdown |
| Issue Date | date | Yes* | Cannot be future |
| Expiry Date | date | Yes* | Must be > 6 months from now |
| Bio Page Image | file | Yes* | Single page with photo and details |

**Validation:**
- If user selects "No" → Skip to Step 4
- If user selects "Yes" → All fields required
- Passport must have > 6 months validity

**Database:**
- Create `KYCDocument` record with type = 'PASSPORT' (if provided)
- Update UserProfile passport fields

---

#### KYR Step 4: Work/Company Details

**Purpose:** Collect employment/business information for future organization sync.

**UI Design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Work & Company Details                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What's your current employment status? *                       │
│                                                                  │
│  ○ Employed (Full-time/Part-time)                               │
│  ○ Self-Employed / Business Owner                               │
│  ○ Freelancer / Contractor                                      │
│  ○ Student                                                      │
│  ○ Retired                                                      │
│  ○ Unemployed / Looking for work                                │
│  ○ Other                                                        │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  If Employed / Self-Employed / Freelancer:                      │
│                                                                  │
│  Job Title / Role *                                             │
│  ┌──────────────────────────────────────┐                       │
│  │ Software Engineer                     │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
│  Company/Organization Name                                      │
│  ┌──────────────────────────────────────┐                       │
│  │ Acme Corporation                      │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
│  Industry/Sector                                                │
│  [Technology ▼]                                                 │
│                                                                  │
│  Work Email (Optional - for company verification)               │
│  ┌──────────────────────────────────────┐                       │
│  │ john@acme.com                         │                       │
│  └──────────────────────────────────────┘                       │
│  ℹ️ Used to link with GX Organization when your company joins   │
│                                                                  │
│  [← Back]                                   [Continue →]         │
└─────────────────────────────────────────────────────────────────┘
```

**Fields to Collect:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Employment Status | select | Yes | Employed, Self-Employed, Student, etc. |
| Job Title/Role | text | Conditional | Required if employed/self-employed |
| Company Name | text | No | Optional, for future org linking |
| Industry/Sector | select | No | Technology, Finance, Healthcare, etc. |
| Work Email | email | No | For future company verification/linking |

**Future Organization Sync:**
When a company creates a GX Organization:
1. System can match employees by work email domain
2. Employee receives invitation to join organization
3. Employment details pre-filled from KYR data
4. Trust score bonus for verified employment

**Database:**
- New fields in `UserProfile`: `employmentStatus`, `jobTitle`, `companyName`, `industry`, `workEmail`

---

#### KYR Step 5: Address Verification

**Fields to Collect:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Address Line 1 | text | Yes | Street address |
| Address Line 2 | text | No | Apartment, suite, etc. |
| City | text | Yes | |
| State/Province | text | Yes | |
| Postal Code | text | Yes | |
| Country | select | Yes | |
| Years at Address | number | Yes | For risk assessment |
| Proof of Address | file | Yes | Utility bill, bank statement (< 3 months old) |

**Previous Address (if < 2 years at current):**
- Same fields as above
- Why: Regulatory requirement for address history

**Database:** Create `Address` table with `isCurrent` flag

---

#### KYR Step 6: Biometric Verification

**Current Status:** Disabled with placeholder
**Message:** "Biometric verification coming soon to your region"

**Future Implementation:**
- Selfie capture with liveness detection
- Face matching against ID document
- Hash stored, raw image deleted after verification

**Placeholder Data Sent:**
```json
{
  "biometric": {
    "placeholder": true,
    "reason": "BIOMETRIC_NOT_AVAILABLE_IN_REGION"
  }
}
```

---

#### KYR Step 7: Review & Submit

**Display:** Summary of all entered data

**Checkboxes (Required):**
- [ ] I confirm all information is accurate
- [ ] I accept the Terms and Conditions
- [ ] I accept the Privacy Policy
- [ ] I consent to data processing for identity verification
- [ ] I declare I am not a Politically Exposed Person (PEP)

**Submit Action:**
1. Validate all required fields present
2. Compute document hashes (SHA-256)
3. Upload documents to S3 (if not already uploaded)
4. Submit KYR application to backend
5. Update user status to `PENDING_ADMIN_APPROVAL`
6. Show success message with expected review time

---

## Part 3: Database Schema Updates

### New/Modified Tables

```prisma
// Separate Address table for history tracking
model Address {
  addressId      String   @id @default(uuid())
  profileId      String
  profile        UserProfile @relation(fields: [profileId], references: [profileId])

  addressLine1   String
  addressLine2   String?
  city           String
  stateProvince  String
  postalCode     String
  country        String   // ISO 2-letter code

  isCurrent      Boolean  @default(true)
  yearsAtAddress Int?

  // Proof document
  proofDocumentId String?
  proofDocument   KYCDocument? @relation(fields: [proofDocumentId], references: [documentId])

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([profileId])
}

// Enhanced UserProfile fields
model UserProfile {
  // ... existing fields ...

  // New fields for enterprise KYR
  middleName         String?
  placeOfBirth       String?

  // Work/Employment fields (for future organization sync)
  employmentStatus   EmploymentStatus?
  jobTitle           String?
  companyName        String?
  industry           String?
  workEmail          String?

  // PEP Declaration
  isPEP              Boolean  @default(false)  // Politically Exposed Person
  pepDetails         String?                    // If PEP, explain relationship

  // Passport (optional secondary document)
  passportNumber     String?
  passportIssuingCountry String?
  passportIssueDate  DateTime?
  passportExpiryDate DateTime?

  // Relationships
  addresses          Address[]

  // ... rest of existing fields ...
}

enum EmploymentStatus {
  EMPLOYED
  SELF_EMPLOYED
  FREELANCER
  STUDENT
  RETIRED
  UNEMPLOYED
  OTHER
}
```

---

## Part 4: API Endpoints

### Registration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register/start` | Step 1: Start registration, send email OTP |
| POST | `/api/v1/auth/register/verify-email` | Step 2: Verify email OTP |
| POST | `/api/v1/auth/register/name-country` | Step 3: Set first name, last name, country |
| POST | `/api/v1/auth/register/dob-gender` | Step 4: Set DOB and gender |
| POST | `/api/v1/auth/register/password` | Step 5: Set password |
| POST | `/api/v1/auth/register/phone` | Step 6: Add phone, send SMS OTP |
| POST | `/api/v1/auth/register/verify-phone` | Step 7: Verify phone OTP, complete registration |
| POST | `/api/v1/auth/register/resend-otp` | Resend OTP (email or phone) |
| GET | `/api/v1/auth/register/status` | Get current registration step |

### KYR Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/:id/kyr` | Get current KYR status |
| PATCH | `/api/v1/users/:id/kyr/personal` | Update personal details |
| POST | `/api/v1/users/:id/kyr/national-id` | Upload national ID document |
| POST | `/api/v1/users/:id/kyr/passport` | Upload passport (optional) |
| PATCH | `/api/v1/users/:id/kyr/work` | Update work/employment details |
| PATCH | `/api/v1/users/:id/kyr/address` | Update address |
| POST | `/api/v1/users/:id/kyr/submit` | Submit complete KYR application |

---

## Part 5: Frontend Components

### Registration Flow Components
```
/app/(auth)/register/
├── page.tsx                    # Main registration flow controller
├── components/
│   ├── EmailStep.tsx           # Step 1: Email input
│   ├── EmailOTPStep.tsx        # Step 2: Email verification
│   ├── NameCountryStep.tsx     # Step 3: First name, Last name, Country
│   ├── DOBGenderStep.tsx       # Step 4: DOB & Gender with genesis check
│   ├── PasswordStep.tsx        # Step 5: Password creation
│   ├── PhoneStep.tsx           # Step 6: Phone input
│   ├── PhoneOTPStep.tsx        # Step 7: Phone verification
│   ├── ProgressIndicator.tsx   # Step progress bar (7 steps)
│   └── RegistrationComplete.tsx # Success screen
```

### KYR Flow Components
```
/components/kyr/
├── KYRWizard.tsx               # Main wizard controller
├── steps/
│   ├── PersonalDetailsStep.tsx # Step 1
│   ├── NationalIDStep.tsx      # Step 2 (mandatory)
│   ├── PassportStep.tsx        # Step 3 (optional)
│   ├── WorkDetailsStep.tsx     # Step 4 (new)
│   ├── AddressStep.tsx         # Step 5
│   ├── BiometricStep.tsx       # Step 6 (disabled placeholder)
│   └── ReviewStep.tsx          # Step 7
```

---

## Part 6: Complete User Lifecycle

### Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REGISTRATION PHASE                                   │
│                         (Off-Chain Only)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Step 1    Step 2      Step 3           Step 4        Step 5    Step 6-7   │
│   [Email] → [OTP] → [Name+Country] → [DOB+Gender] → [Password] → [Phone+OTP]│
│                                                                      ↓       │
│                                                               [REGISTERED]   │
│                                                                              │
│   Database: PendingRegistration → UserProfile (status: REGISTERED)           │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KYR PHASE                                          │
│                         (Off-Chain Only)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [REGISTERED] → Personal → National ID → Passport → Work → Address → Submit│
│                                                                              │
│   On Submit: status → PENDING_ADMIN_APPROVAL                                 │
│                                                                              │
│   Admin Reviews:                                                             │
│   ├── APPROVE → status: APPROVED_PENDING_ONCHAIN                            │
│   │             Generate Fabric User ID from: nationality + DOB + gender     │
│   │                                                                          │
│   └── DENY → status: DENIED (user can resubmit after corrections)           │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN REGISTRATION PHASE                           │
│                         (On-Chain via CQRS)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [APPROVED_PENDING_ONCHAIN]                                                 │
│              │                                                               │
│              ▼                                                               │
│   Admin triggers: POST /api/v1/admin/users/batch-register-onchain            │
│              │                                                               │
│              ▼                                                               │
│   OutboxCommand created: { type: 'CreateUser', payload: {...} }              │
│              │                                                               │
│              ▼                                                               │
│   outbox-submitter → Fabric IdentityContract:CreateUser()                    │
│              │                                                               │
│              ▼                                                               │
│   Blockchain emits: UserCreated event                                        │
│              │                                                               │
│              ▼                                                               │
│   projector → Updates UserProfile: status = ACTIVE                           │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ACTIVE USER                                        │
│                    (Full Blockchain Participation)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User can now:                                                              │
│   ✅ Receive genesis coin distribution (if age 13-73)                        │
│   ✅ Send and receive GX Coins                                               │
│   ✅ Request relationships (build trust score)                               │
│   ✅ Apply for zero-interest loans                                           │
│   ✅ Participate in governance (vote on proposals)                           │
│   ✅ Create/join organizations                                               │
│                                                                              │
│   Account can be:                                                            │
│   ⚠️ FROZEN - Admin freeze for compliance (can unfreeze)                     │
│   ⚠️ SUSPENDED - Severe violation (cannot login)                             │
│   ⛔ CLOSED - Permanent (terminal state)                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Collected Summary

| Phase | Data Collected | Storage |
|-------|---------------|---------|
| **Registration** | Email, Password, Country, DOB, Gender, Phone | UserProfile |
| **KYR Step 1** | Full name (first, middle, last), Place of Birth, Nationality | UserProfile |
| **KYR Step 2** | National ID Number, Front/Back images, Issue/Expiry dates | UserProfile.identityNum, KYCDocument |
| **KYR Step 3** | Passport Number, Bio page image (OPTIONAL) | UserProfile, KYCDocument |
| **KYR Step 4** | Employment Status, Job Title, Company, Industry, Work Email | UserProfile |
| **KYR Step 5** | Full address, Proof of address document | Address, KYCDocument |
| **KYR Step 6** | Biometric (placeholder - coming soon) | UserProfile.biometricHash |
| **KYR Step 7** | Consents + PEP declaration with timestamps | UserProfile + Consent audit |
| **Admin Approval** | Fabric User ID generated | UserProfile.fabricUserId |
| **Blockchain** | On-chain user record | Hyperledger Fabric ledger |

---

## Implementation Roadmap

### Phase 1: Registration Flow (Priority: HIGH)
1. Create `PendingRegistration` table in Prisma schema
2. Implement registration API endpoints (7 steps)
3. Build frontend registration wizard (modal-based)
4. Add OTP generation/verification service
   - **Development/Testing:** Use hardcoded OTP `111111` for both email and phone
   - **Production:** Integrate with Twilio/AWS SNS (TBD)
5. Add phone OTP support

**Testing Configuration:**
```typescript
/**
 * OTP Configuration
 *
 * For development and testing purposes, a hardcoded OTP "111111" is used
 * to allow end-to-end testing without actual SMS/Email delivery.
 *
 * TODO: Replace with actual OTP provider (Twilio/AWS SNS) before production launch.
 *
 * @see REGISTRATION_AND_KYR_FLOW_DESIGN.md for full implementation plan
 */
const DEV_TEST_OTP = '111111';
const isTestMode = process.env.NODE_ENV !== 'production' || process.env.USE_TEST_OTP === 'true';
```

### Phase 2: KYR Flow Enhancement (Priority: HIGH)
1. Update `UserProfile` with new fields (middleName, placeOfBirth, employment fields)
2. Create `Address` table for address history
3. Build new KYR wizard with 7 steps
4. Separate National ID and Passport tabs
5. Add Work/Company details step

### Phase 3: Admin Verification Tools (Priority: MEDIUM)
1. Side-by-side ID number vs document view
2. Document viewer with zoom/rotate
3. Bulk approval workflow
4. Audit logging for all admin actions

### Phase 4: Automated Verification (Priority: LOW - Future)
1. OCR integration for document text extraction
2. AI/ML document authenticity verification
3. Third-party ID verification API integration

---

## Critical Files to Modify

### Backend (gx-protocol-backend)
| File | Changes |
|------|---------|
| `db/prisma/schema.prisma` | Add PendingRegistration, Address tables; Update UserProfile |
| `apps/svc-identity/src/routes/` | Add registration step endpoints |
| `apps/svc-identity/src/services/` | Add registration service, OTP service |
| `apps/svc-admin/src/services/` | Update user management for new fields |

### Frontend (gx-wallet-frontend)
| File | Changes |
|------|---------|
| `app/(auth)/register/` | New progressive registration wizard |
| `components/kyr/KYRWizard.tsx` | Complete rewrite with 7 steps |
| `app/(root)/admin/dashboard/` | Update user detail modal |
| `components/admin/UserDetailModal.tsx` | Show ID number alongside document |

---

## Next Steps

After approval of this design:

1. **Create Prisma migration** for new tables (PendingRegistration, Address, UserProfile updates)
2. **Implement registration backend** - 7 step endpoints with OTP
3. **Build registration frontend** - Progressive modal wizard
4. **Rebuild KYR wizard** - 7 step flow with new tabs
5. **Update admin dashboard** - ID verification view
6. **Testing** - End-to-end registration and KYR flow
7. **Documentation** - Update API docs and user guides
