# Authentication & Authorization Middleware Guide

## Overview

The `@gx/core-http` package provides production-ready JWT authentication and role-based access control (RBAC) middleware for Express applications in the GX Protocol system.

## User Roles

The system supports four user roles with hierarchical permissions:

| Role | Description | Access Level |
|------|-------------|--------------|
| `USER` | Regular user | Standard user operations |
| `ADMIN` | System administrator | User management, KYC approval, system monitoring |
| `SUPER_ADMIN` | Super administrator | Full system control, pause/resume, treasury management |
| `PARTNER_API` | External partner | Machine-to-machine API access |

## Installation

The middleware is already included in `@gx/core-http`. No additional installation required.

```typescript
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  requireRoles,
  requireAdmin,
  requireSuperAdmin,
  UserRole,
  AuthenticatedRequest,
} from '@gx/core-http';
```

## Usage

### 1. Basic JWT Authentication

Protect routes that require any authenticated user:

```typescript
import express from 'express';
import { createAuthMiddleware, AuthenticatedRequest } from '@gx/core-http';

const app = express();
const authenticateJWT = createAuthMiddleware({
  jwtSecret: process.env.JWT_SECRET!,
});

// Protected route - requires valid JWT
app.get('/api/profile', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.profileId;
  const userEmail = req.user!.email;

  // ... fetch and return user profile
  res.json({ userId, email: userEmail });
});
```

### 2. Optional Authentication

Allow both authenticated and anonymous access:

```typescript
import { createOptionalAuthMiddleware } from '@gx/core-http';

const optionalJWT = createOptionalAuthMiddleware({
  jwtSecret: process.env.JWT_SECRET!,
});

// Public route with optional auth
app.get('/api/public/content', optionalJWT, (req: AuthenticatedRequest, res) => {
  if (req.user) {
    // Authenticated user - show personalized content
    res.json({ message: `Welcome back, ${req.user.email}!` });
  } else {
    // Anonymous user - show generic content
    res.json({ message: 'Welcome, guest!' });
  }
});
```

### 3. Role-Based Authorization

#### Using `requireRoles()`

Restrict access to specific roles:

```typescript
import { requireRoles, UserRole } from '@gx/core-http';

const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });

// Only ADMIN and SUPER_ADMIN can approve KYC
const requireAdminRole = requireRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

app.post(
  '/api/admin/kyc/:kycId/approve',
  authenticateJWT,
  requireAdminRole,
  (req: AuthenticatedRequest, res) => {
    // Only admins reach here
    const adminId = req.user!.profileId;
    const kycId = req.params.kycId;

    // ... approve KYC logic
    res.json({ message: 'KYC approved' });
  }
);
```

#### Using Convenience Middlewares

The package provides pre-configured role middleware:

```typescript
import { requireAdmin, requireSuperAdmin } from '@gx/core-http';

const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });

// Require ADMIN or SUPER_ADMIN
app.post('/api/admin/users/verify', authenticateJWT, requireAdmin, controller.verifyUser);

// Require SUPER_ADMIN only
app.post('/api/admin/system/pause', authenticateJWT, requireSuperAdmin, controller.pauseSystem);
```

### 4. Complete Example: Admin Route

```typescript
import express from 'express';
import {
  createAuthMiddleware,
  requireAdmin,
  AuthenticatedRequest,
} from '@gx/core-http';

const router = express.Router();
const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });

/**
 * Freeze user account (ADMIN only)
 */
router.post(
  '/users/:userId/freeze',
  authenticateJWT,   // Step 1: Validate JWT
  requireAdmin,      // Step 2: Check role
  async (req: AuthenticatedRequest, res) => {
    try {
      const adminId = req.user!.profileId;  // Available after authenticateJWT
      const adminRole = req.user!.role;      // Available after authenticateJWT
      const targetUserId = req.params.userId;

      // Business logic
      await userService.freezeAccount(targetUserId, adminId);

      // Audit log
      logger.info({
        action: 'FREEZE_ACCOUNT',
        adminId,
        adminRole,
        targetUserId,
      }, 'Admin froze user account');

      res.json({ message: 'Account frozen successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to freeze account' });
    }
  }
);

export default router;
```

## JWT Payload Structure

The decoded JWT token contains:

