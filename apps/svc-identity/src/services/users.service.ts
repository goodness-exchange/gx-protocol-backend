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
    const { email, password, fullName, phone, dateOfBirth } = data;

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

    // Create outbox command for Fabric chaincode
    const command = await db.outboxCommand.create({
      data: {
        aggregateId: email.toLowerCase(), // Use email as aggregate ID for idempotency
        commandType: 'CreateUser',
        payload: {
          email: email.toLowerCase(),
          passwordHash,
          fullName,
          phone: phone || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        },
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
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
   * @param userId - User ID (UUID)
   * @returns User profile
   */
  async getUserProfile(userId: string): Promise<UserProfileDTO> {
    logger.debug({ userId }, 'Fetching user profile');

    const user = await db.userProfile.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
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
  }

  /**
   * Update user profile
   * 
   * This is a WRITE operation using the CQRS outbox pattern.
   * 
   * @param userId - User ID
   * @param data - Update data
   * @returns Command ID
   */
  async updateProfile(userId: string, data: UpdateProfileRequestDTO): Promise<{ commandId: string }> {
    logger.info({ userId }, 'Updating user profile');

    // Verify user exists
    const user = await db.userProfile.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        aggregateId: userId,
        commandType: 'UpdateUser',
        payload: {
          userId,
          ...data,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        },
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
      },
    });

    logger.info({ commandId: command.id, userId }, 'Profile update command created');

    return {
      commandId: command.id,
    };
  }

  /**
   * Submit KYC verification request
   * 
   * This is a WRITE operation using the CQRS outbox pattern.
   * 
   * @param userId - User ID
   * @param data - KYC submission data
   * @returns Command ID
   */
  async submitKYC(userId: string, data: SubmitKYCRequestDTO): Promise<{ commandId: string }> {
    logger.info({ userId }, 'Submitting KYC verification');

    // Verify user exists
    const user = await db.userProfile.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.kycStatus === 'approved') {
      throw new Error('KYC already approved');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        aggregateId: userId,
        commandType: 'SubmitKYC',
        payload: {
          userId,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          documentFrontImage: data.documentFrontImage,
          documentBackImage: data.documentBackImage,
          selfieImage: data.selfieImage,
          submittedAt: new Date(),
        },
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
      },
    });

    logger.info({ commandId: command.id, userId }, 'KYC submission command created');

    return {
      commandId: command.id,
    };
  }

  /**
   * Get KYC verification status
   * 
   * This is a READ operation - queries the KYCVerification table.
   * 
   * @param userId - User ID
   * @returns KYC status
   */
  async getKYCStatus(userId: string): Promise<KYCStatusDTO | null> {
    logger.debug({ userId }, 'Fetching KYC status');

    const kycRecord = await db.kYCVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });

    if (!kycRecord) {
      return null;
    }

    return {
      id: kycRecord.id,
      userId: kycRecord.userId,
      status: kycRecord.status as 'pending' | 'approved' | 'rejected',
      documentType: kycRecord.documentType,
      documentNumber: kycRecord.documentNumber,
      submittedAt: kycRecord.submittedAt,
      reviewedAt: kycRecord.reviewedAt,
      rejectionReason: kycRecord.rejectionReason,
    };
  }
}

export const usersService = new UsersService();
