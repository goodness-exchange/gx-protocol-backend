# Lecture: JWT Authentication and Role-Based Access Control in Microservices

**Course:** Secure Backend Development
**Module:** Authentication & Authorization
**Duration:** 90 minutes
**Level:** Intermediate to Advanced

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Prerequisites](#prerequisites)
3. [Part I: Authentication Fundamentals](#part-i-authentication-fundamentals)
4. [Part II: JSON Web Tokens (JWT)](#part-ii-json-web-tokens-jwt)
5. [Part III: Role-Based Access Control (RBAC)](#part-iii-role-based-access-control-rbac)
6. [Part IV: Implementation in Express.js](#part-iv-implementation-in-expressjs)
7. [Part V: Security Best Practices](#part-v-security-best-practices)
8. [Part VI: Common Pitfalls and Solutions](#part-vi-common-pitfalls-and-solutions)
9. [Exercises](#exercises)
10. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Explain the difference between authentication and authorization
2. Understand JWT structure, claims, and signing algorithms
3. Implement stateless authentication using JWT in Node.js
4. Design and implement role-based access control systems
5. Secure Express.js API endpoints with middleware
6. Identify and mitigate common JWT security vulnerabilities
7. Apply industry best practices for token management

---

## Prerequisites

- Strong understanding of HTTP protocol and REST APIs
- Proficiency in JavaScript/TypeScript and Node.js
- Familiarity with Express.js middleware pattern
- Basic cryptography concepts (hashing, symmetric/asymmetric encryption)
- Understanding of async/await and Promises

**Optional but helpful:**
- Experience with OAuth 2.0 or OpenID Connect
- Knowledge of SQL injection and XSS attacks
- Exposure to security headers (CORS, CSP, HSTS)

---

## Part I: Authentication Fundamentals

### 1.1 Authentication vs Authorization

**Authentication (AuthN):** Verifying *who* the user is

- Examples: Login with email/password, biometric verification, OAuth
- Question answered: "Are you who you claim to be?"
- HTTP status code: `401 Unauthorized` (despite the name)

**Authorization (AuthZ):** Verifying *what* the user can do

- Examples: Admin privileges, resource ownership, permission levels
- Question answered: "Do you have permission to access this resource?"
- HTTP status code: `403 Forbidden`

### 1.2 Stateful vs Stateless Authentication

#### Stateful Authentication (Session-Based)

```
Client                   Server                   Database
  |                         |                         |
  |--- POST /login -------->|                         |
  |                         |--- Store session ------>|
  |<-- Set-Cookie: sid=123 -|                         |
  |                         |                         |
  |--- GET /profile ------->|                         |
  |    Cookie: sid=123      |--- Lookup session ----->|
  |                         |<-- Session data --------|
  |<-- User profile --------|                         |
```

**Pros:**
- Server can revoke sessions instantly
- No token size limitations
- Simpler client implementation

**Cons:**
- Requires persistent storage (memory, database, Redis)
- Difficult to scale horizontally
- CSRF vulnerabilities if not properly protected
- Sticky sessions complicate load balancing

#### Stateless Authentication (Token-Based)

```
Client                   Server
  |                         |
  |--- POST /login -------->|
  |                         | (Verify credentials)
  |<-- JWT token -----------| (Sign token with secret)
  |                         |
  |--- GET /profile ------->|
  |    Bearer: <JWT>        | (Verify signature)
  |                         | (Decode payload)
  |<-- User profile --------|
```

**Pros:**
- No server-side storage required
- Horizontal scaling is trivial
- Works across multiple domains/services
- Native mobile app friendly

**Cons:**
- Cannot revoke tokens before expiration
- Token size can be large (HTTP header limits)
- Requires careful secret management
- Clock synchronization issues

### 1.3 Why JWT for Microservices?

In a microservices architecture, stateless authentication provides:

1. **Service Independence:** Each service can validate tokens without shared session store
2. **Scalability:** No centralized authentication bottleneck
3. **Polyglot Support:** JWT libraries exist for all major languages
4. **Cross-Domain:** Works seamlessly across different service domains
5. **API Gateway Friendly:** Tokens can be validated at the edge

---

## Part II: JSON Web Tokens (JWT)

### 2.1 JWT Structure

A JWT consists of three Base64-encoded parts separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

<------------ HEADER ------------>.<------------ PAYLOAD -------------->.<------------ SIGNATURE ------------>
```

#### Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

- `alg`: Signing algorithm (HS256, RS256, ES256, etc.)
- `typ`: Token type (always "JWT")

#### Payload (Claims)

```json
{
  "sub": "1234567890",        // Subject (user ID)
  "name": "John Doe",         // Custom claim
  "iat": 1516239022,          // Issued at (Unix timestamp)
  "exp": 1516242622,          // Expiration (Unix timestamp)
  "role": "ADMIN"             // Custom claim (for RBAC)
}
```

**Standard Claims (RFC 7519):**
- `iss` (issuer): Who created and signed the token
- `sub` (subject): Principal the token represents (usually user ID)
- `aud` (audience): Intended recipients of the token
- `exp` (expiration): When the token expires (Unix timestamp)
- `nbf` (not before): Token not valid before this time
- `iat` (issued at): When the token was created
- `jti` (JWT ID): Unique identifier for the token

**Custom Claims:**
You can add any additional data needed for your application:
- `role`, `permissions`, `tenantId`, `email`, etc.

#### Signature

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

The signature ensures:
1. **Integrity:** Token hasn't been tampered with
2. **Authenticity:** Token was created by someone with the secret

### 2.2 Signing Algorithms

#### Symmetric (HMAC)

**HS256 (HMAC with SHA-256):**
```javascript
const jwt = require('jsonwebtoken');

// Both signing and verification use the same secret
const SECRET = 'your-256-bit-secret';

const token = jwt.sign({ userId: '123' }, SECRET);
const payload = jwt.verify(token, SECRET);
```

**Pros:**
- Simple implementation
- Fast signing and verification
- Small signature size

**Cons:**
- Secret must be shared among all services
- Secret compromise compromises entire system
- No non-repudiation (anyone with secret can create tokens)

#### Asymmetric (RSA, ECDSA)

**RS256 (RSA with SHA-256):**
```javascript
const fs = require('fs');

const privateKey = fs.readFileSync('private.key');
const publicKey = fs.readFileSync('public.key');

// Sign with private key
const token = jwt.sign({ userId: '123' }, privateKey, { algorithm: 'RS256' });

// Verify with public key
const payload = jwt.verify(token, publicKey);
```

**Pros:**
- Public key can be distributed safely
- Only one service needs private key (token issuer)
- Non-repudiation (only private key holder can create tokens)
- Key rotation is easier

**Cons:**
- Slower signing/verification
- Larger signature size
- More complex key management

**Recommendation for Microservices:**
- Use RS256 for production systems with multiple services
- Use HS256 for monolithic apps or very simple deployments

### 2.3 Token Lifecycle

```
1. User Login
   ↓
2. Server validates credentials
   ↓
3. Server creates JWT with claims
   ↓
4. Server signs JWT with secret/private key
   ↓
5. Server returns JWT to client
   ↓
6. Client stores JWT (localStorage, memory, secure cookie)
   ↓
7. Client includes JWT in subsequent requests (Authorization header)
   ↓
8. Server validates JWT signature
   ↓
9. Server checks expiration
   ↓
10. Server extracts claims (user ID, role, etc.)
    ↓
11. Server authorizes request based on claims
    ↓
12. Token expires → Client must re-authenticate
```

### 2.4 Access Tokens vs Refresh Tokens

**Access Token:**
- Short-lived (5-15 minutes)
- Used for API requests
- Stored in memory (not localStorage for security)
- Contains user identity and roles

**Refresh Token:**
- Long-lived (7-30 days)
- Used to obtain new access tokens
- Stored in secure HTTP-only cookie
- Can be revoked in database

**Flow:**
```
1. Login → Receive access token (15m) + refresh token (7d)
2. Use access token for API calls
3. Access token expires after 15 minutes
4. Client sends refresh token to /refresh endpoint
5. Server validates refresh token (checks not revoked)
6. Server issues new access token + optionally rotates refresh token
7. Repeat from step 2
```

This pattern provides:
- Short window for compromised access tokens
- Ability to revoke refresh tokens
- Better user experience (no frequent re-login)

---

## Part III: Role-Based Access Control (RBAC)

### 3.1 RBAC Concepts

**Role:** A named collection of permissions

```
USER:
  - Read own profile
  - Update own profile
  - Create transactions

ADMIN:
  - All USER permissions
  - Read all profiles
  - Approve KYC submissions
  - Freeze user accounts

SUPER_ADMIN:
  - All ADMIN permissions
  - Pause/resume system
  - Modify system parameters
  - Access all resources
```

**Permission:** A specific action on a specific resource

```
Format: <action>:<resource>

Examples:
  - read:users
  - write:users
  - delete:transactions
  - approve:kyc
```

### 3.2 RBAC Models

#### Flat RBAC

```
Users ──→ Roles ──→ Permissions
```

- User has one or more roles
- Role has permissions
- No role hierarchy

**Example:**
```
User: john@example.com
Roles: [ADMIN, SUPPORT]
Permissions: [read:users, write:tickets, read:logs]
```

#### Hierarchical RBAC

```
SUPER_ADMIN
    ↓ (inherits)
   ADMIN
    ↓ (inherits)
   USER
```

- Roles can inherit from parent roles
- SUPER_ADMIN has all ADMIN permissions
- ADMIN has all USER permissions

**Example:**
```
USER:
  - read:profile
  - write:profile

ADMIN (inherits USER):
  - read:users
  - approve:kyc

SUPER_ADMIN (inherits ADMIN):
  - pause:system
  - write:parameters
```

#### Constrained RBAC

Adds constraints like:
- **Static Separation of Duty (SSD):** User cannot have conflicting roles
- **Dynamic Separation of Duty (DSD):** User cannot activate conflicting roles in same session
- **Cardinality:** Maximum number of users per role

**Example:**
```
SSD: User cannot be both AUDITOR and ADMIN
DSD: User can be APPROVER and SUBMITTER, but not in same transaction
```

### 3.3 Implementing RBAC in JWT

**Option 1: Single Role in Token**
```json
{
  "sub": "user-123",
  "email": "admin@example.com",
  "role": "ADMIN",
  "iat": 1634567890,
  "exp": 1634571490
}
```

**Pros:** Simple to implement and check
**Cons:** Limited flexibility, no multi-role support

**Option 2: Role Array in Token**
```json
{
  "sub": "user-123",
  "email": "support@example.com",
  "roles": ["SUPPORT", "AUDITOR"],
  "iat": 1634567890,
  "exp": 1634571490
}
```

**Pros:** Supports multiple roles
**Cons:** Token size grows, complex authorization logic

**Option 3: Permissions in Token**
```json
{
  "sub": "user-123",
  "email": "admin@example.com",
  "permissions": [
    "read:users",
    "write:users",
    "approve:kyc",
    "freeze:accounts"
  ],
  "iat": 1634567890,
  "exp": 1634571490
}
```

**Pros:** Most flexible, explicit permissions
**Cons:** Large token size, permission changes require re-login

**Recommendation:**
Use **Option 1 (single role)** with hierarchical role model. This provides:
- Small token size
- Simple authorization checks
- Flexible permission changes without token refresh
- Clear role semantics

---

## Part IV: Implementation in Express.js

### 4.1 Project Structure

```
src/
├── middlewares/
│   ├── auth.ts                    # JWT authentication
│   ├── authorization.ts           # RBAC authorization
│   └── error-handler.ts           # Error handling
├── types/
│   └── express.d.ts               # Type augmentation
├── routes/
│   ├── public.routes.ts           # No auth required
│   ├── user.routes.ts             # USER role required
│   └── admin.routes.ts            # ADMIN role required
└── services/
    └── auth.service.ts            # Token generation/validation
```

### 4.2 Type Definitions

```typescript
// src/types/auth.ts

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  PARTNER_API = 'PARTNER_API',
}

export interface JWTPayload {
  profileId: string;
  email: string | null;
  role: UserRole;
  tenantId: string;
  status: string;
  iat?: number;
  exp?: number;
}

// src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
```

### 4.3 Authentication Middleware

```typescript
// src/middlewares/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types/auth';

export interface AuthConfig {
  jwtSecret: string;
}

export function createAuthMiddleware(config: AuthConfig) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 1. Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No authorization header provided',
        });
        return;
      }

      // 2. Validate Bearer format
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authorization header format. Expected: Bearer <token>',
        });
        return;
      }

      // 3. Extract token
      const token = authHeader.substring(7);

      // 4. Verify token signature and expiration
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

      // 5. Validate required fields
      if (!decoded.profileId || !decoded.role || !decoded.tenantId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token payload',
        });
        return;
      }

      // 6. Attach user to request
      req.user = decoded;

      // 7. Proceed to next middleware/handler
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });
        return;
      }

      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
    }
  };
}
```

### 4.4 Authorization Middleware

```typescript
// src/middlewares/authorization.ts
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/auth';

