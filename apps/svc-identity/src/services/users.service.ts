import bcrypt from 'bcryptjs';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type { 
  RegisterUserRequestDTO, 
  UserProfileDTO, 
  UpdateProfileRequestDTO,
  SubmitKYCRequestDTO,
  KYCStatusDTO 
} from '../types/dtos';

/**
 * Users Service
 * 
 * Handles user-related business logic including:
 * - User registration (CQRS write via outbox)
 * - Profile management (CQRS write via outbox)
 * - KYC submission (CQRS write via outbox)
 * - Profile queries (read from UserProfile table)
 * 
 * ARCHITECTURE NOTE:
 * - Write operations → OutboxCommand table
 * - Read operations → UserProfile table (projected from Fabric events)
 */

class UsersService {
  /**
   * Register a new user
   * 
   * This is a WRITE operation using the CQRS outbox pattern:
   * 1. Hash password
   * 2. Create OutboxCommand for "CreateUser"
   * 3. Outbox-submitter will pick it up and submit to Fabric
   * 4. Fabric emits UserCreated event
   * 5. Projector updates UserProfile table
   * 
   * @param data - User registration data
   * @returns Temporary acknowledgment (command ID)
   */
  async registerUser(data: RegisterUserRequestDTO): Promise<{ commandId: string; message: string }> {
    const { email, password, firstName, lastName, phoneNum, identityNum, nationalityCountryCode } = data;

    logger.info({ email }, 'Registering new user');

    // Check if user already exists
    const existingUser = await db.userProfile.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a simple biometric hash placeholder (in production, this would be actual biometric data)
    const biometricHash = await bcrypt.hash(`${email}:${Date.now()}`, 10);

    // Create outbox command for Fabric chaincode
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default', // TODO: Get from context
        service: 'svc-identity',
        requestId: email.toLowerCase(), // Use email as request ID for idempotency
        commandType: 'CREATE_USER',
        payload: {
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          phoneNum: phoneNum || null,
          identityNum: identityNum || null,
          nationalityCountryCode: nationalityCountryCode || null,
          biometricHash,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, email }, 'User registration command created');

    return {
      commandId: command.id,
      message: 'User registration initiated. Check status with command ID.',
    };
  }

  /**
   * Get user profile by ID
   * 
   * This is a READ operation - queries the projected UserProfile table.
   * 
   * @param profileId - User Profile ID (UUID)
   * @returns User profile
   */
  async getUserProfile(profileId: string): Promise<UserProfileDTO> {
    logger.debug({ profileId }, 'Fetching user profile');

    const user = await db.userProfile.findUnique({
      where: { profileId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      profileId: user.profileId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      identityNum: user.identityNum,
      status: user.status,
      nationalityCountryCode: user.nationalityCountryCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update user profile
   * 
   * This is a WRITE operation using the CQRS outbox pattern.
   * 
   * @param profileId - User Profile ID
   * @param data - Update data
   * @returns Command ID
   */
  async updateProfile(profileId: string, data: UpdateProfileRequestDTO): Promise<{ commandId: string }> {
    logger.info({ profileId }, 'Updating user profile');

    // Verify user exists
    const user = await db.userProfile.findUnique({
      where: { profileId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: user.tenantId,
        service: 'svc-identity',
        requestId: `update-${profileId}-${Date.now()}`,
        commandType: 'CREATE_USER', // TODO: Add UPDATE_USER to enum
        payload: {
          profileId,
          ...data,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, profileId }, 'Profile update command created');

    return {
      commandId: command.id,
    };
  }

  /**
   * Submit KYC verification request
   * 
   * This is a WRITE operation using the CQRS outbox pattern.
   * 
   * @param profileId - User Profile ID
   * @param data - KYC submission data
   * @returns Command ID
   */
  async submitKYC(profileId: string, data: SubmitKYCRequestDTO): Promise<{ commandId: string }> {
    logger.info({ profileId }, 'Submitting KYC verification');

    // Verify user exists
    const user = await db.userProfile.findUnique({
      where: { profileId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if KYC already approved
    const existingKYC = await db.kYCVerification.findFirst({
      where: { profileId, status: 'APPROVED' },
    });

    if (existingKYC) {
      throw new Error('KYC already approved');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: user.tenantId,
        service: 'svc-identity',
        requestId: `kyc-${profileId}-${Date.now()}`,
        commandType: 'CREATE_USER', // TODO: Add SUBMIT_KYC to enum
        payload: {
          profileId,
          evidenceHash: data.evidenceHash,
          evidenceSize: data.evidenceSize,
          evidenceMime: data.evidenceMime,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, profileId }, 'KYC submission command created');

    return {
      commandId: command.id,
    };
  }

  /**
   * Get KYC verification status
   * 
   * This is a READ operation - queries the KYCVerification table.
   * 
   * @param profileId - User Profile ID
   * @returns KYC status
   */
  async getKYCStatus(profileId: string): Promise<KYCStatusDTO | null> {
    logger.debug({ profileId }, 'Fetching KYC status');

    const kycRecord = await db.kYCVerification.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
    });

    if (!kycRecord) {
      return null;
    }

    return {
      kycId: kycRecord.kycId,
      profileId: kycRecord.profileId,
      status: kycRecord.status,
      evidenceHash: kycRecord.evidenceHash,
      evidenceSize: kycRecord.evidenceSize,
      evidenceMime: kycRecord.evidenceMime,
      verifiedAt: kycRecord.verifiedAt,
      verifierDetails: kycRecord.verifierDetails,
      createdAt: kycRecord.createdAt,
      updatedAt: kycRecord.updatedAt,
    };
  }
}

export const usersService = new UsersService();
