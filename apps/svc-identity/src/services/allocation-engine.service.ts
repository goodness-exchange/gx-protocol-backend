/**
 * Allocation Engine Service
 * Handles automatic fund distribution to sub-accounts based on rules
 * Phase 2: Personal Finance Features
 */

import { db, Prisma } from '@gx/core-db';
import { Decimal } from '@prisma/client/runtime/library';

// Transaction client type
type TransactionClient = Prisma.TransactionClient;

// Local type definitions
type AllocationRuleType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'REMAINDER';
type AllocationTrigger = 'ON_RECEIVE' | 'ON_SCHEDULE' | 'MANUAL';
type AllocationFrequency = 'DAILY' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY';

// Type for allocation rule from database
interface AllocationRuleWithSubAccount {
  id: string;
  tenantId: string;
  walletId: string;
  subAccountId: string;
  name: string;
  ruleType: string;
  percentage: Decimal | null;
  fixedAmount: Decimal | null;
  minTriggerAmount: Decimal | null;
  triggerType: string;
  frequency: string | null;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  subAccount: {
    id: string;
    name: string;
    currentBalance: Decimal;
    isActive: boolean;
  };
  wallet?: {
    walletId: string;
    balance: Decimal | null;
  };
}

interface AllocationResult {
  ruleId: string;
  ruleName: string;
  subAccountId: string;
  subAccountName: string;
  amount: Decimal;
  executionId: string;
  success: boolean;
  error?: string;
}

interface AllocationPreview {
  subAccountId: string;
  subAccountName: string;
  ruleName: string;
  ruleType: AllocationRuleType;
  calculatedAmount: Decimal;
  currentBalance: Decimal;
  afterBalance: Decimal;
}

