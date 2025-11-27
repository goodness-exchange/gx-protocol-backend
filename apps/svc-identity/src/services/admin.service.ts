import { logger } from '@gx/core-logger';
import { db, PrismaClient } from '@gx/core-db';

// Prisma transaction client type
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// Type for user with KYC relations
interface UserWithKyc {
  profileId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNum: string | null;
  status: string;
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
  email: string;
  firstName: string;
  lastName: string;
  phoneNum: string | null;
  status: string;
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

    return user;
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
}

export const adminService = new AdminService();
