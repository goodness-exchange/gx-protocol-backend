import { Router } from 'express';
import { tokenomicsController } from '../controllers/tokenomics.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Tokenomics Routes
 *
 * Handles token operations including transfers, balances, and treasury management.
 * All write operations use the CQRS outbox pattern.
 */

const router = Router();

/**
 * POST /api/v1/transfers
 * Transfer tokens between users
 * Requires authentication (users can only transfer from their own wallet)
 *
 * @body {fromUserId: string, toUserId: string, amount: number, remark?: string}
 * @returns {commandId: string, message: string}
 */
router.post('/transfers', authenticateJWT, tokenomicsController.transfer);

/**
 * POST /api/v1/genesis
 * Distribute genesis allocation to user
 * Admin only (TODO: Add admin role check)
 *
 * @body {userId: string, userType: string, countryCode: string}
 * @returns {commandId: string, message: string}
 */
router.post('/genesis', authenticateJWT, tokenomicsController.distributeGenesis);

/**
 * GET /api/v1/wallets/:profileId/balance
 * Get wallet balance for a user
 * Requires authentication (users can only view their own balance)
 *
 * @param profileId - User profile ID
 * @returns {balance: WalletBalanceDTO}
 */
router.get('/wallets/:profileId/balance', authenticateJWT, tokenomicsController.getBalance);

/**
 * GET /api/v1/treasury/:countryCode/balance
 * Get treasury balance for a country
 * Public endpoint
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns {balance: TreasuryBalanceDTO}
 */
router.get('/treasury/:countryCode/balance', tokenomicsController.getTreasuryBalance);

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
router.get('/wallets/:profileId/transactions', authenticateJWT, tokenomicsController.getTransactions);

/**
 * POST /api/v1/wallets/:walletId/freeze
 * Freeze a wallet (admin only)
 *
 * @param walletId - Wallet ID
 * @body {reason: string}
 * @returns {commandId: string, message: string}
 */
router.post('/wallets/:walletId/freeze', authenticateJWT, tokenomicsController.freezeWallet);

/**
 * POST /api/v1/wallets/:walletId/unfreeze
 * Unfreeze a wallet (admin only)
 *
 * @param walletId - Wallet ID
 * @returns {commandId: string, message: string}
 */
router.post('/wallets/:walletId/unfreeze', authenticateJWT, tokenomicsController.unfreezeWallet);

export default router;
