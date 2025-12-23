/**
 * Payroll Controller
 *
 * Phase 3: Business & Enterprise Features
 *
 * Handles HTTP requests for payroll operations.
 */

import { Request, Response } from 'express';
import * as payrollService from '../services/payroll.service';
import { Decimal } from '@prisma/client/runtime/library';

// Type alias for enum
type PayrollStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

// ============================================
// Payroll Record Endpoints
// ============================================

/**
 * Get payroll records for an employee
 * GET /api/v1/employees/:employeeId/payroll
 */
export async function getEmployeePayrollRecords(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId } = req.params;
    const { status, year, limit, offset } = req.query;

    const result = await payrollService.getEmployeePayrollRecords(
      DEFAULT_TENANT_ID,
      employeeId,
      {
        status: status as PayrollStatus | undefined,
        year: year ? parseInt(year as string) : undefined,
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
 * Create a payroll record
 * POST /api/v1/payroll-records
 */
export async function createPayrollRecord(req: Request, res: Response): Promise<void> {
  try {
    const {
      employeeId,
      payrollBatchId,
      periodStart,
      periodEnd,
      grossAmount,
      deductions,
      bonuses,
      deductionBreakdown,
      bonusBreakdown,
      notes,
    } = req.body;
    const user = (req as any).user;

    if (!employeeId || !periodStart || !periodEnd || grossAmount === undefined) {
      res.status(400).json({
        success: false,
        error: 'employeeId, periodStart, periodEnd, and grossAmount are required',
      });
      return;
    }

    const record = await payrollService.createPayrollRecord({
      tenantId: DEFAULT_TENANT_ID,
      employeeId,
      payrollBatchId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      grossAmount,
      deductions,
      bonuses,
      deductionBreakdown,
      bonusBreakdown,
      notes,
      createdById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { record },
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
 * Update a payroll record
 * PUT /api/v1/payroll-records/:id
 */
export async function updatePayrollRecord(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { grossAmount, deductions, bonuses, deductionBreakdown, bonusBreakdown, notes } = req.body;

    const record = await payrollService.updatePayrollRecord(
      DEFAULT_TENANT_ID,
      id,
      { grossAmount, deductions, bonuses, deductionBreakdown, bonusBreakdown, notes }
    );

    res.json({
      success: true,
      data: { record },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('Can only update')) {
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
 * Submit payroll record for approval
 * POST /api/v1/payroll-records/:id/submit
 */
export async function submitPayrollForApproval(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const record = await payrollService.submitForApproval(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { record },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('Can only submit')) {
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
 * Approve a payroll record
 * POST /api/v1/payroll-records/:id/approve
 */
export async function approvePayrollRecord(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const record = await payrollService.approvePayrollRecord(
      DEFAULT_TENANT_ID,
      id,
      user?.profileId || user?.adminId || 'system'
    );

    res.json({
      success: true,
      data: { record },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('not pending approval')) {
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
 * Cancel a payroll record
 * POST /api/v1/payroll-records/:id/cancel
 */
export async function cancelPayrollRecord(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const record = await payrollService.cancelPayrollRecord(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { record },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('Cannot cancel')) {
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

// ============================================
// Payroll Batch Endpoints
// ============================================

/**
 * Get all payroll batches for a business account
 * GET /api/v1/business-accounts/:businessAccountId/payroll-batches
 */
export async function getPayrollBatches(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { status, year, limit, offset } = req.query;

    const result = await payrollService.getPayrollBatches(
      DEFAULT_TENANT_ID,
      businessAccountId,
      {
        status: status as PayrollStatus | undefined,
        year: year ? parseInt(year as string) : undefined,
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
 * Get a single payroll batch
 * GET /api/v1/payroll-batches/:id
 */
export async function getPayrollBatch(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const batch = await payrollService.getPayrollBatch(DEFAULT_TENANT_ID, id);

    if (!batch) {
      res.status(404).json({
        success: false,
        error: 'Payroll batch not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { batch },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create a payroll batch
 * POST /api/v1/payroll-batches
 */
export async function createPayrollBatch(req: Request, res: Response): Promise<void> {
  try {
    const {
      businessAccountId,
      name,
      periodStart,
      periodEnd,
      sourceSubAccountId,
      notes,
      employeeIds,
    } = req.body;
    const user = (req as any).user;

    if (!businessAccountId || !name || !periodStart || !periodEnd) {
      res.status(400).json({
        success: false,
        error: 'businessAccountId, name, periodStart, and periodEnd are required',
      });
      return;
    }

    const batch = await payrollService.createPayrollBatch({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      name,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      sourceSubAccountId,
      notes,
      createdById: user?.profileId || user?.adminId || 'system',
      employeeIds,
    });

    res.status(201).json({
      success: true,
      data: { batch },
    });
  } catch (error: any) {
    if (error.message.includes('No eligible employees')) {
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
 * Submit batch for approval
 * POST /api/v1/payroll-batches/:id/submit
 */
export async function submitBatchForApproval(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const batch = await payrollService.submitBatchForApproval(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      data: { batch },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('Can only submit')) {
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
 * Approve a payroll batch
 * POST /api/v1/payroll-batches/:id/approve
 */
export async function approveBatch(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const batch = await payrollService.approveBatch(
      DEFAULT_TENANT_ID,
      id,
      user?.profileId || user?.adminId || 'system'
    );

    res.json({
      success: true,
      data: { batch },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('not pending approval')) {
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
 * Process batch payments (execute actual transfers)
 * POST /api/v1/payroll-batches/:id/process
 */
export async function processBatchPayments(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Mock payment processor for now
    // In production, this would integrate with the actual GX payment system
    const mockProcessPayment = async (employeeId: string, _amount: Decimal, _walletId: string): Promise<string> => {
      // Simulate payment processing - in production this integrates with GX payment system
      return `tx-${Date.now()}-${employeeId.substring(0, 8)}`;
    };

    const result = await payrollService.processBatchPayments(
      DEFAULT_TENANT_ID,
      id,
      mockProcessPayment
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('must be approved')) {
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
 * Get payroll summary for a business account
 * GET /api/v1/business-accounts/:businessAccountId/payroll-summary
 */
export async function getPayrollSummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { year } = req.query;

    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();

    const summary = await payrollService.getPayrollSummary(
      DEFAULT_TENANT_ID,
      businessAccountId,
      currentYear
    );

    res.json({
      success: true,
      data: { summary, year: currentYear },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export const payrollController = {
  getEmployeePayrollRecords,
  createPayrollRecord,
  updatePayrollRecord,
  submitPayrollForApproval,
  approvePayrollRecord,
  cancelPayrollRecord,
  getPayrollBatches,
  getPayrollBatch,
  createPayrollBatch,
  submitBatchForApproval,
  approveBatch,
  processBatchPayments,
  getPayrollSummary,
};
