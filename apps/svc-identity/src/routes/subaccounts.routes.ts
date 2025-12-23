import { Router } from 'express';
import { subAccountsController } from '../controllers/subaccounts.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Sub-Accounts Routes
 *
 * Manages sub-account budgeting features.
 * All endpoints require JWT authentication.
 */

const router = Router();

// ============================================
// Sub-Account CRUD
// ============================================

/**
 * GET /api/v1/wallets/:walletId/sub-accounts
 * Get all sub-accounts for a wallet
 */
router.get('/wallets/:walletId/sub-accounts', authenticateJWT, subAccountsController.getSubAccounts);

/**
 * GET /api/v1/wallets/:walletId/balance-overview
 * Get wallet balance overview including sub-accounts
 */
router.get('/wallets/:walletId/balance-overview', authenticateJWT, subAccountsController.getBalanceOverview);

/**
 * GET /api/v1/wallets/:walletId/allocation-rules
 * Get allocation rules for a wallet
 */
router.get('/wallets/:walletId/allocation-rules', authenticateJWT, subAccountsController.getAllocationRules);

/**
 * POST /api/v1/wallets/:walletId/allocation-preview
 * Preview allocations for a given amount
 */
router.post('/wallets/:walletId/allocation-preview', authenticateJWT, subAccountsController.previewAllocations);

/**
 * GET /api/v1/sub-accounts/:subAccountId
 * Get a single sub-account
 */
router.get('/sub-accounts/:subAccountId', authenticateJWT, subAccountsController.getSubAccount);

/**
 * POST /api/v1/sub-accounts
 * Create a new sub-account
 */
router.post('/sub-accounts', authenticateJWT, subAccountsController.createSubAccount);

/**
 * PUT /api/v1/sub-accounts/:subAccountId
 * Update a sub-account
 */
router.put('/sub-accounts/:subAccountId', authenticateJWT, subAccountsController.updateSubAccount);

/**
 * DELETE /api/v1/sub-accounts/:subAccountId
 * Delete a sub-account
 */
router.delete('/sub-accounts/:subAccountId', authenticateJWT, subAccountsController.deleteSubAccount);

// ============================================
// Sub-Account Operations
// ============================================

/**
 * POST /api/v1/sub-accounts/:subAccountId/allocate
 * Allocate funds to a sub-account
 */
router.post('/sub-accounts/:subAccountId/allocate', authenticateJWT, subAccountsController.allocateFunds);

/**
 * POST /api/v1/sub-accounts/:subAccountId/return
 * Return funds from sub-account to main wallet
 */
router.post('/sub-accounts/:subAccountId/return', authenticateJWT, subAccountsController.returnToMain);

/**
 * POST /api/v1/sub-accounts/transfer
 * Transfer between sub-accounts
 */
router.post('/sub-accounts/transfer', authenticateJWT, subAccountsController.transfer);

/**
 * GET /api/v1/sub-accounts/:subAccountId/transactions
 * Get transaction history for a sub-account
 */
router.get('/sub-accounts/:subAccountId/transactions', authenticateJWT, subAccountsController.getTransactions);

// ============================================
// Allocation Rules
// ============================================

/**
 * POST /api/v1/allocation-rules
 * Create an allocation rule
 */
router.post('/allocation-rules', authenticateJWT, subAccountsController.createAllocationRule);

export default router;
