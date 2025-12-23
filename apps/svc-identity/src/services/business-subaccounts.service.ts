/**
 * Business Sub-Accounts Service
 *
 * Phase 3: Business & Enterprise Features
 *
 * Manages virtual fund allocations for business accounts including:
 * - Department/project-based sub-accounts
 * - Budget management for business sub-accounts
 * - Transaction tracking within sub-accounts
 * - Approval workflows for high-value transactions
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums (stored as strings in DB)
type BusinessSubAccountType =
  | 'PAYROLL' | 'OPERATING_EXPENSES' | 'TAX_RESERVE' | 'MARKETING' | 'SALES'
  | 'R_AND_D' | 'EQUIPMENT' | 'INVENTORY' | 'DEPARTMENT' | 'PROJECT'
  | 'CLIENT_ESCROW' | 'VENDOR_PAYMENTS' | 'CUSTOM_BUSINESS';

type BusinessSubAccountTxType =
  | 'ALLOCATION' | 'EXPENSE' | 'RETURN_TO_MAIN' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'PAYROLL_PAYMENT' | 'VENDOR_PAYMENT' | 'ADJUSTMENT';

type BudgetPeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
type BudgetStatus = 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED' | 'COMPLETED';

// ============================================
// Types & Interfaces
// ============================================

interface CreateBusinessSubAccountInput {
  tenantId: string;
  businessAccountId: string;
  name: string;
  description?: string;
  type: BusinessSubAccountType;
  departmentId?: string;
  projectId?: string;
  costCenter?: string;
  annualBudget?: number;
  monthlyBudget?: number;
  requiresApproval?: boolean;
  approvalThreshold?: number;
  managerId?: string;
  allowedUserIds?: string[];
  icon?: string;
  color?: string;
}

interface UpdateBusinessSubAccountInput {
  name?: string;
  description?: string;
  departmentId?: string;
  projectId?: string;
  costCenter?: string;
  annualBudget?: number;
  monthlyBudget?: number;
  requiresApproval?: boolean;
  approvalThreshold?: number;
  managerId?: string;
  allowedUserIds?: string[];
  icon?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface BusinessSubAccountAllocationInput {
  tenantId: string;
  businessSubAccountId: string;
  amount: number;
  description?: string;
  reference?: string;
  createdById: string;
}

interface BusinessSubAccountExpenseInput {
  tenantId: string;
  businessSubAccountId: string;
  amount: number;
  description?: string;
  reference?: string;
  vendorName?: string;
  createdById: string;
  approvedById?: string;
}

interface CreateBudgetPeriodInput {
  tenantId: string;
  businessSubAccountId: string;
  periodType: BudgetPeriodType;
  startDate: Date;
  endDate: Date;
  budgetAmount: number;
  alertThreshold?: number;
}

interface BusinessSubAccountWithStats {
  id: string;
  tenantId: string;
  businessAccountId: string;
  name: string;
  description: string | null;
  type: BusinessSubAccountType;
  departmentId: string | null;
  projectId: string | null;
  costCenter: string | null;
  annualBudget: Decimal | null;
  monthlyBudget: Decimal | null;
  currentBalance: Decimal;
  requiresApproval: boolean;
  approvalThreshold: Decimal | null;
  managerId: string | null;
  allowedUserIds: string[];
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  currentBudgetPeriod?: {
    id: string;
    budgetAmount: Decimal;
    spentAmount: Decimal;
    remainingAmount: Decimal;
    status: BudgetStatus;
  } | null;
  transactionCount?: number;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get all sub-accounts for a business account
 */
export async function getBusinessSubAccounts(
  tenantId: string,
  businessAccountId: string,
  options?: { includeInactive?: boolean; type?: BusinessSubAccountType }
): Promise<BusinessSubAccountWithStats[]> {
  const where: any = {
    tenantId,
    businessAccountId,
  };

  if (!options?.includeInactive) {
    where.isActive = true;
  }

  if (options?.type) {
    where.type = options.type;
  }

  const subAccounts = await db.businessSubAccount.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      budgetPeriods: {
        where: {
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        take: 1,
      },
      _count: {
        select: { transactions: true },
      },
    },
  });

  return subAccounts.map((sa: any) => ({
    ...sa,
    currentBudgetPeriod: sa.budgetPeriods[0] || null,
    transactionCount: sa._count.transactions,
    budgetPeriods: undefined,
    _count: undefined,
  })) as BusinessSubAccountWithStats[];
}

/**
 * Get a single business sub-account by ID
 */
