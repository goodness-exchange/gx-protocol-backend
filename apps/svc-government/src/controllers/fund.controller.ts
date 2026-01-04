import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import { fundService } from '../services';
import {
  GovernmentAuthenticatedRequest,
  AllocateFundsSchema,
  DisburseFundsSchema,
  TransactionQuerySchema,
  GovernmentErrorCode,
  getActingUserId,
} from '../types';

export const fundController = {
  /**
   * Allocate funds from treasury to root-level account
   * POST /treasury/:treasuryId/allocate
   */
  async allocateFromTreasury(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const validation = AllocateFundsSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const result = await fundService.allocateFunds(
        treasuryId,
        validation.data,
        getActingUserId(req.user)
      );

      logger.info(
        {
          treasuryId,
          toAccountId: validation.data.toAccountId,
          amount: validation.data.amount,
          immediate: result.immediate,
          pendingTxId: result.pendingTxId,
        },
        'Treasury allocation initiated'
      );

      res.status(result.immediate ? 200 : 202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Allocate funds from parent account to child account
   * POST /account/:accountId/allocate
   */
  async allocateFromAccount(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;
      const validation = AllocateFundsSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const result = await fundService.allocateFunds(
        accountId,
        validation.data,
        getActingUserId(req.user)
      );

      logger.info(
        {
          accountId,
          toAccountId: validation.data.toAccountId,
          amount: validation.data.amount,
          immediate: result.immediate,
          pendingTxId: result.pendingTxId,
        },
        'Account allocation initiated'
      );

      res.status(result.immediate ? 200 : 202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Disburse funds from account to external recipient
   * POST /account/:accountId/disburse
   */
  async disburseFromAccount(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;
      const validation = DisburseFundsSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const result = await fundService.disburseFunds(
        accountId,
        validation.data,
        getActingUserId(req.user)
      );

      logger.info(
        {
          accountId,
          recipientId: validation.data.recipientId,
          recipientType: validation.data.recipientType,
          amount: validation.data.amount,
          immediate: result.immediate,
          pendingTxId: result.pendingTxId,
        },
        'Disbursement initiated'
      );

      res.status(result.immediate ? 200 : 202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get transaction history for treasury
   * GET /treasury/:treasuryId/transactions
   */
  async getTreasuryTransactions(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const validation = TransactionQuerySchema.safeParse(req.query);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const { page, limit, transactionType, category, fromDate, toDate } = validation.data;

      const result = await fundService.getTransactionHistory(treasuryId, {
        page,
        limit,
        transactionType,
        category,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
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
   * Get transaction history for account
   * GET /account/:accountId/transactions
   */
  async getAccountTransactions(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;
      const validation = TransactionQuerySchema.safeParse(req.query);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const { page, limit, transactionType, category, fromDate, toDate } = validation.data;

      const result = await fundService.getTransactionHistory(accountId, {
        page,
        limit,
        transactionType,
        category,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
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
};
