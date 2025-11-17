# GX Protocol Backend - Wallet API Integration Guide
**Version:** 1.0
**Date:** November 17, 2025
**For:** Wallet Frontend Development Team
**Base URL:** `https://api.gxcoin.money`

---

## Quick Start

### Current API Status

**✅ AVAILABLE NOW (Read-Only Operations):**
- User registration & authentication
- View wallet balance
- View transaction history
- Profile management
- KYC status checking

**⏳ COMING SOON (1-2 Days - Write Operations):**
- Transfer tokens
- Create organizations
- Loan applications
- Governance proposals

**Blocker:** Worker pods need Docker image rebuild to fix Prisma client issue.

---

## Authentication Flow

### 1. Register New User

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "countryCode": "US"
}
```

**Response 201 Created:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "User registered successfully",
  "kycStatus": "PENDING"
}
```

**Validation Rules:**
- Email: Valid email format, unique
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number
- Phone: E.164 format (international format)
- Country Code: ISO 3166-1 alpha-2 (2 letters)

**Error Responses:**
```json
// 400 Bad Request - Validation Failed
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}

// 409 Conflict - Email Already Exists
{
  "error": "User already exists",
  "message": "Email is already registered"
}
```

---

### 2. Login (Get JWT Tokens)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response 200 OK:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "kycStatus": "PENDING"
  },
  "expiresIn": 900
}
```

**Token Details:**
- `accessToken`: Short-lived (15 minutes), use for all API calls
- `refreshToken`: Long-lived (7 days), use to get new access token
- `expiresIn`: Access token expiry in seconds (900 = 15 minutes)

**Error Responses:**
```json
// 401 Unauthorized - Invalid Credentials
{
  "error": "Invalid credentials",
  "message": "Email or password is incorrect"
}

// 403 Forbidden - Account Suspended
{
  "error": "Account suspended",
  "message": "Your account has been suspended. Contact support."
}
```

---

### 3. Refresh Access Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response 200 OK:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Error Responses:**
```json
// 401 Unauthorized - Invalid/Expired Refresh Token
{
  "error": "Invalid refresh token",
  "message": "Refresh token is invalid or expired"
}
```

---

### 4. Using Access Tokens

All authenticated endpoints require the `Authorization` header:

```http
GET /api/v1/users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Lifecycle:**
```
1. Login → Get accessToken (15 min) + refreshToken (7 days)
2. Use accessToken for API calls
3. When accessToken expires → Use refreshToken to get new accessToken
4. When refreshToken expires → User must login again
```

**Best Practices:**
- Store tokens securely (iOS Keychain, Android Keystore)
- Auto-refresh accessToken before expiry (e.g., at 14 minutes)
- Handle 401 responses by refreshing token
- Never expose refreshToken to logs or analytics

---

## User Profile Management

### 5. Get User Profile

```http
GET /api/v1/users/profile
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "countryCode": "US",
  "kycStatus": "PENDING",
  "accountStatus": "ACTIVE",
  "tier": "TIER1",
  "createdAt": "2025-11-17T08:00:00Z",
  "updatedAt": "2025-11-17T08:00:00Z"
}
```

**KYC Status Values:**
- `PENDING`: User registered, KYC not submitted
- `SUBMITTED`: KYC documents uploaded, awaiting review
- `APPROVED`: KYC approved, full access
- `REJECTED`: KYC rejected, limited access
- `EXPIRED`: KYC expired, needs renewal

**Account Status Values:**
- `ACTIVE`: Normal account
- `SUSPENDED`: Temporarily suspended
- `DELETED`: Soft-deleted account

---

### 6. Update Profile (Off-Chain)

```http
PUT /api/v1/users/profile
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890"
}
```

**Response 200 OK:**
```json
{
  "message": "Profile updated successfully",
  "updatedFields": ["firstName", "lastName"]
}
```

**Note:** Email cannot be changed via this endpoint (security).

---

### 7. Submit KYC (Off-Chain)

