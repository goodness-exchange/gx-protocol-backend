/**
 * Authentication and Authorization Types
 *
 * Shared types for JWT authentication and role-based access control
 */

import { Request } from 'express';

/**
 * User roles in the GX Protocol system
 *
 * - USER: Regular user with standard permissions
 * - ADMIN: System administrator with elevated permissions
 * - SUPER_ADMIN: Super administrator with full system control
 * - PARTNER_API: External partner API access (machine-to-machine)
 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  PARTNER_API = 'PARTNER_API',
}

/**
 * JWT Payload structure
 *
 * This payload is embedded in JWT tokens and contains user identity
 * and authorization information.
 */
export interface JWTPayload {
  /** Unique profile ID (UUID) */
  profileId: string;

  /** User email address (nullable for PARTNER_API) */
  email: string | null;

  /** User account status */
  status: string;

  /** User role (determines permissions) */
  role: UserRole;

  /** Tenant ID for multi-tenant isolation */
  tenantId: string;

  /** Issued at timestamp (Unix seconds) */
  iat?: number;

  /** Expiration timestamp (Unix seconds) */
  exp?: number;
}

/**
 * Express Request with authenticated user
 *
 * Extends the base Express Request with a user property populated
 * by the authenticateJWT middleware.
 *
 * @example
 * ```typescript
 * router.get('/profile', authenticateJWT, (req: AuthenticatedRequest, res) => {
 *   const userId = req.user!.profileId;
 *   // ...
 * });
 * ```
 */
export interface AuthenticatedRequest extends Request {
  /** Authenticated user information (populated by authenticateJWT middleware) */
  user?: JWTPayload;
}