export async function getBusinessSubAccount(
  tenantId: string,
  id: string
): Promise<BusinessSubAccountWithStats | null> {
  const subAccount = await db.businessSubAccount.findFirst({
    where: { tenantId, id },
    include: {
      budgetPeriods: {
        where: {
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        take: 1,
      },
      _count: {
        select: { transactions: true },
      },
    },
  });

  if (!subAccount) return null;

  return {
    ...subAccount,
    currentBudgetPeriod: subAccount.budgetPeriods[0] || null,
    transactionCount: subAccount._count.transactions,
    budgetPeriods: undefined,
    _count: undefined,
  } as BusinessSubAccountWithStats;
}

/**
 * Create a new business sub-account
 */
export async function createBusinessSubAccount(
  input: CreateBusinessSubAccountInput
): Promise<BusinessSubAccountWithStats> {
  // Verify business account exists and user has access
  const businessAccount = await db.businessAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
    },
  });

  if (!businessAccount) {
    throw new Error('Business account not found or access denied');
  }

  // Check for duplicate name
  const existing = await db.businessSubAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      name: input.name,
    },
  });

  if (existing) {
    throw new Error('A sub-account with this name already exists');
  }

  const subAccount = await db.businessSubAccount.create({
    data: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      name: input.name,
      description: input.description,
      type: input.type,
      departmentId: input.departmentId,
      projectId: input.projectId,
      costCenter: input.costCenter,
      annualBudget: input.annualBudget ? new Decimal(input.annualBudget) : null,
      monthlyBudget: input.monthlyBudget ? new Decimal(input.monthlyBudget) : null,
      requiresApproval: input.requiresApproval ?? false,
      approvalThreshold: input.approvalThreshold ? new Decimal(input.approvalThreshold) : null,
      managerId: input.managerId,
      allowedUserIds: input.allowedUserIds ?? [],
      icon: input.icon,
      color: input.color,
    },
  });

  return {
    ...subAccount,
    currentBudgetPeriod: null,
    transactionCount: 0,
  };
}

/**
 * Update a business sub-account
 */
export async function updateBusinessSubAccount(
  tenantId: string,
  id: string,
  input: UpdateBusinessSubAccountInput
): Promise<BusinessSubAccountWithStats> {
  // Verify sub-account exists
  const existing = await db.businessSubAccount.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Business sub-account not found');
  }

  // Check for duplicate name if name is being changed
  if (input.name && input.name !== existing.name) {
    const duplicate = await db.businessSubAccount.findFirst({
      where: {
        tenantId,
        businessAccountId: existing.businessAccountId,
        name: input.name,
        id: { not: id },
      },
    });

    if (duplicate) {
      throw new Error('A sub-account with this name already exists');
    }
  }

  const subAccount = await db.businessSubAccount.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.costCenter !== undefined && { costCenter: input.costCenter }),
      ...(input.annualBudget !== undefined && { annualBudget: input.annualBudget ? new Decimal(input.annualBudget) : null }),
      ...(input.monthlyBudget !== undefined && { monthlyBudget: input.monthlyBudget ? new Decimal(input.monthlyBudget) : null }),
      ...(input.requiresApproval !== undefined && { requiresApproval: input.requiresApproval }),
      ...(input.approvalThreshold !== undefined && { approvalThreshold: input.approvalThreshold ? new Decimal(input.approvalThreshold) : null }),
      ...(input.managerId !== undefined && { managerId: input.managerId }),
      ...(input.allowedUserIds !== undefined && { allowedUserIds: input.allowedUserIds }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: {
      budgetPeriods: {
        where: {
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        take: 1,
      },
      _count: {
        select: { transactions: true },
      },
    },
  });

  return {
    ...subAccount,
    currentBudgetPeriod: subAccount.budgetPeriods[0] || null,
    transactionCount: subAccount._count.transactions,
    budgetPeriods: undefined,
    _count: undefined,
  } as BusinessSubAccountWithStats;
}

/**
 * Delete a business sub-account
 * Only allowed if balance is zero
 */
export async function deleteBusinessSubAccount(
  tenantId: string,
  id: string
): Promise<void> {
  const subAccount = await db.businessSubAccount.findFirst({
    where: { tenantId, id },
  });

  if (!subAccount) {
    throw new Error('Business sub-account not found');
  }

  if (subAccount.currentBalance.greaterThan(0)) {
    throw new Error('Cannot delete sub-account with non-zero balance. Transfer funds first.');
  }

  await db.businessSubAccount.delete({
    where: { id },
  });
}

/**
 * Allocate funds to a business sub-account
 */
