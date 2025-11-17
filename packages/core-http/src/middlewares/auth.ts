/**
 * Authentication and Authorization Middlewares
 *
 * Provides JWT authentication and role-based access control middleware
 * for Express applications.
 */

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest, JWTPayload, UserRole } from '../types/auth';

/**
 * Configuration for authentication middleware
 */
export interface AuthConfig {
  /** JWT secret for token verification */
  jwtSecret: string;
}

/**
 * Create JWT authentication middleware
 *
 * Validates JWT tokens from the Authorization header and attaches
 * the decoded payload to req.user.
 *
 * @param config - Authentication configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createAuthMiddleware } from '@gx/core-http';
 *
 * const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });
 *
 * router.get('/protected', authenticateJWT, controller.method);
 * ```
 */
export function createAuthMiddleware(config: AuthConfig) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No authorization header provided',
        });
        return;
      }

      // Check for "Bearer" prefix
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authorization header format. Expected: Bearer <token>',
        });
        return;
      }

      // Extract token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

      // Validate required fields
      if (!decoded.profileId || !decoded.role || !decoded.tenantId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token payload',
        });
        return;
      }

      // Attach user to request
      req.user = decoded;

      logger.debug(
        { profileId: decoded.profileId, role: decoded.role, email: decoded.email },
        'JWT authentication successful'
      );

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn({ error: error.message }, 'Invalid JWT token');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });
        return;
      }

      if (error instanceof jwt.TokenExpiredError) {
        logger.warn({ error: error.message }, 'JWT token expired');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
        });
        return;
      }

      logger.error({ error }, 'JWT authentication error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
    }
  };
}

/**
 * Create optional JWT authentication middleware
 *
 * Similar to createAuthMiddleware, but allows the request to proceed
 * even if no token is provided. Useful for endpoints that have
 * different behavior for authenticated vs unauthenticated users.
 *
 * @param config - Authentication configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createOptionalAuthMiddleware } from '@gx/core-http';
 *
 * const optionalJWT = createOptionalAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });
 *
 * router.get('/public', optionalJWT, controller.method);
 * ```
 */
export function createOptionalAuthMiddleware(config: AuthConfig) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided - proceed without user
        next();
        return;
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

      // Validate required fields
      if (decoded.profileId && decoded.role && decoded.tenantId) {
        req.user = decoded;
      }

      next();
    } catch (error) {
      // Token invalid - proceed without user (don't fail the request)
      logger.debug({ error }, 'Optional JWT validation failed, proceeding without user');
      next();
    }
  };
}

/**
 * Create role-based authorization middleware
 *
 * Requires JWT authentication to be applied first (using createAuthMiddleware).
 * Checks if the authenticated user has one of the allowed roles.
 *
 * @param allowedRoles - Array of roles that are authorized
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createAuthMiddleware, requireRoles, UserRole } from '@gx/core-http';
 *
 * const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });
 * const requireAdmin = requireRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
 *
 * router.delete('/users/:id', authenticateJWT, requireAdmin, controller.deleteUser);
 * ```
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    // Check if user is authenticated
    if (!req.user) {
      logger.warn('Authorization check failed: No user in request (missing auth middleware?)');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Check if user has required role
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        {
          profileId: req.user.profileId,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
        },
        'Authorization failed: Insufficient permissions'
      );
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to access this resource',
      });
      return;
    }

    logger.debug(
      {
        profileId: req.user.profileId,
        role: req.user.role,
      },
      'Role authorization successful'
    );

    next();
  };
}

/**
 * Convenience middleware: Require ADMIN or SUPER_ADMIN role
 *
 * @example
 * ```typescript
 * import { createAuthMiddleware, requireAdmin } from '@gx/core-http';
 *
 * const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });
 *
 * router.post('/admin/users/verify', authenticateJWT, requireAdmin, controller.verifyUser);
 * ```
 */
export const requireAdmin = requireRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

/**
 * Convenience middleware: Require SUPER_ADMIN role only
 *
 * @example
 * ```typescript
 * import { createAuthMiddleware, requireSuperAdmin } from '@gx/core-http';
 *
 * const authenticateJWT = createAuthMiddleware({ jwtSecret: process.env.JWT_SECRET! });
 *
 * router.post('/admin/system/pause', authenticateJWT, requireSuperAdmin, controller.pauseSystem);
 * ```
 */
export const requireSuperAdmin = requireRoles([UserRole.SUPER_ADMIN]);
