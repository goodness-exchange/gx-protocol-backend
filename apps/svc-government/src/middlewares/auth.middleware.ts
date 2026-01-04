import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils';
import { governmentConfig } from '../config';
import {
  GovernmentAuthenticatedRequest,
  AdminJWTPayload,
  IdentityJWTPayload,
  SUPER_ADMIN_ROLES,
} from '../types';
import { administratorService } from '../services';

/**
 * All permissions granted to super admins
 */
const ALL_PERMISSIONS = [
  'canCreateStructure',
  'canAllocateFunds',
  'canAssignAdministrators',
  'canConfigureRules',
  'canDisburseFunds',
  'canViewReports',
  'canManageAPIKeys',
];

/**
 * Check if the decoded token is an admin token (from svc-admin)
 */
function isAdminToken(decoded: unknown): decoded is AdminJWTPayload {
  return (
    typeof decoded === 'object' &&
    decoded !== null &&
    'adminId' in decoded &&
    'role' in decoded &&
    typeof (decoded as AdminJWTPayload).adminId === 'string'
  );
}

/**
 * Check if the decoded token is a user token (from svc-identity)
 */
function isUserToken(decoded: unknown): decoded is IdentityJWTPayload {
  return (
    typeof decoded === 'object' &&
    decoded !== null &&
    'profileId' in decoded &&
    typeof (decoded as IdentityJWTPayload).profileId === 'string'
  );
}

/**
 * Authenticate JWT token from either identity service or admin service
 * Supports both user tokens (profileId) and admin tokens (adminId)
 */
