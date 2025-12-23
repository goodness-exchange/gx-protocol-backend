/**
 * Payroll Service
 *
 * Phase 3: Business & Enterprise Features
 *
 * Manages payroll processing for business accounts including:
 * - Individual payroll record management
 * - Batch payroll processing
 * - Payment status tracking
 * - Payroll approvals
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums
type PayrollStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED';
// PaymentSchedule type available for future use
// type PaymentSchedule = 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

// ============================================
// Types & Interfaces
// ============================================

interface CreatePayrollRecordInput {
  tenantId: string;
  employeeId: string;
  payrollBatchId?: string;
  periodStart: Date;
  periodEnd: Date;
  grossAmount: number;
  deductions?: number;
  bonuses?: number;
  deductionBreakdown?: Record<string, number>;
  bonusBreakdown?: Record<string, number>;
  notes?: string;
  createdById: string;
}

interface CreatePayrollBatchInput {
  tenantId: string;
  businessAccountId: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  sourceSubAccountId?: string;
  notes?: string;
  createdById: string;
  employeeIds?: string[]; // Optional: specific employees, defaults to all active
}

interface PayrollRecordWithEmployee {
  id: string;
  tenantId: string;
  employeeId: string;
  payrollBatchId: string | null;
  periodStart: Date;
  periodEnd: Date;
  grossAmount: Decimal;
  deductions: Decimal;
  bonuses: Decimal;
  netAmount: Decimal;
  deductionBreakdown: any | null;
  bonusBreakdown: any | null;
  status: PayrollStatus;
  approvedById: string | null;
  approvedAt: Date | null;
  transactionId: string | null;
  paidAt: Date | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    title: string;
    department: string | null;
    walletId: string | null;
  };
}

interface PayrollBatchWithRecords {
  id: string;
  tenantId: string;
  businessAccountId: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  totalEmployees: number;
  totalGrossAmount: Decimal;
  totalDeductions: Decimal;
  totalNetAmount: Decimal;
  status: PayrollStatus;
  approvedById: string | null;
  approvedAt: Date | null;
  processedAt: Date | null;
  completedAt: Date | null;
  sourceSubAccountId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  payrollRecords?: PayrollRecordWithEmployee[];
  recordsByStatus?: Record<PayrollStatus, number>;
}

// ============================================
// Payroll Record Functions
// ============================================

/**
 * Create a single payroll record
 */
export async function createPayrollRecord(
  input: CreatePayrollRecordInput
): Promise<PayrollRecordWithEmployee> {
  // Verify employee exists
  const employee = await db.employee.findFirst({
    where: {
      tenantId: input.tenantId,
      id: input.employeeId,
      isActive: true,
    },
  });

  if (!employee) {
    throw new Error('Employee not found or inactive');
  }

  // Check for duplicate period
  const existing = await db.payrollRecord.findFirst({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: { notIn: ['CANCELLED', 'FAILED'] },
    },
  });

  if (existing) {
    throw new Error('A payroll record already exists for this period');
  }

  const grossAmount = new Decimal(input.grossAmount);
  const deductions = new Decimal(input.deductions ?? 0);
  const bonuses = new Decimal(input.bonuses ?? 0);
  const netAmount = grossAmount.minus(deductions).plus(bonuses);

  const record = await db.payrollRecord.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      payrollBatchId: input.payrollBatchId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossAmount,
      deductions,
      bonuses,
      netAmount,
      deductionBreakdown: input.deductionBreakdown ?? null,
      bonusBreakdown: input.bonusBreakdown ?? null,
      notes: input.notes,
      createdById: input.createdById,
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Get payroll records for an employee
 */
