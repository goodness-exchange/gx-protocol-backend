import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type { CalculateFeeRequestDTO, ApplyVelocityTaxRequestDTO } from '../types/dtos';

/**
 * Default system parameters for fee calculation
 * These should match the values initialized in Fabric chaincode
 */
const DEFAULT_TRANSACTION_FEE_BPS = 10; // 0.1% (10 basis points)
const DEFAULT_TRANSACTION_FEE_THRESHOLD = 1000000; // 1 million Qirat (10 coins)

class TaxService {
  /**
   * Calculate transaction fee based on system parameters
   *
   * Logic mirrors chaincode implementation:
   * 1. Fetch fee parameters from database (or use defaults)
   * 2. If amount <= threshold: fee = 0
   * 3. If amount > threshold: fee = (amount * feeBps) / 10000
   *
   * @param data - Transaction amount in Qirat (1 coin = 100,000 Qirat)
   * @returns Calculated fee in Qirat
   */
  async calculateFee(data: CalculateFeeRequestDTO): Promise<{ fee: number }> {
    try {
      const { amount } = data;

      // Validate input
      if (amount < 0) {
        throw new Error('Transaction amount cannot be negative');
      }

      if (!Number.isInteger(amount)) {
        throw new Error('Transaction amount must be an integer (Qirat)');
      }

      // Fetch system parameters from database
      const [feeThresholdParam, feeBpsParam] = await Promise.all([
        db.systemParameter.findUnique({
          where: {
            tenantId_paramKey: {
              tenantId: 'default',
              paramKey: 'transactionFeeThreshold',
            },
          },
        }),
        db.systemParameter.findUnique({
          where: {
            tenantId_paramKey: {
              tenantId: 'default',
              paramKey: 'transactionFeeBps',
            },
          },
        }),
      ]);

      // Use database values or fall back to defaults
      const transactionFeeThreshold = feeThresholdParam
        ? parseInt(feeThresholdParam.paramValue, 10)
        : DEFAULT_TRANSACTION_FEE_THRESHOLD;

      const transactionFeeBps = feeBpsParam
        ? parseInt(feeBpsParam.paramValue, 10)
        : DEFAULT_TRANSACTION_FEE_BPS;

      // Calculate fee (same logic as chaincode)
      let fee = 0;
      if (amount > transactionFeeThreshold) {
        fee = Math.floor((amount * transactionFeeBps) / 10000);
      }

      logger.info(
        {
          amount,
          transactionFeeThreshold,
          transactionFeeBps,
          fee,
          feePercentage: (transactionFeeBps / 100).toFixed(2) + '%',
        },
        'Transaction fee calculated'
      );

      return { fee };
    } catch (error) {
      logger.error({ error, amount: data.amount }, 'Fee calculation failed');
      throw error;
    }
  }

  async applyVelocityTax(data: ApplyVelocityTaxRequestDTO): Promise<{ commandId: string; message: string }> {
    const { accountId, taxRateBps } = data;
    logger.info({ accountId, taxRateBps }, 'Applying velocity tax');

    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tax',
        requestId: `velocity-tax-${accountId}-${Date.now()}`,
        commandType: 'APPLY_VELOCITY_TAX',
        payload: { accountId, taxRateBps },
        status: 'PENDING',
        attempts: 0,
      },
    });

    return { commandId: command.id, message: 'Velocity tax application initiated.' };
  }

  /**
   * Check if an account is eligible for velocity tax application
   *
   * Eligibility criteria (from chaincode):
   * 1. Account exists
   * 2. Account is not manually exempt (velocityTaxExempt = false)
   * 3. Account is not a system pool (SYSTEM_* accounts)
   * 4. Velocity tax timer has started (velocityTaxTimerStart is set)
   * 5. 360 days have elapsed since timer start
   * 6. Current balance ≥ 10 million Qirat (100 coins)
   *
   * @param accountId - User profile ID or organization ID
   * @returns Eligibility status and reason
   */
  async checkEligibility(accountId: string): Promise<{ eligible: boolean; reason: string; details?: any }> {
    try {
      logger.info({ accountId }, 'Checking velocity tax eligibility');

      // 1. Check if account is a system pool (always exempt)
      if (accountId.startsWith('SYSTEM_')) {
        return {
          eligible: false,
          reason: 'System pool accounts are exempt from velocity tax',
        };
      }

      //NOTE: Velocity tax timer fields (velocityTaxExempt, velocityTaxTimerStart)
      // are not yet in the database schema. They exist in the chaincode but need
      // to be added to the schema via migration.
      //
      // For now, return a placeholder response indicating the feature is pending
      // database schema updates.

      // Check if account exists (basic validation)
      const userProfile = await db.userProfile.findUnique({
        where: { profileId: accountId },
        select: { profileId: true },
      });

      if (!userProfile) {
        // Try organization
        const organization = await db.organization.findUnique({
          where: { orgId: accountId },
          select: { orgId: true, orgType: true },
        });

        if (!organization) {
          return {
            eligible: false,
            reason: 'Account does not exist',
          };
        }
      }

      // Check balance (using available fields)
      const wallet = await db.wallet.findFirst({
        where: { profileId: accountId },
        select: { cachedBalance: true },
      });

      if (!wallet) {
        return {
          eligible: false,
          reason: 'Wallet not found for account',
        };
      }

      // Convert Decimal to number
      const balance = Number(wallet.cachedBalance) * 100000; // Convert coins to Qirat
      const minimumBalance = 10000000; // 100 coins in Qirat

      if (balance < minimumBalance) {
        return {
          eligible: false,
          reason: `Balance below threshold (${Number(wallet.cachedBalance).toFixed(2)} coins < 100 coins)`,
          details: {
            currentBalance: balance,
            minimumBalance,
            balanceInCoins: Number(wallet.cachedBalance),
            minimumInCoins: 100,
          },
        };
      }

      // Placeholder response - full implementation requires schema migration
      return {
        eligible: false,
        reason: 'Velocity tax timer tracking not yet implemented (database schema update required)',
        details: {
          note: 'velocityTaxExempt and velocityTaxTimerStart fields need to be added to UserProfile and Organization models',
          currentBalance: balance,
          balanceInCoins: Number(wallet.cachedBalance),
        },
      };
    } catch (error) {
      logger.error({ error, accountId }, 'Eligibility check failed');
      throw error;
    }
  }
}

export const taxService = new TaxService();
