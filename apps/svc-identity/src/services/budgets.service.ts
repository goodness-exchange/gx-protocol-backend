/**
 * Budget Service
 * Manages budget periods, spending tracking, and budget status updates
 * Phase 2: Personal Finance Features
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type for budget period with sub-account
interface BudgetPeriodWithSubAccount {
  id: string;
  tenantId: string;
  walletId: string;
  subAccountId: string | null;
  periodType: string;
  startDate: Date;
  endDate: Date;
  budgetAmount: Decimal;
  spentAmount: Decimal;
  remainingAmount: Decimal;
  status: string;
  alertThreshold: Decimal;
  alertSent: boolean;
  alertSentAt: Date | null;
  subAccount?: {
    id: string;
    name: string;
    type: string;
    icon?: string;
    color?: string;
  } | null;
}

// Local enum definitions to match Prisma schema
type BudgetPeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
type BudgetStatus = 'ON_TRACK' | 'WARNING' | 'EXCEEDED' | 'COMPLETED';

interface CreateBudgetPeriodInput {
  tenantId: string;
  walletId: string;
  subAccountId?: string;
  periodType: BudgetPeriodType;
  budgetAmount: number;
  startDate?: Date;
  endDate?: Date;
  alertThreshold?: number;
}

interface UpdateBudgetPeriodInput {
  budgetAmount?: number;
  alertThreshold?: number;
  status?: BudgetStatus;
}

interface BudgetSummary {
  totalBudget: string;
  totalSpent: string;
  totalRemaining: string;
  percentUsed: number;
  status: BudgetStatus;
  budgetPeriods: Array<{
    id: string;
    name: string;
    subAccountId: string | null;
    budgetAmount: string;
    spentAmount: string;
    remainingAmount: string;
    percentUsed: number;
    status: BudgetStatus;
    startDate: Date;
    endDate: Date;
  }>;
}

export class BudgetService {
  /**
   * Calculate period dates based on type
   */
  private calculatePeriodDates(
    periodType: BudgetPeriodType,
    startDate?: Date
  ): { start: Date; end: Date } {
    const start = startDate || new Date();
    start.setHours(0, 0, 0, 0);

    let end: Date;

    switch (periodType) {
      case 'WEEKLY':
        end = new Date(start);
        end.setDate(end.getDate() + 7);
        break;
      case 'MONTHLY':
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        break;
      case 'QUARTERLY':
        end = new Date(start);
        end.setMonth(end.getMonth() + 3);
        break;
      case 'YEARLY':
        end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        break;
      case 'CUSTOM':
      default:
        end = new Date(start);
        end.setMonth(end.getMonth() + 1); // Default to 1 month for custom
    }

    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Create a new budget period
   */
  async createBudgetPeriod(input: CreateBudgetPeriodInput) {
    const { tenantId, walletId, subAccountId, periodType, budgetAmount, alertThreshold = 80 } = input;

    // Calculate dates if not provided
    const dates = this.calculatePeriodDates(periodType, input.startDate);
    const startDate = input.startDate || dates.start;
    const endDate = input.endDate || dates.end;

    // Check for overlapping budget periods
    const existingBudget = await db.budgetPeriod.findFirst({
      where: {
        tenantId,
        walletId,
        subAccountId: subAccountId || null,
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
    });

    if (existingBudget) {
      throw new Error('A budget period already exists for this time range');
    }

    const budgetPeriod = await db.budgetPeriod.create({
      data: {
        tenantId,
        walletId,
        subAccountId,
        periodType,
        startDate,
        endDate,
        budgetAmount: new Decimal(budgetAmount),
        spentAmount: new Decimal(0),
        remainingAmount: new Decimal(budgetAmount),
        status: 'ON_TRACK',
        alertThreshold: new Decimal(alertThreshold),
      },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return budgetPeriod;
  }

  /**
   * Get budget period by ID
   */
  async getBudgetPeriod(tenantId: string, budgetId: string) {
    return db.budgetPeriod.findFirst({
      where: {
        id: budgetId,
        tenantId,
      },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            currentBalance: true,
          },
        },
      },
    });
  }

  /**
   * List budget periods for a wallet
   */
  async listBudgetPeriods(
    tenantId: string,
    walletId: string,
    options?: {
      subAccountId?: string;
      status?: BudgetStatus;
      active?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const { subAccountId, status, active = true, limit = 20, offset = 0 } = options || {};

    const where: Record<string, unknown> = {
      tenantId,
      walletId,
    };

    if (subAccountId !== undefined) {
      where.subAccountId = subAccountId;
    }

    if (status) {
      where.status = status;
    }

    if (active) {
      const now = new Date();
      where.startDate = { lte: now };
      where.endDate = { gte: now };
    }

    const [budgetPeriods, total] = await Promise.all([
      db.budgetPeriod.findMany({
        where,
        include: {
          subAccount: {
            select: {
              id: true,
              name: true,
              type: true,
              icon: true,
              color: true,
            },
          },
        },
        orderBy: [
          { startDate: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      }),
      db.budgetPeriod.count({ where }),
    ]);

    return {
      budgetPeriods,
      total,
      limit,
      offset,
    };
  }

  /**
   * Update a budget period
   */
  async updateBudgetPeriod(
    tenantId: string,
    budgetId: string,
    input: UpdateBudgetPeriodInput
  ) {
    const existingBudget = await this.getBudgetPeriod(tenantId, budgetId);
    if (!existingBudget) {
      throw new Error('Budget period not found');
    }

    const updateData: Record<string, unknown> = {};

    if (input.budgetAmount !== undefined) {
      updateData.budgetAmount = new Decimal(input.budgetAmount);
      // Recalculate remaining
      const currentSpent = existingBudget.spentAmount;
      updateData.remainingAmount = new Decimal(input.budgetAmount).minus(currentSpent);
    }

    if (input.alertThreshold !== undefined) {
      updateData.alertThreshold = new Decimal(input.alertThreshold);
    }

    if (input.status) {
      updateData.status = input.status;
    }

    const updatedBudget = await db.budgetPeriod.update({
      where: { id: budgetId },
      data: updateData,
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return updatedBudget;
  }

  /**
   * Delete a budget period
   */
  async deleteBudgetPeriod(tenantId: string, budgetId: string) {
    const existingBudget = await this.getBudgetPeriod(tenantId, budgetId);
    if (!existingBudget) {
      throw new Error('Budget period not found');
    }

    await db.budgetPeriod.delete({
      where: { id: budgetId },
    });

    return { success: true };
  }

  /**
   * Record spending against a budget
   * Called when a transaction is made from a sub-account or wallet
   */
  async recordSpending(
    tenantId: string,
    walletId: string,
    amount: number,
    subAccountId?: string
  ) {
    const now = new Date();

    // Find active budget periods for this wallet/sub-account
    const activeBudgets = await db.budgetPeriod.findMany({
      where: {
        tenantId,
        walletId,
        subAccountId: subAccountId || null,
        startDate: { lte: now },
        endDate: { gte: now },
        status: { not: 'COMPLETED' },
      },
    });

    const updates: Promise<unknown>[] = [];

    for (const budget of activeBudgets) {
      const newSpent = budget.spentAmount.plus(new Decimal(amount));
      const newRemaining = budget.budgetAmount.minus(newSpent);

      // Calculate percentage used
      const percentUsed = newSpent.dividedBy(budget.budgetAmount).times(100).toNumber();

      // Determine new status
      let newStatus: BudgetStatus = 'ON_TRACK';
      let alertSent = budget.alertSent;
      let alertSentAt = budget.alertSentAt;

      if (newRemaining.lessThan(0)) {
        newStatus = 'EXCEEDED';
      } else if (percentUsed >= budget.alertThreshold.toNumber()) {
        newStatus = 'WARNING';
        if (!budget.alertSent) {
          alertSent = true;
          alertSentAt = now;
          // TODO: Trigger notification
        }
      }

      updates.push(
        db.budgetPeriod.update({
          where: { id: budget.id },
          data: {
            spentAmount: newSpent,
            remainingAmount: newRemaining,
            status: newStatus,
            alertSent,
            alertSentAt,
          },
        })
      );
    }

    await Promise.all(updates);

    return activeBudgets.length;
  }

  /**
   * Get budget summary for a wallet
   */
  async getBudgetSummary(
    tenantId: string,
    walletId: string,
    periodType?: BudgetPeriodType
  ): Promise<BudgetSummary> {
    const now = new Date();

    const where: Record<string, unknown> = {
      tenantId,
      walletId,
      startDate: { lte: now },
      endDate: { gte: now },
    };

    if (periodType) {
      where.periodType = periodType;
    }

    const activeBudgets = await db.budgetPeriod.findMany({
      where,
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalBudget = new Decimal(0);
    let totalSpent = new Decimal(0);
    let totalRemaining = new Decimal(0);
    let overallStatus: BudgetStatus = 'ON_TRACK';

    const budgetPeriods = activeBudgets.map((budget: BudgetPeriodWithSubAccount) => {
      totalBudget = totalBudget.plus(budget.budgetAmount);
      totalSpent = totalSpent.plus(budget.spentAmount);
      totalRemaining = totalRemaining.plus(budget.remainingAmount);

      if (budget.status === 'EXCEEDED') {
        overallStatus = 'EXCEEDED';
      } else if (budget.status === 'WARNING' && overallStatus !== 'EXCEEDED') {
        overallStatus = 'WARNING';
      }

      const percentUsed = budget.budgetAmount.isZero()
        ? 0
        : budget.spentAmount.dividedBy(budget.budgetAmount).times(100).toNumber();

      return {
        id: budget.id,
        name: budget.subAccount?.name || 'Overall Budget',
        subAccountId: budget.subAccountId,
        budgetAmount: budget.budgetAmount.toString(),
        spentAmount: budget.spentAmount.toString(),
        remainingAmount: budget.remainingAmount.toString(),
        percentUsed: Math.round(percentUsed * 100) / 100,
        status: budget.status as BudgetStatus,
        startDate: budget.startDate,
        endDate: budget.endDate,
      };
    });

    const overallPercentUsed = totalBudget.isZero()
      ? 0
      : totalSpent.dividedBy(totalBudget).times(100).toNumber();

    return {
      totalBudget: totalBudget.toString(),
      totalSpent: totalSpent.toString(),
      totalRemaining: totalRemaining.toString(),
      percentUsed: Math.round(overallPercentUsed * 100) / 100,
      status: overallStatus,
      budgetPeriods,
    };
  }

  /**
   * Auto-create monthly budget periods for sub-accounts
   * Should be called by a scheduled job at month start
   */
  async autoCreateMonthlyBudgets(tenantId: string, walletId: string) {
    // Get sub-accounts with monthly budgets configured
    const subAccounts = await db.subAccount.findMany({
      where: {
        tenantId,
        walletId,
        isActive: true,
        monthlyBudget: { not: null },
      },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const created: unknown[] = [];

    for (const subAccount of subAccounts) {
      if (!subAccount.monthlyBudget) continue;

      // Check if budget already exists for this month
      const existingBudget = await db.budgetPeriod.findFirst({
        where: {
          tenantId,
          walletId,
          subAccountId: subAccount.id,
          periodType: 'MONTHLY',
          startDate: monthStart,
        },
      });

      if (!existingBudget) {
        const newBudget = await this.createBudgetPeriod({
          tenantId,
          walletId,
          subAccountId: subAccount.id,
          periodType: 'MONTHLY',
          budgetAmount: subAccount.monthlyBudget.toNumber(),
          startDate: monthStart,
          endDate: monthEnd,
        });
        created.push(newBudget);
      }
    }

    return created;
  }

  /**
   * Check all active budgets for alerts
   * Should be run periodically (e.g., hourly)
   */
  async checkBudgetAlerts(tenantId: string) {
    const now = new Date();

    const budgetsNeedingAlert = await db.budgetPeriod.findMany({
      where: {
        tenantId,
        startDate: { lte: now },
        endDate: { gte: now },
        alertSent: false,
        status: { in: ['WARNING', 'EXCEEDED'] },
      },
      include: {
        wallet: {
          select: {
            profileId: true,
          },
        },
        subAccount: {
          select: {
            name: true,
          },
        },
      },
    });

    const alerts: Array<{
      budgetId: string;
      profileId: string;
      subAccountName: string | null;
      status: string;
      percentUsed: number;
    }> = [];

    for (const budget of budgetsNeedingAlert) {
      const percentUsed = budget.budgetAmount.isZero()
        ? 0
        : budget.spentAmount.dividedBy(budget.budgetAmount).times(100).toNumber();

      alerts.push({
        budgetId: budget.id,
        profileId: budget.wallet.profileId,
        subAccountName: budget.subAccount?.name || null,
        status: budget.status,
        percentUsed,
      });

      // Mark alert as sent
      await db.budgetPeriod.update({
        where: { id: budget.id },
        data: {
          alertSent: true,
          alertSentAt: now,
        },
      });

      // TODO: Create notification
      // await notificationService.createBudgetAlert(...)
    }

    return alerts;
  }

  /**
   * Complete expired budget periods
   * Should be run daily
   */
  async completeExpiredBudgets() {
    const now = new Date();

    const expiredBudgets = await db.budgetPeriod.updateMany({
      where: {
        endDate: { lt: now },
        status: { not: 'COMPLETED' },
      },
      data: {
        status: 'COMPLETED',
      },
    });

    return expiredBudgets.count;
  }
}

export const budgetService = new BudgetService();
