/**
 * Employees Service
 *
 * Phase 3: Business & Enterprise Features
 *
 * Manages employee records for business accounts including:
 * - Employee CRUD operations
 * - Payment configuration
 * - Sub-account access management
 * - Employee directory and search
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type aliases for enums
type PaymentMethod = 'DIRECT_TRANSFER' | 'BATCH_PAYROLL' | 'MANUAL';
type PaymentSchedule = 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

// ============================================
// Types & Interfaces
// ============================================

interface CreateEmployeeInput {
  tenantId: string;
  businessAccountId: string;
  userId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title: string;
  department?: string;
  startDate: Date;
  paymentMethod?: PaymentMethod;
  paymentSchedule?: PaymentSchedule;
  salaryAmount?: number;
  hourlyRate?: number;
  currency?: string;
  walletId?: string;
  externalAccount?: string;
  allowedSubAccountIds?: string[];
}

interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  department?: string;
  endDate?: Date;
  paymentMethod?: PaymentMethod;
  paymentSchedule?: PaymentSchedule;
  salaryAmount?: number;
  hourlyRate?: number;
  currency?: string;
  walletId?: string;
  externalAccount?: string;
  allowedSubAccountIds?: string[];
  isActive?: boolean;
}

interface EmployeeListOptions {
  isActive?: boolean;
  department?: string;
  paymentSchedule?: PaymentSchedule;
  search?: string;
  limit?: number;
  offset?: number;
}

interface EmployeeWithStats {
  id: string;
  tenantId: string;
  businessAccountId: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string;
  department: string | null;
  startDate: Date;
  endDate: Date | null;
  paymentMethod: PaymentMethod;
  paymentSchedule: PaymentSchedule;
  salaryAmount: Decimal | null;
  hourlyRate: Decimal | null;
  currency: string;
  walletId: string | null;
  externalAccount: string | null;
  allowedSubAccountIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalPaid?: Decimal;
  lastPaymentDate?: Date | null;
  payrollRecordCount?: number;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get all employees for a business account
 */
export async function getEmployees(
  tenantId: string,
  businessAccountId: string,
  options?: EmployeeListOptions
): Promise<{ employees: EmployeeWithStats[]; total: number }> {
  const where: any = {
    tenantId,
    businessAccountId,
  };

  if (options?.isActive !== undefined) {
    where.isActive = options.isActive;
  }

  if (options?.department) {
    where.department = options.department;
  }

  if (options?.paymentSchedule) {
    where.paymentSchedule = options.paymentSchedule;
  }

  if (options?.search) {
    where.OR = [
      { firstName: { contains: options.search, mode: 'insensitive' } },
      { lastName: { contains: options.search, mode: 'insensitive' } },
      { email: { contains: options.search, mode: 'insensitive' } },
      { employeeNumber: { contains: options.search, mode: 'insensitive' } },
    ];
  }

  const [employees, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: {
        payrollRecords: {
          select: {
            netAmount: true,
            paidAt: true,
            status: true,
          },
          where: {
            status: 'PAID',
          },
          orderBy: { paidAt: 'desc' },
        },
        _count: {
          select: { payrollRecords: true },
        },
      },
    }),
    db.employee.count({ where }),
  ]);

  const employeesWithStats: EmployeeWithStats[] = employees.map((emp: any) => {
    const paidRecords = emp.payrollRecords;
    const totalPaid = paidRecords.reduce(
      (sum: Decimal, record: any) => sum.plus(record.netAmount),
      new Decimal(0)
    );
    const lastPayment = paidRecords[0];

    return {
      ...emp,
      totalPaid,
      lastPaymentDate: lastPayment?.paidAt ?? null,
      payrollRecordCount: emp._count.payrollRecords,
      payrollRecords: undefined,
      _count: undefined,
    } as EmployeeWithStats;
  });

  return { employees: employeesWithStats, total };
}

/**
 * Get a single employee by ID
 */
