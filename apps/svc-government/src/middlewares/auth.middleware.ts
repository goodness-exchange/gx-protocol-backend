import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils';
import { governmentConfig } from '../config';
import { GovernmentAuthenticatedRequest, GovernmentJWTPayload } from '../types';
import { administratorService } from '../services';

/**
 * Authenticate JWT token from identity service
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
      const decoded = jwt.verify(token, governmentConfig.jwtSecret) as GovernmentJWTPayload;
      req.user = decoded;
      next();
    } catch {
      throw new AppError('UNAUTHORIZED', 401, 'Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Require user to be a government administrator for a treasury
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
 * Require Super Admin role (platform admin, not government admin)
 */
export const requireSuperAdmin = async (
  req: GovernmentAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // This would typically check against the admin service or a role in the JWT
    // For now, we'll check if there's an adminRole in the token
    // In production, integrate with svc-admin for proper RBAC

    const adminRoles = ['SUPER_OWNER', 'SUPER_ADMIN'];

    // Check if request came from admin service with proper role
    const adminRole = req.headers['x-admin-role'] as string;

    if (!adminRole || !adminRoles.includes(adminRole)) {
      throw new AppError('FORBIDDEN', 403, 'Super Admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
};
