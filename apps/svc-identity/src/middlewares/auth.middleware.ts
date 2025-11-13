import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { identityConfig } from '../config';
import { AuthenticatedRequest, JWTPayload } from '../types/dtos';

/**
 * Authentication Middleware
 * 
 * Validates JWT tokens and attaches user information to the request object.
 * Protects routes that require authentication.
 */

/**
 * JWT Authentication Middleware
 * 
 * Extracts and validates the JWT token from the Authorization header.
 * If valid, attaches the decoded payload to req.user.
 * If invalid or missing, returns 401 Unauthorized.
 * 
 * @example
 * router.get('/protected', authenticateJWT, controller.method);
 */
export const authenticateJWT = async (
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
    const decoded = jwt.verify(token, identityConfig.jwtSecret) as JWTPayload;

    // Attach user to request
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

/**
 * Optional JWT Authentication Middleware
 * 
 * Similar to authenticateJWT, but allows the request to proceed
 * even if no token is provided. Useful for endpoints that have
 * different behavior for authenticated vs unauthenticated users.
 * 
 * @example
 * router.get('/optional', optionalJWT, controller.method);
 */
export const optionalJWT = async (
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
    const decoded = jwt.verify(token, identityConfig.jwtSecret) as JWTPayload;
    req.user = decoded;

    next();
  } catch (error) {
    // Token invalid - proceed without user (don't fail the request)
    logger.debug({ error }, 'Optional JWT validation failed, proceeding without user');
    next();
  }
};
