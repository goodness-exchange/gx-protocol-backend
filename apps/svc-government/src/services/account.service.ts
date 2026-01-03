import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import {
  CreateAccountDTO,
  UpdateAccountDTO,
  AccountResponse,
  GovernmentErrorCode,
} from '../types';

export class AccountService {
  /**
   * Get account by ID
   */
  async getAccountById(accountId: string): Promise<AccountResponse | null> {
    const account = await db.governmentHierarchyAccount.findUnique({
      where: { accountId },
      include: {
        parentAccount: true,
        _count: {
          select: {
            childAccounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
          },
        },
      },
    });

    if (!account) {
      return null;
    }

    return this.mapAccountToResponse(account);
  }

  /**
   * List accounts for a treasury
   */
  async listAccounts(options: {
    treasuryId: string;
    parentAccountId?: string | null;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ accounts: AccountResponse[]; total: number }> {
    const { treasuryId, parentAccountId, status, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { treasuryId };

    if (parentAccountId === null) {
      where.parentAccountId = null;
    } else if (parentAccountId !== undefined) {
      where.parentAccountId = parentAccountId;
    }

    if (status) {
      where.status = status;
    }

    const [accounts, total] = await Promise.all([
      db.governmentHierarchyAccount.findMany({
        where,
        include: {
          parentAccount: true,
          _count: {
            select: {
              childAccounts: { where: { status: 'ACCOUNT_ACTIVE' } },
              administrators: { where: { status: 'ADMIN_ACTIVE' } },
            },
          },
        },
        skip,
        take: limit,
        orderBy: [{ hierarchyLevel: 'asc' }, { accountName: 'asc' }],
      }),
      db.governmentHierarchyAccount.count({ where }),
    ]);

    return {
      accounts: accounts.map((a: any) => this.mapAccountToResponse(a)),
      total,
    };
  }

  /**
   * Get full hierarchy tree for a treasury
   */
  async getAccountHierarchy(treasuryId: string): Promise<any[]> {
    const accounts = await db.governmentHierarchyAccount.findMany({
      where: { treasuryId, status: { not: 'ACCOUNT_ARCHIVED' } },
      include: {
        _count: {
          select: {
            childAccounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
          },
        },
      },
      orderBy: [{ hierarchyLevel: 'asc' }, { accountName: 'asc' }],
    });

    // Build tree structure
    const accountMap = new Map<string, any>();
    const rootAccounts: any[] = [];

    for (const account of accounts) {
      accountMap.set(account.accountId, {
        ...this.mapAccountToResponse(account),
        children: [],
      });
    }

    for (const account of accounts) {
      const mappedAccount = accountMap.get(account.accountId)!;
      if (account.parentAccountId) {
        const parent = accountMap.get(account.parentAccountId);
        if (parent) {
          parent.children.push(mappedAccount);
        }
      } else {
        rootAccounts.push(mappedAccount);
      }
    }

    return rootAccounts;
  }

  /**
   * Create a new account in the hierarchy
   */
  async createAccount(
    treasuryId: string,
    dto: CreateAccountDTO,
    createdByProfileId: string
  ): Promise<AccountResponse> {
    const { parentAccountId, accountName, description, budgetCode, fiscalYear } = dto;

    // Verify treasury exists and is active
    const treasury = await db.governmentTreasury.findUnique({
      where: { treasuryId },
    });

    if (!treasury) {
      throw new AppError(GovernmentErrorCode.TREASURY_NOT_FOUND, 404, 'Treasury not found');
    }

    if (treasury.locked) {
      throw new AppError(GovernmentErrorCode.TREASURY_LOCKED, 400, 'Treasury is locked');
    }

    // Calculate hierarchy level and path
    let hierarchyLevel = 0;
    let hierarchyPath = `/${accountName}`;
    let parentAccount = null;

    if (parentAccountId) {
      parentAccount = await db.governmentHierarchyAccount.findUnique({
        where: { accountId: parentAccountId },
      });

      if (!parentAccount) {
        throw new AppError(GovernmentErrorCode.PARENT_ACCOUNT_NOT_FOUND, 404, 'Parent account not found');
      }

      if (parentAccount.treasuryId !== treasuryId) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          'Parent account does not belong to this treasury'
        );
      }

      if (parentAccount.status !== 'ACCOUNT_ACTIVE') {
        throw new AppError(
          GovernmentErrorCode.PARENT_ACCOUNT_NOT_FOUND,
          400,
          'Parent account is not active'
        );
      }

      hierarchyLevel = parentAccount.hierarchyLevel + 1;
      hierarchyPath = `${parentAccount.hierarchyPath}/${accountName}`;
    }

    // Generate account ID
    const accountId = this.generateAccountId(treasuryId, accountName, parentAccountId);

    // Check for duplicate account ID
    const existing = await db.governmentHierarchyAccount.findUnique({
      where: { accountId },
    });

    if (existing) {
      throw new AppError(
        GovernmentErrorCode.VALIDATION_ERROR,
        400,
        'Account with this name already exists in this location'
      );
    }

    const account = await db.governmentHierarchyAccount.create({
      data: {
        accountId,
        tenantId: 'default',
        treasuryId,
        parentAccountId: parentAccountId || null,
        accountName,
        hierarchyLevel,
        hierarchyPath,
        balance: 0,
        allocatedFromParent: 0,
        totalDisbursed: 0,
        totalAllocatedToChildren: 0,
        status: 'ACCOUNT_ACTIVE',
        description,
        budgetCode,
        fiscalYear,
        createdBy: createdByProfileId,
      },
      include: {
        parentAccount: true,
        _count: {
          select: {
            childAccounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
          },
        },
      },
    });

    logger.info(
      { accountId, treasuryId, parentAccountId, accountName, hierarchyLevel },
      'Government account created'
    );

    return this.mapAccountToResponse(account);
  }

