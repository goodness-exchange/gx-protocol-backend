import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { taxConfig } from '../config';
import { AuthenticatedRequest, JWTPayload } from '../types/dtos';

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized', message: 'No authorization header provided' });
      return;
    }
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid authorization header format. Expected: Bearer <token>' });
      return;
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, taxConfig.jwtSecret) as JWTPayload;
    req.user = decoded;
    logger.debug({ profileId: decoded.profileId }, 'JWT authentication successful');
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
      return;
    }
    logger.error({ error }, 'JWT authentication error');
    res.status(500).json({ error: 'Internal Server Error', message: 'Authentication failed' });
  }
};
