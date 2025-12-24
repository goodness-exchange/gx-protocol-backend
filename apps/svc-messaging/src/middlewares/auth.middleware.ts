import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { messagingConfig } from '../config';
import { logger } from '@gx/core-logger';
import { JWTPayload } from '../types/dtos';

/**
 * Extended Express Request with user data
 */
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

/**
 * JWT authentication middleware for REST endpoints
 */
export async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, messagingConfig.jwtSecret) as JWTPayload;

    if (!decoded.profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token: missing profileId',
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
      return;
    }

    logger.error({ error }, 'Authentication error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Admin-only middleware (checks for SUPER_OWNER role)
 * Used for compliance endpoints
 */
export async function requireSuperOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // This would check admin session - simplified for now
  // In production, this should verify against admin service
  const adminRole = req.headers['x-admin-role'];

  if (adminRole !== 'SUPER_OWNER') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'SUPER_OWNER role required',
    });
    return;
  }

  next();
}
