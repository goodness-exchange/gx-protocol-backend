import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { loanPoolConfig } from '../config';
import { AuthenticatedRequest, JWTPayload } from '../types/dtos';

/**
 * Authentication Middleware
 *
 * Validates JWT tokens and attaches user information to the request object.
 * Protects routes that require authentication.
 */

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided',
      });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Expected: Bearer <token>',
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, loanPoolConfig.jwtSecret) as JWTPayload;

    req.user = decoded;

    logger.debug({ profileId: decoded.profileId, email: decoded.email }, 'JWT authentication successful');

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

export const optionalJWT = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, loanPoolConfig.jwtSecret) as JWTPayload;
    req.user = decoded;

    next();
  } catch (error) {
    logger.debug({ error }, 'Optional JWT validation failed, proceeding without user');
    next();
  }
};
