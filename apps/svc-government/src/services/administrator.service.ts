import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import {
  AssignAdministratorDTO,
  UpdateAdministratorDTO,
  AdministratorResponse,
  GovernmentErrorCode,
  AdminPermissions,
} from '../types';

export class AdministratorService {
  /**
   * Get administrator by ID
   */
  async getAdministratorById(adminId: string): Promise<AdministratorResponse | null> {
    const admin = await db.governmentAdministrator.findUnique({
      where: { id: adminId },
      include: {
        userProfile: true,
        account: true,
      },
    });

    if (!admin) {
      return null;
    }

    return this.mapAdministratorToResponse(admin);
  }

  /**
   * List administrators for a treasury
   */
  async listAdministrators(options: {
    treasuryId: string;
    accountId?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ administrators: AdministratorResponse[]; total: number }> {
    const { treasuryId, accountId, status, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { treasuryId };
    if (accountId !== undefined) {
      where.accountId = accountId || null;
    }
    if (status) {
      where.status = status;
    }

    const [administrators, total] = await Promise.all([
      db.governmentAdministrator.findMany({
        where,
        include: {
          userProfile: true,
          account: true,
        },
        skip,
        take: limit,
        orderBy: { assignedAt: 'desc' },
      }),
      db.governmentAdministrator.count({ where }),
    ]);

    return {
      administrators: administrators.map((a: any) => this.mapAdministratorToResponse(a)),
      total,
    };
  }

  /**
   * Get administrators for current user
   */
  async getAdministratorsForProfile(profileId: string): Promise<AdministratorResponse[]> {
    const administrators = await db.governmentAdministrator.findMany({
      where: {
        profileId,
        status: 'ADMIN_ACTIVE',
      },
      include: {
        userProfile: true,
        account: true,
        treasury: {
          include: {
            country: true,
          },
        },
      },
    });

    return administrators.map((a: any) => this.mapAdministratorToResponse(a));
  }

  /**
   * Assign administrator to treasury or account
   */
  async assignAdministrator(
    treasuryId: string,
    dto: AssignAdministratorDTO,
    assignedByProfileId: string
  ): Promise<AdministratorResponse> {
    const { profileId, accountId, role, permissions } = dto;

    // Verify treasury exists
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId },
    });

    if (!treasury) {
      throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
    }

    // Verify profile exists
    const profile = await db.userProfile.findUnique({
      where: { profileId },
    });

    if (!profile) {
      throw new AppError(GovernmentErrorCode.USER_NOT_FOUND, 404, 'User profile not found');
    }

