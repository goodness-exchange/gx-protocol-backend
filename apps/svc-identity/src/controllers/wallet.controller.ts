import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { walletService } from '../services/wallet.service';
import type { AuthenticatedRequest } from '../types/dtos';

/**
 * Wallet Controller
 *
 * Handles wallet-related read operations for the dashboard.
 * All endpoints require JWT authentication and users can only
 * access their own wallet data.
 */
class WalletController {
  /**
   * GET /api/v1/wallets/:profileId/balance
   * Get wallet balance for a user
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

      const balance = await walletService.getWalletBalance(profileId);

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
   * GET /api/v1/wallets/:profileId/transactions
   * Get transaction history for a wallet
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

      const transactions = await walletService.getTransactionHistory(
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
   * GET /api/v1/wallets/:profileId/dashboard
   * Get combined dashboard data (balance + recent transactions)
   */
  getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { profileId } = req.params;

      // Authorization: users can only view their own dashboard
      if (req.user && req.user.profileId !== profileId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only view your own dashboard',
        });
        return;
      }

      const dashboardData = await walletService.getDashboardData(profileId);

      res.status(200).json(dashboardData);
    } catch (error) {
      logger.error({ error, profileId: req.params.profileId }, 'Failed to fetch dashboard data');

      if ((error as Error).message === 'Wallet not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Wallet not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch dashboard data',
      });
    }
  };
}

export const walletController = new WalletController();