export function requireRoles(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Check if user has required role
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to access this resource',
      });
      return;
    }

    // User is authorized
    next();
  };
}

// Convenience middlewares
export const requireAdmin = requireRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
export const requireSuperAdmin = requireRoles([UserRole.SUPER_ADMIN]);
```

### 4.5 Route Protection

```typescript
// src/routes/admin.routes.ts
import express from 'express';
import { createAuthMiddleware } from '../middlewares/auth';
import { requireAdmin, requireSuperAdmin } from '../middlewares/authorization';
import * as adminController from '../controllers/admin.controller';

const router = express.Router();
const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });

// Require ADMIN or SUPER_ADMIN
router.post(
  '/users/:userId/verify',
  authenticateJWT,
  requireAdmin,
  adminController.verifyUser
);

router.post(
  '/kyc/:kycId/approve',
  authenticateJWT,
  requireAdmin,
  adminController.approveKYC
);

// Require SUPER_ADMIN only
router.post(
  '/system/pause',
  authenticateJWT,
  requireSuperAdmin,
  adminController.pauseSystem
);

router.post(
  '/system/resume',
  authenticateJWT,
  requireSuperAdmin,
  adminController.resumeSystem
);

export default router;
```

### 4.6 Token Generation

```typescript
// src/services/auth.service.ts
import jwt from 'jsonwebtoken';
import { UserRole, JWTPayload } from '../types/auth';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;

  constructor(
    accessTokenSecret: string,
    refreshTokenSecret: string
  ) {
    this.accessTokenSecret = accessTokenSecret;
    this.refreshTokenSecret = refreshTokenSecret;
  }

  /**
   * Generate access token (short-lived)
   */
  generateAccessToken(user: {
    profileId: string;
    email: string | null;
    role: UserRole;
    tenantId: string;
    status: string;
  }): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      profileId: user.profileId,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      status: user.status,
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: '15m', // 15 minutes
      issuer: 'gx-protocol',
      audience: 'gx-api',
    });
  }

  /**
   * Generate refresh token (long-lived)
   */
  generateRefreshToken(profileId: string): string {
    return jwt.sign(
      { profileId, type: 'refresh' },
      this.refreshTokenSecret,
      {
        expiresIn: '7d', // 7 days
        issuer: 'gx-protocol',
      }
    );
  }

  /**
   * Generate both tokens
   */
  generateTokenPair(user: {
    profileId: string;
    email: string | null;
    role: UserRole;
    tenantId: string;
    status: string;
  }): TokenPair {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user.profileId),
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    return jwt.verify(token, this.accessTokenSecret, {
      issuer: 'gx-protocol',
      audience: 'gx-api',
    }) as JWTPayload;
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { profileId: string; type: string } {
    return jwt.verify(token, this.refreshTokenSecret, {
      issuer: 'gx-protocol',
    }) as { profileId: string; type: string };
  }
}
```

---

## Part V: Security Best Practices

### 5.1 Token Storage

**Never store JWTs in localStorage:**
```javascript
// ❌ WRONG - Vulnerable to XSS attacks
localStorage.setItem('token', accessToken);
```

**Best Practices:**

**Option 1: Memory (for SPAs)**
```javascript
// ✅ GOOD - Token lost on page refresh, use refresh token to re-obtain
let accessToken = null;

