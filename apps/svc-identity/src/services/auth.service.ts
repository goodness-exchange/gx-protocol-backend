import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
   * Register new user
   *
   * Creates new user profile with REGISTERED status.
   * Password is hashed using bcrypt.
   * User must complete KYC and admin approval before becoming active.
   *
   * @param data - User registration data
   * @returns User profile, access token, and refresh token
   * @throws Error if email already exists or validation fails
   */
  async register(data: {
    fname: string;
    lname: string;
    email: string;
    password: string;
    dateOfBirth: string;
    gender: string;
    phone?: string;
    country?: string;
  }): Promise<LoginResponseDTO> {
    const { fname, lname, email, password, dateOfBirth, gender, phone, country } = data;

    logger.info({ email }, 'Attempting user registration');

    // Check if user already exists
    const existingUser = await db.userProfile.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      logger.warn({ email }, 'Registration failed: Email already exists');
      const error: any = new Error('Email already registered');
      error.statusCode = 409;
      throw error;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate placeholder biometric hash (will be updated during KYC)
    // Must be 64-character SHA-256 hex string for blockchain chaincode compatibility
    const biometricPlaceholder = crypto.createHash('sha256').update(`${email}:${Date.now()}`).digest('hex');

    // Parse date of birth
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      const error: any = new Error('Invalid date of birth format. Expected YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }

    // Validate gender
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      const error: any = new Error('Gender must be "male" or "female"');
      error.statusCode = 400;
      throw error;
    }

    // Validate country code if provided
    if (country) {
      const countryExists = await db.country.findUnique({
        where: { countryCode: country.toUpperCase() },
      });

      if (!countryExists) {
        const error: any = new Error(`Invalid country code: ${country}. Country must be initialized in the system first.`);
        error.statusCode = 400;
        throw error;
      }
    }

    // Create user profile with REGISTERED status
    const user = await db.userProfile.create({
      data: {
        tenantId: 'default',
        email: email.toLowerCase(),
        passwordHash,
        biometricHash: biometricPlaceholder,
        firstName: fname,
        lastName: lname,
        dateOfBirth: dob,
        gender: gender.toLowerCase(),
        phoneNum: phone || null,
        nationalityCountryCode: country || null,
        status: 'REGISTERED', // Initial status - requires admin approval
        onchainStatus: 'NOT_REGISTERED',
        isLocked: false,
      },
    });

    logger.info({ profileId: user.profileId, email }, 'User registration successful');

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Convert Prisma model to DTO
    const userDTO: UserProfileDTO = {
      profileId: user.profileId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      identityNum: user.nationalIdNumber,
      status: user.status,
      nationalityCountryCode: user.nationalityCountryCode,
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

    if (user.status === 'SUSPENDED' || user.status === 'CLOSED') {
      logger.warn({ email, profileId: user.profileId }, 'Login failed: User account is inactive');
      throw new Error('Account is inactive. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn({ email, profileId: user.profileId }, 'Login failed: Invalid password');
      throw new Error('Invalid email or password');
    }

    logger.info({ profileId: user.profileId, email }, 'Login successful');

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Convert Prisma model to DTO
    const userDTO: UserProfileDTO = {
      profileId: user.profileId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      identityNum: user.nationalIdNumber,
      status: user.status,
      nationalityCountryCode: user.nationalityCountryCode,
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

      logger.info({ profileId: decoded.profileId }, 'Refreshing access token');

      // Get fresh user data
      const user = await db.userProfile.findUnique({
        where: { profileId: decoded.profileId },
      });

      if (!user || user.status === 'SUSPENDED' || user.status === 'CLOSED') {
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
      profileId: user.profileId,
      email: user.email,
      status: user.status,
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
      profileId: user.profileId,
      email: user.email,
      status: user.status,
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
      logger.info({ profileId: decoded.profileId }, 'User logged out');
      
      // TODO: In production, add refresh token to a revocation list (Redis)
      // await redis.setex(`revoked:${refreshToken}`, ttl, '1');
    } catch (error) {
      // Token already invalid - that's fine
      logger.debug({ error }, 'Logout called with invalid token');
    }
  }
}

export const authService = new AuthService();
