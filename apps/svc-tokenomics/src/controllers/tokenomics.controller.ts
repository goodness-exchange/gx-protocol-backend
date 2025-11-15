import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { tokenomicsService } from '../services/tokenomics.service';
import type {
  AuthenticatedRequest,
  TransferRequestDTO,
  GenesisDistributionRequestDTO,
} from '../types/dtos';

class TokenomicsController {
  /**
   * POST /api/v1/transfers
   * Transfer tokens between users
   */
  transfer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: TransferRequestDTO = req.body;

      if (!data.fromUserId || !data.toUserId || !data.amount) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'fromUserId, toUserId, and amount are required',
        });
        return;
      }

      // Authorization: users can only transfer from their own wallet
      if (req.user && req.user.profileId !== data.fromUserId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only transfer from your own wallet',
        });
        return;
      }

      if (data.amount <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Amount must be greater than 0',
        });
        return;
      }

      const result = await tokenomicsService.transferTokens(data);

      logger.info({ commandId: result.commandId }, 'Transfer initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Transfer failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Transfer failed',
      });
    }
  };

  /**
   * POST /api/v1/genesis
   * Distribute genesis allocation (admin only)
   */
  distributeGenesis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: GenesisDistributionRequestDTO = req.body;

      if (!data.userId || !data.userType || !data.countryCode) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'userId, userType, and countryCode are required',
        });
        return;
      }

      // TODO: Check admin role from JWT
      // if (req.user && req.user.role !== 'admin') { ... }

      const result = await tokenomicsService.distributeGenesis(data);

      logger.info({ commandId: result.commandId }, 'Genesis distribution initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Genesis distribution failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Genesis distribution failed',
      });
    }
  };

  /**
   * GET /api/v1/wallets/:profileId/balance
   * Get wallet balance
   */
  getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { profileId } = req.params;

      // Authorization: users can only view their own balance
      if (req.user && req.user.profileId !== profileId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own balance',
        });
        return;
      }

      const balance = await tokenomicsService.getWalletBalance(profileId);

      res.status(200).json({ balance });
    } catch (error) {
      logger.error({ error, profileId: req.params.profileId }, 'Failed to fetch balance');

      if ((error as Error).message === 'Wallet not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Wallet not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch balance',
      });
    }
  };

  /**
   * GET /api/v1/treasury/:countryCode/balance
   * Get treasury balance for a country
   */
  getTreasuryBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { countryCode } = req.params;

      const balance = await tokenomicsService.getTreasuryBalance(countryCode);

      res.status(200).json({ balance });
    } catch (error) {
      logger.error({ error, countryCode: req.params.countryCode }, 'Failed to fetch treasury balance');

      if ((error as Error).message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: (error as Error).message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch treasury balance',
      });
    }
  };

  /**
   * GET /api/v1/wallets/:profileId/transactions
   * Get transaction history
   */
  getTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { profileId } = req.params;
      const { limit = '50', offset = '0' } = req.query;

      // Authorization: users can only view their own transactions
      if (req.user && req.user.profileId !== profileId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own transactions',
        });
        return;
      }

      const transactions = await tokenomicsService.getTransactionHistory(
        profileId,
        Number(limit),
        Number(offset)
      );

      res.status(200).json({ transactions });
    } catch (error) {
      logger.error({ error, profileId: req.params.profileId }, 'Failed to fetch transactions');

      if ((error as Error).message === 'Wallet not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Wallet not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch transactions',
      });
    }
  };

  /**
   * POST /api/v1/wallets/:walletId/freeze
   * Freeze wallet (admin only)
   */
  freezeWallet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { walletId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reason is required',
        });
        return;
      }

      // TODO: Check admin role

      const result = await tokenomicsService.freezeWallet({ walletId, reason });

      logger.info({ commandId: result.commandId, walletId }, 'Wallet freeze initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, walletId: req.params.walletId }, 'Wallet freeze failed');

      if ((error as Error).message === 'Wallet not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Wallet not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Wallet freeze failed',
      });
    }
  };

  /**
   * POST /api/v1/wallets/:walletId/unfreeze
   * Unfreeze wallet (admin only)
   */
  unfreezeWallet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { walletId } = req.params;

      // TODO: Check admin role

      const result = await tokenomicsService.unfreezeWallet(walletId);

      logger.info({ commandId: result.commandId, walletId }, 'Wallet unfreeze initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, walletId: req.params.walletId }, 'Wallet unfreeze failed');

      if ((error as Error).message === 'Wallet not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Wallet not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Wallet unfreeze failed',
      });
    }
  };
}

export const tokenomicsController = new TokenomicsController();