function setAccessToken(token) {
  accessToken = token;
}

function getAccessToken() {
  return accessToken;
}
```

**Option 2: Secure HTTP-only Cookie (for server-rendered apps)**
```javascript
// ✅ GOOD - Cannot be accessed by JavaScript
res.cookie('accessToken', token, {
  httpOnly: true,        // Prevent XSS
  secure: true,          // HTTPS only
  sameSite: 'strict',    // Prevent CSRF
  maxAge: 15 * 60 * 1000 // 15 minutes
});
```

### 5.2 Token Expiration Strategy

```
Access Token: 5-15 minutes
  - Short window if compromised
  - Requires refresh token for renewal

Refresh Token: 7-30 days
  - Stored in secure HTTP-only cookie or database
  - Can be revoked in database
  - Rotated on each use (optional)

Session Token (if using): Until logout
  - Stored server-side only
  - Can be revoked immediately
```

### 5.3 Secret Management

**Never hardcode secrets:**
```javascript
// ❌ WRONG
const JWT_SECRET = 'my-secret-key-123';
```

**Use environment variables:**
```javascript
// ✅ GOOD
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}
```

**Generate strong secrets:**
```bash
# Use cryptographically secure random generation
openssl rand -base64 64

# Output:
# Rrf3jMLyp+IxLhNl7SwXC1DZYKLs4KGTjrFyB2KhexQ=...
```

**Rotate secrets regularly:**
```javascript
// Support multiple secrets for zero-downtime rotation
const CURRENT_SECRET = process.env.JWT_SECRET;
const PREVIOUS_SECRET = process.env.JWT_SECRET_PREVIOUS;