  /**
   * Update an account
   */
  async updateAccount(
    accountId: string,
    dto: UpdateAccountDTO,
    updatedByProfileId: string
  ): Promise<AccountResponse> {
    const existing = await db.governmentHierarchyAccount.findUnique({
      where: { accountId },
    });

    if (!existing) {
      throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
    }

    if (existing.status === 'ACCOUNT_ARCHIVED') {
      throw new AppError(GovernmentErrorCode.ACCOUNT_ARCHIVED, 400, 'Account is archived');
    }

    const updateData: any = {};

    if (dto.accountName) {
      updateData.accountName = dto.accountName;
      // Update hierarchy path
      const pathParts = existing.hierarchyPath.split('/');
      pathParts[pathParts.length - 1] = dto.accountName;
      updateData.hierarchyPath = pathParts.join('/');
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    if (dto.budgetCode !== undefined) {
      updateData.budgetCode = dto.budgetCode;
    }

    if (dto.fiscalYear !== undefined) {
      updateData.fiscalYear = dto.fiscalYear;
    }

    if (dto.status) {
      updateData.status = dto.status;
    }

    const account = await db.governmentHierarchyAccount.update({
      where: { accountId },
      data: updateData,
      include: {
        parentAccount: true,
        _count: {
          select: {
            childAccounts: { where: { status: 'ACCOUNT_ACTIVE' } },
            administrators: { where: { status: 'ADMIN_ACTIVE' } },
          },
        },
      },
    });

    logger.info({ accountId, updatedByProfileId, changes: Object.keys(updateData) }, 'Account updated');

    return this.mapAccountToResponse(account);
  }

  /**
   * Archive an account (soft delete)
   */
  async archiveAccount(accountId: string, archivedByProfileId: string): Promise<void> {
    const existing = await db.governmentHierarchyAccount.findUnique({
      where: { accountId },
      include: {
        childAccounts: { where: { status: { not: 'ACCOUNT_ARCHIVED' } } },
      },
    });

    if (!existing) {
      throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
    }

    if (existing.childAccounts.length > 0) {
      throw new AppError(
        GovernmentErrorCode.VALIDATION_ERROR,
        400,
        'Cannot archive account with active child accounts'
      );
    }

    // Check balance is zero
    if (parseFloat(existing.balance.toString()) > 0) {
      throw new AppError(
        GovernmentErrorCode.VALIDATION_ERROR,
        400,
        'Cannot archive account with non-zero balance'
      );
    }

    await db.governmentHierarchyAccount.update({
      where: { accountId },
      data: { status: 'ACCOUNT_ARCHIVED' },
    });

    logger.info({ accountId, archivedByProfileId }, 'Account archived');
  }

  /**
   * Sync account balance from blockchain
   */
  async syncAccountBalance(accountId: string, balance: string, blockNumber: bigint): Promise<void> {
    await db.governmentHierarchyAccount.update({
      where: { accountId },
      data: {
        balance: balance,
        lastSyncBlock: blockNumber,
        lastSyncAt: new Date(),
      },
    });

    logger.debug({ accountId, balance, blockNumber }, 'Account balance synced');
  }

  /**
   * Generate account ID from treasury ID, name, and parent
   */
  private generateAccountId(treasuryId: string, accountName: string, parentAccountId?: string): string {
    const sanitizedName = accountName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    if (parentAccountId) {
      return `${parentAccountId}.${sanitizedName}`;
    }

    return `${treasuryId}.${sanitizedName}`;
  }

  /**
   * Map database model to response
   */
  private mapAccountToResponse(account: any): AccountResponse {
    return {
      accountId: account.accountId,
      treasuryId: account.treasuryId,
      parentAccountId: account.parentAccountId ?? undefined,
      accountName: account.accountName,
      hierarchyLevel: account.hierarchyLevel,
      hierarchyPath: account.hierarchyPath,
      balance: account.balance.toString(),
      allocatedFromParent: account.allocatedFromParent.toString(),
      totalDisbursed: account.totalDisbursed.toString(),
      totalAllocatedToChildren: account.totalAllocatedToChildren.toString(),
      status: account.status,
      description: account.description ?? undefined,
      budgetCode: account.budgetCode ?? undefined,
      fiscalYear: account.fiscalYear ?? undefined,
      createdAt: account.createdAt.toISOString(),
      createdBy: account.createdBy,
      childAccountCount: account._count?.childAccounts ?? 0,
      administratorCount: account._count?.administrators ?? 0,
    };
  }
}

export const accountService = new AccountService();
