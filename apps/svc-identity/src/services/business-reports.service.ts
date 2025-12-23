/**
 * Business Reports Service
 *
 * Phase 3: Business & Enterprise Features
 *
 * Generates comprehensive business reports including:
 * - Daily/Weekly/Monthly summaries
 * - Profit & Loss statements
 * - Payroll reports
 * - Budget vs Actual analysis
 * - Tax summaries
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums
type BusinessReportType =
  | 'DAILY_SUMMARY' | 'WEEKLY_SUMMARY' | 'MONTHLY_PROFIT_LOSS' | 'QUARTERLY_REPORT'
  | 'ANNUAL_REPORT' | 'TAX_SUMMARY' | 'PAYROLL_REPORT' | 'EXPENSE_REPORT'
  | 'BUDGET_VS_ACTUAL' | 'CUSTOM';

type BudgetStatus = 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED' | 'COMPLETED';

// ============================================
// Types & Interfaces
// ============================================

interface GenerateReportInput {
  tenantId: string;
  businessAccountId: string;
  reportType: BusinessReportType;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  generatedById: string;
}

interface ReportData {
  id: string;
  tenantId: string;
  businessAccountId: string;
  reportType: BusinessReportType;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  totalIncome: Decimal;
  totalExpenses: Decimal;
  netProfit: Decimal;
  incomeByCategory: Record<string, number> | null;
  expensesByCategory: Record<string, number> | null;
  subAccountSummary: Record<string, any> | null;
  employeePayroll: Record<string, any> | null;
  monthlyTrends: any[] | null;
  pdfUrl: string | null;
  csvUrl: string | null;
  excelUrl: string | null;
  generatedAt: Date;
  generatedById: string;
}

interface FinancialSummary {
  totalIncome: Decimal;
  totalExpenses: Decimal;
  netProfit: Decimal;
  incomeByCategory: Record<string, number>;
  expensesByCategory: Record<string, number>;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate financial summary for a period
 */
