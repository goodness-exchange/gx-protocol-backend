import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '@gx/core-logger';

/**
 * Analytics Service
 *
 * Provides transaction analytics, spending summaries, and trend analysis.
 * Aggregates data for daily and monthly analytics tables and provides
 * real-time analytics queries.
 *
 * Transaction Schema Notes:
 * - walletId: The wallet that owns this transaction record
 * - type: SENT = outgoing (expense), RECEIVED = incoming (income)
 * - counterparty: The other party's wallet ID
 * - timestamp: When the transaction occurred
 */

// Transaction types that count as income (must match OffChainTxType enum)
const INCOME_TYPES = ['RECEIVED', 'MINT', 'LOAN_DISBURSEMENT'];
// Transaction types that count as expenses (must match OffChainTxType enum)
const EXPENSE_TYPES = ['SENT', 'FEE', 'TAX', 'LOAN_REPAYMENT'];

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface SpendingByCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  totalAmount: string;
  transactionCount: number;
  percentageOfTotal: number;
}

export interface DailyTrend {
  date: string;
  totalIncome: string;
  totalExpense: string;
  netFlow: string;
  transactionCount: number;
}

export interface MonthlyTrend {
  month: string;
  year: number;
  totalIncome: string;
  totalExpense: string;
  netFlow: string;
  transactionCount: number;
  averageTransactionSize: string;
}

export interface AnalyticsSummary {
  period: DateRange;
  totalIncome: string;
  totalExpense: string;
  netFlow: string;
  transactionCount: number;
  averageTransactionSize: string;
  largestIncome: string;
  largestExpense: string;
  topCategories: SpendingByCategory[];
  dailyTrends: DailyTrend[];
}

class AnalyticsService {
  private readonly tenantId = 'default';