export async function getEmployeePayrollRecords(
  tenantId: string,
  employeeId: string,
  options?: {
    status?: PayrollStatus;
    year?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ records: PayrollRecordWithEmployee[]; total: number }> {
  const where: any = {
    tenantId,
    employeeId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.year) {
    where.periodStart = {
      gte: new Date(options.year, 0, 1),
      lt: new Date(options.year + 1, 0, 1),
    };
  }

  const [records, total] = await Promise.all([
    db.payrollRecord.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    db.payrollRecord.count({ where }),
  ]);

  return { records: records as PayrollRecordWithEmployee[], total };
}

/**
 * Update payroll record amounts
 */
export async function updatePayrollRecord(
  tenantId: string,
  id: string,
  input: {
    grossAmount?: number;
    deductions?: number;
    bonuses?: number;
    deductionBreakdown?: Record<string, number>;
    bonusBreakdown?: Record<string, number>;
    notes?: string;
  }
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (!['DRAFT', 'PENDING_APPROVAL'].includes(existing.status)) {
    throw new Error('Can only update draft or pending payroll records');
  }

  const grossAmount = input.grossAmount !== undefined
    ? new Decimal(input.grossAmount)
    : existing.grossAmount;
  const deductions = input.deductions !== undefined
    ? new Decimal(input.deductions)
    : existing.deductions;
  const bonuses = input.bonuses !== undefined
    ? new Decimal(input.bonuses)
    : existing.bonuses;
  const netAmount = grossAmount.minus(deductions).plus(bonuses);

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      grossAmount,
      deductions,
      bonuses,
      netAmount,
      ...(input.deductionBreakdown !== undefined && { deductionBreakdown: input.deductionBreakdown }),
      ...(input.bonusBreakdown !== undefined && { bonusBreakdown: input.bonusBreakdown }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Approve a payroll record
 */
export async function approvePayrollRecord(
  tenantId: string,
  id: string,
  approvedById: string
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (existing.status !== 'PENDING_APPROVAL') {
    throw new Error('Payroll record is not pending approval');
  }

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById,
      approvedAt: new Date(),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Submit payroll record for approval
 */
export async function submitForApproval(
  tenantId: string,
  id: string
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (existing.status !== 'DRAFT') {
    throw new Error('Can only submit draft payroll records for approval');
  }

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      status: 'PENDING_APPROVAL',
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Process payment for a payroll record
 */
export async function processPayrollPayment(
  tenantId: string,
  id: string,
  transactionId: string
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
    include: {
      employee: {
        select: {
          walletId: true,
          externalAccount: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (existing.status !== 'APPROVED') {
    throw new Error('Payroll record must be approved before processing');
  }

  if (!existing.employee?.walletId && !existing.employee?.externalAccount) {
    throw new Error('Employee has no payment destination configured');
  }

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      status: 'PAID',
      transactionId,
      paidAt: new Date(),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Mark payroll record as failed
 */
export async function markPayrollFailed(
  tenantId: string,
  id: string,
  failureReason: string
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (!['APPROVED', 'PROCESSING'].includes(existing.status)) {
    throw new Error('Can only mark approved or processing records as failed');
  }

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      status: 'FAILED',
      failureReason,
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

/**
 * Cancel a payroll record
 */
export async function cancelPayrollRecord(
  tenantId: string,
  id: string
): Promise<PayrollRecordWithEmployee> {
  const existing = await db.payrollRecord.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Payroll record not found');
  }

  if (['PAID', 'CANCELLED'].includes(existing.status)) {
    throw new Error('Cannot cancel paid or already cancelled records');
  }

  const record = await db.payrollRecord.update({
    where: { id },
    data: {
      status: 'CANCELLED',
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          title: true,
          department: true,
          walletId: true,
        },
      },
    },
  });

  return record as PayrollRecordWithEmployee;
}

// ============================================
// Payroll Batch Functions
// ============================================

/**
 * Create a payroll batch with records for all eligible employees
 */
export async function createPayrollBatch(
  input: CreatePayrollBatchInput
): Promise<PayrollBatchWithRecords> {
  // Get eligible employees
  const employeeWhere: any = {
    tenantId: input.tenantId,
    businessAccountId: input.businessAccountId,
    isActive: true,
    endDate: null,
    salaryAmount: { not: null },
  };

  if (input.employeeIds?.length) {
    employeeWhere.id = { in: input.employeeIds };
  }

  const employees = await db.employee.findMany({
    where: employeeWhere,
  });

  if (employees.length === 0) {
    throw new Error('No eligible employees found for payroll');
  }

  // Calculate totals
  let totalGross = new Decimal(0);
  employees.forEach((emp: any) => {
    if (emp.salaryAmount) {
      totalGross = totalGross.plus(emp.salaryAmount);
    }
  });

  // Create batch and records in transaction
  const batch = await db.$transaction(async (tx: any) => {
    const newBatch = await tx.payrollBatch.create({
      data: {
        tenantId: input.tenantId,
        businessAccountId: input.businessAccountId,
        name: input.name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalEmployees: employees.length,
        totalGrossAmount: totalGross,
        totalDeductions: new Decimal(0),
        totalNetAmount: totalGross,
        sourceSubAccountId: input.sourceSubAccountId,
        notes: input.notes,
        createdById: input.createdById,
      },
    });

    // Create individual payroll records
    for (const emp of employees) {
      const grossAmount = emp.salaryAmount ?? new Decimal(0);
      await tx.payrollRecord.create({
        data: {
          tenantId: input.tenantId,
          employeeId: emp.id,
          payrollBatchId: newBatch.id,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          grossAmount,
          deductions: new Decimal(0),
          bonuses: new Decimal(0),
          netAmount: grossAmount,
          createdById: input.createdById,
        },
      });
    }

    return newBatch;
  });

  // Fetch complete batch with records
  return getPayrollBatch(input.tenantId, batch.id) as Promise<PayrollBatchWithRecords>;
}

/**
 * Get a payroll batch with all records
 */
export async function getPayrollBatch(
  tenantId: string,
  id: string
): Promise<PayrollBatchWithRecords | null> {
  const batch = await db.payrollBatch.findFirst({
    where: { tenantId, id },
    include: {
      payrollRecords: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              title: true,
              department: true,
              walletId: true,
            },
          },
        },
        orderBy: [
          { employee: { lastName: 'asc' } },
          { employee: { firstName: 'asc' } },
        ],
      },
    },
  });

  if (!batch) return null;

  // Calculate records by status
  const recordsByStatus: Record<string, number> = {};
  batch.payrollRecords.forEach((r: any) => {
    recordsByStatus[r.status] = (recordsByStatus[r.status] ?? 0) + 1;
  });

  return {
    ...batch,
    recordsByStatus: recordsByStatus as Record<PayrollStatus, number>,
  } as PayrollBatchWithRecords;
}

/**
 * Get all payroll batches for a business account
 */
export async function getPayrollBatches(
  tenantId: string,
  businessAccountId: string,
  options?: {
    status?: PayrollStatus;
    year?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ batches: PayrollBatchWithRecords[]; total: number }> {
  const where: any = {
    tenantId,
    businessAccountId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.year) {
    where.periodStart = {
      gte: new Date(options.year, 0, 1),
      lt: new Date(options.year + 1, 0, 1),
    };
  }

  const [batches, total] = await Promise.all([
    db.payrollBatch.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
      include: {
        _count: {
          select: { payrollRecords: true },
        },
      },
    }),
    db.payrollBatch.count({ where }),
  ]);

  return {
    batches: batches.map((b: any) => ({
      ...b,
      _count: undefined,
    })) as PayrollBatchWithRecords[],
    total,
  };
}

/**
 * Submit batch for approval
 */
export async function submitBatchForApproval(
  tenantId: string,
  id: string
): Promise<PayrollBatchWithRecords> {
  const batch = await db.payrollBatch.findFirst({
    where: { tenantId, id },
  });

  if (!batch) {
    throw new Error('Payroll batch not found');
  }

  if (batch.status !== 'DRAFT') {
    throw new Error('Can only submit draft batches for approval');
  }

  // Update batch and all records
  await db.$transaction([
    db.payrollBatch.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    }),
    db.payrollRecord.updateMany({
      where: {
        tenantId,
        payrollBatchId: id,
        status: 'DRAFT',
      },
      data: { status: 'PENDING_APPROVAL' },
    }),
  ]);

  return getPayrollBatch(tenantId, id) as Promise<PayrollBatchWithRecords>;
}