export async function getEmployee(
  tenantId: string,
  id: string
): Promise<EmployeeWithStats | null> {
  const employee = await db.employee.findFirst({
    where: { tenantId, id },
    include: {
      payrollRecords: {
        select: {
          netAmount: true,
          paidAt: true,
          status: true,
        },
        where: {
          status: 'PAID',
        },
        orderBy: { paidAt: 'desc' },
      },
      _count: {
        select: { payrollRecords: true },
      },
      user: {
        select: {
          profileId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!employee) return null;

  const paidRecords = employee.payrollRecords as any[];
  const totalPaid = paidRecords.reduce(
    (sum: Decimal, record: any) => sum.plus(record.netAmount),
    new Decimal(0)
  );
  const lastPayment = paidRecords[0];

  return {
    ...employee,
    totalPaid,
    lastPaymentDate: lastPayment?.paidAt ?? null,
    payrollRecordCount: employee._count.payrollRecords,
    payrollRecords: undefined,
    _count: undefined,
    user: undefined,
  } as EmployeeWithStats;
}

/**
 * Get employee by employee number
 */
export async function getEmployeeByNumber(
  tenantId: string,
  businessAccountId: string,
  employeeNumber: string
): Promise<EmployeeWithStats | null> {
  const employee = await db.employee.findFirst({
    where: {
      tenantId,
      businessAccountId,
      employeeNumber,
    },
    include: {
      _count: {
        select: { payrollRecords: true },
      },
    },
  });

  if (!employee) return null;

  return {
    ...employee,
    payrollRecordCount: employee._count.payrollRecords,
    _count: undefined,
  } as EmployeeWithStats;
}

/**
 * Create a new employee
 */
export async function createEmployee(
  input: CreateEmployeeInput
): Promise<EmployeeWithStats> {
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

  // Check for duplicate employee number
  const existingByNumber = await db.employee.findFirst({
    where: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      employeeNumber: input.employeeNumber,
    },
  });

  if (existingByNumber) {
    throw new Error('An employee with this employee number already exists');
  }

  // Check for duplicate email within business account
  const existingByEmail = await db.employee.findFirst({
    where: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      email: input.email,
    },
  });

  if (existingByEmail) {
    throw new Error('An employee with this email already exists');
  }

  // Validate sub-account IDs if provided
  if (input.allowedSubAccountIds?.length) {
    const validSubAccounts = await db.businessSubAccount.count({
      where: {
        tenantId: input.tenantId,
        businessAccountId: input.businessAccountId,
        id: { in: input.allowedSubAccountIds },
      },
    });

    if (validSubAccounts !== input.allowedSubAccountIds.length) {
      throw new Error('One or more sub-account IDs are invalid');
    }
  }

  // Validate wallet ID if provided (employee has GX account)
  if (input.walletId) {
    const wallet = await db.wallet.findFirst({
      where: {
        tenantId: input.tenantId,
        walletId: input.walletId,
      },
    });

    if (!wallet) {
      throw new Error('Invalid wallet ID');
    }
  }

  const employee = await db.employee.create({
    data: {
      tenantId: input.tenantId,
      businessAccountId: input.businessAccountId,
      userId: input.userId,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      title: input.title,
      department: input.department,
      startDate: input.startDate,
      paymentMethod: input.paymentMethod ?? 'DIRECT_TRANSFER',
      paymentSchedule: input.paymentSchedule ?? 'MONTHLY',
      salaryAmount: input.salaryAmount ? new Decimal(input.salaryAmount) : null,
      hourlyRate: input.hourlyRate ? new Decimal(input.hourlyRate) : null,
      currency: input.currency ?? 'GXC',
      walletId: input.walletId,
      externalAccount: input.externalAccount,
      allowedSubAccountIds: input.allowedSubAccountIds ?? [],
    },
  });

  return {
    ...employee,
    totalPaid: new Decimal(0),
    lastPaymentDate: null,
    payrollRecordCount: 0,
  };
}

/**
 * Update an employee
 */
export async function updateEmployee(
  tenantId: string,
  id: string,
  input: UpdateEmployeeInput
): Promise<EmployeeWithStats> {
  // Verify employee exists
  const existing = await db.employee.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Employee not found');
  }

  // Check for duplicate email if email is being changed
  if (input.email && input.email !== existing.email) {
    const duplicate = await db.employee.findFirst({
      where: {
        tenantId,
        businessAccountId: existing.businessAccountId,
        email: input.email,
        id: { not: id },
      },
    });

    if (duplicate) {
      throw new Error('An employee with this email already exists');
    }
  }

  // Validate sub-account IDs if provided
  if (input.allowedSubAccountIds?.length) {
    const validSubAccounts = await db.businessSubAccount.count({
      where: {
        tenantId,
        businessAccountId: existing.businessAccountId,
        id: { in: input.allowedSubAccountIds },
      },
    });

    if (validSubAccounts !== input.allowedSubAccountIds.length) {
      throw new Error('One or more sub-account IDs are invalid');
    }
  }

  const employee = await db.employee.update({
    where: { id },
    data: {
      ...(input.firstName && { firstName: input.firstName }),
      ...(input.lastName && { lastName: input.lastName }),
      ...(input.email && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.title && { title: input.title }),
      ...(input.department !== undefined && { department: input.department }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.paymentMethod && { paymentMethod: input.paymentMethod }),
      ...(input.paymentSchedule && { paymentSchedule: input.paymentSchedule }),
      ...(input.salaryAmount !== undefined && { salaryAmount: input.salaryAmount ? new Decimal(input.salaryAmount) : null }),
      ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate ? new Decimal(input.hourlyRate) : null }),
      ...(input.currency && { currency: input.currency }),
      ...(input.walletId !== undefined && { walletId: input.walletId }),
      ...(input.externalAccount !== undefined && { externalAccount: input.externalAccount }),
      ...(input.allowedSubAccountIds !== undefined && { allowedSubAccountIds: input.allowedSubAccountIds }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: {
      _count: {
        select: { payrollRecords: true },
      },
    },
  });

  return {
    ...employee,
    payrollRecordCount: employee._count.payrollRecords,
    _count: undefined,
  } as EmployeeWithStats;
}

/**
 * Terminate an employee (set end date and mark inactive)
 */
export async function terminateEmployee(
  tenantId: string,
  id: string,
  endDate: Date
): Promise<EmployeeWithStats> {
  const existing = await db.employee.findFirst({
    where: { tenantId, id },
  });

  if (!existing) {
    throw new Error('Employee not found');
  }

  if (!existing.isActive) {
    throw new Error('Employee is already inactive');
  }

  return updateEmployee(tenantId, id, {
    endDate,
    isActive: false,
  });
}

/**
 * Delete an employee (only if no payroll records)
 */
export async function deleteEmployee(
  tenantId: string,
  id: string
): Promise<void> {
  const employee = await db.employee.findFirst({
    where: { tenantId, id },
    include: {
      _count: {
        select: { payrollRecords: true },
      },
    },
  });

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (employee._count.payrollRecords > 0) {
    throw new Error('Cannot delete employee with payroll records. Use terminate instead.');
  }

  await db.employee.delete({
    where: { id },
  });
}

/**
 * Get employees due for payment this period
 */
export async function getEmployeesDueForPayment(
  tenantId: string,
  businessAccountId: string,
  paymentSchedule: PaymentSchedule
): Promise<EmployeeWithStats[]> {
  const employees = await db.employee.findMany({
    where: {
      tenantId,
      businessAccountId,
      isActive: true,
      paymentSchedule,
      endDate: null, // Not terminated
    },
    include: {
      payrollRecords: {
        select: {
          periodEnd: true,
          status: true,
        },
        orderBy: { periodEnd: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return employees.map((emp: any) => ({
    ...emp,
    payrollRecords: undefined,
  })) as EmployeeWithStats[];
}

/**
 * Get department list for a business account
 */
export async function getDepartments(
  tenantId: string,
  businessAccountId: string
): Promise<{ department: string; employeeCount: number }[]> {
  const result = await db.employee.groupBy({
    by: ['department'],
    where: {
      tenantId,
      businessAccountId,
      department: { not: null },
      isActive: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      department: 'asc',
    },
  });

  return result
    .filter((r: any) => r.department !== null)
    .map((r: any) => ({
      department: r.department as string,
      employeeCount: r._count.id,
    }));
}

/**
 * Get employee statistics for a business account
 */
export async function getEmployeeStats(
  tenantId: string,
  businessAccountId: string
): Promise<{
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  byDepartment: { department: string; count: number }[];
  byPaymentSchedule: { schedule: PaymentSchedule; count: number }[];
  totalMonthlySalary: Decimal;
}> {
  const [
    totalEmployees,
    activeEmployees,
    inactiveEmployees,
    byDepartment,
    byPaymentSchedule,
    salaryAggregate,
  ] = await Promise.all([
    db.employee.count({
      where: { tenantId, businessAccountId },
    }),
    db.employee.count({
      where: { tenantId, businessAccountId, isActive: true },
    }),
    db.employee.count({
      where: { tenantId, businessAccountId, isActive: false },
    }),
    db.employee.groupBy({
      by: ['department'],
      where: { tenantId, businessAccountId, isActive: true, department: { not: null } },
      _count: { id: true },
    }),
    db.employee.groupBy({
      by: ['paymentSchedule'],
      where: { tenantId, businessAccountId, isActive: true },
      _count: { id: true },
    }),
    db.employee.aggregate({
      where: {
        tenantId,
        businessAccountId,
        isActive: true,
        salaryAmount: { not: null },
      },
      _sum: { salaryAmount: true },
    }),
  ]);

  return {
    totalEmployees,
    activeEmployees,
    inactiveEmployees,
    byDepartment: byDepartment
      .filter((d: any) => d.department !== null)
      .map((d: any) => ({ department: d.department as string, count: d._count.id })),
    byPaymentSchedule: byPaymentSchedule.map((p: any) => ({
      schedule: p.paymentSchedule,
      count: p._count.id,
    })),
    totalMonthlySalary: salaryAggregate._sum.salaryAmount ?? new Decimal(0),
  };
}

/**
 * Link employee to GX user profile
 */
export async function linkEmployeeToUser(
  tenantId: string,
  employeeId: string,
  userId: string,
  walletId: string
): Promise<EmployeeWithStats> {
  // Verify user exists
  const user = await db.userProfile.findFirst({
    where: { tenantId, profileId: userId },
  });

  if (!user) {
    throw new Error('User profile not found');
  }

  // Verify wallet belongs to user
  const wallet = await db.wallet.findFirst({
    where: {
      tenantId,
      walletId,
      ownerProfileId: userId,
    },
  });

  if (!wallet) {
    throw new Error('Wallet not found or does not belong to user');
  }

  return updateEmployee(tenantId, employeeId, {
    walletId,
  });
}
