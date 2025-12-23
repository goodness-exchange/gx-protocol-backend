/**
 * Business Sub-Accounts Controller
 *
 * Phase 3: Business & Enterprise Features
 *
 * Handles HTTP requests for business sub-account operations.
 */

import { Request, Response } from 'express';
import * as businessSubAccountsService from '../services/business-subaccounts.service';

// Type aliases for enums
type BusinessSubAccountType =
  | 'PAYROLL' | 'OPERATING_EXPENSES' | 'TAX_RESERVE' | 'MARKETING' | 'SALES'
  | 'R_AND_D' | 'EQUIPMENT' | 'INVENTORY' | 'DEPARTMENT' | 'PROJECT'
  | 'CLIENT_ESCROW' | 'VENDOR_PAYMENTS' | 'CUSTOM_BUSINESS';

type BudgetPeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

/**
 * Get all sub-accounts for a business account
 * GET /api/v1/business-accounts/:businessAccountId/sub-accounts
 */
export async function getBusinessSubAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { includeInactive, type } = req.query;

    const subAccounts = await businessSubAccountsService.getBusinessSubAccounts(
      DEFAULT_TENANT_ID,
      businessAccountId,
      {
        includeInactive: includeInactive === 'true',
        type: type as BusinessSubAccountType | undefined,
      }
    );

    res.json({
      success: true,
      data: {
        subAccounts,
        total: subAccounts.length,
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
 * Get a single business sub-account
 * GET /api/v1/business-sub-accounts/:id
 */
export async function getBusinessSubAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const subAccount = await businessSubAccountsService.getBusinessSubAccount(
      DEFAULT_TENANT_ID,
      id
    );

    if (!subAccount) {
      res.status(404).json({
        success: false,
        error: 'Business sub-account not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { subAccount },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create a new business sub-account
 * POST /api/v1/business-sub-accounts
 */
export async function createBusinessSubAccount(req: Request, res: Response): Promise<void> {
  try {
    const {
      businessAccountId,
      name,
      description,
      type,
      departmentId,
      projectId,
      costCenter,
      annualBudget,
      monthlyBudget,
      requiresApproval,
      approvalThreshold,
      managerId,
      allowedUserIds,
      icon,
      color,
    } = req.body;

    if (!businessAccountId || !name || !type) {
      res.status(400).json({
        success: false,
        error: 'businessAccountId, name, and type are required',
      });
      return;
    }

    const subAccount = await businessSubAccountsService.createBusinessSubAccount({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      name,
      description,
      type,
      departmentId,
      projectId,
      costCenter,
      annualBudget,
      monthlyBudget,
      requiresApproval,
      approvalThreshold,
      managerId,
      allowedUserIds,
      icon,
      color,
    });

    res.status(201).json({
      success: true,
      data: { subAccount },
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
 * Update a business sub-account
 * PUT /api/v1/business-sub-accounts/:id
 */
export async function updateBusinessSubAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const subAccount = await businessSubAccountsService.updateBusinessSubAccount(
      DEFAULT_TENANT_ID,
      id,
      updateData
    );

    res.json({
      success: true,
      data: { subAccount },
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
 * Delete a business sub-account
 * DELETE /api/v1/business-sub-accounts/:id
 */
export async function deleteBusinessSubAccount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await businessSubAccountsService.deleteBusinessSubAccount(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      message: 'Business sub-account deleted successfully',
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('non-zero balance')) {
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
 * Allocate funds to a business sub-account
 * POST /api/v1/business-sub-accounts/:id/allocate
 */
export async function allocateFunds(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { amount, description, reference } = req.body;
    const user = (req as any).user;

    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Valid positive amount is required',
      });
      return;
    }

    const result = await businessSubAccountsService.allocateFunds({
      tenantId: DEFAULT_TENANT_ID,
      businessSubAccountId: id,
      amount,
      description,
      reference,
      createdById: user?.profileId || user?.adminId || 'system',
    });

    res.json({
      success: true,
      data: {
        transaction: result.transaction,
        newBalance: result.newBalance,
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
 * Record an expense from a business sub-account
 * POST /api/v1/business-sub-accounts/:id/expense
 */
export async function recordExpense(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { amount, description, reference, vendorName, approvedById } = req.body;
    const user = (req as any).user;

    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Valid positive amount is required',
      });
      return;
    }

    const result = await businessSubAccountsService.recordExpense({
      tenantId: DEFAULT_TENANT_ID,
      businessSubAccountId: id,
      amount,
      description,
      reference,
      vendorName,
      createdById: user?.profileId || user?.adminId || 'system',
      approvedById,
    });

    res.json({
      success: true,
      data: {
        transaction: result.transaction,
        newBalance: result.newBalance,
      },
    });
  } catch (error: any) {
    if (error.message.includes('Insufficient balance')) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }
    if (error.message.includes('require approval')) {
      res.status(403).json({
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
 * Transfer between business sub-accounts
 * POST /api/v1/business-sub-accounts/transfer
 */
export async function transferBetweenSubAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { fromSubAccountId, toSubAccountId, amount, description } = req.body;
    const user = (req as any).user;

    if (!fromSubAccountId || !toSubAccountId || !amount) {
      res.status(400).json({
        success: false,
        error: 'fromSubAccountId, toSubAccountId, and amount are required',
      });
      return;
    }

    const result = await businessSubAccountsService.transferBetweenSubAccounts(
      DEFAULT_TENANT_ID,
      fromSubAccountId,
      toSubAccountId,
      amount,
      description || 'Transfer',
      user?.profileId || user?.adminId || 'system'
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.message.includes('Insufficient balance')) {
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
 * Get transactions for a business sub-account
 * GET /api/v1/business-sub-accounts/:id/transactions
 */
export async function getTransactions(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { type, startDate, endDate, limit, offset } = req.query;

    const result = await businessSubAccountsService.getBusinessSubAccountTransactions(
      DEFAULT_TENANT_ID,
      id,
      {
        type: type as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
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
 * Create a budget period for a business sub-account
 * POST /api/v1/business-sub-accounts/:id/budget-periods
 */
export async function createBudgetPeriod(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { periodType, startDate, endDate, budgetAmount, alertThreshold } = req.body;

    if (!periodType || !startDate || !endDate || !budgetAmount) {
      res.status(400).json({
        success: false,
        error: 'periodType, startDate, endDate, and budgetAmount are required',
      });
      return;
    }

    const budgetPeriod = await businessSubAccountsService.createBudgetPeriod({
      tenantId: DEFAULT_TENANT_ID,
      businessSubAccountId: id,
      periodType: periodType as BudgetPeriodType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      budgetAmount,
      alertThreshold,
    });

    res.status(201).json({
      success: true,
      data: { budgetPeriod },
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
 * Get budget summary for a business account
 * GET /api/v1/business-accounts/:businessAccountId/budget-summary
 */
export async function getBudgetSummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;

    const summary = await businessSubAccountsService.getBusinessBudgetSummary(
      DEFAULT_TENANT_ID,
      businessAccountId
    );

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export const businessSubAccountsController = {
  getBusinessSubAccounts,
  getBusinessSubAccount,
  createBusinessSubAccount,
  updateBusinessSubAccount,
  deleteBusinessSubAccount,
  allocateFunds,
  recordExpense,
  transferBetweenSubAccounts,
  getTransactions,
  createBudgetPeriod,
  getBudgetSummary,
};
