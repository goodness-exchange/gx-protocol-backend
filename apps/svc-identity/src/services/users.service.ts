import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '@gx/core-logger';
import { db, PrismaClient } from '@gx/core-db';
import type {
  RegisterUserRequestDTO,
  UserProfileDTO,
  UpdateProfileRequestDTO,
  SubmitKYCRequestDTO,
  KYCStatusDTO,
  KYCDocumentDTO
} from '../types/dtos';

// Prisma transaction client type - omits interactive transaction methods
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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
   * This is a direct WRITE operation to create a local user profile:
   * 1. Hash password
   * 2. Create UserProfile in database
   * 3. User can then complete KYC
   * 4. Admin approves KYC and triggers on-chain registration via svc-admin
   *
   * NOTE: Blockchain registration happens AFTER KYC approval via svc-admin.batchRegisterOnchain()
   * This separation ensures only verified users get on-chain identities.
   *
   * @param data - User registration data
   * @returns Created user profile
   */
  async registerUser(data: RegisterUserRequestDTO): Promise<{ profileId: string; message: string }> {
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

    // Generate a SHA-256 biometric hash placeholder (in production, this would be actual biometric data)
    // Must be 64-character hex string for blockchain chaincode compatibility
    const biometricHash = crypto.createHash('sha256').update(`${email}:${Date.now()}`).digest('hex');

    // Create local user profile (off-chain)
    // Blockchain registration happens after KYC approval via svc-admin.batchRegisterOnchain()
    const userProfile = await db.userProfile.create({
      data: {
        tenantId: 'default', // TODO: Get from context
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phoneNum: phoneNum || null,
        nationalIdNumber: identityNum || null,
        nationalityCountryCode: nationalityCountryCode || null,
        biometricHash,
        status: 'PENDING_KYC', // User needs to complete KYC before on-chain registration
      },
    });

    logger.info({ profileId: userProfile.profileId, email }, 'User profile created');

    return {
      profileId: userProfile.profileId,
      message: 'User registration successful. Please complete KYC verification.',
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
      include: {
        addresses: {
          where: { isCurrent: true },
          take: 1,
        },
        nationalityCountry: {
          select: { countryName: true },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentAddress = user.addresses[0] || null;

    return {
      profileId: user.profileId,
      email: user.email,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      identityNum: user.nationalIdNumber,
      status: user.status,
      nationalityCountryCode: user.nationalityCountryCode,
      nationalityCountryName: user.nationalityCountry?.countryName || null,
      // Additional fields for KYC pre-fill
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      placeOfBirth: user.placeOfBirth,
      // National ID fields (KYR)
      nationalIdNumber: user.nationalIdNumber,
      nationalIdIssuedAt: user.nationalIdIssuedAt,
      nationalIdExpiresAt: user.nationalIdExpiresAt,
      // Passport fields (KYR)
      passportNumber: user.passportNumber,
      passportIssuingCountry: user.passportIssuingCountry,
      passportIssuedAt: user.passportIssuedAt,
      passportExpiresAt: user.passportExpiresAt,
      // Employment fields (KYR)
      employmentStatus: user.employmentStatus,
      jobTitle: user.jobTitle,
      companyName: user.companyName,
      industry: user.industry,
      workEmail: user.workEmail,
      workPhoneNum: user.workPhoneNum,
      // Compliance flags
      isPEP: user.isPEP,
      pepDetails: user.pepDetails,
      // Address (current)
      address: currentAddress ? {
        addressLine1: currentAddress.addressLine1,
        addressLine2: currentAddress.addressLine2,
        city: currentAddress.city,
        stateProvince: currentAddress.stateProvince,
        postalCode: currentAddress.postalCode,
        countryCode: currentAddress.countryCode,
        isVerified: currentAddress.isVerified,
        verifiedAt: currentAddress.verifiedAt,
      } : null,
      // Account status
      isLocked: user.isLocked,
      lockReason: user.lockReason,
      lockedAt: user.lockedAt,
      // Admin review tracking
      reviewedBy: user.reviewedBy,
      reviewedAt: user.reviewedAt,
      denialReason: user.denialReason,
      // Blockchain identity
      fabricUserId: user.fabricUserId,
      onchainStatus: user.onchainStatus,
      onchainRegisteredAt: user.onchainRegisteredAt,
      // Timestamps
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

    // Basic identity fields
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = data.middleName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phoneNum !== undefined) updateData.phoneNum = data.phoneNum;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.gender !== undefined) updateData.gender = data.gender?.toLowerCase();
    if (data.placeOfBirth !== undefined) updateData.placeOfBirth = data.placeOfBirth;
    if (data.nationalityCountryCode !== undefined) updateData.nationalityCountryCode = data.nationalityCountryCode;

    // National ID fields (KYR)
    if (data.nationalIdNumber !== undefined) updateData.nationalIdNumber = data.nationalIdNumber;
    if (data.nationalIdIssuedAt !== undefined) updateData.nationalIdIssuedAt = data.nationalIdIssuedAt ? new Date(data.nationalIdIssuedAt) : null;
    if (data.nationalIdExpiresAt !== undefined) updateData.nationalIdExpiresAt = data.nationalIdExpiresAt ? new Date(data.nationalIdExpiresAt) : null;

    // Passport fields (KYR - optional)
    if (data.passportNumber !== undefined) updateData.passportNumber = data.passportNumber;
    if (data.passportIssuingCountry !== undefined) updateData.passportIssuingCountry = data.passportIssuingCountry;
    if (data.passportIssuedAt !== undefined) updateData.passportIssuedAt = data.passportIssuedAt ? new Date(data.passportIssuedAt) : null;
    if (data.passportExpiresAt !== undefined) updateData.passportExpiresAt = data.passportExpiresAt ? new Date(data.passportExpiresAt) : null;

    // Employment fields (KYR)
    if (data.employmentStatus !== undefined) updateData.employmentStatus = data.employmentStatus;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    if (data.industry !== undefined) updateData.industry = data.industry;
    if (data.workEmail !== undefined) updateData.workEmail = data.workEmail;
    if (data.workPhoneNum !== undefined) updateData.workPhoneNum = data.workPhoneNum;

    // PEP fields (KYR)
    if (data.isPEP !== undefined) updateData.isPEP = data.isPEP;
    if (data.pepDetails !== undefined) updateData.pepDetails = data.pepDetails;

    // Legacy field
    if (data.identityNum !== undefined) updateData.nationalIdNumber = data.identityNum;

    // Handle address separately (create/update Address record)
    let addressRecord = null;
    if (data.addressLine1 && data.city && data.addressCountry) {
      // Check for existing current address
      const existingAddress = await db.address.findFirst({
        where: { profileId, isCurrent: true },
      });

      if (existingAddress) {
        // Update existing address
        addressRecord = await db.address.update({
          where: { addressId: existingAddress.addressId },
          data: {
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2 || null,
            city: data.city,
            stateProvince: data.stateProvince || null,
            postalCode: data.postalCode || null,
            countryCode: data.addressCountry,
          },
        });
      } else {
        // Create new address
        addressRecord = await db.address.create({
          data: {
            profileId,
            addressType: 'CURRENT',
            isCurrent: true,
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2 || null,
            city: data.city,
            stateProvince: data.stateProvince || null,
            postalCode: data.postalCode || null,
            countryCode: data.addressCountry,
          },
        });
      }
      logger.info({ profileId, addressId: addressRecord.addressId }, 'Address record created/updated');
    }

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
        identityNum: updatedUser.nationalIdNumber,
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
    logger.info({ profileId, documentCount: data.documents?.length || 0 }, 'Submitting KYC verification');

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

    // Create KYC verification record, documents, and update user status in a transaction
    const kycRecord = await db.$transaction(async (tx: TransactionClient) => {
      // Create KYC verification record
      const kyc = await tx.kYCVerification.create({
        data: {
          profileId,
          status: 'PENDING',
          evidenceHash: data.evidenceHash,
          evidenceSize: data.evidenceSize,
          evidenceMime: data.evidenceMime,
        },
      });

      // Create KYCDocument records if documents are provided
      if (data.documents && data.documents.length > 0) {
        const documentRecords = data.documents.map((doc: KYCDocumentDTO) => ({
          tenantId: user.tenantId,
          kycId: kyc.kycId,
          documentType: doc.type as any,
          documentNumber: doc.documentNumber || data.documentNumber || null,
          issuingCountry: doc.issuingCountry || data.issuingCountry || null,
          issuedDate: doc.issuedDate ? new Date(doc.issuedDate) : (data.issuedDate ? new Date(data.issuedDate) : null),
          expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : (data.expiryDate ? new Date(data.expiryDate) : null),
          storageUrl: `pending://${doc.fileName}`,
          fileHash: doc.hash,
          fileSize: doc.size,
          mimeType: doc.mimeType,
        }));

        await tx.kYCDocument.createMany({
          data: documentRecords,
        });

        logger.info({ kycId: kyc.kycId, documentCount: documentRecords.length }, 'KYC documents created');
      }

      // Update user status to PENDING_ADMIN_APPROVAL
      await tx.userProfile.update({
        where: { profileId },
        data: { status: 'PENDING_ADMIN_APPROVAL' },
      });

      return kyc;
    });

    logger.info({ kycId: kycRecord.kycId, profileId }, 'KYC verification record created, user status updated to PENDING_ADMIN_APPROVAL');

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

  /**
   * Check if a National ID number is already registered
   *
   * This ensures no duplicate National IDs within the same country.
   * Used for real-time validation during KYR submission.
   *
   * @param nationalIdNumber - The National ID number to check
   * @param countryCode - The country code (2-letter ISO)
   * @param excludeProfileId - Optional profile ID to exclude (for updates)
   * @returns Object with isAvailable boolean and optional existingProfileId
   */
  async checkNationalIdAvailability(
    nationalIdNumber: string,
    countryCode: string,
    excludeProfileId?: string
  ): Promise<{ isAvailable: boolean; message: string }> {
    logger.debug({ nationalIdNumber: nationalIdNumber.substring(0, 4) + '***', countryCode }, 'Checking National ID availability');

    const existingUser = await db.userProfile.findFirst({
      where: {
        nationalIdNumber: nationalIdNumber,
        nationalityCountryCode: countryCode,
        ...(excludeProfileId ? { NOT: { profileId: excludeProfileId } } : {}),
      },
      select: { profileId: true },
    });

    if (existingUser) {
      logger.info({ countryCode }, 'National ID already registered');
      return {
        isAvailable: false,
        message: 'This National ID is already registered in our system',
      };
    }

    return {
      isAvailable: true,
      message: 'National ID is available',
    };
  }
}

export const usersService = new UsersService();