```http
POST /api/v1/users/kyc/submit
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "documentType": "PASSPORT",
  "documentNumber": "AB1234567",
  "issuingCountry": "US",
  "expiryDate": "2030-12-31",
  "biometricHash": "base64_encoded_hash",
  "documents": [
    {
      "type": "ID_FRONT",
      "url": "https://storage.example.com/kyc/doc1.jpg"
    },
    {
      "type": "ID_BACK",
      "url": "https://storage.example.com/kyc/doc2.jpg"
    },
    {
      "type": "SELFIE",
      "url": "https://storage.example.com/kyc/selfie.jpg"
    }
  ]
}
```

**Document Types:**
- `PASSPORT`: Passport
- `NATIONAL_ID`: National ID card
- `DRIVERS_LICENSE`: Driver's license

**Response 200 OK:**
```json
{
  "kycId": "kyc-uuid",
  "status": "SUBMITTED",
  "message": "KYC submitted successfully. Review may take 1-3 business days."
}
```

---

## Wallet & Balance

### 8. Get Wallet Balance

```http
GET /api/v1/wallets/{userId}/balance
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "balance": "1000.50",
  "currency": "GXC",
  "frozenAmount": "0.00",
  "availableBalance": "1000.50",
  "lastUpdated": "2025-11-17T08:00:00Z"
}
```

**Balance Fields:**
- `balance`: Total balance (frozen + available)
- `frozenAmount`: Amount locked (multi-sig, loans, etc.)
- `availableBalance`: Amount available for transfer

---

### 9. Get Transaction History