export async function allocateFunds(
  input: BusinessSubAccountAllocationInput
): Promise<{ transaction: any; newBalance: Decimal }> {
  const subAccount = await db.businessSubAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      id: input.businessSubAccountId,
      isActive: true,
    },
  });

  if (!subAccount) {
    throw new Error('Business sub-account not found or inactive');
  }

  const balanceBefore = subAccount.currentBalance;
  const balanceAfter = balanceBefore.plus(new Decimal(input.amount));

  // Create transaction and update balance atomically
  const [transaction] = await db.$transaction([
    db.businessSubAccountTx.create({
      data: {
        tenantId: input.tenantId,
        businessSubAccountId: input.businessSubAccountId,
        type: 'ALLOCATION',
        amount: new Decimal(input.amount),
        description: input.description ?? 'Fund allocation',
        reference: input.reference,
        balanceBefore,
        balanceAfter,
        createdById: input.createdById,
      },
    }),
    db.businessSubAccount.update({
      where: { id: input.businessSubAccountId },
      data: { currentBalance: balanceAfter },
    }),
  ]);

  return { transaction, newBalance: balanceAfter };
}

/**
 * Record an expense from a business sub-account
 */
export async function recordExpense(
  input: BusinessSubAccountExpenseInput
): Promise<{ transaction: any; newBalance: Decimal }> {
  const subAccount = await db.businessSubAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      id: input.businessSubAccountId,
      isActive: true,
    },
  });

  if (!subAccount) {
    throw new Error('Business sub-account not found or inactive');
  }

  const expenseAmount = new Decimal(input.amount);

  // Check if approval is required
  if (subAccount.requiresApproval && subAccount.approvalThreshold) {
    if (expenseAmount.greaterThan(subAccount.approvalThreshold) && !input.approvedById) {
      throw new Error(`Expenses above ${subAccount.approvalThreshold} require approval`);
    }
  }

  // Check sufficient balance
  if (subAccount.currentBalance.lessThan(expenseAmount)) {
    throw new Error('Insufficient balance in sub-account');
  }

  const balanceBefore = subAccount.currentBalance;
  const balanceAfter = balanceBefore.minus(expenseAmount);

  // Create transaction and update balance atomically
  const [transaction] = await db.$transaction([
    db.businessSubAccountTx.create({
      data: {
        tenantId: input.tenantId,
        businessSubAccountId: input.businessSubAccountId,
        type: 'EXPENSE',
        amount: expenseAmount,
        description: input.description ?? 'Expense',
        reference: input.reference,
        vendorName: input.vendorName,
        balanceBefore,
        balanceAfter,
        approvedById: input.approvedById,
        approvedAt: input.approvedById ? new Date() : null,
        createdById: input.createdById,
      },
    }),
    db.businessSubAccount.update({
      where: { id: input.businessSubAccountId },
      data: { currentBalance: balanceAfter },
    }),
  ]);

  // Update budget period spent amount if exists
  const currentPeriod = await db.businessBudgetPeriod.findFirst({
    where: {
      tenantId: input.tenantId,
      businessSubAccountId: input.businessSubAccountId,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    },
  });

  if (currentPeriod) {
    const newSpent = currentPeriod.spentAmount.plus(expenseAmount);
    const newRemaining = currentPeriod.budgetAmount.minus(newSpent);
    const percentUsed = newSpent.dividedBy(currentPeriod.budgetAmount).times(100);

    let status: BudgetStatus = 'ON_TRACK';
    if (newRemaining.lessThanOrEqualTo(0)) {
      status = 'EXCEEDED';
    } else if (percentUsed.greaterThanOrEqualTo(currentPeriod.alertThreshold)) {
      status = 'AT_RISK';
    }

    await db.businessBudgetPeriod.update({
      where: { id: currentPeriod.id },
      data: {
        spentAmount: newSpent,
        remainingAmount: newRemaining,
        status,
      },
    });
  }

  return { transaction, newBalance: balanceAfter };
}

/**
 * Transfer funds between business sub-accounts
 */
export async function transferBetweenSubAccounts(
  tenantId: string,
  fromSubAccountId: string,
  toSubAccountId: string,
  amount: number,
  description: string,
  createdById: string
): Promise<{ fromTransaction: any; toTransaction: any }> {
  // Get both sub-accounts
  const [fromSubAccount, toSubAccount] = await Promise.all([
    db.businessSubAccount.findFirst({
      where: { tenantId, id: fromSubAccountId, isActive: true },
    }),
    db.businessSubAccount.findFirst({
      where: { tenantId, id: toSubAccountId, isActive: true },
    }),
  ]);

  if (!fromSubAccount || !toSubAccount) {
    throw new Error('One or both sub-accounts not found or inactive');
  }

  // Verify same business account
  if (fromSubAccount.businessAccountId !== toSubAccount.businessAccountId) {
    throw new Error('Cannot transfer between sub-accounts of different business accounts');
  }

  const transferAmount = new Decimal(amount);

  if (fromSubAccount.currentBalance.lessThan(transferAmount)) {
    throw new Error('Insufficient balance in source sub-account');
  }

  const fromBalanceBefore = fromSubAccount.currentBalance;
  const fromBalanceAfter = fromBalanceBefore.minus(transferAmount);
  const toBalanceBefore = toSubAccount.currentBalance;
  const toBalanceAfter = toBalanceBefore.plus(transferAmount);

  // Execute transfer atomically
  const [fromTx, toTx] = await db.$transaction([
    db.businessSubAccountTx.create({
      data: {
        tenantId,
        businessSubAccountId: fromSubAccountId,
        type: 'TRANSFER_OUT',
        amount: transferAmount,
        description: `Transfer to ${toSubAccount.name}: ${description}`,
        balanceBefore: fromBalanceBefore,
        balanceAfter: fromBalanceAfter,
        createdById,
      },
    }),
    db.businessSubAccountTx.create({
      data: {
        tenantId,
        businessSubAccountId: toSubAccountId,
        type: 'TRANSFER_IN',
        amount: transferAmount,
        description: `Transfer from ${fromSubAccount.name}: ${description}`,
        balanceBefore: toBalanceBefore,
        balanceAfter: toBalanceAfter,
        createdById,
      },
    }),
    db.businessSubAccount.update({
      where: { id: fromSubAccountId },
      data: { currentBalance: fromBalanceAfter },
    }),
    db.businessSubAccount.update({
      where: { id: toSubAccountId },
      data: { currentBalance: toBalanceAfter },
    }),
  ]);

  return { fromTransaction: fromTx, toTransaction: toTx };
}

