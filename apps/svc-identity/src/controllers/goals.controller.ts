/**
 * Goals Controller
 * API handlers for savings goals management
 * Phase 2: Personal Finance Features
 */

import { Request, Response, NextFunction } from 'express';
import { goalsService } from '../services/goals.service';

interface AuthenticatedRequest extends Request {
  user?: {
    profileId: string;
    walletId: string;
    email: string;
  };
}

const TENANT_ID = 'default';

/**
 * Set or update a goal for a sub-account
 */
export async function setGoal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;
    const { goalAmount, goalName, goalDeadline } = req.body;

    if (!goalAmount || goalAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'goalAmount is required and must be positive',
      });
      return;
    }

    const progress = await goalsService.setGoal(TENANT_ID, subAccountId, {
      goalAmount,
      goalName,
      goalDeadline: goalDeadline ? new Date(goalDeadline) : undefined,
    });

    res.json({
      success: true,
      data: { goal: progress },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove goal from a sub-account
 */
export async function removeGoal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;

    await goalsService.removeGoal(TENANT_ID, subAccountId);

    res.json({
      success: true,
      message: 'Goal removed successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get goal progress for a sub-account
 */
export async function getGoalProgress(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;

    const progress = await goalsService.getGoalProgress(TENANT_ID, subAccountId);

    if (!progress) {
      res.status(404).json({
        success: false,
        error: 'No goal set for this sub-account',
      });
      return;
    }

    res.json({
      success: true,
      data: { goal: progress },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all goals summary for a wallet
 */
export async function getGoalsSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.params;

    const summary = await goalsService.getGoalsSummary(TENANT_ID, walletId);

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get upcoming goal deadlines
 */
export async function getUpcomingDeadlines(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.params;
    const { days } = req.query;

    const daysAhead = days ? parseInt(days as string) : 30;
    const goals = await goalsService.getUpcomingDeadlines(TENANT_ID, walletId, daysAhead);

    res.json({
      success: true,
      data: { goals },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get overdue goals
 */
export async function getOverdueGoals(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.params;

    const goals = await goalsService.getOverdueGoals(TENANT_ID, walletId);

    res.json({
      success: true,
      data: { goals },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get off-track goals
 */
export async function getOffTrackGoals(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { walletId } = req.params;

    const goals = await goalsService.getOffTrackGoals(TENANT_ID, walletId);

    res.json({
      success: true,
      data: { goals },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get suggested contribution amount
 */
export async function getSuggestedContribution(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;
    const { frequency } = req.query;

    if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency as string)) {
      res.status(400).json({
        success: false,
        error: 'frequency must be one of: daily, weekly, monthly',
      });
      return;
    }

    const suggestion = await goalsService.getSuggestedContribution(
      TENANT_ID,
      subAccountId,
      frequency as 'daily' | 'weekly' | 'monthly'
    );

    if (!suggestion) {
      res.status(404).json({
        success: false,
        error: 'No active goal for this sub-account',
      });
      return;
    }

    res.json({
      success: true,
      data: { suggestion },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get goal milestones
 */
export async function getGoalMilestones(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { subAccountId } = req.params;

    const milestones = await goalsService.getGoalMilestones(TENANT_ID, subAccountId);

    res.json({
      success: true,
      data: { milestones },
    });
  } catch (error) {
    next(error);
  }
}

export const goalsController = {
  setGoal,
  removeGoal,
  getGoalProgress,
  getGoalsSummary,
  getUpcomingDeadlines,
  getOverdueGoals,
  getOffTrackGoals,
  getSuggestedContribution,
  getGoalMilestones,
};