```http
GET /api/v1/transactions/{userId}/history?page=1&limit=20&type=TRANSFER
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `type`: Filter by transaction type (optional)
  - `TRANSFER`: P2P transfers
  - `GENESIS`: Genesis distribution
  - `LOAN`: Loan disbursements/repayments
  - `TAX`: Tax payments
  - `FEE`: Transaction fees

**Response 200 OK:**
```json
{
  "transactions": [
    {
      "id": "tx-uuid",
      "type": "TRANSFER",
      "amount": "50.00",
      "currency": "GXC",
      "from": "550e8400-e29b-41d4-a716-446655440000",
      "to": "660e8400-e29b-41d4-a716-446655440001",
      "status": "COMPLETED",
      "timestamp": "2025-11-17T07:00:00Z",
      "blockNumber": 12345,
      "txHash": "0xabc123...",
      "fee": "0.10",
      "description": "Payment for services"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Transaction Status:**
- `PENDING`: Submitted to blockchain, not confirmed
- `COMPLETED`: Confirmed on blockchain
- `FAILED`: Transaction failed

---

## Token Transfers (⏳ BLOCKED - Workers Down)

### 10. Transfer Tokens

```http
POST /api/v1/transactions/transfer
Authorization: Bearer {accessToken}
Content-Type: application/json
X-Idempotency-Key: unique-request-id-12345

{
  "toUserId": "660e8400-e29b-41d4-a716-446655440001",
  "amount": "50.00",
  "description": "Payment for services",
  "pin": "1234"
}
```

**Headers:**
- `X-Idempotency-Key`: Unique key per request (prevents duplicate transfers)

**Response 202 Accepted:**
```json
{
  "commandId": "cmd-uuid",
  "status": "PENDING",
  "message": "Transfer submitted to blockchain",
  "estimatedConfirmationTime": "30-60 seconds"
}
```

**⚠️ Current Status:** Returns 500 error because workers are down. Will work in 1-2 days after Docker image rebuild.

---

## Organization Management (⏳ BLOCKED)

### 11. Create Organization (Multi-Sig Wallet)

```http
POST /api/v1/organizations/propose
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "name": "My Business LLC",
  "type": "BUSINESS",
  "stakeholders": [
    {
      "userId": "user-uuid-1",
      "role": "FOUNDER",
      "votingWeight": 50
    },
    {
      "userId": "user-uuid-2",
      "role": "PARTNER",
      "votingWeight": 50
    }
  ],
  "approvalThreshold": 60,
  "description": "Our family business"
}
```

**Organization Types:**
- `FAMILY`: Family organization
- `BUSINESS`: Business entity
- `COOPERATIVE`: Cooperative
- `NONPROFIT`: Non-profit organization

**Response 202 Accepted:**
```json
{
  "organizationId": "org-uuid",
  "status": "PROPOSED",
  "message": "Organization proposal submitted. Requires stakeholder endorsements."
}
```

**⚠️ Current Status:** Blocked by workers.

---

### 12. Get Organization Details

```http
GET /api/v1/organizations/{organizationId}
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "id": "org-uuid",
  "name": "My Business LLC",
  "type": "BUSINESS",
  "status": "ACTIVE",
  "stakeholders": [
    {
      "userId": "user-uuid-1",
      "role": "FOUNDER",
      "votingWeight": 50,
      "joinedAt": "2025-11-01T00:00:00Z"
    }
  ],
  "approvalThreshold": 60,
  "balance": "5000.00",
  "createdAt": "2025-11-01T00:00:00Z"
}
```

---

## Loan Management (⏳ BLOCKED)

### 13. Apply for Loan

```http
POST /api/v1/loans/apply
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": "1000.00",
  "purpose": "Business expansion",
  "repaymentPeriod": 12,
  "collateral": "Real estate title"
}
```

**Response 202 Accepted:**
```json
{
  "loanId": "loan-uuid",
  "status": "PENDING_APPROVAL",
  "message": "Loan application submitted for review"
}
```

**⚠️ Current Status:** Blocked by workers.

---

### 14. Get Loan Status

```http
GET /api/v1/loans/{loanId}
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "id": "loan-uuid",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": "1000.00",
  "purpose": "Business expansion",
  "status": "APPROVED",
  "approvedAmount": "1000.00",
  "repaymentPeriod": 12,
  "disbursedAt": "2025-11-15T00:00:00Z",
  "dueDate": "2026-11-15T00:00:00Z",
  "remainingBalance": "800.00"
}
```

**Loan Status:**
- `PENDING_APPROVAL`: Awaiting admin approval
- `APPROVED`: Approved, funds disbursed
- `REJECTED`: Application rejected
- `REPAID`: Fully repaid
- `DEFAULTED`: Loan defaulted

---

## Governance (⏳ BLOCKED)

### 15. Submit Governance Proposal

```http
POST /api/v1/proposals/submit
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "Increase transaction fee from 0.1% to 0.2%",
  "description": "Proposal to adjust fees to cover operational costs",
  "type": "PARAMETER_CHANGE",
  "proposedChanges": {
    "parameter": "TRANSACTION_FEE_PERCENTAGE",
    "currentValue": "0.1",
    "proposedValue": "0.2"
  },
  "votingPeriod": 7
}
```

**Proposal Types:**
- `PARAMETER_CHANGE`: Change system parameters
- `TREASURY_ALLOCATION`: Allocate treasury funds
- `PROTOCOL_UPGRADE`: Protocol changes

**Response 202 Accepted:**
```json
{
  "proposalId": "prop-uuid",
  "status": "VOTING",
  "votingStartsAt": "2025-11-17T00:00:00Z",
  "votingEndsAt": "2025-11-24T00:00:00Z"
}
```

**⚠️ Current Status:** Blocked by workers.

---

### 16. Vote on Proposal

```http
POST /api/v1/proposals/{proposalId}/vote
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "vote": "YES",
  "reason": "I support this change"
}
```

**Vote Options:**
- `YES`: Support the proposal
- `NO`: Reject the proposal
- `ABSTAIN`: Abstain from voting

**Response 200 OK:**
```json
{
  "message": "Vote recorded successfully",
  "votingPower": "100.00"
}
```

**⚠️ Current Status:** Blocked by workers.

---

## Tax & Fees

### 17. Calculate Transaction Fee

```http
POST /api/v1/fees/calculate
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "transactionType": "TRANSFER",
  "amount": "100.00",
  "fromUserId": "user-uuid-1",
  "toUserId": "user-uuid-2"
}
```

**Response 200 OK:**
```json
{
  "feeAmount": "0.10",
  "feePercentage": "0.1",
  "totalAmount": "100.10",
  "breakdown": {
    "baseFee": "0.05",
    "networkFee": "0.05"
  }
}
```

---

### 18. Check Hoarding Tax Eligibility

```http
GET /api/v1/fees/hoarding-tax/eligibility?userId={userId}
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "eligible": true,
  "taxableAmount": "5000.00",
  "taxRate": "1.0",
  "taxAmount": "50.00",
  "reason": "Balance exceeds threshold without transactions for 90 days",
  "lastTransactionDate": "2025-08-17T00:00:00Z"
}
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2025-11-17T08:00:00Z",
  "path": "/api/v1/auth/register"
}
```

### HTTP Status Codes

| Code | Meaning | When It Happens |
|------|---------|-----------------|
| 200 | OK | Successful GET/PUT request |
| 201 | Created | Successful POST (resource created) |
| 202 | Accepted | Request accepted for async processing |
| 400 | Bad Request | Invalid input, validation failed |
| 401 | Unauthorized | Missing/invalid/expired access token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate) |
| 429 | Too Many Requests | Rate limit exceeded (100 req/min) |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Service temporarily down |

---

## Rate Limiting

**Limit:** 100 requests per minute per user (based on JWT user ID)

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700208000
```

**429 Response:**
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded 100 requests per minute. Please try again in 30 seconds.",
  "retryAfter": 30
}
```

---

## Testing Endpoints

### Health Check (No Auth Required)

```http
GET /api/v1/health
```

**Response 200 OK:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "version": "2.0.6"
}
```

### Readiness Check (No Auth Required)

```http
GET /api/v1/readyz
```

**Response 200 OK:**
```json
{
  "ready": true,
  "checks": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## Environment URLs

**Production:**
- Base URL: `https://api.gxcoin.money`
- SSL: Let's Encrypt (staging cert currently, production cert coming)
- Cloudflare CDN: Enabled (DDoS protection)

**Testing:**
- You can test read-only endpoints NOW
- Write operations will be available in 1-2 days

---

## SDK Examples

### JavaScript/TypeScript

```typescript
// Install: npm install axios

import axios from 'axios';

const API_BASE_URL = 'https://api.gxcoin.money';

// 1. Register
async function register(email: string, password: string) {
  const response = await axios.post(`${API_BASE_URL}/api/v1/auth/register`, {
    email,
    password,
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    countryCode: 'US'
  });
  return response.data;
}

// 2. Login
async function login(email: string, password: string) {
  const response = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
    email,
    password
  });
  const { accessToken, refreshToken, user } = response.data;

  // Store tokens securely
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  return user;
}

// 3. Get Balance
async function getBalance(userId: string) {
  const accessToken = localStorage.getItem('accessToken');
  const response = await axios.get(
    `${API_BASE_URL}/api/v1/wallets/${userId}/balance`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  return response.data;
}

// 4. Handle 401 (Token Expired) - Auto Refresh
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
        refreshToken
      });
      const { accessToken } = response.data;
      localStorage.setItem('accessToken', accessToken);

      // Retry original request
      error.config.headers.Authorization = `Bearer ${accessToken}`;
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

### Swift (iOS)

```swift
import Foundation

struct GXAPIClient {
    static let baseURL = "https://api.gxcoin.money"

    // 1. Login
    static func login(email: String, password: String, completion: @escaping (Result<LoginResponse, Error>) -> Void) {
        let url = URL(string: "\(baseURL)/api/v1/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["email": email, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let data = data else {
                completion(.failure(NSError(domain: "No data", code: -1)))
                return
            }

            let decoder = JSONDecoder()
            if let loginResponse = try? decoder.decode(LoginResponse.self, from: data) {
                // Store tokens in Keychain
                KeychainHelper.save(loginResponse.accessToken, forKey: "accessToken")
                KeychainHelper.save(loginResponse.refreshToken, forKey: "refreshToken")
                completion(.success(loginResponse))
            }
        }.resume()
    }

    // 2. Get Balance
    static func getBalance(userId: String, completion: @escaping (Result<BalanceResponse, Error>) -> Void) {
        let url = URL(string: "\(baseURL)/api/v1/wallets/\(userId)/balance")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        if let accessToken = KeychainHelper.load(forKey: "accessToken") {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            // Handle response...
        }.resume()
    }
}

struct LoginResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: User
}

