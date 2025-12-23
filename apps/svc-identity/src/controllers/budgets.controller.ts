/**
 * Budgets Controller
 * API handlers for budget period management
 * Phase 2: Personal Finance Features
 */

import { Request, Response, NextFunction } from 'express';
import { budgetService } from '../services/budgets.service';

interface AuthenticatedRequest extends Request {
  user?: {
    profileId: string;
    walletId: string;
    email: string;
  };
}

const TENANT_ID = 'default';

/**
 * Create a new budget period
 */
export async function createBudget(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId, subAccountId, periodType, budgetAmount, startDate, endDate, alertThreshold } = req.body;

    if (!walletId || !periodType || !budgetAmount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: walletId, periodType, budgetAmount',
      });
      return;
    }

    const budget = await budgetService.createBudgetPeriod({
      tenantId: TENANT_ID,
      walletId,
      subAccountId,
      periodType,
      budgetAmount,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      alertThreshold,
    });

    res.status(201).json({
      success: true,
      data: { budget },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get budget by ID
 */
export async function getBudget(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { budgetId } = req.params;

    const budget = await budgetService.getBudgetPeriod(TENANT_ID, budgetId);

    if (!budget) {
      res.status(404).json({
        success: false,
        error: 'Budget not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { budget },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List budget periods
 */
export async function listBudgets(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId, subAccountId, status, active, limit, offset } = req.query;

    if (!walletId) {
      res.status(400).json({
        success: false,
        error: 'walletId is required',
      });
      return;
    }

    const result = await budgetService.listBudgetPeriods(TENANT_ID, walletId as string, {
      subAccountId: subAccountId as string,
      status: status as 'ON_TRACK' | 'WARNING' | 'EXCEEDED' | 'COMPLETED',
      active: active !== 'false',
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a budget
 */
export async function updateBudget(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { budgetId } = req.params;
    const { budgetAmount, alertThreshold, status } = req.body;

    const budget = await budgetService.updateBudgetPeriod(TENANT_ID, budgetId, {
      budgetAmount,
      alertThreshold,
      status,
    });

    res.json({
      success: true,
      data: { budget },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a budget
 */
export async function deleteBudget(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { budgetId } = req.params;

    await budgetService.deleteBudgetPeriod(TENANT_ID, budgetId);

    res.json({
      success: true,
      message: 'Budget deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get budget summary for a wallet
 */
export async function getBudgetSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId, periodType } = req.query;

    if (!walletId) {
      res.status(400).json({
        success: false,
        error: 'walletId is required',
      });
      return;
    }

    const summary = await budgetService.getBudgetSummary(
      TENANT_ID,
      walletId as string,
      periodType as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM' | undefined
    );

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Check budget alerts (admin/scheduled job endpoint)
 */
export async function checkAlerts(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const alerts = await budgetService.checkBudgetAlerts(TENANT_ID);

    res.json({
      success: true,
      data: {
        alertsTriggered: alerts.length,
        alerts,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Complete expired budgets (admin/scheduled job endpoint)
 */
export async function completeExpired(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const count = await budgetService.completeExpiredBudgets();

    res.json({
      success: true,
      data: {
        completedCount: count,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Auto-create monthly budgets for a wallet
 */
export async function autoCreateMonthly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.body;

    if (!walletId) {
      res.status(400).json({
        success: false,
        error: 'walletId is required',
      });
      return;
    }

    const created = await budgetService.autoCreateMonthlyBudgets(TENANT_ID, walletId);

    res.json({
      success: true,
      data: {
        createdCount: created.length,
        budgets: created,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const budgetsController = {
  createBudget,
  getBudget,
  listBudgets,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  checkAlerts,
  completeExpired,
  autoCreateMonthly,
};