```typescript
interface JWTPayload {
  profileId: string;           // User UUID
  email: string | null;        // User email (null for PARTNER_API)
  status: string;              // PENDING_VERIFICATION | VERIFIED | SUSPENDED | etc.
  role: UserRole;              // USER | ADMIN | SUPER_ADMIN | PARTNER_API
  tenantId: string;            // Multi-tenant identifier
  iat?: number;                // Issued at (Unix timestamp)
  exp?: number;                // Expiration (Unix timestamp)
}
```

## HTTP Response Codes

| Status | Scenario |
|--------|----------|
| `401 Unauthorized` | Missing/invalid/expired JWT token |
| `403 Forbidden` | Valid JWT but insufficient role permissions |
| `500 Internal Server Error` | Unexpected authentication error |

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "No authorization header provided"
}
```

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden

```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions to access this resource"
}
```

## Security Best Practices

### 1. Always Use HTTPS in Production

JWT tokens must be transmitted over HTTPS to prevent token theft:

```typescript
// In production config
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

### 2. Set Appropriate Token Expiration

```typescript
import jwt from 'jsonwebtoken';

// Short-lived access tokens (15 minutes)
const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
  expiresIn: '15m',
});

// Long-lived refresh tokens (7 days) - stored securely
const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
  expiresIn: '7d',
});
```

### 3. Rotate JWT Secrets Regularly

Schedule periodic JWT secret rotation (recommended: every 90 days).

### 4. Validate Role on Critical Operations

Even if middleware checks roles, validate again in business logic for sensitive operations:

```typescript
router.delete('/users/:userId', authenticateJWT, requireSuperAdmin, async (req, res) => {
  // Double-check role in business logic for critical operations
  if (req.user!.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Operation requires SUPER_ADMIN' });
  }

  // ... proceed with deletion
});
```

### 5. Audit Log All Admin Actions

```typescript
import { logger } from '@gx/core-logger';

router.post('/admin/action', authenticateJWT, requireAdmin, async (req, res) => {
  // Always log admin actions for audit trail
  logger.info({
    action: 'ADMIN_ACTION',
    adminId: req.user!.profileId,
    adminRole: req.user!.role,
    targetResource: req.params.resourceId,
    timestamp: new Date().toISOString(),
  }, 'Admin performed action');

  // ... business logic
});
```

## Testing

### Unit Test Example

```typescript
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

describe('Admin Authorization', () => {
  const JWT_SECRET = 'test-secret';

  it('should allow ADMIN to access admin endpoint', async () => {
    const token = jwt.sign({
      profileId: 'admin-123',
      email: 'admin@example.com',
      role: 'ADMIN',
      tenantId: 'tenant-1',
      status: 'VERIFIED',
    }, JWT_SECRET);

    const response = await request(app)
      .post('/api/admin/users/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'user-456' });

    expect(response.status).toBe(200);
  });

  it('should deny USER access to admin endpoint', async () => {
    const token = jwt.sign({
      profileId: 'user-123',
      email: 'user@example.com',
      role: 'USER',
      tenantId: 'tenant-1',
      status: 'VERIFIED',
    }, JWT_SECRET);

    const response = await request(app)
      .post('/api/admin/users/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'user-456' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });
});
```

## Migration from Existing Code

If you're migrating from service-specific auth middleware:

### Before (in svc-identity/src/middlewares/auth.middleware.ts):

```typescript
export const authenticateJWT = async (req, res, next) => {
  // ... local implementation
};
```

### After (using @gx/core-http):

```typescript
import { createAuthMiddleware } from '@gx/core-http';

export const authenticateJWT = createAuthMiddleware({
  jwtSecret: identityConfig.jwtSecret,
});
```

## Troubleshooting

### Issue: "Authentication required" despite valid token

**Cause**: Missing `authenticateJWT` middleware before role check

**Solution**: Always apply authentication before authorization

```typescript
// ❌ WRONG - will fail
router.post('/admin/action', requireAdmin, controller.action);

// ✅ CORRECT - authentication first, then authorization
router.post('/admin/action', authenticateJWT, requireAdmin, controller.action);
```

### Issue: "Invalid token payload"

**Cause**: JWT missing required fields (`profileId`, `role`, or `tenantId`)

**Solution**: Ensure JWT is signed with all required fields:

```typescript
const token = jwt.sign({
  profileId: user.profileId,
  email: user.email,
  role: user.role,           // ← Required
  tenantId: user.tenantId,   // ← Required
  status: user.status,
}, JWT_SECRET);
```

## Related Documentation

- [JWT.io](https://jwt.io/) - JWT token debugger
- [Express.js Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
