import { Router } from 'express';
import { walletController } from '../controllers/wallet.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Wallet Routes
 *
 * Provides wallet-related read operations for the dashboard.
 * These routes are served through svc-identity as an API gateway pattern,
 * allowing the frontend to access wallet data through a single API endpoint.
 *
 * All endpoints require JWT authentication and users can only
 * access their own wallet data.
 */

const router = Router();

/**
 * GET /api/v1/wallets/:profileId/balance
 * Get wallet balance for a user
 * Requires authentication (users can only view their own balance)
 *
 * @param profileId - User profile ID
 * @returns {balance: WalletBalanceDTO}
 */
router.get('/:profileId/balance', authenticateJWT, walletController.getBalance);

/**
 * GET /api/v1/wallets/:profileId/transactions
 * Get transaction history for a wallet
 * Requires authentication (users can only view their own transactions)
 *
 * @param profileId - User profile ID
 * @query limit - Number of transactions to return (default: 50)
 * @query offset - Pagination offset (default: 0)
 * @returns {transactions: TransactionDTO[]}
 */
router.get('/:profileId/transactions', authenticateJWT, walletController.getTransactions);

/**
 * GET /api/v1/wallets/:profileId/dashboard
 * Get combined dashboard data (balance + recent transactions)
 * Requires authentication (users can only view their own dashboard)
 *
 * @param profileId - User profile ID
 * @returns {wallet: WalletBalanceDTO, recentTransactions: TransactionDTO[]}
 */
router.get('/:profileId/dashboard', authenticateJWT, walletController.getDashboard);

export default router;
