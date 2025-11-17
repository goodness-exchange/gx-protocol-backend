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
   * This is a direct WRITE operation to the read model.
   *
   * Profile metadata (names, phone, etc.) is stored OFF-CHAIN in PostgreSQL.
   * Only the on-chain identity (CreateUser in Fabric) establishes blockchain presence.
   * Profile updates don't require blockchain consensus.
   *
   * @param profileId - User Profile ID
   * @param data - Update data
   * @returns Updated profile
   */
  async updateProfile(profileId: string, data: UpdateProfileRequestDTO): Promise<{ profile: UserProfileDTO }> {
    logger.info({ profileId, fields: Object.keys(data) }, 'Updating user profile');

    // Verify user exists
    const existingUser = await db.userProfile.findUnique({
      where: { profileId },
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phoneNum !== undefined) updateData.phoneNum = data.phoneNum;
    if (data.identityNum !== undefined) updateData.identityNum = data.identityNum;

    // Update user profile directly
    const updatedUser = await db.userProfile.update({
      where: { profileId },
      data: updateData,
    });

    logger.info({ profileId }, 'User profile updated successfully');

    return {
      profile: {
        profileId: updatedUser.profileId,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phoneNum: updatedUser.phoneNum,
        identityNum: updatedUser.identityNum,
        status: updatedUser.status,
        nationalityCountryCode: updatedUser.nationalityCountryCode,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    };
  }

  /**
   * Submit KYC verification request
   *
   * This is a direct WRITE operation to create a KYC verification record.
   *
   * KYC verification is an OFF-CHAIN administrative process. The KYC document
   * review and approval happens in the backend, not on the blockchain.
   * Only the final approval status may optionally sync to Fabric for compliance.
   *
   * @param profileId - User Profile ID
   * @param data - KYC submission data
   * @returns KYC verification record
   */
  async submitKYC(profileId: string, data: SubmitKYCRequestDTO): Promise<{ kycRecord: KYCStatusDTO }> {
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

    // Create KYC verification record
    const kycRecord = await db.kYCVerification.create({
      data: {
        profileId,
        status: 'PENDING',
        evidenceHash: data.evidenceHash,
        evidenceSize: data.evidenceSize,
        evidenceMime: data.evidenceMime,
      },
    });

    logger.info({ kycId: kycRecord.kycId, profileId }, 'KYC verification record created');

    return {
      kycRecord: {
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
      },
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
