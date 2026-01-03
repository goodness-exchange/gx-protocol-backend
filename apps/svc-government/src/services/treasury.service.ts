import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import {
  OnboardTreasuryDTO,
  UpdateTreasuryStatusDTO,
  TreasuryResponse,
  GovernmentErrorCode,
} from '../types';

export class TreasuryService {
  /**
   * Get treasury by country code
   */
  async getTreasuryByCountry(countryCode: string): Promise<TreasuryResponse | null> {
    const treasury = await db.governmentTreasury.findUnique({
      where: { countryCode },
      include: {
        country: true,
        _count: {
          select: {
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
            accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
          },
        },
      },
    });

    if (!treasury) {
      return null;
    }

    return this.mapTreasuryToResponse(treasury);
  }

  /**
   * Get treasury by ID
   */
  async getTreasuryById(treasuryId: string): Promise<TreasuryResponse | null> {
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId },
      include: {
        country: true,
        _count: {
          select: {
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
            accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
          },
        },
      },
    });

    if (!treasury) {
      return null;
    }

    return this.mapTreasuryToResponse(treasury);
  }

  /**
   * List all treasuries with pagination
   */
  async listTreasuries(options: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<{ treasuries: TreasuryResponse[]; total: number }> {
    const { page, limit, status } = options;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [treasuries, total] = await Promise.all([
      db.governmentTreasury.findMany({
        where,
        include: {
          country: true,
          _count: {
            select: {
              administrators: { where: { status: 'ADMIN_ACTIVE' } },
              accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.governmentTreasury.count({ where }),
    ]);

    return {
      treasuries: treasuries.map((t: any) => this.mapTreasuryToResponse(t)),
      total,
    };
  }

  /**
   * Onboard a treasury (Super Admin action)
   * Transitions treasury from PENDING_ONBOARDING to ONBOARDING or ACTIVE
   */
  async onboardTreasury(
    dto: OnboardTreasuryDTO,
    adminProfileId: string
  ): Promise<TreasuryResponse> {
    const { countryCode, verificationNotes, initialAdministrators } = dto;

    // Check country exists
    const country = await db.country.findUnique({
      where: { countryCode },
    });

    if (!country) {
      throw new AppError(GovernmentErrorCode.COUNTRY_NOT_FOUND, 404, 'Country not found');
    }

    // Check treasury exists
    const existingTreasury = await db.governmentTreasury.findUnique({
      where: { countryCode },
    });

    if (!existingTreasury) {
      throw new AppError(
        GovernmentErrorCode.TREASURY_NOT_FOUND,
        404,
        'Treasury not found. Treasury is auto-created when first citizen registers.'
      );
    }

    if (existingTreasury.status !== 'PENDING_ONBOARDING') {
      throw new AppError(
        GovernmentErrorCode.TREASURY_ALREADY_ONBOARDED,
        400,
        `Treasury is already in ${existingTreasury.status} status`
      );
    }

    // Start transaction to onboard treasury and assign initial administrators
    const result = await db.$transaction(async (tx: any) => {
      // Update treasury status
      const treasury = await tx.governmentTreasury.update({
        where: { treasuryId: existingTreasury.treasuryId },
        data: {
          status: initialAdministrators?.length ? 'ONBOARDING' : 'TREASURY_ACTIVE',
          locked: initialAdministrators?.length ? true : false,
          verifiedBy: adminProfileId,
          verificationNotes,
          onboardedAt: new Date(),
          lastActivityAt: new Date(),
        },
        include: {
          country: true,
          _count: {
            select: {
              administrators: { where: { status: 'ADMIN_ACTIVE' } },
              accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            },
          },
        },
      });

      // Assign initial administrators if provided
      if (initialAdministrators?.length) {
        for (const admin of initialAdministrators) {
          // Verify profile exists
          const profile = await tx.userProfile.findUnique({
            where: { profileId: admin.profileId },
          });

          if (!profile) {
            logger.warn({ profileId: admin.profileId }, 'Profile not found for initial administrator');
            continue;
          }

          await tx.governmentAdministrator.create({
            data: {
              tenantId: 'default',
              treasuryId: treasury.treasuryId,
              profileId: admin.profileId,
              role: admin.role,
              canCreateStructure: admin.permissions?.canCreateStructure ?? false,
              canAllocateFunds: admin.permissions?.canAllocateFunds ?? false,
              canAssignAdministrators: admin.permissions?.canAssignAdministrators ?? false,
              canConfigureRules: admin.permissions?.canConfigureRules ?? false,
              canDisburseFunds: admin.permissions?.canDisburseFunds ?? false,
              canViewReports: admin.permissions?.canViewReports ?? true,
              canManageAPIKeys: admin.permissions?.canManageAPIKeys ?? false,
              status: 'ADMIN_ACTIVE',
              assignedBy: adminProfileId,
            },
          });
        }
      }

      return treasury;
    });

    logger.info(
      { treasuryId: result.treasuryId, countryCode, adminProfileId },
      'Treasury onboarded successfully'
    );

    return this.mapTreasuryToResponse(result);
  }

  /**
   * Update treasury status (Super Admin action)
   */
  async updateTreasuryStatus(
    treasuryId: string,
    dto: UpdateTreasuryStatusDTO,
    adminProfileId: string
  ): Promise<TreasuryResponse> {
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId },
    });

    if (!treasury) {
      throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
    }

    const updated = await db.governmentTreasury.update({
      where: { treasuryId },
      data: {
        status: dto.status,
        locked: dto.status !== 'TREASURY_ACTIVE',
        lockReason: dto.reason,
        lastActivityAt: new Date(),
      },
      include: {
        country: true,
        _count: {
          select: {
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
            accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
          },
        },
      },
    });

    logger.info(
      { treasuryId, status: dto.status, adminProfileId },
      'Treasury status updated'
    );

    return this.mapTreasuryToResponse(updated);
  }

  /**
   * Activate treasury (unlock after onboarding complete)
   */
  async activateTreasury(treasuryId: string, adminProfileId: string): Promise<TreasuryResponse> {
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId },
    });

    if (!treasury) {
      throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
    }

    if (treasury.status !== 'ONBOARDING') {
      throw new AppError(
        GovernmentErrorCode.TREASURY_NOT_ACTIVE,
        400,
        'Treasury must be in ONBOARDING status to activate'
      );
    }

    const updated = await db.governmentTreasury.update({
      where: { treasuryId },
      data: {
        status: 'TREASURY_ACTIVE',
        locked: false,
        lockReason: null,
        lastActivityAt: new Date(),
      },
      include: {
        country: true,
        _count: {
          select: {
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
            accounts: { where: { status: 'ACCOUNT_ACTIVE' } },
          },
        },
      },
    });

    logger.info({ treasuryId, adminProfileId }, 'Treasury activated');

    return this.mapTreasuryToResponse(updated);
  }

  /**
   * Sync treasury balance from blockchain
   */
  async syncTreasuryBalance(treasuryId: string, balance: string, blockNumber: bigint): Promise<void> {
    await db.governmentTreasury.update({
      where: { treasuryId },
      data: {
        balance: balance,
        lastSyncBlock: blockNumber,
        lastSyncAt: new Date(),
      },
    });

    logger.debug({ treasuryId, balance, blockNumber }, 'Treasury balance synced');
  }

  /**
   * Map database model to response
   */
  private mapTreasuryToResponse(treasury: any): TreasuryResponse {
    return {
      treasuryId: treasury.treasuryId,
      countryCode: treasury.countryCode,
      countryName: treasury.country?.countryName ?? treasury.countryCode,
      status: treasury.status,
      locked: treasury.locked,
      lockReason: treasury.lockReason ?? undefined,
      balance: treasury.balance.toString(),
      cumulativeAllocations: treasury.cumulativeAllocations.toString(),
      totalDisbursed: treasury.totalDisbursed.toString(),
      totalAllocatedToAccounts: treasury.totalAllocatedToAccounts.toString(),
      onboardedAt: treasury.onboardedAt?.toISOString(),
      createdAt: treasury.createdAt.toISOString(),
      lastActivityAt: treasury.lastActivityAt?.toISOString(),
      administratorCount: treasury._count?.administrators ?? 0,
      accountCount: treasury._count?.accounts ?? 0,
    };
  }
}

export const treasuryService = new TreasuryService();
