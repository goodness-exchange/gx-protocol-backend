import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Define enum types locally since Prisma generates them at runtime
type SubAccountType =
  | 'SAVINGS' | 'EMERGENCY_FUND' | 'MORTGAGE' | 'RENT' | 'UTILITIES'
  | 'GROCERIES' | 'ENTERTAINMENT' | 'HEALTHCARE' | 'EDUCATION' | 'VACATION'
  | 'CUSTOM_PERSONAL' | 'PAYROLL' | 'OPERATING_EXPENSES' | 'TAX_RESERVE'
  | 'MARKETING' | 'EQUIPMENT' | 'INVENTORY' | 'DEPARTMENT' | 'PROJECT' | 'CUSTOM_BUSINESS';

type AllocationRuleType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'REMAINDER';
type AllocationTrigger = 'ON_DEPOSIT' | 'MANUAL' | 'SCHEDULED' | 'ON_SCHEDULE';
type AllocationFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY';

/**
 * Sub-Accounts Service
 *
 * Manages virtual sub-divisions of a wallet for budgeting purposes.
 * Sub-accounts are off-chain virtual allocations - the actual funds
 * remain in the main wallet on the blockchain.
 *
 * Features:
 * - Create and manage sub-accounts (savings, rent, utilities, etc.)
 * - Automatic fund allocation based on rules
 * - Budget tracking and goal setting
 * - Transfer between sub-accounts
 */

export interface SubAccountDTO {
  id: string;
  walletId: string;
  name: string;
  description: string | null;
  type: SubAccountType;
  icon: string | null;
  color: string | null;
  currentBalance: number;
  reservedBalance: number;
  monthlyBudget: number | null;
  monthlySpent: number;
  monthlyResetDay: number;
  goalAmount: number | null;
  goalDeadline: Date | null;
  goalName: string | null;
  goalProgress: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface CreateSubAccountDTO {
  walletId: string;
  name: string;
  description?: string;
  type: SubAccountType;
  icon?: string;
  color?: string;
  monthlyBudget?: number;
  monthlyResetDay?: number;
  goalAmount?: number;
  goalDeadline?: Date;
  goalName?: string;
}

export interface UpdateSubAccountDTO {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  monthlyBudget?: number | null;
  monthlyResetDay?: number;
  goalAmount?: number | null;
  goalDeadline?: Date | null;
  goalName?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AllocationRuleDTO {
  id: string;
  walletId: string;
  subAccountId: string;
  subAccountName: string;
  name: string;
  description: string | null;
  ruleType: AllocationRuleType;
  percentage: number | null;
  fixedAmount: number | null;
  triggerType: AllocationTrigger;
  minTriggerAmount: number | null;
  frequency: AllocationFrequency | null;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  nextScheduledAt: Date | null;
  lastExecutedAt: Date | null;
  isActive: boolean;
  priority: number;
}

export interface CreateAllocationRuleDTO {
  walletId: string;
  subAccountId: string;
  name: string;
  description?: string;
  ruleType: AllocationRuleType;
  percentage?: number;
  fixedAmount?: number;
  triggerType: AllocationTrigger;
  minTriggerAmount?: number;
  frequency?: AllocationFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  priority?: number;
}

export interface TransferDTO {
  fromSubAccountId: string;
  toSubAccountId: string;
  amount: number;
  description?: string;
}

export interface AllocationResult {
  subAccountId: string;
  subAccountName: string;
  amount: number;
  ruleId: string;
  ruleName: string;
}

class SubAccountsService {
  private readonly tenantId = 'default';

