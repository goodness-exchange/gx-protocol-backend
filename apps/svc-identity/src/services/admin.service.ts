import { logger } from '@gx/core-logger';
import { db, PrismaClient } from '@gx/core-db';
import { generateFabricUserId } from '@gx/core-fabric';

// Prisma transaction client type
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// Result interface for batch approval
export interface BatchApprovalResult {
  success: string[];
  failed: Array<{ profileId: string; error: string }>;
  totalProcessed: number;
}

// Type for user with KYC relations
interface UserWithKyc {
  profileId: string;
  fabricUserId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phoneNum: string | null;
  status: string;
  onchainStatus: string | null;
  nationalityCountryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  kycVerifications: Array<{
    status: string;
    createdAt: Date;
  }>;
}

/**
 * Admin Service
 *
 * Handles administrative operations including:
 * - User listing by status
 * - KYC approval/rejection
 * - User status management
 */

export interface UserListItem {
  profileId: string;
  fabricUserId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phoneNum: string | null;
  status: string;
  onchainStatus: string | null;
  nationalityCountryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  kycStatus?: string | null;
  kycSubmittedAt?: Date | null;
}

export interface UserListResult {
  users: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

class AdminService {
  /**
   * List users with optional filtering by status
   *
   * @param status - Optional user status filter (REGISTERED, PENDING_ADMIN_APPROVAL, ACTIVE, etc.)
   * @param page - Page number (1-based)
   * @param pageSize - Number of items per page
   * @returns Paginated user list with KYC info
   */
  async listUsers(
    status?: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<UserListResult> {
    logger.debug({ status, page, pageSize }, 'Listing users');

    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // Get users with their latest KYC record
    const [users, total] = await Promise.all([
      db.userProfile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          kycVerifications: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      db.userProfile.count({ where }),
    ]);

    const userList: UserListItem[] = users.map((user: UserWithKyc) => ({
      profileId: user.profileId,
      fabricUserId: user.fabricUserId,  // Blockchain address
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      status: user.status,
      onchainStatus: user.onchainStatus,  // Blockchain registration status
      nationalityCountryCode: user.nationalityCountryCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      kycStatus: user.kycVerifications[0]?.status || null,
      kycSubmittedAt: user.kycVerifications[0]?.createdAt || null,
    }));

    return {
      users: userList,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get detailed user information for admin review
   *
   * @param profileId - User profile ID
   * @returns Full user details with KYC and address info
   */
  async getUserDetails(profileId: string): Promise<any> {
    logger.debug({ profileId }, 'Getting user details for admin');

    const user = await db.userProfile.findUnique({
      where: { profileId },
      include: {
        kycVerifications: {
          orderBy: { createdAt: 'desc' },
        },
        addresses: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Transform to include all KYC-related fields
    return {
      // Basic info
      profileId: user.profileId,
      fabricUserId: user.fabricUserId,  // Blockchain address
      email: user.email,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      placeOfBirth: user.placeOfBirth,
      nationalityCountryCode: user.nationalityCountryCode,
      status: user.status,
      onchainStatus: user.onchainStatus,  // Blockchain registration status

      // National ID
      nationalIdNumber: user.nationalIdNumber,
      nationalIdIssuedAt: user.nationalIdIssuedAt,
      nationalIdExpiresAt: user.nationalIdExpiresAt,

      // Passport
      passportNumber: user.passportNumber,
      passportIssuingCountry: user.passportIssuingCountry,
      passportIssuedAt: user.passportIssuedAt,
      passportExpiresAt: user.passportExpiresAt,

      // Employment
      employmentStatus: user.employmentStatus,
      jobTitle: user.jobTitle,
      companyName: user.companyName,
      industry: user.industry,
      workEmail: user.workEmail,
      workPhoneNum: user.workPhoneNum,

      // PEP
      isPEP: user.isPEP,
      pepDetails: user.pepDetails,

      // Admin review tracking
      isLocked: user.isLocked,
      lockReason: user.lockReason,
      reviewedBy: user.reviewedBy,
      reviewedAt: user.reviewedAt,
      denialReason: user.denialReason,

      // Timestamps
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      // Relations
      kycVerifications: user.kycVerifications,
      addresses: user.addresses,
    };
  }

  /**
   * Approve user KYC and activate account
   *
   * @param profileId - User profile ID
   * @param adminId - Admin performing the action
   * @param notes - Optional admin notes
   */
  async approveUser(
    profileId: string,
    adminId: string,
    notes?: string
  ): Promise<void> {
    logger.info({ profileId, adminId }, 'Approving user KYC');

    await db.$transaction(async (tx: TransactionClient) => {
      // Update user status to ACTIVE
      await tx.userProfile.update({
        where: { profileId },
        data: { status: 'ACTIVE' },
      });

      // Update KYC verification status
      const latestKyc = await tx.kYCVerification.findFirst({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
      });

      if (latestKyc) {
        await tx.kYCVerification.update({
          where: { kycId: latestKyc.kycId },
          data: {
            status: 'APPROVED',
            verifiedAt: new Date(),
            verifierDetails: JSON.stringify({ adminId, notes }),
          },
        });
      }
    });

    logger.info({ profileId, adminId }, 'User approved successfully');
  }

  /**
   * Reject user KYC
   *
   * @param profileId - User profile ID
   * @param adminId - Admin performing the action
   * @param reason - Rejection reason
   */
  async rejectUser(
    profileId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    logger.info({ profileId, adminId, reason }, 'Rejecting user KYC');

    await db.$transaction(async (tx: TransactionClient) => {
      // Update user status to REJECTED
      await tx.userProfile.update({
        where: { profileId },
        data: { status: 'REJECTED' },
      });

      // Update KYC verification status
      const latestKyc = await tx.kYCVerification.findFirst({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
      });

      if (latestKyc) {
        await tx.kYCVerification.update({
          where: { kycId: latestKyc.kycId },
          data: {
            status: 'REJECTED',
            verifiedAt: new Date(),
            verifierDetails: JSON.stringify({ adminId, reason }),
          },
        });
      }
    });

    logger.info({ profileId, adminId }, 'User rejected');
  }

  /**
   * Batch approve users and register them on blockchain
   *
   * This function:
   * 1. Finds all users with APPROVED KYC status but not yet on blockchain
   * 2. Generates Fabric User IDs for each
   * 3. Creates CREATE_USER outbox commands for blockchain registration
   * 4. Updates user status to APPROVED_PENDING_ONCHAIN
   *
   * @param adminId - Admin performing the batch approval
   * @param profileIds - Optional array of specific profile IDs to approve (if empty, approves all eligible)
   * @returns BatchApprovalResult with success/failed counts
   */
  async batchApproveForBlockchain(
    adminId: string,
    profileIds?: string[]
  ): Promise<BatchApprovalResult> {
    logger.info({ adminId, profileIds }, 'Starting batch approval for blockchain registration');

    const result: BatchApprovalResult = {
      success: [],
      failed: [],
      totalProcessed: 0,
    };

    // Find eligible users: KYC approved but not yet on blockchain
    const whereClause: any = {
      status: 'ACTIVE', // User has been approved by admin
      onchainStatus: 'NOT_REGISTERED', // Not yet on blockchain
      nationalityCountryCode: { not: null }, // Must have nationality for Fabric ID
      dateOfBirth: { not: null }, // Must have DOB for Fabric ID
    };

    // If specific profile IDs provided, filter to those
    if (profileIds && profileIds.length > 0) {
      whereClause.profileId = { in: profileIds };
    }

    const eligibleUsers = await db.userProfile.findMany({
      where: whereClause,
      select: {
        profileId: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        nationalityCountryCode: true,
        biometricHash: true,
      },
    });

    logger.info({ count: eligibleUsers.length }, 'Found eligible users for blockchain registration');

    // Process each user
    for (const user of eligibleUsers) {
      result.totalProcessed++;

      try {
        // Validate required fields
        if (!user.dateOfBirth || !user.nationalityCountryCode) {
          throw new Error('Missing required fields: dateOfBirth or nationalityCountryCode');
        }

        // Format DOB for Fabric ID generation (YYYY-MM-DD)
        const dobString = user.dateOfBirth instanceof Date
          ? user.dateOfBirth.toISOString().slice(0, 10)
          : new Date(user.dateOfBirth).toISOString().slice(0, 10);

        // Generate deterministic Fabric User ID
        const fabricUserId = generateFabricUserId(
          user.nationalityCountryCode,
          dobString,
          user.gender || 'male',
          '0' // Account type 0 = Individuals
        );

        // Calculate age for blockchain
        const age = this.calculateAge(user.dateOfBirth);

        // Use transaction to update user and create outbox command atomically
        await db.$transaction(async (tx: TransactionClient) => {
          // Update user with Fabric ID and pending status
          await tx.userProfile.update({
            where: { profileId: user.profileId },
            data: {
              fabricUserId: fabricUserId,
              onchainStatus: 'PENDING',
              reviewedBy: adminId,
              reviewedAt: new Date(),
            },
          });

          // Create outbox command for blockchain registration
          // NOTE: Field names must match what outbox-submitter expects:
          // - userId (lowercase 'd') not userID
          await tx.outboxCommand.create({
            data: {
              tenantId: 'default',
              service: 'svc-identity',
              commandType: 'CREATE_USER',
              requestId: user.profileId,
              payload: {
                userId: fabricUserId,
                biometricHash: user.biometricHash,
                nationality: user.nationalityCountryCode,
                age: age,
              },
              status: 'PENDING',
            },
          });
        });

        result.success.push(user.profileId);
        logger.info(
          { profileId: user.profileId, fabricUserId },
          'Queued user for blockchain registration'
        );

      } catch (error: any) {
        result.failed.push({
          profileId: user.profileId,
          error: error.message || 'Unknown error',
        });
        logger.error(
          { profileId: user.profileId, error: error.message },
          'Failed to queue user for blockchain registration'
        );
      }
    }

    logger.info(
      { adminId, success: result.success.length, failed: result.failed.length },
      'Batch approval completed'
    );

    return result;
  }

  /**
   * Get users pending blockchain registration
   *
   * @returns List of users with ACTIVE status but NOT_REGISTERED onchainStatus
   */
  async getUsersPendingBlockchain(): Promise<UserListItem[]> {
    const users = await db.userProfile.findMany({
      where: {
        status: 'ACTIVE',
        onchainStatus: 'NOT_REGISTERED',
      },
      orderBy: { createdAt: 'asc' },
      include: {
        kycVerifications: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return users.map((user: UserWithKyc) => ({
      profileId: user.profileId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNum: user.phoneNum,
      status: user.status,
      nationalityCountryCode: user.nationalityCountryCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      kycStatus: user.kycVerifications[0]?.status || null,
      kycSubmittedAt: user.kycVerifications[0]?.createdAt || null,
    }));
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dob: Date | string): number {
    const birthDate = dob instanceof Date ? dob : new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }
}

export const adminService = new AdminService();
