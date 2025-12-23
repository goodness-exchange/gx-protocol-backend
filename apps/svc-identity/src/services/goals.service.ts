/**
 * Goals Service
 * Manages savings goals for sub-accounts with progress tracking
 * Phase 2: Personal Finance Features
 */

import { db } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Type for sub-account with goal fields
interface SubAccountWithGoal {
  id: string;
  name: string;
  goalName: string | null;
  goalAmount: Decimal | null;
  goalDeadline: Date | null;
  currentBalance: Decimal;
}

interface GoalProgress {
  subAccountId: string;
  subAccountName: string;
  goalName: string | null;
  goalAmount: Decimal;
  currentBalance: Decimal;
  progressPercent: number;
  remainingAmount: Decimal;
  deadline: Date | null;
  daysRemaining: number | null;
  requiredDailyContribution: Decimal | null;
  isOnTrack: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'NEAR_GOAL' | 'ACHIEVED' | 'OVERDUE';
}

interface GoalSummary {
  totalGoals: number;
  goalsAchieved: number;
  goalsInProgress: number;
  goalsOverdue: number;
  totalTargetAmount: string;
  totalSavedAmount: string;
  overallProgress: number;
  goals: GoalProgress[];
}

interface SetGoalInput {
  goalAmount: number;
  goalName?: string;
  goalDeadline?: Date;
}

