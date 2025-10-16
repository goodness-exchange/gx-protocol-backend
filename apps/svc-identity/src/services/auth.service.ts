import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { identityConfig } from '../config';
import type { LoginRequestDTO, LoginResponseDTO, JWTPayload, UserProfileDTO } from '../types/dtos';

/**
 * Authentication Service
 * 
 * Handles user authentication logic including:
 * - Login validation
 * - JWT token generation
 * - Password verification
 * - Token refresh
 */

class AuthService {
  /**
   * Authenticate user with email and password
   * 
   * This is a READ operation - queries the UserProfile table (read model).
   * Password is hashed using bcrypt.
   * 
   * @param credentials - User login credentials
   * @returns Access token, refresh token, and user profile
   * @throws Error if credentials are invalid
   */
  async login(credentials: LoginRequestDTO): Promise<LoginResponseDTO> {
    const { email, password } = credentials;

    logger.info({ email }, 'Attempting user login');

    // Find user by email in read model
    const user = await db.userProfile.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      logger.warn({ email }, 'Login failed: User not found');
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      logger.warn({ email, userId: user.id }, 'Login failed: User account is inactive');
      throw new Error('Account is inactive. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn({ email, userId: user.id }, 'Login failed: Invalid password');
      throw new Error('Invalid email or password');
    }

    logger.info({ userId: user.id, email }, 'Login successful');

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Convert Prisma model to DTO
    const userDTO: UserProfileDTO = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      kycStatus: user.kycStatus as 'not_started' | 'pending' | 'approved' | 'rejected',
      trustScore: user.trustScore,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return {
      accessToken,
      refreshToken,
      user: userDTO,
    };
  }

  /**
   * Refresh access token using refresh token
   * 
   * @param refreshToken - Valid refresh token
   * @returns New access token
   * @throws Error if refresh token is invalid
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, identityConfig.jwtSecret) as JWTPayload;

      logger.info({ userId: decoded.userId }, 'Refreshing access token');

      // Get fresh user data
      const user = await db.userProfile.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new access token with fresh data
      return this.generateAccessToken(user);
    } catch (error) {
      logger.warn({ error }, 'Refresh token validation failed');
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Generate JWT access token
   * 
   * Access tokens are short-lived (default: 24h)
   * and used for API authentication.
   * 
   * @param user - User profile
   * @returns JWT access token
   */
  private generateAccessToken(user: any): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };

    const options: any = {
      expiresIn: identityConfig.jwtExpiresIn,
      issuer: 'gx-identity-service',
      audience: 'gx-api',
    };

    return jwt.sign(payload, identityConfig.jwtSecret, options);
  }

  /**
   * Generate JWT refresh token
   * 
   * Refresh tokens are long-lived (default: 7d)
   * and used to obtain new access tokens.
   * 
   * @param user - User profile
   * @returns JWT refresh token
   */
  private generateRefreshToken(user: any): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      kycStatus: user.kycStatus,
    };

    const options: any = {
      expiresIn: identityConfig.jwtRefreshExpiresIn,
      issuer: 'gx-identity-service',
      audience: 'gx-api-refresh',
    };

    return jwt.sign(payload, identityConfig.jwtSecret, options);
  }

  /**
   * Logout user (invalidate refresh token)
   * 
   * In a production system, you'd store refresh tokens in a database
   * or Redis and mark them as revoked. For now, we just return success.
   * 
   * @param refreshToken - Token to invalidate
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = jwt.verify(refreshToken, identityConfig.jwtSecret) as JWTPayload;
      logger.info({ userId: decoded.userId }, 'User logged out');
      
      // TODO: In production, add refresh token to a revocation list (Redis)
      // await redis.setex(`revoked:${refreshToken}`, ttl, '1');
    } catch (error) {
      // Token already invalid - that's fine
      logger.debug({ error }, 'Logout called with invalid token');
    }
  }
}

export const authService = new AuthService();
