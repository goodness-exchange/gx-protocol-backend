/**
 * Employees Controller
 *
 * Phase 3: Business & Enterprise Features
 *
 * Handles HTTP requests for employee management operations.
 */

import { Request, Response } from 'express';
import * as employeesService from '../services/employees.service';

// Type aliases for enums
type PaymentMethod = 'DIRECT_TRANSFER' | 'BATCH_PAYROLL' | 'MANUAL';
type PaymentSchedule = 'WEEKLY' | 'BI_WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

/**
 * Get all employees for a business account
 * GET /api/v1/business-accounts/:businessAccountId/employees
 */
export async function getEmployees(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { isActive, department, paymentSchedule, search, limit, offset } = req.query;

    const result = await employeesService.getEmployees(
      DEFAULT_TENANT_ID,
      businessAccountId,
      {
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        department: department as string | undefined,
        paymentSchedule: paymentSchedule as PaymentSchedule | undefined,
        search: search as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get a single employee
 * GET /api/v1/employees/:id
 */
export async function getEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const employee = await employeesService.getEmployee(DEFAULT_TENANT_ID, id);

    if (!employee) {
      res.status(404).json({
        success: false,
        error: 'Employee not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { employee },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create a new employee
 * POST /api/v1/employees
 */
export async function createEmployee(req: Request, res: Response): Promise<void> {
  try {
    const {
      businessAccountId,
      userId,
      employeeNumber,
      firstName,
      lastName,
      email,
      phone,
      title,
      department,
      startDate,
      paymentMethod,
      paymentSchedule,
      salaryAmount,
      hourlyRate,
      currency,
      walletId,
      externalAccount,
      allowedSubAccountIds,
    } = req.body;

    // Validate required fields
    if (!businessAccountId || !employeeNumber || !firstName || !lastName || !email || !title || !startDate) {
      res.status(400).json({
        success: false,
        error: 'businessAccountId, employeeNumber, firstName, lastName, email, title, and startDate are required',
      });
      return;
    }

    const employee = await employeesService.createEmployee({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      userId,
      employeeNumber,
      firstName,
      lastName,
      email,
      phone,
      title,
      department,
      startDate: new Date(startDate),
      paymentMethod: paymentMethod as PaymentMethod | undefined,
      paymentSchedule: paymentSchedule as PaymentSchedule | undefined,
      salaryAmount,
      hourlyRate,
      currency,
      walletId,
      externalAccount,
      allowedSubAccountIds,
    });

    res.status(201).json({
      success: true,
      data: { employee },
    });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Update an employee
 * PUT /api/v1/employees/:id
 */
export async function updateEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Convert endDate if provided
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const employee = await employeesService.updateEmployee(
      DEFAULT_TENANT_ID,
      id,
      updateData
    );

    res.json({
      success: true,
      data: { employee },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Terminate an employee
 * POST /api/v1/employees/:id/terminate
 */
export async function terminateEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!endDate) {
      res.status(400).json({
        success: false,
        error: 'endDate is required',
      });
      return;
    }

    const employee = await employeesService.terminateEmployee(
      DEFAULT_TENANT_ID,
      id,
      new Date(endDate)
    );

    res.json({
      success: true,
      data: { employee },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('already inactive')) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Delete an employee
 * DELETE /api/v1/employees/:id
 */
export async function deleteEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await employeesService.deleteEmployee(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('payroll records')) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get employees due for payment
 * GET /api/v1/business-accounts/:businessAccountId/employees/due-for-payment
 */
export async function getEmployeesDueForPayment(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { paymentSchedule } = req.query;

    if (!paymentSchedule) {
      res.status(400).json({
        success: false,
        error: 'paymentSchedule query parameter is required',
      });
      return;
    }

    const employees = await employeesService.getEmployeesDueForPayment(
      DEFAULT_TENANT_ID,
      businessAccountId,
      paymentSchedule as PaymentSchedule
    );

    res.json({
      success: true,
      data: {
        employees,
        total: employees.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get departments for a business account
 * GET /api/v1/business-accounts/:businessAccountId/departments
 */
export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;

    const departments = await employeesService.getDepartments(
      DEFAULT_TENANT_ID,
      businessAccountId
    );

    res.json({
      success: true,
      data: { departments },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get employee statistics for a business account
 * GET /api/v1/business-accounts/:businessAccountId/employees/stats
 */
export async function getEmployeeStats(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;

    const stats = await employeesService.getEmployeeStats(
      DEFAULT_TENANT_ID,
      businessAccountId
    );

    res.json({
      success: true,
      data: { stats },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Link employee to GX user profile
 * POST /api/v1/employees/:id/link-user
 */
export async function linkEmployeeToUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId, walletId } = req.body;

    if (!userId || !walletId) {
      res.status(400).json({
        success: false,
        error: 'userId and walletId are required',
      });
      return;
    }

    const employee = await employeesService.linkEmployeeToUser(
      DEFAULT_TENANT_ID,
      id,
      userId,
      walletId
    );

    res.json({
      success: true,
      data: { employee },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export const employeesController = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  deleteEmployee,
  getEmployeesDueForPayment,
  getDepartments,
  getEmployeeStats,
  linkEmployeeToUser,
};
