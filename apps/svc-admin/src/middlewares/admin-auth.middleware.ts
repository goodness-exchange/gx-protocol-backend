import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { adminConfig } from '../config';
import { AdminAuthenticatedRequest, AdminJWTPayload, AdminAuthErrorCode, AdminRole } from '../types/admin-auth.types';
import { adminAuthService } from '../services/admin-auth.service';
import { rbacService } from '../services/rbac.service';

// ============================================================================
// Admin JWT Authentication Middleware
// ============================================================================

/**
 * Authenticate admin JWT token and validate session
 */
export const authenticateAdminJWT = async (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        code: AdminAuthErrorCode.INVALID_CREDENTIALS,
        message: 'No authorization header provided',
      });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        code: AdminAuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid authorization header format. Expected: Bearer <token>',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT
    let decoded: AdminJWTPayload;
    try {
      decoded = jwt.verify(token, adminConfig.jwtSecret) as AdminJWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Unauthorized',
          code: AdminAuthErrorCode.SESSION_EXPIRED,
          message: 'Token expired. Please refresh your token.',
        });
        return;
      }
      res.status(401).json({
        error: 'Unauthorized',
        code: AdminAuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid token',
      });
      return;
    }

    // Validate session is still active
    const sessionValidation = await adminAuthService.validateSession(decoded.sessionId);
    if (!sessionValidation.valid) {
      res.status(401).json({
        error: 'Unauthorized',
        code: AdminAuthErrorCode.SESSION_REVOKED,
        message: sessionValidation.reason || 'Session invalid',
      });
      return;
    }

    // Update session activity (for idle timeout tracking)
    await adminAuthService.updateSessionActivity(decoded.sessionId);

    // Attach admin to request
    req.admin = decoded;
    req.sessionId = decoded.sessionId;

    logger.debug({ adminId: decoded.adminId, sessionId: decoded.sessionId }, 'Admin JWT authentication successful');
    next();
  } catch (error) {
    logger.error({ error }, 'Admin JWT authentication error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

// ============================================================================
// Role-Based Access Control Middlewares
// ============================================================================

/**
 * Require specific admin role or higher
 */
export const requireAdminRole = (minRole: AdminRole) => {
  const roleHierarchy: Record<AdminRole, number> = {
    SUPER_OWNER: 100,
    SUPER_ADMIN: 90,
    ADMIN: 50,
    MODERATOR: 30,
    DEVELOPER: 20,
    AUDITOR: 10,
  };

  return (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    const userRoleLevel = roleHierarchy[req.admin.role] || 0;
    const requiredRoleLevel = roleHierarchy[minRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      logger.warn(
        { adminId: req.admin.adminId, role: req.admin.role, requiredRole: minRole },
        'Admin access denied: insufficient role'
      );
      res.status(403).json({
        error: 'Forbidden',
        message: `This action requires ${minRole} role or higher`,
      });
      return;
    }

    next();
  };
};

/**
 * Require SUPER_OWNER role
 */
export const requireSuperOwner = requireAdminRole('SUPER_OWNER');

/**
 * Require SUPER_ADMIN role or higher
 */
export const requireSuperAdmin = requireAdminRole('SUPER_ADMIN');

/**
 * Require ADMIN role or higher
 */
export const requireAdmin = requireAdminRole('ADMIN');

/**
 * Require MFA to be verified for the session
 */
export const requireMfaVerified = (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.admin) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Not authenticated',
    });
    return;
  }

  if (!req.admin.mfaVerified) {
    res.status(403).json({
      error: 'Forbidden',
      code: AdminAuthErrorCode.MFA_REQUIRED,
      message: 'MFA verification required for this action',
    });
    return;
  }

  next();
};

// ============================================================================
// Permission-Based Access Control Middleware (Enhanced with RBAC Service)
// ============================================================================

/**
 * Require specific permission (uses RBAC service for comprehensive checking)
 * Supports:
 * - Wildcard permissions (e.g., user:* matches user:view:all)
 * - MFA requirement checking
 * - Approval requirement indication
 */
export const requirePermission = (permissionCode: string) => {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    try {
      const result = await rbacService.checkPermission(
        {
          adminId: req.admin.adminId,
          role: req.admin.role,
          customPermissions: [],
          mfaVerified: req.admin.mfaVerified,
        },
        permissionCode
      );

      if (!result.allowed) {
        logger.warn(
          { adminId: req.admin.adminId, permission: permissionCode, reason: result.reason },
          'Admin access denied'
        );

        // Check if MFA is required
        if (result.requiresMfa && !req.admin.mfaVerified) {
          res.status(403).json({
            error: 'Forbidden',
            code: AdminAuthErrorCode.MFA_REQUIRED,
            message: 'MFA verification required for this action',
            requiresMfa: true,
          });
          return;
        }

        res.status(403).json({
          error: 'Forbidden',
          message: result.reason || `Missing required permission: ${permissionCode}`,
          requiresApproval: result.requiresApproval,
        });
        return;
      }

      // Attach permission info to request for downstream use
      (req as any).permissionInfo = {
        code: permissionCode,
        requiresMfa: result.requiresMfa,
        requiresApproval: result.requiresApproval,
      };

      next();
    } catch (error) {
      logger.error({ error }, 'Permission check error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission check failed',
      });
    }
  };
};

/**
 * Require any of the specified permissions
 */
export const requireAnyPermission = (...permissionCodes: string[]) => {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    try {
      const result = await rbacService.checkAnyPermission(
        {
          adminId: req.admin.adminId,
          role: req.admin.role,
          customPermissions: [],
          mfaVerified: req.admin.mfaVerified,
        },
        permissionCodes
      );

      if (!result.allowed) {
        logger.warn(
          { adminId: req.admin.adminId, permissions: permissionCodes },
          'Admin access denied: missing all required permissions'
        );
        res.status(403).json({
          error: 'Forbidden',
          message: `Missing required permissions: ${permissionCodes.join(' OR ')}`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Permission check error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission check failed',
      });
    }
  };
};

/**
 * Require all specified permissions
 */
export const requireAllPermissions = (...permissionCodes: string[]) => {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    try {
      const result = await rbacService.checkAllPermissions(
        {
          adminId: req.admin.adminId,
          role: req.admin.role,
          customPermissions: [],
          mfaVerified: req.admin.mfaVerified,
        },
        permissionCodes
      );

      if (!result.allowed) {
        logger.warn(
          { adminId: req.admin.adminId, permissions: permissionCodes, reason: result.reason },
          'Admin access denied: missing required permission'
        );
        res.status(403).json({
          error: 'Forbidden',
          message: result.reason || `Missing required permissions: ${permissionCodes.join(' AND ')}`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Permission check error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission check failed',
      });
    }
  };
};

/**
 * Check if action requires approval and attach to request
 * Use this for actions that may need workflow approval
 */
export const checkApprovalRequired = (permissionCode: string) => {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    try {
      const permission = await rbacService.getPermissionByCode(permissionCode);

      if (permission?.requiresApproval) {
        (req as any).approvalRequired = {
          permissionCode,
          riskLevel: permission.riskLevel,
        };
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Approval check error');
      next(); // Continue anyway, approval is optional check
    }
  };
};