function verifyToken(token) {
  try {
    return jwt.verify(token, CURRENT_SECRET);
  } catch (err) {
    // Try previous secret during rotation period
    return jwt.verify(token, PREVIOUS_SECRET);
  }
}
```

### 5.4 Algorithm Validation

**Prevent 'none' algorithm attack:**
```javascript
// ❌ VULNERABLE - Accepts 'none' algorithm
jwt.verify(token, secret);

// ✅ SAFE - Explicitly require algorithm
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

**Prevent algorithm confusion attack:**
```javascript
// If using RS256, ensure public key is used for verification
const publicKey = fs.readFileSync('public.key');

jwt.verify(token, publicKey, { algorithms: ['RS256'] });
// Attacker cannot switch to HS256 and use public key as HMAC secret
```

### 5.5 HTTPS Enforcement

```javascript
// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
  });
}
```

### 5.6 Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

// Limit login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/login', loginLimiter, authController.login);
```

### 5.7 Input Validation

```javascript
import { body, validationResult } from 'express-validator';

app.post(
  '/api/auth/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Proceed with login
  }
);
```

---

## Part VI: Common Pitfalls and Solutions

### 6.1 Pitfall: Token Revocation

**Problem:** JWTs are stateless - cannot be revoked before expiration

**Solutions:**

**Option 1: Short expiration + refresh tokens**
```javascript
// Access token expires in 15 minutes
// Refresh token stored in database, can be revoked
const accessToken = jwt.sign(payload, SECRET, { expiresIn: '15m' });
```

**Option 2: Token blacklist**
```javascript
// Store revoked tokens in Redis with TTL = remaining token life
const revokedTokens = new Set();

