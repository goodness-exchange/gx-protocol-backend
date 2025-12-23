import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '@gx/core-logger';

const prisma = new PrismaClient();

/**
 * Analytics Service
 *
 * Provides transaction analytics, spending summaries, and trend analysis.
 * Aggregates data for daily and monthly analytics tables and provides
 * real-time analytics queries.
 */

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
  /**
   * Get analytics summary for a user within a date range
   */
  async getAnalyticsSummary(
    profileId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsSummary> {
    // Get user's wallet
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get transactions within date range
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: wallet.id },
          { recipientWalletId: wallet.id },
        ],
        createdAt: {
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

    // Calculate totals
    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    let largestIncome = new Decimal(0);
    let largestExpense = new Decimal(0);
    const categoryTotals: Map<string, { amount: Decimal; count: number; category: any }> = new Map();
    const dailyData: Map<string, { income: Decimal; expense: Decimal; count: number }> = new Map();

    for (const tx of transactions) {
      const isIncome = tx.recipientWalletId === wallet.id;
      const amount = tx.amount;

      if (isIncome) {
        totalIncome = totalIncome.add(amount);
        if (amount.gt(largestIncome)) {
          largestIncome = amount;
        }
      } else {
        totalExpense = totalExpense.add(amount);
        if (amount.gt(largestExpense)) {
          largestExpense = amount;
        }
      }

      // Aggregate by category
      for (const tag of tx.tags) {
        const existing = categoryTotals.get(tag.categoryId) || {
          amount: new Decimal(0),
          count: 0,
          category: tag.category,
        };
        existing.amount = existing.amount.add(amount);
        existing.count += 1;
        categoryTotals.set(tag.categoryId, existing);
      }

      // Aggregate daily
      const dateKey = tx.createdAt.toISOString().split('T')[0];
      const dailyEntry = dailyData.get(dateKey) || {
        income: new Decimal(0),
        expense: new Decimal(0),
        count: 0,
      };
      if (isIncome) {
        dailyEntry.income = dailyEntry.income.add(amount);
      } else {
        dailyEntry.expense = dailyEntry.expense.add(amount);
      }
      dailyEntry.count += 1;
      dailyData.set(dateKey, dailyEntry);
    }

    // Calculate totals and percentages
    const totalSpending = totalExpense;
    const topCategories: SpendingByCategory[] = Array.from(categoryTotals.entries())
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get outgoing transactions with category tags
    const transactions = await prisma.transaction.findMany({
      where: {
        senderWalletId: wallet.id,
        createdAt: {
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

      for (const tag of tx.tags) {
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Get incoming transactions with category tags
    const transactions = await prisma.transaction.findMany({
      where: {
        recipientWalletId: wallet.id,
        createdAt: {
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

      for (const tag of tx.tags) {
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: wallet.id },
          { recipientWalletId: wallet.id },
        ],
        createdAt: {
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
      const isIncome = tx.recipientWalletId === wallet.id;
      const dateKey = tx.createdAt.toISOString().split('T')[0];
      const dailyEntry = dailyData.get(dateKey)!;

      if (isIncome) {
        dailyEntry.income = dailyEntry.income.add(tx.amount);
      } else {
        dailyEntry.expense = dailyEntry.expense.add(tx.amount);
      }
      dailyEntry.count += 1;
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: wallet.id },
          { recipientWalletId: wallet.id },
        ],
        createdAt: {
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
      const isIncome = tx.recipientWalletId === wallet.id;
      const monthKey = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const monthEntry = monthlyData.get(monthKey);

      if (monthEntry) {
        if (isIncome) {
          monthEntry.income = monthEntry.income.add(tx.amount);
        } else {
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
      goalAmount: string | null;
      goalProgress: number;
      budgetUsage: number;
      lastAllocation: Date | null;
    }>;
    totalAllocated: string;
    totalUnallocated: string;
  }> {
    // Verify wallet belongs to user
    const wallet = await prisma.wallet.findFirst({
      where: {
        id: walletId,
        profileId,
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const subAccounts = await prisma.subAccount.findMany({
      where: {
        walletId,
        isActive: true,
      },
      include: {
        allocations: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
    });

    let totalAllocated = new Decimal(0);

    const subAccountsWithAnalytics = subAccounts.map((sa: typeof subAccounts[0]) => {
      totalAllocated = totalAllocated.add(sa.currentBalance);

      const goalProgress = sa.goalAmount && sa.goalAmount.gt(0)
        ? parseFloat(sa.currentBalance.div(sa.goalAmount).mul(100).toFixed(2))
        : 0;

      const budgetUsage = sa.monthlyBudget && sa.monthlyBudget.gt(0)
        ? parseFloat(sa.currentBalance.div(sa.monthlyBudget).mul(100).toFixed(2))
        : 0;

      return {
        id: sa.id,
        name: sa.name,
        type: sa.type,
        currentBalance: sa.currentBalance.toString(),
        monthlyBudget: sa.monthlyBudget?.toString() || null,
        goalAmount: sa.goalAmount?.toString() || null,
        goalProgress,
        budgetUsage,
        lastAllocation: sa.allocations[0]?.executedAt || null,
      };
    });

    const totalUnallocated = wallet.balance.sub(totalAllocated);

    return {
      subAccounts: subAccountsWithAnalytics,
      totalAllocated: totalAllocated.toString(),
      totalUnallocated: totalUnallocated.toString(),
    };
  }

  /**
   * Aggregate and store daily analytics (called by cron job)
   */
  async aggregateDailyAnalytics(
    profileId: string,
    date: Date
  ): Promise<void> {
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: wallet.id },
          { recipientWalletId: wallet.id },
        ],
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    let largestTx = new Decimal(0);
    let smallestTx: Decimal | null = null;
    const uniqueContacts = new Set<string>();

    for (const tx of transactions) {
      const isIncome = tx.recipientWalletId === wallet.id;
      const amount = tx.amount;

      if (isIncome) {
        totalIncome = totalIncome.add(amount);
        if (tx.senderWalletId) uniqueContacts.add(tx.senderWalletId);
      } else {
        totalExpense = totalExpense.add(amount);
        if (tx.recipientWalletId) uniqueContacts.add(tx.recipientWalletId);
      }

      if (amount.gt(largestTx)) largestTx = amount;
      if (smallestTx === null || amount.lt(smallestTx)) smallestTx = amount;
    }

    const transactionCount = transactions.length;
    const averageTxSize = transactionCount > 0
      ? totalIncome.add(totalExpense).div(transactionCount)
      : new Decimal(0);

    // Upsert daily analytics
    await prisma.dailyAnalytics.upsert({
      where: {
        tenantId_profileId_date: {
          tenantId: wallet.tenantId,
          profileId,
          date: startOfDay,
        },
      },
      update: {
        totalIncome,
        totalExpense,
        netFlow: totalIncome.sub(totalExpense),
        transactionCount,
        averageTransactionSize: averageTxSize,
        largestTransaction: largestTx,
        smallestTransaction: smallestTx || new Decimal(0),
        uniqueContacts: uniqueContacts.size,
        updatedAt: new Date(),
      },
      create: {
        tenantId: wallet.tenantId,
        profileId,
        date: startOfDay,
        totalIncome,
        totalExpense,
        netFlow: totalIncome.sub(totalExpense),
        transactionCount,
        averageTransactionSize: averageTxSize,
        largestTransaction: largestTx,
        smallestTransaction: smallestTx || new Decimal(0),
        uniqueContacts: uniqueContacts.size,
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: wallet.id },
          { recipientWalletId: wallet.id },
        ],
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    let largestTx = new Decimal(0);
    let smallestTx: Decimal | null = null;
    const uniqueContacts = new Set<string>();
    const activeDays = new Set<string>();

    for (const tx of transactions) {
      const isIncome = tx.recipientWalletId === wallet.id;
      const amount = tx.amount;

      if (isIncome) {
        totalIncome = totalIncome.add(amount);
        if (tx.senderWalletId) uniqueContacts.add(tx.senderWalletId);
      } else {
        totalExpense = totalExpense.add(amount);
        if (tx.recipientWalletId) uniqueContacts.add(tx.recipientWalletId);
      }

      if (amount.gt(largestTx)) largestTx = amount;
      if (smallestTx === null || amount.lt(smallestTx)) smallestTx = amount;
      activeDays.add(tx.createdAt.toISOString().split('T')[0]);
    }

    const transactionCount = transactions.length;
    const averageTxSize = transactionCount > 0
      ? totalIncome.add(totalExpense).div(transactionCount)
      : new Decimal(0);

    // Get category breakdown
    const categoryBreakdown: Record<string, string> = {};
    const categoryTotals = new Map<string, Decimal>();

    for (const tx of transactions) {
      const tags = await prisma.transactionTag.findMany({
        where: { transactionId: tx.id },
        include: { category: true },
      });

      for (const tag of tags) {
        const existing = categoryTotals.get(tag.category.name) || new Decimal(0);
        categoryTotals.set(tag.category.name, existing.add(tx.amount));
      }
    }

    for (const [name, amount] of categoryTotals) {
      categoryBreakdown[name] = amount.toString();
    }

    // Upsert monthly analytics
    await prisma.monthlyAnalytics.upsert({
      where: {
        tenantId_profileId_year_month: {
          tenantId: wallet.tenantId,
          profileId,
          year,
          month,
        },
      },
      update: {
        totalIncome,
        totalExpense,
        netFlow: totalIncome.sub(totalExpense),
        transactionCount,
        averageTransactionSize: averageTxSize,
        largestTransaction: largestTx,
        smallestTransaction: smallestTx || new Decimal(0),
        uniqueContacts: uniqueContacts.size,
        activeDays: activeDays.size,
        categoryBreakdown,
        updatedAt: new Date(),
      },
      create: {
        tenantId: wallet.tenantId,
        profileId,
        year,
        month,
        totalIncome,
        totalExpense,
        netFlow: totalIncome.sub(totalExpense),
        transactionCount,
        averageTransactionSize: averageTxSize,
        largestTransaction: largestTx,
        smallestTransaction: smallestTx || new Decimal(0),
        uniqueContacts: uniqueContacts.size,
        activeDays: activeDays.size,
        categoryBreakdown,
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
    const wallet = await prisma.wallet.findFirst({
      where: { profileId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const calculatePeriod = async (start: Date, end: Date) => {
      const transactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { senderWalletId: wallet.id },
            { recipientWalletId: wallet.id },
          ],
          createdAt: { gte: start, lte: end },
        },
      });

      let income = new Decimal(0);
      let expense = new Decimal(0);

      for (const tx of transactions) {
        if (tx.recipientWalletId === wallet.id) {
          income = income.add(tx.amount);
        } else {
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