/**
 * Get transactions for a business sub-account
 */
export async function getBusinessSubAccountTransactions(
  tenantId: string,
  businessSubAccountId: string,
  options?: {
    type?: BusinessSubAccountTxType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ transactions: any[]; total: number }> {
  const where: any = {
    tenantId,
    businessSubAccountId,
  };

  if (options?.type) {
    where.type = options.type;
  }

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) where.createdAt.gte = options.startDate;
    if (options.endDate) where.createdAt.lte = options.endDate;
  }

  const [transactions, total] = await Promise.all([
    db.businessSubAccountTx.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    }),
    db.businessSubAccountTx.count({ where }),
  ]);

  return { transactions, total };
}

/**
 * Create a budget period for a business sub-account
 */
export async function createBudgetPeriod(
  input: CreateBudgetPeriodInput
): Promise<any> {
  // Verify sub-account exists
  const subAccount = await db.businessSubAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      id: input.businessSubAccountId,
    },
  });

  if (!subAccount) {
    throw new Error('Business sub-account not found');
  }

  // Check for overlapping periods
  const overlapping = await db.businessBudgetPeriod.findFirst({
    where: {
      tenantId: input.tenantId,
      businessSubAccountId: input.businessSubAccountId,
      OR: [
        {
          startDate: { lte: input.startDate },
          endDate: { gte: input.startDate },
        },
        {
          startDate: { lte: input.endDate },
          endDate: { gte: input.endDate },
        },
      ],
    },
  });

  if (overlapping) {
    throw new Error('A budget period already exists for this date range');
  }

  return db.businessBudgetPeriod.create({
    data: {
      tenantId: input.tenantId,
      businessSubAccountId: input.businessSubAccountId,
      periodType: input.periodType,
      startDate: input.startDate,
      endDate: input.endDate,
      budgetAmount: new Decimal(input.budgetAmount),
      remainingAmount: new Decimal(input.budgetAmount),
      alertThreshold: new Decimal(input.alertThreshold ?? 80),
    },
  });
}

/**
 * Get budget summary for all sub-accounts of a business account
 */
export async function getBusinessBudgetSummary(
  tenantId: string,
  businessAccountId: string
): Promise<{
  totalBudget: Decimal;
  totalSpent: Decimal;
  totalRemaining: Decimal;
  subAccountSummaries: any[];
}> {
  const subAccounts = await db.businessSubAccount.findMany({
    where: {
      tenantId,
      businessAccountId,
      isActive: true,
    },
    include: {
      budgetPeriods: {
        where: {
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        take: 1,
      },
    },
  });

  let totalBudget = new Decimal(0);
  let totalSpent = new Decimal(0);
  let totalRemaining = new Decimal(0);

  const subAccountSummaries = subAccounts.map((sa: any) => {
    const currentPeriod = sa.budgetPeriods[0];
    if (currentPeriod) {
      totalBudget = totalBudget.plus(currentPeriod.budgetAmount);
      totalSpent = totalSpent.plus(currentPeriod.spentAmount);
      totalRemaining = totalRemaining.plus(currentPeriod.remainingAmount);
    }

    return {
      id: sa.id,
      name: sa.name,
      type: sa.type,
      currentBalance: sa.currentBalance,
      budget: currentPeriod?.budgetAmount ?? null,
      spent: currentPeriod?.spentAmount ?? null,
      remaining: currentPeriod?.remainingAmount ?? null,
      status: currentPeriod?.status ?? null,
    };
  });

  return {
    totalBudget,
    totalSpent,
    totalRemaining,
    subAccountSummaries,
  };
}
