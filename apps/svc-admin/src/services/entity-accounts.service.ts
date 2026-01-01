/**
 * Entity Accounts Service
 * Database operations for Business, Government, and NPO accounts
 */

import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';

interface ListParams {
  page: number;
  limit: number;
  search?: string;
}

interface BusinessListParams extends ListParams {}

interface GovernmentListParams extends ListParams {
  agencyLevel?: string;
}

interface NPOListParams extends ListParams {
  category?: string;
}

class EntityAccountsService {
  // ============================================
  // Business Accounts
  // ============================================

  async listBusinessAccounts(params: BusinessListParams) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          organization: {
            legalName: { contains: search, mode: 'insensitive' as const },
          },
        }
      : {};

    const [accounts, total] = await Promise.all([
      db.businessAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: true,
          wallet: {
            select: {
              walletId: true,
              cachedBalance: true,
            },
          },
          _count: {
            select: {
              businessSubAccounts: true,
              employees: true,
            },
          },
        },
      }),
      db.businessAccount.count({ where }),
    ]);

    // Map to frontend expected format
    const mappedAccounts = accounts.map((account: typeof accounts[number]) => ({
      ...account,
      _count: {
        subAccounts: account._count.businessSubAccounts,
        employees: account._count.employees,
      },
    }));

    return {
      accounts: mappedAccounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBusinessAccount(id: string) {
    const account = await db.businessAccount.findUnique({
      where: { businessAccountId: id },
      include: {
        organization: true,
        wallet: {
          select: {
            walletId: true,
            cachedBalance: true,
          },
        },
        _count: {
          select: {
            businessSubAccounts: true,
            employees: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error('Business account not found');
    }

    return {
      ...account,
      _count: {
        subAccounts: account._count.businessSubAccounts,
        employees: account._count.employees,
      },
    };
  }

  async getBusinessDashboard(id: string) {
    const account = await db.businessAccount.findUnique({
      where: { businessAccountId: id },
      include: {
        wallet: { select: { cachedBalance: true } },
        businessSubAccounts: { select: { monthlyBudget: true } },
        employees: { select: { isActive: true } },
        payrollBatches: {
          where: { status: 'PENDING' },
          select: { totalAmount: true },
        },
      },
    });

    if (!account) {
      throw new Error('Business account not found');
    }

    const totalBudget = account.businessSubAccounts.reduce(
      (sum: number, sub: { monthlyBudget: any }) => sum + parseFloat(sub.monthlyBudget?.toString() || '0'),
      0
    );

    const activeEmployees = account.employees.filter((e: { isActive: boolean }) => e.isActive).length;

    const monthlyPayroll = account.payrollBatches.reduce(
      (sum: number, batch: { totalAmount: any }) => sum + parseFloat(batch.totalAmount?.toString() || '0'),
      0
    );

    return {
      dashboard: {
        account: {
          walletBalance: account.wallet?.cachedBalance?.toString() || '0',
        },
        subAccounts: {
          count: account.businessSubAccounts.length,
          totalBudget: totalBudget.toFixed(2),
        },
        employees: {
          total: account.employees.length,
          active: activeEmployees,
        },
        payroll: {
          monthlyTotal: monthlyPayroll.toFixed(2),
          pendingCount: account.payrollBatches.length,
        },
      },
    };
  }

  async getBusinessSubAccounts(id: string) {
    const subAccounts = await db.businessSubAccount.findMany({
      where: { businessAccountId: id },
      orderBy: { createdAt: 'desc' },
    });

    return { subAccounts };
  }

  async getBusinessEmployees(id: string) {
    const employees = await db.employee.findMany({
      where: { businessAccountId: id },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        department: true,
        isActive: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { employees };
  }

  // ============================================
  // Government Accounts
  // ============================================

  async listGovernmentAccounts(params: GovernmentListParams) {
    const { page, limit, search, agencyLevel } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.organization = {
        legalName: { contains: search, mode: 'insensitive' },
      };
    }
    if (agencyLevel) {
      where.agencyLevel = agencyLevel;
    }

    const [accounts, total] = await Promise.all([
      db.governmentAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: true,
          wallet: {
            select: {
              walletId: true,
              cachedBalance: true,
            },
          },
          _count: {
            select: {
              signatories: true,
              subAccounts: true,
            },
          },
        },
      }),
      db.governmentAccount.count({ where }),
    ]);

    return {
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getGovernmentAccount(id: string) {
    const account = await db.governmentAccount.findUnique({
      where: { governmentAccountId: id },
      include: {
        organization: true,
        wallet: {
          select: {
            walletId: true,
            cachedBalance: true,
          },
        },
        _count: {
          select: {
            signatories: true,
            subAccounts: true,
            pendingApprovals: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    return account;
  }

  async getGovernmentDashboard(id: string) {
    const account = await db.governmentAccount.findUnique({
      where: { governmentAccountId: id },
      include: {
        wallet: { select: { cachedBalance: true } },
        signatories: { select: { revokedAt: true } },
        subAccounts: { select: { allocatedAmount: true } },
        pendingApprovals: { where: { status: 'PENDING' } },
      },
    });

    if (!account) {
      throw new Error('Government account not found');
    }

    const activeSignatories = account.signatories.filter(
      (s: { revokedAt: Date | null }) => s.revokedAt === null
    ).length;

    const totalAllocated = account.subAccounts.reduce(
      (sum: number, sub: { allocatedAmount: any }) => sum + parseFloat(sub.allocatedAmount?.toString() || '0'),
      0
    );

    return {
      dashboard: {
        account: {
          walletBalance: account.wallet?.cachedBalance?.toString() || '0',
        },
        signatories: {
          total: account.signatories.length,
          active: activeSignatories,
        },
        pendingApprovals: account.pendingApprovals.length,
        subAccounts: {
          count: account.subAccounts.length,
          totalAllocated: totalAllocated.toFixed(2),
        },
      },
    };
  }

  async getGovernmentSignatories(id: string) {
    const signatories = await db.governmentSignatory.findMany({
      where: { governmentAccountId: id },
      include: {
        userProfile: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { signatories };
  }

  async getGovernmentApprovals(id: string, status?: string) {
    const where: any = { governmentAccountId: id };
    if (status) {
      where.status = status;
    }

    const approvals = await db.governmentApproval.findMany({
      where,
      include: {
        votes: {
          include: {
            signatory: {
              include: {
                userProfile: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        requestedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { approvals };
  }

  async getGovernmentSubAccounts(id: string) {
    const subAccounts = await db.governmentSubAccount.findMany({
      where: { governmentAccountId: id },
      orderBy: { createdAt: 'desc' },
    });

    return { subAccounts };
  }

  // ============================================
  // NPO Accounts (placeholder - tables may not exist yet)
  // ============================================

  async listNPOAccounts(params: NPOListParams) {
    const { page, limit } = params;

    // Check if NPOAccount table exists
    try {
      const accounts = await (db as any).nPOAccount?.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: true,
          wallet: {
            select: {
              walletId: true,
              cachedBalance: true,
            },
          },
        },
      });

      const total = await (db as any).nPOAccount?.count() || 0;

      return {
        accounts: accounts || [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.warn({ error }, 'NPO accounts table may not exist yet');
      return {
        accounts: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  async getNPOAccount(id: string) {
    try {
      const account = await (db as any).nPOAccount?.findUnique({
        where: { npoAccountId: id },
        include: {
          organization: true,
          wallet: {
            select: {
              walletId: true,
              cachedBalance: true,
            },
          },
        },
      });

      if (!account) {
        throw new Error('NPO account not found');
      }

      return account;
    } catch (error) {
      throw new Error('NPO account not found');
    }
  }

  async getNPODashboard(_id: string) {
    // Placeholder - return empty dashboard if table doesn't exist
    return {
      dashboard: {
        account: { walletBalance: '0' },
        programs: { activeCount: 0, progress: 0 },
        donations: {
          totalCount: 0,
          totalAmount: '0',
          last30Days: { count: 0, amount: '0' },
        },
        pendingApprovals: 0,
        signatories: { boardMembers: 0 },
      },
    };
  }

  async getNPOSignatories(_id: string) {
    return { signatories: [] };
  }

  async getNPOPrograms(_id: string) {
    return { programs: [] };
  }

  async getNPODonations(_id: string) {
    return { donations: [], totalAmount: '0' };
  }
}

export const entityAccountsService = new EntityAccountsService();