/**
 * Approve entire batch
 */
export async function approveBatch(
  tenantId: string,
  id: string,
  approvedById: string
): Promise<PayrollBatchWithRecords> {
  const batch = await db.payrollBatch.findFirst({
    where: { tenantId, id },
  });

  if (!batch) {
    throw new Error('Payroll batch not found');
  }

  if (batch.status !== 'PENDING_APPROVAL') {
    throw new Error('Batch is not pending approval');
  }

  const now = new Date();

  await db.$transaction([
    db.payrollBatch.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById,
        approvedAt: now,
      },
    }),
    db.payrollRecord.updateMany({
      where: {
        tenantId,
        payrollBatchId: id,
        status: 'PENDING_APPROVAL',
      },
      data: {
        status: 'APPROVED',
        approvedById,
        approvedAt: now,
      },
    }),
  ]);

  return getPayrollBatch(tenantId, id) as Promise<PayrollBatchWithRecords>;
}

/**
 * Process all approved records in a batch
 */
export async function processBatchPayments(
  tenantId: string,
  id: string,
  processPayment: (employeeId: string, amount: Decimal, walletId: string) => Promise<string>
): Promise<{ successful: number; failed: number; results: any[] }> {
  const batch = await getPayrollBatch(tenantId, id);

  if (!batch) {
    throw new Error('Payroll batch not found');
  }

  if (batch.status !== 'APPROVED') {
    throw new Error('Batch must be approved before processing');
  }

  // Update batch status to processing
  await db.payrollBatch.update({
    where: { id },
    data: { status: 'PROCESSING', processedAt: new Date() },
  });

  const results: any[] = [];
  let successful = 0;
  let failed = 0;

  // Process each approved record
  const approvedRecords = batch.payrollRecords?.filter((r) => r.status === 'APPROVED') ?? [];

  for (const record of approvedRecords) {
    try {
      if (!record.employee?.walletId) {
        throw new Error('Employee has no wallet configured');
      }

      // Update to processing
      await db.payrollRecord.update({
        where: { id: record.id },
        data: { status: 'PROCESSING' },
      });

      // Execute payment
      const transactionId = await processPayment(
        record.employeeId,
        record.netAmount,
        record.employee.walletId
      );

      // Mark as paid
      await db.payrollRecord.update({
        where: { id: record.id },
        data: {
          status: 'PAID',
          transactionId,
          paidAt: new Date(),
        },
      });

      successful++;
      results.push({
        recordId: record.id,
        employeeId: record.employeeId,
        status: 'PAID',
        transactionId,
      });
    } catch (error: any) {
      failed++;
      await db.payrollRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          failureReason: error.message,
        },
      });
      results.push({
        recordId: record.id,
        employeeId: record.employeeId,
        status: 'FAILED',
        error: error.message,
      });
    }
  }

  // Update batch status based on results
  const finalStatus = failed === 0 ? 'PAID' : (successful === 0 ? 'FAILED' : 'PAID');
  await db.payrollBatch.update({
    where: { id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
    },
  });

  return { successful, failed, results };
}