async function calculateFinancialSummary(
  tenantId: string,
  businessAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialSummary> {
  // Get all business sub-account transactions for the period
  const transactions = await db.businessSubAccountTx.findMany({
    where: {
      tenantId,
      businessSubAccount: {
        businessAccountId,
      },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      businessSubAccount: {
        select: {
          type: true,
          name: true,
        },
      },
    },
  });

  let totalIncome = new Decimal(0);
  let totalExpenses = new Decimal(0);
  const incomeByCategory: Record<string, number> = {};
  const expensesByCategory: Record<string, number> = {};

  transactions.forEach((tx: any) => {
    const category = tx.businessSubAccount.type;

    if (tx.type === 'ALLOCATION' || tx.type === 'TRANSFER_IN') {
      totalIncome = totalIncome.plus(tx.amount);
      incomeByCategory[category] = (incomeByCategory[category] ?? 0) + tx.amount.toNumber();
    } else if (
      tx.type === 'EXPENSE' ||
      tx.type === 'PAYROLL_PAYMENT' ||
      tx.type === 'VENDOR_PAYMENT'
    ) {
      totalExpenses = totalExpenses.plus(tx.amount);
      expensesByCategory[category] = (expensesByCategory[category] ?? 0) + tx.amount.toNumber();
    }
  });

  return {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome.minus(totalExpenses),
    incomeByCategory,
    expensesByCategory,
  };
}

/**
 * Get sub-account summary for a period
 */
async function getSubAccountSummary(
  tenantId: string,
  businessAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, any>> {
  const subAccounts = await db.businessSubAccount.findMany({
    where: {
      tenantId,
      businessAccountId,
    },
    include: {
      budgetPeriods: {
        where: {
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      },
      transactions: {
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
    },
  });

  const summary: Record<string, any> = {};

  subAccounts.forEach((sa: any) => {
    const periodTx = sa.transactions;
    let periodIncome = new Decimal(0);
    let periodExpenses = new Decimal(0);

    periodTx.forEach((tx: any) => {
      if (tx.type === 'ALLOCATION' || tx.type === 'TRANSFER_IN') {
        periodIncome = periodIncome.plus(tx.amount);
      } else if (
        tx.type === 'EXPENSE' ||
        tx.type === 'PAYROLL_PAYMENT' ||
        tx.type === 'VENDOR_PAYMENT' ||
        tx.type === 'TRANSFER_OUT'
      ) {
        periodExpenses = periodExpenses.plus(tx.amount);
      }
    });

    const currentBudget = sa.budgetPeriods[0];

    summary[sa.id] = {
      name: sa.name,
      type: sa.type,
      currentBalance: sa.currentBalance.toNumber(),
      periodIncome: periodIncome.toNumber(),
      periodExpenses: periodExpenses.toNumber(),
      budget: currentBudget?.budgetAmount.toNumber() ?? null,
      spent: currentBudget?.spentAmount.toNumber() ?? null,
      remaining: currentBudget?.remainingAmount.toNumber() ?? null,
      status: currentBudget?.status ?? null,
    };
  });

  return summary;
}

/**
 * Get payroll summary for a period
 */
async function getPayrollSummary(
  tenantId: string,
  businessAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, any>> {
  const payrollRecords = await db.payrollRecord.findMany({
    where: {
      tenantId,
      employee: {
        businessAccountId,
      },
      periodStart: { gte: startDate },
      periodEnd: { lte: endDate },
      status: 'PAID',
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
  });

  const summary: Record<string, any> = {};
  const byDepartment: Record<string, number> = {};

  payrollRecords.forEach((record: any) => {
    const empId = record.employeeId;
    if (!summary[empId]) {
      summary[empId] = {
        name: `${record.employee.firstName} ${record.employee.lastName}`,
        department: record.employee.department,
        grossTotal: 0,
        deductionsTotal: 0,
        bonusesTotal: 0,
        netTotal: 0,
        paymentCount: 0,
      };
    }

    summary[empId].grossTotal += record.grossAmount.toNumber();
    summary[empId].deductionsTotal += record.deductions.toNumber();
    summary[empId].bonusesTotal += record.bonuses.toNumber();
    summary[empId].netTotal += record.netAmount.toNumber();
    summary[empId].paymentCount += 1;

    const dept = record.employee.department ?? 'Unassigned';
    byDepartment[dept] = (byDepartment[dept] ?? 0) + record.netAmount.toNumber();
  });

  return {
    byEmployee: summary,
    byDepartment,
    totalGross: payrollRecords.reduce((sum: number, r: any) => sum + r.grossAmount.toNumber(), 0),
    totalNet: payrollRecords.reduce((sum: number, r: any) => sum + r.netAmount.toNumber(), 0),
    totalDeductions: payrollRecords.reduce((sum: number, r: any) => sum + r.deductions.toNumber(), 0),
    recordCount: payrollRecords.length,
  };
}

/**
 * Calculate monthly trends
 */
async function calculateMonthlyTrends(
  tenantId: string,
  businessAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const transactions = await db.businessSubAccountTx.findMany({
    where: {
      tenantId,
      businessSubAccount: {
        businessAccountId,
      },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const monthlyData: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach((tx: any) => {
    const monthKey = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expenses: 0 };
    }

    if (tx.type === 'ALLOCATION' || tx.type === 'TRANSFER_IN') {
      monthlyData[monthKey].income += tx.amount.toNumber();
    } else if (
      tx.type === 'EXPENSE' ||
      tx.type === 'PAYROLL_PAYMENT' ||
      tx.type === 'VENDOR_PAYMENT'
    ) {
      monthlyData[monthKey].expenses += tx.amount.toNumber();
    }
  });

  return Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      profit: data.income - data.expenses,
    }));
}

// ============================================
// Service Functions
// ============================================

/**
 * Generate a business report
 */
export async function generateReport(
  input: GenerateReportInput
): Promise<ReportData> {
  // Verify business account exists
  const businessAccount = await db.businessAccount.findFirst({
    where: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
    },
  });

  if (!businessAccount) {
    throw new Error('Business account not found');
  }

  // Calculate financial summary
  const financialSummary = await calculateFinancialSummary(
    input.tenantId,
    input.businessAccountId,
    input.periodStart,
    input.periodEnd
  );

  // Get additional data based on report type
  let subAccountSummary: Record<string, any> | null = null;
  let employeePayroll: Record<string, any> | null = null;
  let monthlyTrends: any[] | null = null;

  switch (input.reportType) {
    case 'DAILY_SUMMARY':
    case 'WEEKLY_SUMMARY':
    case 'MONTHLY_PROFIT_LOSS':
      subAccountSummary = await getSubAccountSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;

    case 'QUARTERLY_REPORT':
    case 'ANNUAL_REPORT':
      subAccountSummary = await getSubAccountSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      monthlyTrends = await calculateMonthlyTrends(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;

    case 'PAYROLL_REPORT':
      employeePayroll = await getPayrollSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;

    case 'EXPENSE_REPORT':
      subAccountSummary = await getSubAccountSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;

    case 'BUDGET_VS_ACTUAL':
      subAccountSummary = await getSubAccountSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;

    case 'TAX_SUMMARY':
      subAccountSummary = await getSubAccountSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      employeePayroll = await getPayrollSummary(
        input.tenantId,
        input.businessAccountId,
        input.periodStart,
        input.periodEnd
      );
      break;
  }

  // Create the report
  const report = await db.businessReport.create({
    data: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      reportType: input.reportType,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalIncome: financialSummary.totalIncome,
      totalExpenses: financialSummary.totalExpenses,
      netProfit: financialSummary.netProfit,
      incomeByCategory: financialSummary.incomeByCategory,
      expensesByCategory: financialSummary.expensesByCategory,
      subAccountSummary,
      employeePayroll,
      monthlyTrends,
      generatedById: input.generatedById,
    },
  });

  return report as ReportData;
}

/**
 * Get a report by ID
 */
export async function getReport(
  tenantId: string,
  id: string
): Promise<ReportData | null> {
  const report = await db.businessReport.findFirst({
    where: { tenantId, id },
  });

  return report as ReportData | null;
}

/**
 * Get all reports for a business account
 */
export async function getReports(
  tenantId: string,
  businessAccountId: string,
  options?: {
    reportType?: BusinessReportType;
    year?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ reports: ReportData[]; total: number }> {
  const where: any = {
    tenantId,
    businessAccountId,
  };

  if (options?.reportType) {
    where.reportType = options.reportType;
  }

  if (options?.year) {
    where.periodStart = {
      gte: new Date(options.year, 0, 1),
      lt: new Date(options.year + 1, 0, 1),
    };
  }

  const [reports, total] = await Promise.all([
    db.businessReport.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
    }),
    db.businessReport.count({ where }),
  ]);

  return { reports: reports as ReportData[], total };
}

/**
 * Delete a report
 */
export async function deleteReport(
  tenantId: string,
  id: string
): Promise<void> {
  const report = await db.businessReport.findFirst({
    where: { tenantId, id },
  });

  if (!report) {
    throw new Error('Report not found');
  }

  await db.businessReport.delete({
    where: { id },
  });
}

/**
 * Generate quick dashboard summary (not persisted)
 */
export async function getDashboardSummary(
  tenantId: string,
  businessAccountId: string
): Promise<{
  today: FinancialSummary;
  thisWeek: FinancialSummary;
  thisMonth: FinancialSummary;
  thisYear: FinancialSummary;
  subAccountBalances: { id: string; name: string; type: string; balance: number }[];
  pendingPayroll: { count: number; total: number };
  budgetAlerts: { subAccountId: string; name: string; status: BudgetStatus; percentUsed: number }[];
}> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Calculate summaries for different periods
  const [today, thisWeek, thisMonth, thisYear] = await Promise.all([
    calculateFinancialSummary(tenantId, businessAccountId, startOfDay, now),
    calculateFinancialSummary(tenantId, businessAccountId, startOfWeek, now),
    calculateFinancialSummary(tenantId, businessAccountId, startOfMonth, now),
    calculateFinancialSummary(tenantId, businessAccountId, startOfYear, now),
  ]);

  // Get sub-account balances
  const subAccounts = await db.businessSubAccount.findMany({
    where: {
      tenantId,
      businessAccountId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      currentBalance: true,
    },
    orderBy: { currentBalance: 'desc' },
  });

  // Get pending payroll
  const pendingPayrollRecords = await db.payrollRecord.findMany({
    where: {
      tenantId,
      employee: {
        businessAccountId,
      },
      status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
    },
    select: {
      netAmount: true,
    },
  });

  const pendingPayroll = {
    count: pendingPayrollRecords.length,
    total: pendingPayrollRecords.reduce((sum: number, r: any) => sum + r.netAmount.toNumber(), 0),
  };

  // Get budget alerts
  const budgetPeriods = await db.businessBudgetPeriod.findMany({
    where: {
      tenantId,
      businessSubAccount: {
        businessAccountId,
      },
      startDate: { lte: now },
      endDate: { gte: now },
      status: { in: ['AT_RISK', 'EXCEEDED'] },
    },
    include: {
      businessSubAccount: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const budgetAlerts = budgetPeriods.map((bp: any) => ({
    subAccountId: bp.businessSubAccountId,
    name: bp.businessSubAccount.name,
    status: bp.status,
    percentUsed: bp.budgetAmount.greaterThan(0)
      ? bp.spentAmount.dividedBy(bp.budgetAmount).times(100).toNumber()
      : 0,
  }));

  return {
    today,
    thisWeek,
    thisMonth,
    thisYear,
    subAccountBalances: subAccounts.map((sa: any) => ({
      id: sa.id,
      name: sa.name,
      type: sa.type,
      balance: sa.currentBalance.toNumber(),
    })),
    pendingPayroll,
    budgetAlerts,
  };
}

/**
 * Generate budget vs actual comparison
 */
export async function getBudgetVsActual(
  tenantId: string,
  businessAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  subAccounts: {
    id: string;
    name: string;
    type: string;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }[];
  totals: {
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
  };
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
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      },
      transactions: {
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          type: { in: ['EXPENSE', 'PAYROLL_PAYMENT', 'VENDOR_PAYMENT'] },
        },
      },
    },
  });

  let totalBudget = 0;
  let totalActual = 0;

  const comparison = subAccounts.map((sa: any) => {
    const budget = sa.budgetPeriods.reduce(
      (sum: number, bp: any) => sum + bp.budgetAmount.toNumber(),
      0
    );
    const actual = sa.transactions.reduce(
      (sum: number, tx: any) => sum + tx.amount.toNumber(),
      0
    );
    const variance = budget - actual;
    const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;

    totalBudget += budget;
    totalActual += actual;

    return {
      id: sa.id,
      name: sa.name,
      type: sa.type,
      budget,
      actual,
      variance,
      variancePercent,
    };
  });

  const totalVariance = totalBudget - totalActual;
  const totalVariancePercent = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  return {
    subAccounts: comparison,
    totals: {
      budget: totalBudget,
      actual: totalActual,
      variance: totalVariance,
      variancePercent: totalVariancePercent,
    },
  };
}