  /**
   * Get analytics summary for a user within a date range
   */
  async getAnalyticsSummary(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsSummary> {
    // Get user's wallet
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get transactions within date range
    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Calculate totals
    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    let largestIncome = new Decimal(0);
    let largestExpense = new Decimal(0);
    const categoryTotals: Map<string, { amount: Decimal; count: number; category: any }> = new Map();
    const dailyData: Map<string, { income: Decimal; expense: Decimal; count: number }> = new Map();

    for (const tx of transactions) {
      const isIncome = INCOME_TYPES.includes(tx.type);
      const isExpense = EXPENSE_TYPES.includes(tx.type);
      const amount = tx.amount;

      if (isIncome) {
        totalIncome = totalIncome.add(amount);
        if (amount.gt(largestIncome)) {
          largestIncome = amount;
        }
      } else if (isExpense) {
        totalExpense = totalExpense.add(amount);
        if (amount.gt(largestExpense)) {
          largestExpense = amount;
        }
      }

      // Aggregate by category (for expenses)
      if (isExpense && tx.tags) {
        for (const tag of tx.tags) {
          if (tag.category) {
            const existing = categoryTotals.get(tag.categoryId) || {
              amount: new Decimal(0),
              count: 0,
              category: tag.category,
            };
            existing.amount = existing.amount.add(amount);
            existing.count += 1;
            categoryTotals.set(tag.categoryId, existing);
          }
        }
      }

      // Aggregate daily
      const dateKey = tx.timestamp.toISOString().split('T')[0];
      const dailyEntry = dailyData.get(dateKey) || {
        income: new Decimal(0),
        expense: new Decimal(0),
        count: 0,
      };
      if (isIncome) {
        dailyEntry.income = dailyEntry.income.add(amount);
      } else if (isExpense) {
        dailyEntry.expense = dailyEntry.expense.add(amount);
      }
      dailyEntry.count += 1;
      dailyData.set(dateKey, dailyEntry);
    }

    // Calculate totals and percentages
    const topCategories: SpendingByCategory[] = Array.from(categoryTotals.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.category.name,
        categoryColor: data.category.color || '#6B7280',
        categoryIcon: data.category.icon || 'tag',
        totalAmount: data.amount.toString(),
        transactionCount: data.count,
        percentageOfTotal: totalExpense.gt(0)
          ? parseFloat(data.amount.div(totalExpense).mul(100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount))
      .slice(0, 10);

    // Format daily trends
    const dailyTrends: DailyTrend[] = Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        totalIncome: data.income.toString(),
        totalExpense: data.expense.toString(),
        netFlow: data.income.sub(data.expense).toString(),
        transactionCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const netFlow = totalIncome.sub(totalExpense);
    const transactionCount = transactions.length;
    const averageTransactionSize = transactionCount > 0
      ? totalIncome.add(totalExpense).div(transactionCount)
      : new Decimal(0);

    return {
      period: { startDate, endDate },
      totalIncome: totalIncome.toString(),
      totalExpense: totalExpense.toString(),
      netFlow: netFlow.toString(),
      transactionCount,
      averageTransactionSize: averageTransactionSize.toString(),
      largestIncome: largestIncome.toString(),
      largestExpense: largestExpense.toString(),
      topCategories,
      dailyTrends,
    };
  }

  /**
   * Get spending breakdown by category
   */
  async getSpendingByCategory(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<SpendingByCategory[]> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get outgoing transactions with category tags
    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        type: { in: EXPENSE_TYPES as any },
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    const categoryTotals: Map<string, { amount: Decimal; count: number; category: any }> = new Map();
    let totalSpending = new Decimal(0);

    for (const tx of transactions) {
      totalSpending = totalSpending.add(tx.amount);

      if (tx.tags) {
        for (const tag of tx.tags) {
          if (tag.category) {
            const existing = categoryTotals.get(tag.categoryId) || {
              amount: new Decimal(0),
              count: 0,
              category: tag.category,
            };
            existing.amount = existing.amount.add(tx.amount);
            existing.count += 1;
            categoryTotals.set(tag.categoryId, existing);
          }
        }
      }
    }

    return Array.from(categoryTotals.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.category.name,
        categoryColor: data.category.color || '#6B7280',
        categoryIcon: data.category.icon || 'tag',
        totalAmount: data.amount.toString(),
        transactionCount: data.count,
        percentageOfTotal: totalSpending.gt(0)
          ? parseFloat(data.amount.div(totalSpending).mul(100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount));
  }

  /**
   * Get income breakdown by source/category
   */
  async getIncomeBySource(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<SpendingByCategory[]> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get incoming transactions with category tags
    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        type: { in: INCOME_TYPES as any },
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    const categoryTotals: Map<string, { amount: Decimal; count: number; category: any }> = new Map();
    let totalIncome = new Decimal(0);

    for (const tx of transactions) {
      totalIncome = totalIncome.add(tx.amount);

      if (tx.tags) {
        for (const tag of tx.tags) {
          if (tag.category) {
            const existing = categoryTotals.get(tag.categoryId) || {
              amount: new Decimal(0),
              count: 0,
              category: tag.category,
            };
            existing.amount = existing.amount.add(tx.amount);
            existing.count += 1;
            categoryTotals.set(tag.categoryId, existing);
          }
        }
      }
    }

    return Array.from(categoryTotals.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.category.name,
        categoryColor: data.category.color || '#6B7280',
        categoryIcon: data.category.icon || 'tag',
        totalAmount: data.amount.toString(),
        transactionCount: data.count,
        percentageOfTotal: totalIncome.gt(0)
          ? parseFloat(data.amount.div(totalIncome).mul(100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount));
  }

  /**
   * Get daily transaction trends
   */
  async getDailyTrends(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyTrend[]> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const dailyData: Map<string, { income: Decimal; expense: Decimal; count: number }> = new Map();

    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      dailyData.set(dateKey, {
        income: new Decimal(0),
        expense: new Decimal(0),
        count: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const tx of transactions) {
      const isIncome = INCOME_TYPES.includes(tx.type);
      const isExpense = EXPENSE_TYPES.includes(tx.type);
      const dateKey = tx.timestamp.toISOString().split('T')[0];
      const dailyEntry = dailyData.get(dateKey);

      if (dailyEntry) {
        if (isIncome) {
          dailyEntry.income = dailyEntry.income.add(tx.amount);
        } else if (isExpense) {
          dailyEntry.expense = dailyEntry.expense.add(tx.amount);
        }
        dailyEntry.count += 1;
      }
    }

    return Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        totalIncome: data.income.toString(),
        totalExpense: data.expense.toString(),
        netFlow: data.income.sub(data.expense).toString(),
        transactionCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get monthly transaction trends
   */
  async getMonthlyTrends(
    profileId: string,
    months: number = 12
  ): Promise<MonthlyTrend[]> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const monthlyData: Map<string, { income: Decimal; expense: Decimal; count: number }> = new Map();

    // Initialize all months in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyData.set(monthKey, {
        income: new Decimal(0),
        expense: new Decimal(0),
        count: 0,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    for (const tx of transactions) {
      const isIncome = INCOME_TYPES.includes(tx.type);
      const isExpense = EXPENSE_TYPES.includes(tx.type);
      const monthKey = `${tx.timestamp.getFullYear()}-${String(tx.timestamp.getMonth() + 1).padStart(2, '0')}`;
      const monthEntry = monthlyData.get(monthKey);

      if (monthEntry) {
        if (isIncome) {
          monthEntry.income = monthEntry.income.add(tx.amount);
        } else if (isExpense) {
          monthEntry.expense = monthEntry.expense.add(tx.amount);
        }
        monthEntry.count += 1;
      }
    }

    return Array.from(monthlyData.entries())
      .map(([monthKey, data]) => {
        const [year] = monthKey.split('-');
        const totalVolume = data.income.add(data.expense);
        return {
          month: monthKey,
          year: parseInt(year),
          totalIncome: data.income.toString(),
          totalExpense: data.expense.toString(),
          netFlow: data.income.sub(data.expense).toString(),
          transactionCount: data.count,
          averageTransactionSize: data.count > 0
            ? totalVolume.div(data.count).toString()
            : '0',
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Get sub-account analytics
   */
  async getSubAccountAnalytics(
    profileId: string,
    walletId: string
  ): Promise<{
    subAccounts: Array<{
      id: string;
      name: string;
      type: string;
      currentBalance: string;
      monthlyBudget: string | null;
      monthlySpent: string;
      goalAmount: string | null;
      goalProgress: number;
      budgetUsage: number;
    }>;
    totalAllocated: string;
    totalUnallocated: string;
    walletBalance: string;
  }> {
    // Verify wallet belongs to user
    const wallet = await db.wallet.findFirst({
      where: {
        walletId,
        profileId,
        deletedAt: null,
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const subAccounts = await db.subAccount.findMany({
      where: {
        walletId,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    let totalAllocated = new Decimal(0);

    const subAccountsWithAnalytics = subAccounts.map((sa: typeof subAccounts[0]) => {
      totalAllocated = totalAllocated.add(sa.currentBalance);

      const goalProgress = sa.goalAmount && sa.goalAmount.gt(0)
        ? Math.min(parseFloat(sa.currentBalance.div(sa.goalAmount).mul(100).toFixed(2)), 100)
        : 0;

      const budgetUsage = sa.monthlyBudget && sa.monthlyBudget.gt(0)
        ? parseFloat(sa.monthlySpent.div(sa.monthlyBudget).mul(100).toFixed(2))
        : 0;

      return {
        id: sa.id,
        name: sa.name,
        type: sa.type,
        currentBalance: sa.currentBalance.toString(),
        monthlyBudget: sa.monthlyBudget?.toString() || null,
        monthlySpent: sa.monthlySpent.toString(),
        goalAmount: sa.goalAmount?.toString() || null,
        goalProgress,
        budgetUsage,
      };
    });

    const walletBalance = Number(wallet.cachedBalance);
    const totalUnallocated = new Decimal(walletBalance).sub(totalAllocated);

    return {
      subAccounts: subAccountsWithAnalytics,
      totalAllocated: totalAllocated.toString(),
      totalUnallocated: totalUnallocated.toString(),
      walletBalance: walletBalance.toString(),
    };
  }

  /**
   * Aggregate and store daily analytics (called by cron job)
   */
  async aggregateDailyAnalytics(
    profileId: string,
    date: Date
  ): Promise<void> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let totalSent = new Decimal(0);
    let totalReceived = new Decimal(0);
    let totalFees = new Decimal(0);
    let sendCount = 0;
    let receiveCount = 0;

    for (const tx of transactions) {
      if (INCOME_TYPES.includes(tx.type)) {
        totalReceived = totalReceived.add(tx.amount);
        receiveCount += 1;
      } else if (EXPENSE_TYPES.includes(tx.type)) {
        if (tx.type === 'FEE') {
          totalFees = totalFees.add(tx.amount);
        } else {
          totalSent = totalSent.add(tx.amount);
        }
        sendCount += 1;
      }
    }

    const netFlow = totalReceived.sub(totalSent).sub(totalFees);

    // Upsert daily analytics
    await db.dailyAnalytics.upsert({
      where: {
        tenantId_walletId_date: {
          tenantId: this.tenantId,
          walletId: wallet.walletId,
          date: startOfDay,
        },
      },
      update: {
        profileId,
        totalSent,
        totalReceived,
        netFlow,
        sendCount,
        receiveCount,
        totalFees,
        openingBalance: wallet.cachedBalance,
        closingBalance: wallet.cachedBalance,
        updatedAt: new Date(),
      },
      create: {
        tenantId: this.tenantId,
        profileId,
        walletId: wallet.walletId,
        date: startOfDay,
        totalSent,
        totalReceived,
        netFlow,
        sendCount,
        receiveCount,
        totalFees,
        openingBalance: wallet.cachedBalance,
        closingBalance: wallet.cachedBalance,
      },
    });

    logger.info({ profileId, date: startOfDay }, 'Daily analytics aggregated');
  }

  /**
   * Aggregate and store monthly analytics (called by cron job)
   */
  async aggregateMonthlyAnalytics(
    profileId: string,
    year: number,
    month: number
  ): Promise<void> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await db.transaction.findMany({
      where: {
        walletId: wallet.walletId,
        timestamp: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    let totalSent = new Decimal(0);
    let totalReceived = new Decimal(0);
    let totalFees = new Decimal(0);
    let sendCount = 0;
    let receiveCount = 0;
    let largestSent = new Decimal(0);
    let largestReceived = new Decimal(0);
    const uniqueCounterparties = new Set<string>();

    for (const tx of transactions) {
      uniqueCounterparties.add(tx.counterparty);

      if (INCOME_TYPES.includes(tx.type)) {
        totalReceived = totalReceived.add(tx.amount);
        receiveCount += 1;
        if (tx.amount.gt(largestReceived)) {
          largestReceived = tx.amount;
        }
      } else if (EXPENSE_TYPES.includes(tx.type)) {
        if (tx.type === 'FEE') {
          totalFees = totalFees.add(tx.amount);
        } else {
          totalSent = totalSent.add(tx.amount);
          if (tx.amount.gt(largestSent)) {
            largestSent = tx.amount;
          }
        }
        sendCount += 1;
      }
    }

    const netFlow = totalReceived.sub(totalSent).sub(totalFees);
    const totalTransactions = sendCount + receiveCount;
    const avgTransactionSize = totalTransactions > 0
      ? totalSent.add(totalReceived).div(totalTransactions)
      : new Decimal(0);

    // Upsert monthly analytics
    await db.monthlyAnalytics.upsert({
      where: {
        tenantId_walletId_year_month: {
          tenantId: this.tenantId,
          walletId: wallet.walletId,
          year,
          month,
        },
      },
      update: {
        profileId,
        totalSent,
        totalReceived,
        netFlow,
        sendCount,
        receiveCount,
        totalFees,
        avgTransactionSize,
        largestSent,
        largestReceived,
        uniqueCounterparties: uniqueCounterparties.size,
        openingBalance: wallet.cachedBalance,
        closingBalance: wallet.cachedBalance,
        updatedAt: new Date(),
      },
      create: {
        tenantId: this.tenantId,
        profileId,
        walletId: wallet.walletId,
        year,
        month,
        totalSent,
        totalReceived,
        netFlow,
        sendCount,
        receiveCount,
        totalFees,
        avgTransactionSize,
        largestSent,
        largestReceived,
        uniqueCounterparties: uniqueCounterparties.size,
        openingBalance: wallet.cachedBalance,
        closingBalance: wallet.cachedBalance,
      },
    });

    logger.info({ profileId, year, month }, 'Monthly analytics aggregated');
  }

  /**
   * Get comparison between two periods
   */
  async getPeriodComparison(
    profileId: string,
    currentStart: Date,
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date
  ): Promise<{
    current: { income: string; expense: string; netFlow: string; count: number };
    previous: { income: string; expense: string; netFlow: string; count: number };
    changes: {
      incomeChange: number;
      expenseChange: number;
      netFlowChange: number;
      countChange: number;
    };
  }> {
    const wallet = await db.wallet.findFirst({
      where: { profileId, deletedAt: null },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const calculatePeriod = async (start: Date, end: Date) => {
      const transactions = await db.transaction.findMany({
        where: {
          walletId: wallet.walletId,
          timestamp: { gte: start, lte: end },
        },
      });

      let income = new Decimal(0);
      let expense = new Decimal(0);

      for (const tx of transactions) {
        if (INCOME_TYPES.includes(tx.type)) {
          income = income.add(tx.amount);
        } else if (EXPENSE_TYPES.includes(tx.type)) {
          expense = expense.add(tx.amount);
        }
      }

      return {
        income: income.toString(),
        expense: expense.toString(),
        netFlow: income.sub(expense).toString(),
        count: transactions.length,
      };
    };

    const current = await calculatePeriod(currentStart, currentEnd);
    const previous = await calculatePeriod(previousStart, previousEnd);

    const calculateChange = (curr: string, prev: string): number => {
      const currNum = parseFloat(curr);
      const prevNum = parseFloat(prev);
      if (prevNum === 0) return currNum > 0 ? 100 : 0;
      return parseFloat(((currNum - prevNum) / prevNum * 100).toFixed(2));
    };

    return {
      current,
      previous,
      changes: {
        incomeChange: calculateChange(current.income, previous.income),
        expenseChange: calculateChange(current.expense, previous.expense),
        netFlowChange: calculateChange(current.netFlow, previous.netFlow),
        countChange: calculateChange(String(current.count), String(previous.count)),
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