    // Verify account exists if specified
    if (accountId) {
      const account = await db.governmentHierarchyAccount.findUnique({
        where: { accountId },
      });

      if (!account) {
        throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
      }

      if (account.treasuryId !== treasuryId) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          'Account does not belong to this treasury'
        );
      }
    }

    // Check if administrator already exists
    const existing = await db.governmentAdministrator.findFirst({
      where: {
        treasuryId,
        accountId: accountId || null,
        profileId,
        status: { not: 'ADMIN_REMOVED' },
      },
    });

    if (existing) {
      throw new AppError(
        GovernmentErrorCode.ADMINISTRATOR_ALREADY_EXISTS,
        400,
        'Administrator already assigned to this treasury/account'
      );
    }

    const admin = await db.governmentAdministrator.create({
      data: {
        tenantId: 'default',
        treasuryId,
        accountId: accountId || null,
        profileId,
        role,
        canCreateStructure: permissions.canCreateStructure,
        canAllocateFunds: permissions.canAllocateFunds,
        canAssignAdministrators: permissions.canAssignAdministrators,
        canConfigureRules: permissions.canConfigureRules,
        canDisburseFunds: permissions.canDisburseFunds,
        canViewReports: permissions.canViewReports,
        canManageAPIKeys: permissions.canManageAPIKeys,
        status: 'ADMIN_ACTIVE',
        assignedBy: assignedByProfileId,
      },
      include: {
        userProfile: true,
        account: true,
      },
    });

    logger.info(
      { adminId: admin.id, treasuryId, accountId, profileId, role },
      'Administrator assigned'
    );

    return this.mapAdministratorToResponse(admin);
  }

  /**
   * Update administrator
   */
  async updateAdministrator(
    adminId: string,
    dto: UpdateAdministratorDTO,
    updatedByProfileId: string
  ): Promise<AdministratorResponse> {
    const existing = await db.governmentAdministrator.findUnique({
      where: { id: adminId },
    });

    if (!existing) {
      throw new AppError(GovernmentErrorCode.ADMINISTRATOR_NOT_FOUND, 404, 'Administrator not found');
    }

    if (existing.status === 'ADMIN_REMOVED') {
      throw new AppError(
        GovernmentErrorCode.ADMINISTRATOR_NOT_FOUND,
        400,
        'Administrator has been removed'
      );
    }

    const updateData: any = {};

    if (dto.role) {
      updateData.role = dto.role;
    }

    if (dto.status) {
      updateData.status = dto.status;
    }

    if (dto.permissions) {
      if (dto.permissions.canCreateStructure !== undefined) {
        updateData.canCreateStructure = dto.permissions.canCreateStructure;
      }
      if (dto.permissions.canAllocateFunds !== undefined) {
        updateData.canAllocateFunds = dto.permissions.canAllocateFunds;
      }
      if (dto.permissions.canAssignAdministrators !== undefined) {
        updateData.canAssignAdministrators = dto.permissions.canAssignAdministrators;
      }
      if (dto.permissions.canConfigureRules !== undefined) {
        updateData.canConfigureRules = dto.permissions.canConfigureRules;
      }
      if (dto.permissions.canDisburseFunds !== undefined) {
        updateData.canDisburseFunds = dto.permissions.canDisburseFunds;
      }
      if (dto.permissions.canViewReports !== undefined) {
        updateData.canViewReports = dto.permissions.canViewReports;
      }
      if (dto.permissions.canManageAPIKeys !== undefined) {
        updateData.canManageAPIKeys = dto.permissions.canManageAPIKeys;
      }
    }

    const admin = await db.governmentAdministrator.update({
      where: { id: adminId },
      data: updateData,
      include: {
        userProfile: true,
        account: true,
      },
    });

    logger.info({ adminId, updatedByProfileId, changes: Object.keys(updateData) }, 'Administrator updated');

    return this.mapAdministratorToResponse(admin);
  }

  /**
   * Remove administrator
   */
  async removeAdministrator(adminId: string, removedByProfileId: string): Promise<void> {
    const existing = await db.governmentAdministrator.findUnique({
      where: { id: adminId },
    });

    if (!existing) {
      throw new AppError(GovernmentErrorCode.ADMINISTRATOR_NOT_FOUND, 404, 'Administrator not found');
    }

    await db.governmentAdministrator.update({
      where: { id: adminId },
      data: {
        status: 'ADMIN_REMOVED',
        removedBy: removedByProfileId,
        removedAt: new Date(),
      },
    });

    logger.info({ adminId, removedByProfileId }, 'Administrator removed');
  }

  /**
   * Check if user has specific permission on treasury/account
   */
  async hasPermission(
    profileId: string,
    treasuryId: string,
    permission: keyof AdminPermissions,
    accountId?: string
  ): Promise<boolean> {
    // Check treasury-level permissions first
    const treasuryAdmin = await db.governmentAdministrator.findFirst({
      where: {
        treasuryId,
        profileId,
        accountId: null,
        status: 'ADMIN_ACTIVE',
      },
    });

    if (treasuryAdmin && (treasuryAdmin as any)[permission]) {
      return true;
    }

    // Check account-level permissions if accountId provided
    if (accountId) {
      const accountAdmin = await db.governmentAdministrator.findFirst({
        where: {
          treasuryId,
          profileId,
          accountId,
          status: 'ADMIN_ACTIVE',
        },
      });

      if (accountAdmin && (accountAdmin as any)[permission]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get permissions for user on treasury/account
   */
  async getPermissions(
    profileId: string,
    treasuryId: string,
    accountId?: string
  ): Promise<AdminPermissions> {
    const admins = await db.governmentAdministrator.findMany({
      where: {
        treasuryId,
        profileId,
        status: 'ADMIN_ACTIVE',
        OR: [
          { accountId: null },
          { accountId: accountId || undefined },
        ],
      },
    });

    // Merge permissions from all applicable admin assignments
    const permissions: AdminPermissions = {
      canCreateStructure: false,
      canAllocateFunds: false,
      canAssignAdministrators: false,
      canConfigureRules: false,
      canDisburseFunds: false,
      canViewReports: false,
      canManageAPIKeys: false,
    };

    for (const admin of admins) {
      permissions.canCreateStructure = permissions.canCreateStructure || admin.canCreateStructure;
      permissions.canAllocateFunds = permissions.canAllocateFunds || admin.canAllocateFunds;
      permissions.canAssignAdministrators = permissions.canAssignAdministrators || admin.canAssignAdministrators;
      permissions.canConfigureRules = permissions.canConfigureRules || admin.canConfigureRules;
      permissions.canDisburseFunds = permissions.canDisburseFunds || admin.canDisburseFunds;
      permissions.canViewReports = permissions.canViewReports || admin.canViewReports;
      permissions.canManageAPIKeys = permissions.canManageAPIKeys || admin.canManageAPIKeys;
    }

    return permissions;
  }

  /**
   * Map database model to response
   */
  private mapAdministratorToResponse(admin: any): AdministratorResponse {
    return {
      id: admin.id,
      treasuryId: admin.treasuryId,
      accountId: admin.accountId ?? undefined,
      accountName: admin.account?.accountName ?? undefined,
      profileId: admin.profileId,
      profileName: `${admin.userProfile?.firstName ?? ''} ${admin.userProfile?.lastName ?? ''}`.trim(),
      profileEmail: admin.userProfile?.email ?? '',
      role: admin.role,
      permissions: {
        canCreateStructure: admin.canCreateStructure,
        canAllocateFunds: admin.canAllocateFunds,
        canAssignAdministrators: admin.canAssignAdministrators,
        canConfigureRules: admin.canConfigureRules,
        canDisburseFunds: admin.canDisburseFunds,
        canViewReports: admin.canViewReports,
        canManageAPIKeys: admin.canManageAPIKeys,
      },
      status: admin.status,
      assignedAt: admin.assignedAt.toISOString(),
      assignedBy: admin.assignedBy,
    };
  }
}

export const administratorService = new AdministratorService();
