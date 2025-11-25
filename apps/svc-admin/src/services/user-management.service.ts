import { db as prisma } from '@gx/core-db';
import { generateFabricUserId } from '@gx/core-fabric';
import { logger } from '@gx/core-logger';

/**
 * User Management Service
 * Business logic for KYC approval, user management, and blockchain registration
 */
class UserManagementService {
  /**
   * List users with filtering and pagination
   */
  async listUsers(params: {
    status?: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const { status, page, limit, search } = params;

    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null, // Exclude soft-deleted users
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fabricUserId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.userProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          profileId: true,
          firstName: true,
          lastName: true,
          email: true,
          gender: true,
          dateOfBirth: true,
          nationalityCountryCode: true,
          fabricUserId: true,
          status: true,
          isLocked: true,
          reviewedBy: true,
          reviewedAt: true,
          createdAt: true,
          kycVerifications: {
            select: {
              kycId: true,
              status: true,
              documents: {
                select: {
                  documentId: true,
                  documentType: true,
                  storageUrl: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.userProfile.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(userId: string) {
    const user = await prisma.userProfile.findUnique({
      where: { profileId: userId, deletedAt: null },
      include: {
        kycVerifications: {
          include: {
            documents: true,
          },
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
   * Approve user KYC and generate Fabric User ID
   */
  async approveUser(userId: string, adminId: string, _notes?: string) {
    // Get user
    const user = await prisma.userProfile.findUnique({
      where: { profileId: userId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new Error(`User status is ${user.status}, expected PENDING_ADMIN_APPROVAL`);
    }

    // Validate required fields for ID generation
    if (!user.nationalityCountryCode) {
      throw new Error('User nationality is required for ID generation');
    }

    if (!user.dateOfBirth) {
      throw new Error('User date of birth is required for ID generation');
    }

    if (!user.gender) {
      throw new Error('User gender is required for ID generation');
    }

    if (!['male', 'female'].includes(user.gender.toLowerCase())) {
      throw new Error('User gender must be "male" or "female"');
    }

    // Generate Fabric User ID
    const fabricUserId = generateFabricUserId(
      user.nationalityCountryCode,
      user.dateOfBirth.toISOString().split('T')[0], // YYYY-MM-DD format
      user.gender.toLowerCase(),
      '0' // Account type: Individual
    );

    logger.info({ userId, fabricUserId }, 'Generated Fabric User ID');

    // Check for collision (extremely rare but possible)
    const existingUser = await prisma.userProfile.findUnique({
      where: { fabricUserId },
    });

    if (existingUser) {
      logger.warn({ userId, fabricUserId }, 'Fabric User ID collision detected!');
      throw new Error('ID collision detected. Please try again.');
    }

    // Update user
    const updated = await prisma.userProfile.update({
      where: { profileId: userId },
      data: {
        status: 'APPROVED_PENDING_ONCHAIN',
        fabricUserId,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        // Store approval notes in a JSON field if you have one, or create a separate AuditLog table
      },
    });

    return {
      fabricUserId: updated.fabricUserId!,
      status: updated.status,
    };
  }

  /**
   * Deny user KYC application
   */
  async denyUser(userId: string, adminId: string, reason: string) {
    const user = await prisma.userProfile.findUnique({
      where: { profileId: userId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new Error(`User status is ${user.status}, expected PENDING_ADMIN_APPROVAL`);
    }

    const updated = await prisma.userProfile.update({
      where: { profileId: userId },
      data: {
        status: 'DENIED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        denialReason: reason,
      },
    });

    return {
      status: updated.status,
    };
  }

  /**
   * Get users approved and awaiting blockchain registration
   */
  async getPendingOnchainUsers() {
    const users = await prisma.userProfile.findMany({
      where: {
        status: 'APPROVED_PENDING_ONCHAIN',
        fabricUserId: { not: null },
        deletedAt: null,
      },
      select: {
        profileId: true,
        firstName: true,
        lastName: true,
        email: true,
        fabricUserId: true,
        nationalityCountryCode: true,
        dateOfBirth: true,
        gender: true,
        biometricHash: true,
        reviewedAt: true,
      },
      orderBy: { reviewedAt: 'asc' }, // FIFO: First approved, first registered
      take: 100, // Batch limit
    });

    return users;
  }

  /**
   * Batch register approved users on blockchain
   */
  async batchRegisterOnchain(userIds: string[]) {
    // Validate all users are eligible
    const users = await prisma.userProfile.findMany({
      where: {
        profileId: { in: userIds },
        status: 'APPROVED_PENDING_ONCHAIN',
        fabricUserId: { not: null },
        deletedAt: null,
      },
    });

    if (users.length !== userIds.length) {
      throw new Error(
        `Some users are not eligible. Expected ${userIds.length}, found ${users.length} eligible.`
      );
    }

    // Create OutboxCommands for batch registration
    const commands = await Promise.all(
      users.map(async (user: typeof users[0]) => {
        // Calculate age from date of birth
        const age = user.dateOfBirth
          ? Math.floor(
              (Date.now() - user.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
            )
          : 0;

        return prisma.outboxCommand.create({
          data: {
            tenantId: user.tenantId,
            aggregateId: user.fabricUserId!,
            commandType: 'CREATE_USER',
            payload: {
              userId: user.fabricUserId,
              biometricHash: user.biometricHash,
              nationality: user.nationalityCountryCode,
              age,
            },
            status: 'PENDING',
          },
        });
      })
    );

    logger.info({ count: commands.length }, 'Batch registration commands created');

    return {
      commands: commands.map((cmd: typeof commands[0]) => ({
        userId: cmd.aggregateId,
        commandId: cmd.commandId,
        status: cmd.status,
      })),
    };
  }

  /**
   * Freeze user account
   */
  async freezeUser(userId: string, adminId: string, reason: string, notes?: string) {
    const user = await prisma.userProfile.findUnique({
      where: { profileId: userId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.fabricUserId) {
      throw new Error('Cannot freeze: User does not have an on-chain ID (fabricUserId)');
    }

    if (user.isLocked) {
      throw new Error('User is already frozen');
    }

    // Update off-chain status
    const updated = await prisma.$transaction([
      prisma.userProfile.update({
        where: { profileId: userId },
        data: {
          status: 'FROZEN',
          isLocked: true,
          lockReason: reason,
          lockedBy: adminId,
          lockedAt: new Date(),
          lockNotes: notes,
        },
      }),

      // Create outbox command to freeze on blockchain
      prisma.outboxCommand.create({
        data: {
          tenantId: user.tenantId,
          aggregateId: user.fabricUserId,
          commandType: 'FREEZE_WALLET',
          payload: {
            userID: user.fabricUserId,
            reason: `${reason}: ${notes || ''}`,
          },
          status: 'PENDING',
        },
      }),
    ]);

    return {
      fabricUserId: updated[0].fabricUserId!,
      status: updated[0].status,
    };
  }

  /**
   * Unfreeze user account
   */
  async unfreezeUser(userId: string, _adminId: string) {
    const user = await prisma.userProfile.findUnique({
      where: { profileId: userId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.fabricUserId) {
      throw new Error('Cannot unfreeze: User does not have an on-chain ID (fabricUserId)');
    }

    if (!user.isLocked) {
      throw new Error('User is not frozen');
    }

    // Update off-chain status
    const updated = await prisma.$transaction([
      prisma.userProfile.update({
        where: { profileId: userId },
        data: {
          status: 'ACTIVE',
          isLocked: false,
          lockReason: null,
          lockedBy: null,
          lockedAt: null,
          lockNotes: null,
        },
      }),

      // Create outbox command to unfreeze on blockchain
      prisma.outboxCommand.create({
        data: {
          tenantId: user.tenantId,
          aggregateId: user.fabricUserId,
          commandType: 'UNFREEZE_WALLET',
          payload: {
            userID: user.fabricUserId,
          },
          status: 'PENDING',
        },
      }),
    ]);

    return {
      fabricUserId: updated[0].fabricUserId!,
      status: updated[0].status,
    };
  }

  /**
   * List all frozen accounts
   */
  async listFrozenUsers() {
    const users = await prisma.userProfile.findMany({
      where: {
        isLocked: true,
        status: 'FROZEN',
        deletedAt: null,
      },
      select: {
        profileId: true,
        firstName: true,
        lastName: true,
        email: true,
        fabricUserId: true,
        lockReason: true,
        lockNotes: true,
        lockedBy: true,
        lockedAt: true,
      },
      orderBy: { lockedAt: 'desc' },
    });

    return users;
  }
}

export const userManagementService = new UserManagementService();
