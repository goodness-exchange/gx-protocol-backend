import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { AppError } from '../utils';
import { accountService } from '../services';
import {
  GovernmentAuthenticatedRequest,
  CreateAccountSchema,
  UpdateAccountSchema,
  GovernmentErrorCode,
} from '../types';

export const accountController = {
  /**
   * Get account by ID
   */
  async getAccountById(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;

      const account = await accountService.getAccountById(accountId);

      if (!account) {
        throw new AppError(GovernmentErrorCode.ACCOUNT_NOT_FOUND, 404, 'Account not found');
      }

      res.json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List accounts for a treasury
   */
  async listAccounts(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const parentAccountId = req.query.parentAccountId as string | undefined;

      // Handle explicit null for root-level accounts
      let parentFilter: string | null | undefined = parentAccountId;
      if (req.query.parentAccountId === 'null' || req.query.rootOnly === 'true') {
        parentFilter = null;
      }

      const result = await accountService.listAccounts({
        treasuryId,
        parentAccountId: parentFilter,
        status,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.accounts,
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
   * Get full account hierarchy tree
   */
  async getAccountHierarchy(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const hierarchy = await accountService.getAccountHierarchy(treasuryId);

      res.json({ success: true, data: hierarchy });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create account in hierarchy
   */
  async createAccount(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { treasuryId } = req.params;

      const validation = CreateAccountSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const account = await accountService.createAccount(
        treasuryId,
        validation.data,
        req.user!.profileId
      );

      logger.info(
        { accountId: account.accountId, treasuryId, createdByProfileId: req.user!.profileId },
        'Government account created via API'
      );

      res.status(201).json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update account
   */
  async updateAccount(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;

      const validation = UpdateAccountSchema.safeParse(req.body);

      if (!validation.success) {
        throw new AppError(
          GovernmentErrorCode.VALIDATION_ERROR,
          400,
          validation.error.errors.map((e) => e.message).join(', ')
        );
      }

      const account = await accountService.updateAccount(
        accountId,
        validation.data,
        req.user!.profileId
      );

      res.json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Archive account
   */
  async archiveAccount(
    req: GovernmentAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { accountId } = req.params;

      await accountService.archiveAccount(accountId, req.user!.profileId);

      res.json({ success: true, message: 'Account archived' });
    } catch (error) {
      next(error);
    }
  },
};