/**
 * Get payroll summary for a business account
 */
export async function getPayrollSummary(
  tenantId: string,
  businessAccountId: string,
  year: number
): Promise<{
  totalPaid: Decimal;
  totalPending: Decimal;
  byMonth: { month: number; amount: Decimal }[];
  byDepartment: { department: string; amount: Decimal }[];
}> {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);

  // Get all paid records for the year
  const paidRecords = await db.payrollRecord.findMany({
    where: {
      tenantId,
      status: 'PAID',
      paidAt: {
        gte: startOfYear,
        lt: endOfYear,
      },
      employee: {
        businessAccountId,
      },
    },
    include: {
      employee: {
        select: { department: true },
      },
    },
  });

  // Get pending records
  const pendingRecords = await db.payrollRecord.findMany({
    where: {
      tenantId,
      status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
      employee: {
        businessAccountId,
      },
    },
  });

  // Calculate totals
  let totalPaid = new Decimal(0);
  const byMonth: Record<number, Decimal> = {};
  const byDepartment: Record<string, Decimal> = {};

  paidRecords.forEach((r: any) => {
    totalPaid = totalPaid.plus(r.netAmount);

    const month = r.paidAt!.getMonth();
    byMonth[month] = (byMonth[month] ?? new Decimal(0)).plus(r.netAmount);

    const dept = r.employee?.department ?? 'Unassigned';
    byDepartment[dept] = (byDepartment[dept] ?? new Decimal(0)).plus(r.netAmount);
  });

  const totalPending = pendingRecords.reduce(
    (sum: Decimal, r: any) => sum.plus(r.netAmount),
    new Decimal(0)
  );

  return {
    totalPaid,
    totalPending,
    byMonth: Object.entries(byMonth).map(([m, amount]) => ({
      month: parseInt(m),
      amount: amount as Decimal,
    })),
    byDepartment: Object.entries(byDepartment).map(([dept, amount]) => ({
      department: dept,
      amount: amount as Decimal,
    })),
  };
}
