import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { messagingConfig } from '../config';
import { logger } from '@gx/core-logger';
import { JWTPayload } from '../types/dtos';

/**
 * Socket.io authentication middleware
 *
 * Validates JWT tokens for WebSocket connections.
 * Token can be passed via:
 * - socket.handshake.auth.token
 * - socket.handshake.headers.authorization (Bearer token)
 */
export function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): void {
  try {
    // Extract token from auth object or authorization header
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn({ socketId: socket.id }, 'WebSocket connection without token');
      return next(new Error('Authentication required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, messagingConfig.jwtSecret) as JWTPayload;

    // Validate required fields
    if (!decoded.profileId) {
      logger.warn({ socketId: socket.id }, 'JWT missing profileId');
      return next(new Error('Invalid token: missing profileId'));
    }

    // Attach user data to socket
    socket.data.user = decoded;

    logger.debug(
      { socketId: socket.id, profileId: decoded.profileId },
      'WebSocket authenticated successfully'
    );

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn({ socketId: socket.id }, 'WebSocket token expired');
      return next(new Error('Token expired'));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ socketId: socket.id, error }, 'WebSocket invalid token');
      return next(new Error('Invalid token'));
    }

    logger.error({ socketId: socket.id, error }, 'WebSocket authentication error');
    next(new Error('Authentication failed'));
  }
}
