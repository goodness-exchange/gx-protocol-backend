import { Request, Response, NextFunction } from 'express';
import { subAccountsService } from '../services/subaccounts.service';
import { logger } from '@gx/core-logger';

/**
 * Sub-Accounts Controller
 *
 * Handles HTTP requests for sub-account management (budgeting).
 */

class SubAccountsController {
  /**
   * GET /api/v1/wallets/:walletId/sub-accounts
   * Get all sub-accounts for a wallet
   */
  async getSubAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const subAccounts = await subAccountsService.getSubAccounts(walletId);

      res.json({
        success: true,
        data: { subAccounts },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting sub-accounts');
      next(error);
    }
  }

  /**
   * GET /api/v1/sub-accounts/:subAccountId
   * Get a single sub-account
   */
  async getSubAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subAccountId } = req.params;
      const subAccount = await subAccountsService.getSubAccount(subAccountId);

      if (!subAccount) {
        res.status(404).json({ error: 'Sub-account not found' });
        return;
      }

      res.json({
        success: true,
        data: { subAccount },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting sub-account');
      next(error);
    }
  }

  /**
   * POST /api/v1/sub-accounts
   * Create a new sub-account
   */
  async createSubAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { walletId, name, description, type, icon, color, monthlyBudget, monthlyResetDay, goalAmount, goalDeadline, goalName } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!walletId || !name || !type) {
        res.status(400).json({ error: 'walletId, name, and type are required' });
        return;
      }

      const subAccount = await subAccountsService.createSubAccount(profileId, {
        walletId,
        name,
        description,
        type,
        icon,
        color,
        monthlyBudget,
        monthlyResetDay,
        goalAmount,
        goalDeadline: goalDeadline ? new Date(goalDeadline) : undefined,
        goalName,
      });

      res.status(201).json({
        success: true,
        data: { subAccount },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('already exists')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error creating sub-account');
      next(error);
    }
  }

  /**
   * PUT /api/v1/sub-accounts/:subAccountId
   * Update a sub-account
   */
  async updateSubAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { subAccountId } = req.params;
      const updates = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Convert goalDeadline string to Date if provided
      if (updates.goalDeadline) {
        updates.goalDeadline = new Date(updates.goalDeadline);
      }

      const subAccount = await subAccountsService.updateSubAccount(profileId, subAccountId, updates);

      res.json({
        success: true,
        data: { subAccount },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error updating sub-account');
      next(error);
    }
  }

  /**
   * DELETE /api/v1/sub-accounts/:subAccountId
   * Delete a sub-account
   */
  async deleteSubAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { subAccountId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await subAccountsService.deleteSubAccount(profileId, subAccountId);

      res.json({
        success: true,
        message: 'Sub-account deleted',
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error deleting sub-account');
      next(error);
    }
  }

  /**
   * POST /api/v1/sub-accounts/:subAccountId/allocate
   * Allocate funds to a sub-account
   */
  async allocateFunds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { subAccountId } = req.params;
      const { amount, description } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }

      const subAccount = await subAccountsService.allocateFunds(
        profileId,
        subAccountId,
        amount,
        description
      );

      res.json({
        success: true,
        data: { subAccount },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Insufficient')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error allocating funds');
      next(error);
    }
  }

  /**
   * POST /api/v1/sub-accounts/transfer
   * Transfer between sub-accounts
   */
  async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { fromSubAccountId, toSubAccountId, amount, description } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!fromSubAccountId || !toSubAccountId || !amount) {
        res.status(400).json({ error: 'fromSubAccountId, toSubAccountId, and amount are required' });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }

      const result = await subAccountsService.transferBetweenSubAccounts(profileId, {
        fromSubAccountId,
        toSubAccountId,
        amount,
        description,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Insufficient') || error.message.includes('Cannot transfer')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error transferring between sub-accounts');
      next(error);
    }
  }

  /**
   * POST /api/v1/sub-accounts/:subAccountId/return
   * Return funds from sub-account to main wallet
   */
  async returnToMain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { subAccountId } = req.params;
      const { amount, description } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }

      const subAccount = await subAccountsService.returnToMainWallet(
        profileId,
        subAccountId,
        amount,
        description
      );

      res.json({
        success: true,
        data: { subAccount },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Insufficient')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error returning funds to main wallet');
      next(error);
    }
  }

  /**
   * GET /api/v1/sub-accounts/:subAccountId/transactions
   * Get transaction history for a sub-account
   */
  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subAccountId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await subAccountsService.getSubAccountTransactions(subAccountId, limit, offset);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting sub-account transactions');
      next(error);
    }
  }

  /**
   * GET /api/v1/wallets/:walletId/balance-overview
   * Get wallet balance overview including sub-accounts
   */
  async getBalanceOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { walletId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const overview = await subAccountsService.getWalletBalanceOverview(profileId, walletId);

      res.json({
        success: true,
        data: overview,
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting balance overview');
      next(error);
    }
  }

  /**
   * GET /api/v1/wallets/:walletId/allocation-rules
   * Get allocation rules for a wallet
   */
  async getAllocationRules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const rules = await subAccountsService.getAllocationRules(walletId);

      res.json({
        success: true,
        data: { rules },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting allocation rules');
      next(error);
    }
  }

  /**
   * POST /api/v1/allocation-rules
   * Create an allocation rule
   */
  async createAllocationRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const ruleData = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!ruleData.walletId || !ruleData.subAccountId || !ruleData.name || !ruleData.ruleType || !ruleData.triggerType) {
        res.status(400).json({ error: 'walletId, subAccountId, name, ruleType, and triggerType are required' });
        return;
      }

      const rule = await subAccountsService.createAllocationRule(profileId, ruleData);

      res.status(201).json({
        success: true,
        data: { rule },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('must be')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error creating allocation rule');
      next(error);
    }
  }

  /**
   * POST /api/v1/wallets/:walletId/allocation-preview
   * Preview allocations for a given amount
   */
  async previewAllocations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }

      const allocations = await subAccountsService.previewAllocations(walletId, amount);

      res.json({
        success: true,
        data: { allocations, totalAmount: amount },
      });
    } catch (error) {
      logger.error({ error }, 'Error previewing allocations');
      next(error);
    }
  }
}

export const subAccountsController = new SubAccountsController();