export class AllocationEngineService {
  /**
   * Process allocations when funds are received
   * Called from transaction completion webhook/event
   */
  async processOnReceiveAllocations(
    tenantId: string,
    walletId: string,
    receivedAmount: Decimal,
    sourceTransactionId?: string
  ): Promise<AllocationResult[]> {
    // Get active ON_RECEIVE rules for this wallet, ordered by priority
    const rules = await db.allocationRule.findMany({
      where: {
        tenantId,
        walletId,
        triggerType: 'ON_RECEIVE',
        isActive: true,
      },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            currentBalance: true,
            isActive: true,
          },
        },
      },
      orderBy: { priority: 'desc' },
    });

    // Filter rules that meet minimum trigger amount
    const eligibleRules = rules.filter((rule: AllocationRuleWithSubAccount) => {
      if (!rule.minTriggerAmount) return true;
      return receivedAmount.greaterThanOrEqualTo(rule.minTriggerAmount);
    });

    if (eligibleRules.length === 0) {
      return [];
    }

    // Calculate allocations
    const allocations = this.calculateAllocations(eligibleRules, receivedAmount);

    // Execute allocations
    const results: AllocationResult[] = [];

    for (const allocation of allocations) {
      try {
        const result = await this.executeAllocation(
          tenantId,
          allocation.ruleId,
          allocation.subAccountId,
          allocation.amount,
          'ON_RECEIVE',
          receivedAmount,
          sourceTransactionId
        );
        results.push({
          ...allocation,
          executionId: result.executionId,
          success: true,
        });
      } catch (error) {
        results.push({
          ...allocation,
          executionId: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Process scheduled allocations
   * Called by scheduled job (cron)
   */
  async processScheduledAllocations(tenantId?: string): Promise<AllocationResult[]> {
    const now = new Date();

    // Get rules due for execution
    const where: Record<string, unknown> = {
      triggerType: 'ON_SCHEDULE',
      isActive: true,
      OR: [
        { nextScheduledAt: null },
        { nextScheduledAt: { lte: now } },
      ],
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const rules = await db.allocationRule.findMany({
      where,
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            currentBalance: true,
            isActive: true,
          },
        },
        wallet: {
          select: {
            walletId: true,
            balance: true,
          },
        },
      },
      orderBy: { priority: 'desc' },
    });

    const results: AllocationResult[] = [];

    for (const rule of rules) {
      // Skip inactive sub-accounts
      if (!rule.subAccount.isActive) continue;

      try {
        let allocationAmount = new Decimal(0);

        // Calculate allocation based on rule type
        switch (rule.ruleType) {
          case 'FIXED_AMOUNT':
            if (rule.fixedAmount) {
              allocationAmount = rule.fixedAmount;
            }
            break;

          case 'PERCENTAGE':
            if (rule.percentage && rule.wallet.balance) {
              allocationAmount = rule.wallet.balance
                .times(rule.percentage)
                .dividedBy(100);
            }
            break;

          case 'REMAINDER':
            // For scheduled remainder, use available wallet balance
            // This is typically used to sweep remaining funds
            if (rule.wallet.balance) {
              allocationAmount = rule.wallet.balance;
            }
            break;
        }

        // Check minimum trigger amount
        if (rule.minTriggerAmount && allocationAmount.lessThan(rule.minTriggerAmount)) {
          continue;
        }

        if (allocationAmount.isPositive()) {
          const result = await this.executeAllocation(
            rule.tenantId,
            rule.id,
            rule.subAccountId,
            allocationAmount,
            'SCHEDULED',
            undefined,
            undefined
          );

          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            subAccountId: rule.subAccountId,
            subAccountName: rule.subAccount.name,
            amount: allocationAmount,
            executionId: result.executionId,
            success: true,
          });
        }

        // Update next scheduled time
        const nextScheduled = this.calculateNextScheduledTime(
          rule.frequency as AllocationFrequency | null,
          rule.dayOfMonth,
          rule.dayOfWeek
        );

        await db.allocationRule.update({
          where: { id: rule.id },
          data: {
            lastExecutedAt: now,
            nextScheduledAt: nextScheduled,
          },
        });
      } catch (error) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          subAccountId: rule.subAccountId,
          subAccountName: rule.subAccount.name,
          amount: new Decimal(0),
          executionId: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Execute a manual allocation
   */
  async executeManualAllocation(
    tenantId: string,
    walletId: string,
    subAccountId: string,
    amount: number,
    description?: string
  ): Promise<AllocationResult> {
    const subAccount = await db.subAccount.findFirst({
      where: {
        id: subAccountId,
        tenantId,
        walletId,
        isActive: true,
      },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found or inactive');
    }

    const allocationAmount = new Decimal(amount);

    const result = await this.executeAllocation(
      tenantId,
      'MANUAL',
      subAccountId,
      allocationAmount,
      'MANUAL',
      undefined,
      undefined,
      description
    );

    return {
      ruleId: 'MANUAL',
      ruleName: 'Manual Allocation',
      subAccountId,
      subAccountName: subAccount.name,
      amount: allocationAmount,
      executionId: result.executionId,
      success: true,
    };
  }

  /**
   * Preview allocations without executing
   */
  async previewAllocations(
    tenantId: string,
    walletId: string,
    amount: number,
    triggerType: AllocationTrigger = 'ON_RECEIVE'
  ): Promise<AllocationPreview[]> {
    const receivedAmount = new Decimal(amount);

    const rules = await db.allocationRule.findMany({
      where: {
        tenantId,
        walletId,
        triggerType,
        isActive: true,
      },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            currentBalance: true,
          },
        },
      },
      orderBy: { priority: 'desc' },
    });

    const eligibleRules = rules.filter((rule: AllocationRuleWithSubAccount) => {
      if (!rule.minTriggerAmount) return true;
      return receivedAmount.greaterThanOrEqualTo(rule.minTriggerAmount);
    });

    const allocations = this.calculateAllocations(eligibleRules as AllocationRuleWithSubAccount[], receivedAmount);

    return allocations.map((alloc) => {
      const rule = eligibleRules.find((r: AllocationRuleWithSubAccount) => r.id === alloc.ruleId);
      const currentBalance = rule?.subAccount.currentBalance || new Decimal(0);

      return {
        subAccountId: alloc.subAccountId,
        subAccountName: alloc.subAccountName,
        ruleName: alloc.ruleName,
        ruleType: (rule?.ruleType || 'FIXED_AMOUNT') as AllocationRuleType,
        calculatedAmount: alloc.amount,
        currentBalance,
        afterBalance: currentBalance.plus(alloc.amount),
      };
    });
  }

  /**
   * Calculate allocations based on rules
   * @private
   */
  private calculateAllocations(
    rules: Array<{
      id: string;
      name: string;
      ruleType: string;
      percentage: Decimal | null;
      fixedAmount: Decimal | null;
      subAccountId: string;
      subAccount: {
        id: string;
        name: string;
        currentBalance: Decimal;
        isActive: boolean;
      };
    }>,
    totalAmount: Decimal
  ): Array<{
    ruleId: string;
    ruleName: string;
    subAccountId: string;
    subAccountName: string;
    amount: Decimal;
  }> {
    const allocations: Array<{
      ruleId: string;
      ruleName: string;
      subAccountId: string;
      subAccountName: string;
      amount: Decimal;
    }> = [];

    let remainingAmount = totalAmount;

    // First pass: PERCENTAGE and FIXED_AMOUNT rules
    for (const rule of rules) {
      if (!rule.subAccount.isActive) continue;
      if (rule.ruleType === 'REMAINDER') continue; // Handle in second pass

      let allocationAmount = new Decimal(0);

      switch (rule.ruleType) {
        case 'PERCENTAGE':
          if (rule.percentage) {
            allocationAmount = totalAmount.times(rule.percentage).dividedBy(100);
          }
          break;

        case 'FIXED_AMOUNT':
          if (rule.fixedAmount) {
            allocationAmount = Decimal.min(rule.fixedAmount, remainingAmount);
          }
          break;
      }

      if (allocationAmount.isPositive()) {
        allocations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          subAccountId: rule.subAccountId,
          subAccountName: rule.subAccount.name,
          amount: allocationAmount,
        });

        remainingAmount = remainingAmount.minus(allocationAmount);
      }
    }

    // Second pass: REMAINDER rules
    for (const rule of rules) {
      if (!rule.subAccount.isActive) continue;
      if (rule.ruleType !== 'REMAINDER') continue;

      if (remainingAmount.isPositive()) {
        allocations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          subAccountId: rule.subAccountId,
          subAccountName: rule.subAccount.name,
          amount: remainingAmount,
        });

        remainingAmount = new Decimal(0);
        break; // Only one REMAINDER rule should get the remaining
      }
    }

    return allocations;
  }

  /**
   * Execute a single allocation
   * @private
   */
  private async executeAllocation(
    tenantId: string,
    ruleId: string,
    subAccountId: string,
    amount: Decimal,
    triggeredBy: string,
    triggerAmount?: Decimal,
    sourceTransactionId?: string,
    description?: string
  ): Promise<{ executionId: string }> {
    return await db.$transaction(async (tx: TransactionClient) => {
      // Get sub-account with lock
      const subAccount = await tx.subAccount.findUnique({
        where: { id: subAccountId },
      });

      if (!subAccount) {
        throw new Error('Sub-account not found');
      }

      const balanceBefore = subAccount.currentBalance;
      const balanceAfter = balanceBefore.plus(amount);

      // Update sub-account balance
      await tx.subAccount.update({
        where: { id: subAccountId },
        data: {
          currentBalance: balanceAfter,
        },
      });

      // Create sub-account transaction record
      await tx.subAccountTransaction.create({
        data: {
          tenantId,
          subAccountId,
          mainTransactionId: sourceTransactionId,
          type: 'ALLOCATION',
          amount,
          balanceBefore,
          balanceAfter,
          isCredit: true,
          description: description || `Auto-allocation: ${triggeredBy}`,
          reference: ruleId !== 'MANUAL' ? `RULE:${ruleId}` : undefined,
        },
      });

      // Create execution log (only for rule-based allocations)
      let executionId = `MANUAL-${Date.now()}`;

      if (ruleId !== 'MANUAL') {
        const execution = await tx.allocationExecution.create({
          data: {
            tenantId,
            ruleId,
            subAccountId,
            amount,
            triggerAmount,
            triggeredBy,
            sourceTransactionId,
            status: 'COMPLETED',
          },
        });
        executionId = execution.id;
      }

      // Record spending against budget if applicable
      // Note: Allocations are credits, not spending, but we track them
      // Budget spending is tracked separately when funds leave the sub-account

      return { executionId };
    });
  }

  /**
   * Calculate next scheduled time based on frequency
   * @private
   */
  private calculateNextScheduledTime(
    frequency: AllocationFrequency | null,
    dayOfMonth: number | null,
    dayOfWeek: number | null
  ): Date | null {
    if (!frequency) return null;

    const now = new Date();
    let next: Date;

    switch (frequency) {
      case 'DAILY':
        next = new Date(now);
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        break;

      case 'WEEKLY':
        next = new Date(now);
        const targetDay = dayOfWeek ?? 1; // Default to Monday
        const currentDay = next.getDay();
        const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
        next.setDate(next.getDate() + daysUntilTarget);
        next.setHours(0, 0, 0, 0);
        break;

      case 'BI_WEEKLY':
        next = new Date(now);
        next.setDate(next.getDate() + 14);
        next.setHours(0, 0, 0, 0);
        break;

      case 'MONTHLY':
        next = new Date(now);
        next.setMonth(next.getMonth() + 1);
        if (dayOfMonth) {
          next.setDate(Math.min(dayOfMonth, this.getDaysInMonth(next)));
        }
        next.setHours(0, 0, 0, 0);
        break;

      case 'QUARTERLY':
        next = new Date(now);
        next.setMonth(next.getMonth() + 3);
        if (dayOfMonth) {
          next.setDate(Math.min(dayOfMonth, this.getDaysInMonth(next)));
        }
        next.setHours(0, 0, 0, 0);
        break;

      default:
        return null;
    }

    return next;
  }

  /**
   * Get days in month
   * @private
   */
  private getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  /**
   * Get allocation history for a sub-account
   */
  async getAllocationHistory(
    tenantId: string,
    subAccountId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const { limit = 20, offset = 0, startDate, endDate } = options || {};

    const where: Record<string, unknown> = {
      tenantId,
      subAccountId,
    };

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) {
        (where.executedAt as Record<string, unknown>).gte = startDate;
      }
      if (endDate) {
        (where.executedAt as Record<string, unknown>).lte = endDate;
      }
    }

    const [executions, total] = await Promise.all([
      db.allocationExecution.findMany({
        where,
        include: {
          rule: {
            select: {
              name: true,
              ruleType: true,
            },
          },
        },
        orderBy: { executedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.allocationExecution.count({ where }),
    ]);

    return {
      executions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Create an allocation rule
   */
  async createAllocationRule(input: {
    tenantId: string;
    walletId: string;
    subAccountId: string;
    name: string;
    description?: string;
    ruleType: AllocationRuleType;
    percentage?: number;
    fixedAmount?: number;
    triggerType: AllocationTrigger;
    minTriggerAmount?: number;
    frequency?: AllocationFrequency;
    dayOfMonth?: number;
    dayOfWeek?: number;
    priority?: number;
  }) {
    // Validate sub-account belongs to wallet
    const subAccount = await db.subAccount.findFirst({
      where: {
        id: input.subAccountId,
        tenantId: input.tenantId,
        walletId: input.walletId,
      },
    });

    if (!subAccount) {
      throw new Error('Sub-account not found or does not belong to this wallet');
    }

    // Calculate initial next scheduled time if ON_SCHEDULE
    let nextScheduledAt: Date | null = null;
    if (input.triggerType === 'ON_SCHEDULE' && input.frequency) {
      nextScheduledAt = this.calculateNextScheduledTime(
        input.frequency,
        input.dayOfMonth ?? null,
        input.dayOfWeek ?? null
      );
    }

    const rule = await db.allocationRule.create({
      data: {
        tenantId: input.tenantId,
        walletId: input.walletId,
        subAccountId: input.subAccountId,
        name: input.name,
        description: input.description,
        ruleType: input.ruleType,
        percentage: input.percentage ? new Decimal(input.percentage) : null,
        fixedAmount: input.fixedAmount ? new Decimal(input.fixedAmount) : null,
        triggerType: input.triggerType,
        minTriggerAmount: input.minTriggerAmount ? new Decimal(input.minTriggerAmount) : null,
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth,
        dayOfWeek: input.dayOfWeek,
        nextScheduledAt,
        isActive: true,
        priority: input.priority || 0,
      },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return rule;
  }

  /**
   * Update an allocation rule
   */
  async updateAllocationRule(
    tenantId: string,
    ruleId: string,
    input: Partial<{
      name: string;
      description: string;
      percentage: number;
      fixedAmount: number;
      minTriggerAmount: number;
      frequency: AllocationFrequency;
      dayOfMonth: number;
      dayOfWeek: number;
      priority: number;
      isActive: boolean;
    }>
  ) {
    const existingRule = await db.allocationRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
      },
    });

    if (!existingRule) {
      throw new Error('Allocation rule not found');
    }

    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.percentage !== undefined) updateData.percentage = new Decimal(input.percentage);
    if (input.fixedAmount !== undefined) updateData.fixedAmount = new Decimal(input.fixedAmount);
    if (input.minTriggerAmount !== undefined) updateData.minTriggerAmount = new Decimal(input.minTriggerAmount);
    if (input.frequency !== undefined) updateData.frequency = input.frequency;
    if (input.dayOfMonth !== undefined) updateData.dayOfMonth = input.dayOfMonth;
    if (input.dayOfWeek !== undefined) updateData.dayOfWeek = input.dayOfWeek;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    // Recalculate next scheduled time if frequency changed
    if (input.frequency || input.dayOfMonth !== undefined || input.dayOfWeek !== undefined) {
      const frequency = input.frequency || existingRule.frequency;
      const dayOfMonth = input.dayOfMonth ?? existingRule.dayOfMonth;
      const dayOfWeek = input.dayOfWeek ?? existingRule.dayOfWeek;

      updateData.nextScheduledAt = this.calculateNextScheduledTime(
        frequency as AllocationFrequency | null,
        dayOfMonth,
        dayOfWeek
      );
    }

    return db.allocationRule.update({
      where: { id: ruleId },
      data: updateData,
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  /**
   * Delete an allocation rule
   */
  async deleteAllocationRule(tenantId: string, ruleId: string) {
    const existingRule = await db.allocationRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
      },
    });

    if (!existingRule) {
      throw new Error('Allocation rule not found');
    }

    await db.allocationRule.delete({
      where: { id: ruleId },
    });

    return { success: true };
  }
}

export const allocationEngineService = new AllocationEngineService();