struct BalanceResponse: Codable {
    let balance: String
    let availableBalance: String
}
```

### Kotlin (Android)

```kotlin
import okhttp3.*
import com.google.gson.Gson

object GXAPIClient {
    private const val BASE_URL = "https://api.gxcoin.money"
    private val client = OkHttpClient()
    private val gson = Gson()

    // 1. Login
    fun login(email: String, password: String, callback: (LoginResponse?) -> Unit) {
        val json = gson.toJson(mapOf(
            "email" to email,
            "password" to password
        ))

        val request = Request.Builder()
            .url("$BASE_URL/api/v1/auth/login")
            .post(RequestBody.create(
                MediaType.parse("application/json"), json
            ))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    val loginResponse = gson.fromJson(
                        response.body?.string(),
                        LoginResponse::class.java
                    )

                    // Store tokens in EncryptedSharedPreferences
                    SecureStorage.saveToken("accessToken", loginResponse.accessToken)
                    SecureStorage.saveToken("refreshToken", loginResponse.refreshToken)

                    callback(loginResponse)
                }
            }

            override fun onFailure(call: Call, e: IOException) {
                callback(null)
            }
        })
    }

    // 2. Get Balance
    fun getBalance(userId: String, callback: (BalanceResponse?) -> Unit) {
        val accessToken = SecureStorage.getToken("accessToken")

        val request = Request.Builder()
            .url("$BASE_URL/api/v1/wallets/$userId/balance")
            .header("Authorization", "Bearer $accessToken")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    val balanceResponse = gson.fromJson(
                        response.body?.string(),
                        BalanceResponse::class.java
                    )
                    callback(balanceResponse)
                }
            }

            override fun onFailure(call: Call, e: IOException) {
                callback(null)
            }
        })
    }
}