  /**
   * Get all sub-accounts for a wallet
   */
  async getSubAccounts(walletId: string): Promise<SubAccountDTO[]> {
    const subAccounts = await db.subAccount.findMany({
      where: {
        tenantId: this.tenantId,
        walletId,
      },
      orderBy: [
        { isActive: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return subAccounts.map((sa: typeof subAccounts[0]) => this.toDTO(sa));
  }

  /**
   * Get a single sub-account by ID
   */
  async getSubAccount(subAccountId: string): Promise<SubAccountDTO | null> {
    const subAccount = await db.subAccount.findUnique({
      where: { id: subAccountId },
    });

    if (!subAccount) {
      return null;
    }

    return this.toDTO(subAccount);
  }

  /**
   * Create a new sub-account
   */
  async createSubAccount(profileId: string, data: CreateSubAccountDTO): Promise<SubAccountDTO> {
    // Verify wallet belongs to user
    const wallet = await db.wallet.findFirst({
      where: {
        walletId: data.walletId,
        profileId,
        deletedAt: null,
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found or access denied');
    }

    // Check for duplicate name
    const existing = await db.subAccount.findFirst({
      where: {
        tenantId: this.tenantId,
        walletId: data.walletId,
        name: data.name,
      },
    });

    if (existing) {
      throw new Error('Sub-account with this name already exists');
    }

    // Get next sort order
    const maxSort = await db.subAccount.aggregate({
      where: { walletId: data.walletId },
      _max: { sortOrder: true },
    });

    const subAccount = await db.subAccount.create({
      data: {
        tenantId: this.tenantId,
        walletId: data.walletId,
        name: data.name,
        description: data.description,
        type: data.type,
        icon: data.icon || this.getDefaultIcon(data.type),
        color: data.color || this.getDefaultColor(data.type),
        monthlyBudget: data.monthlyBudget ? new Decimal(data.monthlyBudget) : null,
        monthlyResetDay: data.monthlyResetDay || 1,
        goalAmount: data.goalAmount ? new Decimal(data.goalAmount) : null,
        goalDeadline: data.goalDeadline,
        goalName: data.goalName,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });

    return this.toDTO(subAccount);
  }

  /**
   * Update a sub-account
   */
  async updateSubAccount(
    profileId: string,
    subAccountId: string,
    data: UpdateSubAccountDTO
  ): Promise<SubAccountDTO> {
    // Verify sub-account exists and user has access
    const subAccount = await db.subAccount.findUnique({
      where: { id: subAccountId },
      include: {
        wallet: true,
      },
    });

    if (!subAccount || subAccount.wallet.profileId !== profileId) {
      throw new Error('Sub-account not found or access denied');
    }

    const updated = await db.subAccount.update({
      where: { id: subAccountId },
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        monthlyBudget: data.monthlyBudget !== undefined
          ? (data.monthlyBudget !== null ? new Decimal(data.monthlyBudget) : null)
          : undefined,
        monthlyResetDay: data.monthlyResetDay,
        goalAmount: data.goalAmount !== undefined
          ? (data.goalAmount !== null ? new Decimal(data.goalAmount) : null)
          : undefined,
        goalDeadline: data.goalDeadline,
        goalName: data.goalName,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Delete a sub-account (returns funds to main wallet)
   */
  async deleteSubAccount(profileId: string, subAccountId: string): Promise<void> {
    const subAccount = await db.subAccount.findUnique({
      where: { id: subAccountId },
      include: {
        wallet: true,
      },
    });

    if (!subAccount || subAccount.wallet.profileId !== profileId) {
      throw new Error('Sub-account not found or access denied');
    }

    // If there's a balance, create a return transaction
    if (Number(subAccount.currentBalance) > 0) {
      await db.subAccountTransaction.create({
        data: {
          tenantId: this.tenantId,
          subAccountId,
          type: 'RETURN_TO_MAIN',
          amount: subAccount.currentBalance,
          balanceBefore: subAccount.currentBalance,
          balanceAfter: new Decimal(0),
          isCredit: false,
          description: 'Returned to main wallet on sub-account deletion',
        },
      });
    }

    // Delete allocation rules first (cascade should handle this, but be explicit)
    await db.allocationRule.deleteMany({
      where: { subAccountId },
    });

    // Delete the sub-account
    await db.subAccount.delete({
      where: { id: subAccountId },
    });
  }

  /**
   * Allocate funds to a sub-account (manual allocation)
   */
  async allocateFunds(
    profileId: string,
    subAccountId: string,
    amount: number,
    description?: string
  ): Promise<SubAccountDTO> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const subAccount = await db.subAccount.findUnique({
      where: { id: subAccountId },
      include: {
        wallet: true,
      },
    });

    if (!subAccount || subAccount.wallet.profileId !== profileId) {
      throw new Error('Sub-account not found or access denied');
    }

    // Check if wallet has sufficient unallocated balance
    const totalAllocated = await this.getTotalAllocatedBalance(subAccount.walletId);
    const walletBalance = Number(subAccount.wallet.cachedBalance);
    const available = walletBalance - totalAllocated;

    if (amount > available) {
      throw new Error(`Insufficient unallocated funds. Available: ${available}`);
    }

    // Create the allocation transaction
    const newBalance = new Decimal(Number(subAccount.currentBalance) + amount);

    await db.subAccountTransaction.create({
      data: {
        tenantId: this.tenantId,
        subAccountId,
        type: 'ALLOCATION',
        amount: new Decimal(amount),
        balanceBefore: subAccount.currentBalance,
        balanceAfter: newBalance,
        isCredit: true,
        description: description || 'Manual allocation',
      },
    });

    // Update sub-account balance
    const updated = await db.subAccount.update({
      where: { id: subAccountId },
      data: {
        currentBalance: newBalance,
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Transfer between sub-accounts
   */
  async transferBetweenSubAccounts(
    profileId: string,
    data: TransferDTO
  ): Promise<{ from: SubAccountDTO; to: SubAccountDTO }> {
    if (data.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (data.fromSubAccountId === data.toSubAccountId) {
      throw new Error('Cannot transfer to same sub-account');
    }

    // Get both sub-accounts
    const [fromAccount, toAccount] = await Promise.all([
      db.subAccount.findUnique({
        where: { id: data.fromSubAccountId },
        include: { wallet: true },
      }),
      db.subAccount.findUnique({
        where: { id: data.toSubAccountId },
        include: { wallet: true },
      }),
    ]);

    if (!fromAccount || fromAccount.wallet.profileId !== profileId) {
      throw new Error('Source sub-account not found or access denied');
    }

    if (!toAccount || toAccount.wallet.profileId !== profileId) {
      throw new Error('Destination sub-account not found or access denied');
    }

    if (fromAccount.walletId !== toAccount.walletId) {
      throw new Error('Sub-accounts must belong to the same wallet');
    }

    if (Number(fromAccount.currentBalance) < data.amount) {
      throw new Error('Insufficient balance in source sub-account');
    }

    // Perform the transfer in a transaction
    const result = await db.$transaction(async (tx: typeof db) => {
      const fromNewBalance = new Decimal(Number(fromAccount.currentBalance) - data.amount);
      const toNewBalance = new Decimal(Number(toAccount.currentBalance) + data.amount);

      // Create outgoing transaction
      await tx.subAccountTransaction.create({
        data: {
          tenantId: this.tenantId,
          subAccountId: data.fromSubAccountId,
          type: 'TRANSFER_OUT',
          amount: new Decimal(data.amount),
          balanceBefore: fromAccount.currentBalance,
          balanceAfter: fromNewBalance,
          counterpartSubAccountId: data.toSubAccountId,
          isCredit: false,
          description: data.description || `Transfer to ${toAccount.name}`,
        },
      });

      // Create incoming transaction
      await tx.subAccountTransaction.create({
        data: {
          tenantId: this.tenantId,
          subAccountId: data.toSubAccountId,
          type: 'TRANSFER_IN',
          amount: new Decimal(data.amount),
          balanceBefore: toAccount.currentBalance,
          balanceAfter: toNewBalance,
          counterpartSubAccountId: data.fromSubAccountId,
          isCredit: true,
          description: data.description || `Transfer from ${fromAccount.name}`,
        },
      });

      // Update balances
      const updatedFrom = await tx.subAccount.update({
        where: { id: data.fromSubAccountId },
        data: { currentBalance: fromNewBalance },
      });

      const updatedTo = await tx.subAccount.update({
        where: { id: data.toSubAccountId },
        data: { currentBalance: toNewBalance },
      });

      return { from: updatedFrom, to: updatedTo };
    });

    return {
      from: this.toDTO(result.from),
      to: this.toDTO(result.to),
    };
  }

  /**
   * Return funds from sub-account to main wallet
   */
  async returnToMainWallet(
    profileId: string,
    subAccountId: string,
    amount: number,
    description?: string
  ): Promise<SubAccountDTO> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const subAccount = await db.subAccount.findUnique({
      where: { id: subAccountId },
      include: { wallet: true },
    });

    if (!subAccount || subAccount.wallet.profileId !== profileId) {
      throw new Error('Sub-account not found or access denied');
    }

    if (Number(subAccount.currentBalance) < amount) {
      throw new Error('Insufficient balance in sub-account');
    }

    const newBalance = new Decimal(Number(subAccount.currentBalance) - amount);

    await db.subAccountTransaction.create({
      data: {
        tenantId: this.tenantId,
        subAccountId,
        type: 'RETURN_TO_MAIN',
        amount: new Decimal(amount),
        balanceBefore: subAccount.currentBalance,
        balanceAfter: newBalance,
        isCredit: false,
        description: description || 'Returned to main wallet',
      },
    });

    const updated = await db.subAccount.update({
      where: { id: subAccountId },
      data: { currentBalance: newBalance },
    });

    return this.toDTO(updated);
  }

  /**
   * Get sub-account transaction history
   */
  async getSubAccountTransactions(
    subAccountId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      isCredit: boolean;
      description: string | null;
      counterpartName: string | null;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const [transactions, total] = await Promise.all([
      db.subAccountTransaction.findMany({
        where: { subAccountId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.subAccountTransaction.count({
        where: { subAccountId },
      }),
    ]);

    // Get counterpart sub-account names
    const counterpartIds = transactions
      .map((tx: typeof transactions[0]) => tx.counterpartSubAccountId)
      .filter((id: string | null): id is string => id !== null);

    const counterparts = await db.subAccount.findMany({
      where: { id: { in: counterpartIds } },
      select: { id: true, name: true },
    });

    const counterpartMap = new Map(counterparts.map((c: typeof counterparts[0]) => [c.id, c.name]));

    return {
      transactions: transactions.map((tx: typeof transactions[0]) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        balanceBefore: Number(tx.balanceBefore),
        balanceAfter: Number(tx.balanceAfter),
        isCredit: tx.isCredit,
        description: tx.description,
        counterpartName: tx.counterpartSubAccountId
          ? counterpartMap.get(tx.counterpartSubAccountId) || null
          : null,
        createdAt: tx.createdAt,
      })),
      total,
    };
  }

  /**
   * Get total allocated balance across all sub-accounts for a wallet
   */
  async getTotalAllocatedBalance(walletId: string): Promise<number> {
    const result = await db.subAccount.aggregate({
      where: {
        walletId,
        isActive: true,
      },
      _sum: {
        currentBalance: true,
        reservedBalance: true,
      },
    });

    return (
      Number(result._sum.currentBalance || 0) +
      Number(result._sum.reservedBalance || 0)
    );
  }

  /**
   * Get wallet balance overview including sub-accounts
   */
  async getWalletBalanceOverview(profileId: string, walletId: string): Promise<{
    totalBalance: number;
    allocatedBalance: number;
    unallocatedBalance: number;
    subAccounts: SubAccountDTO[];
  }> {
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

    const subAccounts = await this.getSubAccounts(walletId);
    const totalBalance = Number(wallet.cachedBalance);
    const allocatedBalance = subAccounts
      .filter((sa) => sa.isActive)
      .reduce((sum, sa) => sum + sa.currentBalance, 0);

    return {
      totalBalance,
      allocatedBalance,
      unallocatedBalance: totalBalance - allocatedBalance,
      subAccounts,
    };
  }

  // =========================================================================
  // Allocation Rules
  // =========================================================================

  /**
   * Get allocation rules for a wallet
   */
  async getAllocationRules(walletId: string): Promise<AllocationRuleDTO[]> {
    const rules = await db.allocationRule.findMany({
      where: {
        tenantId: this.tenantId,
        walletId,
      },
      include: {
        subAccount: {
          select: { name: true },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return rules.map((rule: typeof rules[0]) => ({
      id: rule.id,
      walletId: rule.walletId,
      subAccountId: rule.subAccountId,
      subAccountName: rule.subAccount.name,
      name: rule.name,
      description: rule.description,
      ruleType: rule.ruleType,
      percentage: rule.percentage ? Number(rule.percentage) : null,
      fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
      triggerType: rule.triggerType,
      minTriggerAmount: rule.minTriggerAmount ? Number(rule.minTriggerAmount) : null,
      frequency: rule.frequency,
      dayOfMonth: rule.dayOfMonth,
      dayOfWeek: rule.dayOfWeek,
      nextScheduledAt: rule.nextScheduledAt,
      lastExecutedAt: rule.lastExecutedAt,
      isActive: rule.isActive,
      priority: rule.priority,
    }));
  }

  /**
   * Create an allocation rule
   */
  async createAllocationRule(
    profileId: string,
    data: CreateAllocationRuleDTO
  ): Promise<AllocationRuleDTO> {
    // Verify wallet and sub-account access
    const wallet = await db.wallet.findFirst({
      where: {
        walletId: data.walletId,
        profileId,
        deletedAt: null,
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found or access denied');
    }

    const subAccount = await db.subAccount.findFirst({
      where: {
        id: data.subAccountId,
        walletId: data.walletId,
      },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found');
    }

    // Validate rule configuration
    if (data.ruleType === 'PERCENTAGE' && (data.percentage === undefined || data.percentage <= 0 || data.percentage > 100)) {
      throw new Error('Percentage must be between 0 and 100');
    }

    if (data.ruleType === 'FIXED_AMOUNT' && (data.fixedAmount === undefined || data.fixedAmount <= 0)) {
      throw new Error('Fixed amount must be positive');
    }

    // Calculate next scheduled time for scheduled rules
    let nextScheduledAt: Date | null = null;
    if (data.triggerType === 'ON_SCHEDULE' && data.frequency) {
      nextScheduledAt = this.calculateNextScheduledTime(
        data.frequency,
        data.dayOfMonth,
        data.dayOfWeek
      );
    }

    const rule = await db.allocationRule.create({
      data: {
        tenantId: this.tenantId,
        walletId: data.walletId,
        subAccountId: data.subAccountId,
        name: data.name,
        description: data.description,
        ruleType: data.ruleType,
        percentage: data.percentage ? new Decimal(data.percentage) : null,
        fixedAmount: data.fixedAmount ? new Decimal(data.fixedAmount) : null,
        triggerType: data.triggerType,
        minTriggerAmount: data.minTriggerAmount ? new Decimal(data.minTriggerAmount) : null,
        frequency: data.frequency,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: data.dayOfWeek,
        nextScheduledAt,
        priority: data.priority || 0,
      },
      include: {
        subAccount: {
          select: { name: true },
        },
      },
    });

    return {
      id: rule.id,
      walletId: rule.walletId,
      subAccountId: rule.subAccountId,
      subAccountName: rule.subAccount.name,
      name: rule.name,
      description: rule.description,
      ruleType: rule.ruleType,
      percentage: rule.percentage ? Number(rule.percentage) : null,
      fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
      triggerType: rule.triggerType,
      minTriggerAmount: rule.minTriggerAmount ? Number(rule.minTriggerAmount) : null,
      frequency: rule.frequency,
      dayOfMonth: rule.dayOfMonth,
      dayOfWeek: rule.dayOfWeek,
      nextScheduledAt: rule.nextScheduledAt,
      lastExecutedAt: rule.lastExecutedAt,
      isActive: rule.isActive,
      priority: rule.priority,
    };
  }

  /**
   * Preview allocations for a given amount (doesn't execute)
   */
  async previewAllocations(walletId: string, amount: number): Promise<AllocationResult[]> {
    const rules = await db.allocationRule.findMany({
      where: {
        tenantId: this.tenantId,
        walletId,
        triggerType: 'ON_RECEIVE',
        isActive: true,
      },
      include: {
        subAccount: {
          select: { name: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    const results: AllocationResult[] = [];
    let remainingAmount = amount;

    for (const rule of rules) {
      // Check minimum trigger amount
      if (rule.minTriggerAmount && amount < Number(rule.minTriggerAmount)) {
        continue;
      }

      let allocationAmount = 0;

      switch (rule.ruleType) {
        case 'PERCENTAGE':
          allocationAmount = (amount * Number(rule.percentage!)) / 100;
          break;
        case 'FIXED_AMOUNT':
          allocationAmount = Math.min(Number(rule.fixedAmount!), remainingAmount);
          break;
        case 'REMAINDER':
          allocationAmount = remainingAmount;
          break;
      }

      if (allocationAmount > 0 && allocationAmount <= remainingAmount) {
        results.push({
          subAccountId: rule.subAccountId,
          subAccountName: rule.subAccount.name,
          amount: allocationAmount,
          ruleId: rule.id,
          ruleName: rule.name,
        });
        remainingAmount -= allocationAmount;
      }

      if (remainingAmount <= 0) break;
    }

    return results;
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private toDTO(subAccount: any): SubAccountDTO {
    const goalProgress = subAccount.goalAmount
      ? (Number(subAccount.currentBalance) / Number(subAccount.goalAmount)) * 100
      : null;

    return {
      id: subAccount.id,
      walletId: subAccount.walletId,
      name: subAccount.name,
      description: subAccount.description,
      type: subAccount.type,
      icon: subAccount.icon,
      color: subAccount.color,
      currentBalance: Number(subAccount.currentBalance),
      reservedBalance: Number(subAccount.reservedBalance),
      monthlyBudget: subAccount.monthlyBudget ? Number(subAccount.monthlyBudget) : null,
      monthlySpent: Number(subAccount.monthlySpent),
      monthlyResetDay: subAccount.monthlyResetDay,
      goalAmount: subAccount.goalAmount ? Number(subAccount.goalAmount) : null,
      goalDeadline: subAccount.goalDeadline,
      goalName: subAccount.goalName,
      goalProgress: goalProgress !== null ? Math.min(goalProgress, 100) : null,
      isActive: subAccount.isActive,
      sortOrder: subAccount.sortOrder,
      createdAt: subAccount.createdAt,
    };
  }

  private getDefaultIcon(type: SubAccountType): string {
    const iconMap: Record<SubAccountType, string> = {
      SAVINGS: 'piggy-bank',
      EMERGENCY_FUND: 'shield',
      MORTGAGE: 'home',
      RENT: 'building',
      UTILITIES: 'zap',
      GROCERIES: 'shopping-cart',
      ENTERTAINMENT: 'film',
      HEALTHCARE: 'heart-pulse',
      EDUCATION: 'graduation-cap',
      VACATION: 'plane',
      CUSTOM_PERSONAL: 'wallet',
      PAYROLL: 'users',
      OPERATING_EXPENSES: 'briefcase',
      TAX_RESERVE: 'file-text',
      MARKETING: 'megaphone',
      EQUIPMENT: 'tool',
      INVENTORY: 'package',
      DEPARTMENT: 'layers',
      PROJECT: 'folder',
      CUSTOM_BUSINESS: 'building-2',
    };
    return iconMap[type] || 'wallet';
  }

  private getDefaultColor(type: SubAccountType): string {
    const colorMap: Record<SubAccountType, string> = {
      SAVINGS: '#22C55E',
      EMERGENCY_FUND: '#EF4444',
      MORTGAGE: '#8B5CF6',
      RENT: '#F59E0B',
      UTILITIES: '#3B82F6',
      GROCERIES: '#10B981',
      ENTERTAINMENT: '#EC4899',
      HEALTHCARE: '#06B6D4',
      EDUCATION: '#6366F1',
      VACATION: '#F97316',
      CUSTOM_PERSONAL: '#6B7280',
      PAYROLL: '#14B8A6',
      OPERATING_EXPENSES: '#64748B',
      TAX_RESERVE: '#DC2626',
      MARKETING: '#A855F7',
      EQUIPMENT: '#78716C',
      INVENTORY: '#84CC16',
      DEPARTMENT: '#0EA5E9',
      PROJECT: '#7C3AED',
      CUSTOM_BUSINESS: '#475569',
    };
    return colorMap[type] || '#6366F1';
  }

  private calculateNextScheduledTime(
    frequency: AllocationFrequency,
    dayOfMonth?: number | null,
    dayOfWeek?: number | null
  ): Date {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        break;
      case 'WEEKLY':
        const targetDay = dayOfWeek || 0;
        const daysUntilNext = (targetDay - now.getDay() + 7) % 7 || 7;
        next.setDate(next.getDate() + daysUntilNext);
        next.setHours(0, 0, 0, 0);
        break;
      case 'BI_WEEKLY':
        next.setDate(next.getDate() + 14);
        next.setHours(0, 0, 0, 0);
        break;
      case 'MONTHLY':
        const targetDate = dayOfMonth || 1;
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(targetDate, 28));
        next.setHours(0, 0, 0, 0);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        next.setDate(dayOfMonth || 1);
        next.setHours(0, 0, 0, 0);
        break;
    }

    return next;
  }
}

export const subAccountsService = new SubAccountsService();
