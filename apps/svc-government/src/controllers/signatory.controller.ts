import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import { multiSigService } from '../services';
import {
  GovernmentAuthenticatedRequest,
  CreateSignatoryRuleSchema,
  VoteOnTransactionSchema,
  GovernmentErrorCode,
} from '../types';

export const signatoryController = {
  /**
   * Create signatory rule for a treasury
   */
  async createTreasuryRule(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const validation = CreateSignatoryRuleSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const rule = await multiSigService.createSignatoryRule(
        treasuryId,
        'GOVERNMENT_TREASURY',
        { ...validation.data, entityId: treasuryId },
        req.user!.profileId
      );

      logger.info({ ruleId: rule.ruleId, treasuryId }, 'Treasury signatory rule created');

      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create signatory rule for an account
   */
  async createAccountRule(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId, accountId } = req.params;
      const validation = CreateSignatoryRuleSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const rule = await multiSigService.createSignatoryRule(
        treasuryId,
        'GOVERNMENT_ACCOUNT',
        { ...validation.data, entityId: accountId },
        req.user!.profileId
      );

      logger.info({ ruleId: rule.ruleId, accountId }, 'Account signatory rule created');

      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get signatory rules for a treasury
   */
  async getTreasuryRules(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const rules = await multiSigService.getSignatoryRules('GOVERNMENT_TREASURY', treasuryId);

      res.json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get signatory rules for an account
   */
  async getAccountRules(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;

      const rules = await multiSigService.getSignatoryRules('GOVERNMENT_ACCOUNT', accountId);

      res.json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get pending transactions for a treasury
   */
  async getTreasuryPendingTransactions(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;

      const result = await multiSigService.listPendingTransactions({
        entityType: 'GOVERNMENT_TREASURY',
        entityId: treasuryId,
        status: status as any,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get pending transactions for an account
   */
  async getAccountPendingTransactions(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;

      const result = await multiSigService.listPendingTransactions({
        entityType: 'GOVERNMENT_ACCOUNT',
        entityId: accountId,
        status: status as any,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.transactions,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Vote on a pending transaction
   */
  async voteOnTransaction(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { pendingTxId } = req.params;
      const validation = VoteOnTransactionSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const result = await multiSigService.voteOnTransaction(
        pendingTxId,
        validation.data,
        req.user!.profileId,
        req.user?.permissions?.[0] // Use first permission as role if available
      );

      logger.info(
        { pendingTxId, approved: validation.data.approved },
        'Vote recorded on transaction'
      );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { pendingTxId } = req.params;

      await multiSigService.cancelTransaction(pendingTxId, req.user!.profileId);

      logger.info({ pendingTxId }, 'Transaction cancelled');

      res.json({ success: true, message: 'Transaction cancelled' });
    } catch (error) {
      next(error);
    }
  },
};