data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: User
)

data class BalanceResponse(
    val balance: String,
    val availableBalance: String
)
```

---

## Postman Collection

Import this into Postman to test the API:

```json
{
  "info": {
    "name": "GX Protocol API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://api.gxcoin.money"
    },
    {
      "key": "accessToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "1. Register",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"Test1234!\",\n  \"firstName\": \"Test\",\n  \"lastName\": \"User\",\n  \"phone\": \"+1234567890\",\n  \"countryCode\": \"US\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "{{baseUrl}}/api/v1/auth/register",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "auth", "register"]
        }
      }
    },
    {
      "name": "2. Login",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"Test1234!\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "{{baseUrl}}/api/v1/auth/login",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "auth", "login"]
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "var jsonData = pm.response.json();",
              "pm.collectionVariables.set(\"accessToken\", jsonData.accessToken);"
            ]
          }
        }
      ]
    },
    {
      "name": "3. Get Profile",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{accessToken}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/v1/users/profile",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "users", "profile"]
        }
      }
    }
  ]
}
```

---

## FAQ

**Q: When will transfer operations work?**
A: Within 1-2 days after Docker images are rebuilt with Prisma client fix.

**Q: Can I test the API now?**
A: Yes! All read-only operations work (register, login, balance, transaction history).

**Q: What's the rate limit?**
A: 100 requests per minute per user.

**Q: How long do tokens last?**
A: Access token: 15 minutes, Refresh token: 7 days.

**Q: Is the API production-ready?**
A: Read operations: YES. Write operations: In 1-2 days. Full production: 6-8 weeks (after testing).

**Q: Where can I report API bugs?**
A: Create an issue in the GitHub repository or contact the backend team.

---

**Document Version:** 1.0
**Last Updated:** November 17, 2025
**Maintained By:** Backend Team