export const authenticateJWT = async (
  req: GovernmentAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 401, 'No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, governmentConfig.jwtSecret);

      // Handle admin tokens (from svc-admin)
      if (isAdminToken(decoded)) {
        const adminPayload = decoded as AdminJWTPayload;

        // Check if admin has super admin role
        const isSuperAdmin = SUPER_ADMIN_ROLES.includes(adminPayload.role as typeof SUPER_ADMIN_ROLES[number]);

        req.user = {
          adminId: adminPayload.adminId,
          username: adminPayload.username,
          email: adminPayload.email,
          role: adminPayload.role,
          sessionId: adminPayload.sessionId,
          mfaVerified: adminPayload.mfaVerified,
          // Super admins get all permissions
          permissions: isSuperAdmin ? ALL_PERMISSIONS : [],
          isAdminToken: true,
          iat: adminPayload.iat,
          exp: adminPayload.exp,
        };

        next();
        return;
      }

      // Handle user tokens (from svc-identity)
      if (isUserToken(decoded)) {
        const userPayload = decoded as IdentityJWTPayload;

        req.user = {
          profileId: userPayload.profileId,
          email: userPayload.email,
          permissions: [],
          isAdminToken: false,
          iat: userPayload.iat,
          exp: userPayload.exp,
        };

        next();
        return;
      }

      // Unknown token format
      throw new AppError('UNAUTHORIZED', 401, 'Invalid token format');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('UNAUTHORIZED', 401, 'Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Require user to be a government administrator for a treasury
 * Super admins (SUPER_OWNER, SUPER_ADMIN) bypass this check
 */
export const requireTreasuryAdmin = (options?: { permission?: string }) => {
  return async (
    req: GovernmentAuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('UNAUTHORIZED', 401, 'Not authenticated');
      }

      const treasuryId = req.params.treasuryId;

      if (!treasuryId) {
        throw new AppError('VALIDATION_ERROR', 400, 'Treasury ID required');
      }

      // Super admins bypass treasury admin checks
      if (req.user.isAdminToken && req.user.role && SUPER_ADMIN_ROLES.includes(req.user.role as typeof SUPER_ADMIN_ROLES[number])) {
        req.user.treasuryId = treasuryId;
        // Super admins already have all permissions from authenticateJWT
        next();
        return;
      }

      // For user tokens, check if they are a government administrator
      if (!req.user.profileId) {
        throw new AppError('FORBIDDEN', 403, 'Admin token without super admin role cannot access treasury');
      }

      // Check if user is an administrator for this treasury
      const assignments = await administratorService.getAdministratorsForProfile(req.user.profileId);
      const treasuryAssignment = assignments.find((a) => a.treasuryId === treasuryId);

      if (!treasuryAssignment) {
        throw new AppError('FORBIDDEN', 403, 'Not an administrator for this treasury');
      }

      // Check specific permission if required
      if (options?.permission) {
        const permissions = await administratorService.getPermissions(
          req.user.profileId,
          treasuryId,
          req.params.accountId
        );

        const hasPermission = (permissions as unknown as Record<string, boolean>)[options.permission];
        if (!hasPermission) {
          throw new AppError('FORBIDDEN', 403, `Missing permission: ${options.permission}`);
        }
      }

      // Attach treasury context to request
      req.user.treasuryId = treasuryId;
      req.user.permissions = Object.entries(treasuryAssignment.permissions)
        .filter(([, v]) => v)
        .map(([k]) => k);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require user to be a government administrator for an account
 * Checks both account-level and treasury-level permissions
 * Super admins (SUPER_OWNER, SUPER_ADMIN) bypass this check
 */
export const requireAccountAdmin = (options?: { permission?: string }) => {
  return async (
    req: GovernmentAuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('UNAUTHORIZED', 401, 'Not authenticated');
      }

      const accountId = req.params.accountId;

      if (!accountId) {
        throw new AppError('VALIDATION_ERROR', 400, 'Account ID required');
      }

      // Get account to find its treasury
      const account = await import('@gx/core-db').then((m) =>
        m.db.governmentHierarchyAccount.findUnique({
          where: { accountId },
          select: { accountId: true, treasuryId: true, accountName: true },
        })
      );

      if (!account) {
        throw new AppError('ACCOUNT_NOT_FOUND', 404, 'Account not found');
      }

      // Super admins bypass account admin checks
      if (req.user.isAdminToken && req.user.role && SUPER_ADMIN_ROLES.includes(req.user.role as typeof SUPER_ADMIN_ROLES[number])) {
        req.user.treasuryId = account.treasuryId;
        req.user.accountId = accountId;
        // Super admins already have all permissions from authenticateJWT
        next();
        return;
      }

      // For user tokens, check if they are a government administrator
      if (!req.user.profileId) {
        throw new AppError('FORBIDDEN', 403, 'Admin token without super admin role cannot access account');
      }

      // Check if user is an administrator for this account's treasury
      const assignments = await administratorService.getAdministratorsForProfile(req.user.profileId);

      // Find assignment for this treasury (account-level or treasury-level)
      const treasuryAssignment = assignments.find(
        (a) => a.treasuryId === account.treasuryId && (a.accountId === accountId || !a.accountId)
      );

      if (!treasuryAssignment) {
        throw new AppError('FORBIDDEN', 403, 'Not an administrator for this account');
      }

      // Check specific permission if required
      if (options?.permission) {
        const permissions = await administratorService.getPermissions(
          req.user.profileId,
          account.treasuryId,
          accountId
        );

        const hasPermission = (permissions as unknown as Record<string, boolean>)[options.permission];
        if (!hasPermission) {
          throw new AppError('FORBIDDEN', 403, `Missing permission: ${options.permission}`);
        }
      }

      // Attach context to request
      req.user.treasuryId = account.treasuryId;
      req.user.accountId = accountId;
      req.user.permissions = Object.entries(treasuryAssignment.permissions)
        .filter(([, v]) => v)
        .map(([k]) => k);

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require Super Admin role (platform admin, not government admin)
 * Checks the JWT token's role field directly
 */
export const requireSuperAdmin = async (
  req: GovernmentAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 401, 'Not authenticated');
    }

    // Check if the token is an admin token with super admin role
    if (req.user.isAdminToken && req.user.role && SUPER_ADMIN_ROLES.includes(req.user.role as typeof SUPER_ADMIN_ROLES[number])) {
      next();
      return;
    }

    // Also support the legacy x-admin-role header for backward compatibility
    const adminRole = req.headers['x-admin-role'] as string;
    if (adminRole && SUPER_ADMIN_ROLES.includes(adminRole as typeof SUPER_ADMIN_ROLES[number])) {
      next();
      return;
    }

    throw new AppError('FORBIDDEN', 403, 'Super Admin access required');
  } catch (error) {
    next(error);
  }
};