export class GoalsService {
  /**
   * Set or update a goal for a sub-account
   */
  async setGoal(
    tenantId: string,
    subAccountId: string,
    input: SetGoalInput
  ) {
    const subAccount = await db.subAccount.findFirst({
      where: {
        id: subAccountId,
        tenantId,
        isActive: true,
      },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found');
    }

    const updated = await db.subAccount.update({
      where: { id: subAccountId },
      data: {
        goalAmount: new Decimal(input.goalAmount),
        goalName: input.goalName || null,
        goalDeadline: input.goalDeadline || null,
      },
    });

    return this.calculateGoalProgress(updated);
  }

  /**
   * Remove goal from a sub-account
   */
  async removeGoal(tenantId: string, subAccountId: string) {
    const subAccount = await db.subAccount.findFirst({
      where: {
        id: subAccountId,
        tenantId,
        isActive: true,
      },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found');
    }

    await db.subAccount.update({
      where: { id: subAccountId },
      data: {
        goalAmount: null,
        goalName: null,
        goalDeadline: null,
      },
    });

    return { success: true };
  }

  /**
   * Get goal progress for a single sub-account
   */
  async getGoalProgress(
    tenantId: string,
    subAccountId: string
  ): Promise<GoalProgress | null> {
    const subAccount = await db.subAccount.findFirst({
      where: {
        id: subAccountId,
        tenantId,
        isActive: true,
        goalAmount: { not: null },
      },
    });

    if (!subAccount || !subAccount.goalAmount) {
      return null;
    }

    return this.calculateGoalProgress(subAccount);
  }

  /**
   * Get all goals summary for a wallet
   */
  async getGoalsSummary(
    tenantId: string,
    walletId: string
  ): Promise<GoalSummary> {
    const subAccountsWithGoals = await db.subAccount.findMany({
      where: {
        tenantId,
        walletId,
        isActive: true,
        goalAmount: { not: null },
      },
      orderBy: { goalDeadline: 'asc' },
    });

    const goals: GoalProgress[] = subAccountsWithGoals.map((sa: SubAccountWithGoal) =>
      this.calculateGoalProgress(sa)
    );

    let totalTargetAmount = new Decimal(0);
    let totalSavedAmount = new Decimal(0);
    let goalsAchieved = 0;
    let goalsInProgress = 0;
    let goalsOverdue = 0;

    for (const goal of goals) {
      totalTargetAmount = totalTargetAmount.plus(goal.goalAmount);
      totalSavedAmount = totalSavedAmount.plus(goal.currentBalance);

      switch (goal.status) {
        case 'ACHIEVED':
          goalsAchieved++;
          break;
        case 'OVERDUE':
          goalsOverdue++;
          break;
        case 'IN_PROGRESS':
        case 'NEAR_GOAL':
        case 'NOT_STARTED':
          goalsInProgress++;
          break;
      }
    }

    const overallProgress = totalTargetAmount.isZero()
      ? 0
      : totalSavedAmount.dividedBy(totalTargetAmount).times(100).toNumber();

    return {
      totalGoals: goals.length,
      goalsAchieved,
      goalsInProgress,
      goalsOverdue,
      totalTargetAmount: totalTargetAmount.toString(),
      totalSavedAmount: totalSavedAmount.toString(),
      overallProgress: Math.round(overallProgress * 100) / 100,
      goals,
    };
  }

  /**
   * Calculate goal progress for a sub-account
   * @private
   */
  private calculateGoalProgress(subAccount: {
    id: string;
    name: string;
    goalName: string | null;
    goalAmount: Decimal | null;
    goalDeadline: Date | null;
    currentBalance: Decimal;
  }): GoalProgress {
    const goalAmount = subAccount.goalAmount || new Decimal(0);
    const currentBalance = subAccount.currentBalance;

    const progressPercent = goalAmount.isZero()
      ? 0
      : currentBalance.dividedBy(goalAmount).times(100).toNumber();

    const remainingAmount = Decimal.max(
      goalAmount.minus(currentBalance),
      new Decimal(0)
    );

    let daysRemaining: number | null = null;
    let requiredDailyContribution: Decimal | null = null;
    let isOnTrack = true;

    if (subAccount.goalDeadline) {
      const now = new Date();
      const deadline = new Date(subAccount.goalDeadline);
      const msRemaining = deadline.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

      if (daysRemaining > 0 && remainingAmount.isPositive()) {
        requiredDailyContribution = remainingAmount.dividedBy(daysRemaining);

        // Consider on track if meeting at least 80% of required pace
        const expectedProgress = goalAmount
          .times(1 - daysRemaining / this.getTotalDaysForGoal(subAccount.goalDeadline));
        isOnTrack = currentBalance.greaterThanOrEqualTo(expectedProgress.times(0.8));
      }
    }

    // Determine status
    let status: GoalProgress['status'];
    if (currentBalance.greaterThanOrEqualTo(goalAmount)) {
      status = 'ACHIEVED';
    } else if (subAccount.goalDeadline && daysRemaining !== null && daysRemaining <= 0 && remainingAmount.isPositive()) {
      status = 'OVERDUE';
    } else if (progressPercent >= 90) {
      status = 'NEAR_GOAL';
    } else if (progressPercent > 0) {
      status = 'IN_PROGRESS';
    } else {
      status = 'NOT_STARTED';
    }

    return {
      subAccountId: subAccount.id,
      subAccountName: subAccount.name,
      goalName: subAccount.goalName,
      goalAmount,
      currentBalance,
      progressPercent: Math.round(progressPercent * 100) / 100,
      remainingAmount,
      deadline: subAccount.goalDeadline,
      daysRemaining,
      requiredDailyContribution,
      isOnTrack,
      status,
    };
  }

  /**
   * Get total days from now until goal was created (approximation)
   * @private
   */
  private getTotalDaysForGoal(deadline: Date): number {
    // Assume goals are typically set 3-12 months in advance
    // This is an approximation for pace tracking
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const totalMs = deadlineDate.getTime() - now.getTime();
    return Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Get goals that are near deadline (within X days)
   */
  async getUpcomingDeadlines(
    tenantId: string,
    walletId: string,
    daysAhead: number = 30
  ): Promise<GoalProgress[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const subAccountsWithUpcomingDeadlines = await db.subAccount.findMany({
      where: {
        tenantId,
        walletId,
        isActive: true,
        goalAmount: { not: null },
        goalDeadline: {
          gte: now,
          lte: futureDate,
        },
      },
      orderBy: { goalDeadline: 'asc' },
    });

    return subAccountsWithUpcomingDeadlines.map((sa: SubAccountWithGoal) =>
      this.calculateGoalProgress(sa)
    );
  }

  /**
   * Get overdue goals
   */
  async getOverdueGoals(
    tenantId: string,
    walletId: string
  ): Promise<GoalProgress[]> {
    const now = new Date();

    const subAccounts = await db.subAccount.findMany({
      where: {
        tenantId,
        walletId,
        isActive: true,
        goalAmount: { not: null },
        goalDeadline: { lt: now },
      },
      orderBy: { goalDeadline: 'asc' },
    });

    return subAccounts
      .map((sa: SubAccountWithGoal) => this.calculateGoalProgress(sa))
      .filter((goal: GoalProgress) => goal.status === 'OVERDUE');
  }

  /**
   * Get goals that are behind schedule
   */
  async getOffTrackGoals(
    tenantId: string,
    walletId: string
  ): Promise<GoalProgress[]> {
    const subAccounts = await db.subAccount.findMany({
      where: {
        tenantId,
        walletId,
        isActive: true,
        goalAmount: { not: null },
        goalDeadline: { not: null },
      },
    });

    return subAccounts
      .map((sa: SubAccountWithGoal) => this.calculateGoalProgress(sa))
      .filter((goal: GoalProgress) => !goal.isOnTrack && goal.status !== 'ACHIEVED');
  }

  /**
   * Calculate suggested contribution amount to meet goal
   */
  async getSuggestedContribution(
    tenantId: string,
    subAccountId: string,
    contributionFrequency: 'daily' | 'weekly' | 'monthly'
  ): Promise<{
    suggestedAmount: string;
    contributionsNeeded: number;
    projectedCompletionDate: Date | null;
  } | null> {
    const progress = await this.getGoalProgress(tenantId, subAccountId);
    if (!progress || progress.status === 'ACHIEVED') {
      return null;
    }

    let divisor: number;
    let daysPerContribution: number;

    switch (contributionFrequency) {
      case 'daily':
        divisor = progress.daysRemaining || 30;
        daysPerContribution = 1;
        break;
      case 'weekly':
        divisor = Math.ceil((progress.daysRemaining || 30) / 7);
        daysPerContribution = 7;
        break;
      case 'monthly':
        divisor = Math.ceil((progress.daysRemaining || 30) / 30);
        daysPerContribution = 30;
        break;
    }

    const suggestedAmount = progress.remainingAmount.dividedBy(Math.max(1, divisor));
    const contributionsNeeded = Math.ceil(divisor);

    let projectedCompletionDate: Date | null = null;
    if (progress.deadline) {
      projectedCompletionDate = progress.deadline;
    } else {
      // If no deadline, estimate based on contributions
      projectedCompletionDate = new Date();
      projectedCompletionDate.setDate(
        projectedCompletionDate.getDate() + contributionsNeeded * daysPerContribution
      );
    }

    return {
      suggestedAmount: suggestedAmount.toFixed(2),
      contributionsNeeded,
      projectedCompletionDate,
    };
  }

  /**
   * Get milestone events for a goal
   * Returns key milestones: 25%, 50%, 75%, 90%, 100%
   */
  async getGoalMilestones(
    tenantId: string,
    subAccountId: string
  ): Promise<Array<{
    milestone: number;
    targetAmount: string;
    achieved: boolean;
    achievedAt?: Date;
  }>> {
    const progress = await this.getGoalProgress(tenantId, subAccountId);
    if (!progress) {
      return [];
    }

    const milestones = [25, 50, 75, 90, 100];

    return milestones.map((milestone) => {
      const targetAmount = progress.goalAmount.times(milestone).dividedBy(100);
      const achieved = progress.currentBalance.greaterThanOrEqualTo(targetAmount);

      return {
        milestone,
        targetAmount: targetAmount.toString(),
        achieved,
        // Note: Would need historical data to track when milestones were achieved
      };
    });
  }
}

export const goalsService = new GoalsService();