function revokeToken(token) {
  const decoded = jwt.decode(token);
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  redis.setex(`revoked:${token}`, ttl, '1');
}

function isTokenRevoked(token) {
  return redis.exists(`revoked:${token}`);
}
```

**Option 3: Token versioning**
```json
{
  "sub": "user-123",
  "tokenVersion": 5,
  "exp": 1634571490
}
```

```javascript
// Increment user's tokenVersion in database when revoking all tokens
function verifyToken(token) {
  const decoded = jwt.verify(token, SECRET);
  const user = await getUserFromDB(decoded.sub);

  if (decoded.tokenVersion < user.tokenVersion) {
    throw new Error('Token has been revoked');
  }

  return decoded;
}
```

### 6.2 Pitfall: Missing Authentication Middleware

```javascript
// ❌ WRONG - Authorization without authentication
router.delete('/users/:id', requireAdmin, controller.deleteUser);
// req.user is undefined, middleware crashes
```

```javascript
// ✅ CORRECT - Authentication first, then authorization
router.delete('/users/:id', authenticateJWT, requireAdmin, controller.deleteUser);
```

### 6.3 Pitfall: Role in URL

```javascript
// ❌ WRONG - Trusting role from request
app.get('/admin/users', (req, res) => {
  if (req.query.role === 'ADMIN') {
    // Show admin data
  }
});
```

```javascript
// ✅ CORRECT - Role from verified JWT only
app.get('/admin/users', authenticateJWT, requireAdmin, (req, res) => {
  // req.user.role is from verified JWT
});
```

### 6.4 Pitfall: Sensitive Data in JWT

```javascript
// ❌ WRONG - Sensitive data in token
const token = jwt.sign({
  userId: '123',
  email: 'user@example.com',
  creditCardNumber: '4111111111111111', // Never do this!
  ssn: '123-45-6789',                    // Never do this!
}, SECRET);
```

**Remember:** JWTs are Base64-encoded, not encrypted. Anyone can decode and read the payload.

```javascript
// ✅ CORRECT - Only non-sensitive data
const token = jwt.sign({
  userId: '123',
  email: 'user@example.com',
  role: 'USER',
}, SECRET);
```

### 6.5 Pitfall: Not Validating 'aud' and 'iss'

```javascript
// ❌ VULNERABLE - Accepts tokens from any issuer
jwt.verify(token, SECRET);
```

```javascript
// ✅ SAFE - Validates issuer and audience
jwt.verify(token, SECRET, {
  issuer: 'gx-protocol',
  audience: 'gx-api',
});
```

### 6.6 Pitfall: Clock Skew

**Problem:** Server clocks not synchronized, tokens rejected as expired

**Solution:** Add clock tolerance
```javascript
jwt.verify(token, SECRET, {
  clockTolerance: 10, // 10 seconds tolerance
});
```

---

## Exercises

### Exercise 1: Basic Implementation

Implement a simple Express.js API with JWT authentication:

1. Create `/api/auth/register` endpoint (POST)
2. Create `/api/auth/login` endpoint (POST)
3. Create `/api/profile` endpoint (GET) - requires authentication
4. Use HS256 algorithm with a secret from environment variable

**Bonus:** Add input validation for email and password

### Exercise 2: RBAC Implementation

Extend Exercise 1 with role-based access control:

1. Add `role` field to user model (USER, ADMIN)
2. Create `/api/admin/users` endpoint (GET) - requires ADMIN role
3. Create authorization middleware that checks user role
4. Test with both USER and ADMIN tokens

**Bonus:** Implement role hierarchy (ADMIN inherits USER permissions)

### Exercise 3: Refresh Token Flow

Implement refresh token functionality:

1. Generate both access token (5m) and refresh token (7d) on login
2. Store refresh token in database with user ID
3. Create `/api/auth/refresh` endpoint that accepts refresh token
4. Validate refresh token and issue new access token
5. Implement refresh token rotation (issue new refresh token on each use)

**Bonus:** Add refresh token revocation endpoint

### Exercise 4: Security Hardening

Secure your implementation from Exercises 1-3:

1. Add rate limiting to login endpoint (5 requests per 15 minutes)
2. Enforce HTTPS in production
3. Add helmet middleware for security headers
4. Implement token revocation using Redis blacklist
5. Add input validation and sanitization

**Bonus:** Write unit tests for authentication and authorization middleware

### Exercise 5: Multi-Service Architecture

Simulate microservices with shared authentication:

1. Create two Express apps: `auth-service` and `user-service`
2. `auth-service`: Issues JWT tokens (has private key)
3. `user-service`: Validates JWT tokens (has public key only)
4. Use RS256 algorithm for asymmetric signing
5. Both services should validate tokens independently

**Bonus:** Add API gateway that validates tokens before routing to services

---

## Further Reading

### Official Specifications
- [RFC 7519: JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7515: JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)
- [RFC 7516: JSON Web Encryption (JWE)](https://tools.ietf.org/html/rfc7516)
- [RFC 7518: JSON Web Algorithms (JWA)](https://tools.ietf.org/html/rfc7518)

### Security Resources
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [JWT.io - JWT Debugger and Library Guide](https://jwt.io/)
- [Auth0 JWT Handbook](https://auth0.com/resources/ebooks/jwt-handbook)

### Books
- *OAuth 2 in Action* by Justin Richer and Antonio Sanso
- *Web Application Security* by Andrew Hoffman
- *Identity and Data Security for Web Development* by Jonathan LeBlanc and Tim Messerschmidt

### Articles
- [Stop Using JWT for Sessions](http://cryto.net/~joepie91/blog/2016/06/13/stop-using-jwt-for-sessions/)
- [The Hard Parts of JWT Security Nobody Talks About](https://www.pingidentity.com/en/resources/blog/post/jwt-security-nobody-talks-about.html)
- [Critical Vulnerabilities in JSON Web Token Libraries](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)

### Tools
- [JWT.io Debugger](https://jwt.io/) - Decode and verify JWTs
- [Keycloak](https://www.keycloak.org/) - Open-source identity and access management
- [Auth0](https://auth0.com/) - Authentication-as-a-Service platform
- [Postman](https://www.postman.com/) - API testing with JWT support

---

## Summary

In this lecture, we covered:

1. **Authentication vs Authorization:** Understanding the difference and when to use each
2. **JWT Structure:** Header, payload, signature and their purposes
3. **Signing Algorithms:** Symmetric (HS256) vs Asymmetric (RS256) trade-offs
4. **RBAC Design:** Role hierarchies and permission models
5. **Express Implementation:** Middleware patterns for auth and authz
6. **Security Best Practices:** Token storage, expiration, secret management, HTTPS
7. **Common Pitfalls:** Token revocation, sensitive data, clock skew, and their solutions

**Key Takeaways:**
- JWTs provide stateless authentication ideal for microservices
- Always use authentication before authorization middleware
- Keep access tokens short-lived, use refresh tokens for longevity
- Never store sensitive data in JWT payload
- Use HTTPS in production, always
- Implement rate limiting on authentication endpoints
- Validate `iss`, `aud`, and `exp` claims
- Test your implementation thoroughly

**Next Steps:**
- Complete the exercises to solidify understanding
- Read OWASP JWT Security Cheat Sheet
- Explore OAuth 2.0 and OpenID Connect for federated authentication
- Study zero-trust architecture and BeyondCorp principles

---

**Questions for Discussion:**

1. When would you choose session-based authentication over JWT?
2. How would you implement single sign-out across multiple services using JWTs?
3. What are the security implications of storing user roles in JWT vs database?
4. How can you balance token size against the need for user metadata?
5. What strategies exist for handling token refresh in mobile apps vs SPAs?

---

**End of Lecture**