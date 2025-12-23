/**
 * Allocation Rules Controller
 * API handlers for automatic allocation rule management
 * Phase 2: Personal Finance Features
 */

import { Request, Response, NextFunction } from 'express';
import { allocationEngineService } from '../services/allocation-engine.service';

interface AuthenticatedRequest extends Request {
  user?: {
    profileId: string;
    walletId: string;
    email: string;
  };
}

const TENANT_ID = 'default';

/**
 * Create a new allocation rule
 */
export async function createRule(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      walletId,
      subAccountId,
      name,
      description,
      ruleType,
      percentage,
      fixedAmount,
      triggerType,
      minTriggerAmount,
      frequency,
      dayOfMonth,
      dayOfWeek,
      priority,
    } = req.body;

    // Validate required fields
    if (!walletId || !subAccountId || !name || !ruleType || !triggerType) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: walletId, subAccountId, name, ruleType, triggerType',
      });
      return;
    }

    // Validate rule type specific fields
    if (ruleType === 'PERCENTAGE' && (!percentage || percentage <= 0 || percentage > 100)) {
      res.status(400).json({
        success: false,
        error: 'PERCENTAGE rule requires percentage between 0 and 100',
      });
      return;
    }

    if (ruleType === 'FIXED_AMOUNT' && (!fixedAmount || fixedAmount <= 0)) {
      res.status(400).json({
        success: false,
        error: 'FIXED_AMOUNT rule requires a positive fixedAmount',
      });
      return;
    }

    // Validate schedule fields
    if (triggerType === 'ON_SCHEDULE' && !frequency) {
      res.status(400).json({
        success: false,
        error: 'ON_SCHEDULE trigger requires frequency',
      });
      return;
    }

    const rule = await allocationEngineService.createAllocationRule({
      tenantId: TENANT_ID,
      walletId,
      subAccountId,
      name,
      description,
      ruleType,
      percentage,
      fixedAmount,
      triggerType,
      minTriggerAmount,
      frequency,
      dayOfMonth,
      dayOfWeek,
      priority,
    });

    res.status(201).json({
      success: true,
      data: { rule },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update an allocation rule
 */
export async function updateRule(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    const rule = await allocationEngineService.updateAllocationRule(
      TENANT_ID,
      ruleId,
      updates
    );

    res.json({
      success: true,
      data: { rule },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an allocation rule
 */
export async function deleteRule(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ruleId } = req.params;

    await allocationEngineService.deleteAllocationRule(TENANT_ID, ruleId);

    res.json({
      success: true,
      message: 'Allocation rule deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Execute manual allocation
 */
export async function manualAllocate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.params;
    const { subAccountId, amount, description } = req.body;

    if (!subAccountId || !amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'subAccountId and positive amount are required',
      });
      return;
    }

    const result = await allocationEngineService.executeManualAllocation(
      TENANT_ID,
      walletId,
      subAccountId,
      amount,
      description
    );

    res.json({
      success: true,
      data: { allocation: result },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Preview allocations
 */
export async function previewAllocations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId, amount, triggerType } = req.query;

    if (!walletId || !amount) {
      res.status(400).json({
        success: false,
        error: 'walletId and amount are required',
      });
      return;
    }

    const parsedAmount = parseFloat(amount as string);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'amount must be a positive number',
      });
      return;
    }

    const preview = await allocationEngineService.previewAllocations(
      TENANT_ID,
      walletId as string,
      parsedAmount,
      (triggerType as 'ON_RECEIVE' | 'ON_SCHEDULE' | 'MANUAL') || 'ON_RECEIVE'
    );

    res.json({
      success: true,
      data: { preview },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get allocation history for a sub-account
 */
export async function getAllocationHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;
    const { limit, offset, startDate, endDate } = req.query;

    const history = await allocationEngineService.getAllocationHistory(
      TENANT_ID,
      subAccountId,
      {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      }
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Process scheduled allocations (admin/cron endpoint)
 */
export async function processScheduled(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const results = await allocationEngineService.processScheduledAllocations(TENANT_ID);

    res.json({
      success: true,
      data: {
        processed: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const allocationRulesController = {
  createRule,
  updateRule,
  deleteRule,
  manualAllocate,
  previewAllocations,
  getAllocationHistory,
  processScheduled,
};
