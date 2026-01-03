import { Router } from 'express';
import { fundController } from '../controllers';
import { authenticateJWT, requireTreasuryAdmin } from '../middlewares';

const router = Router();

// =============================================================================
// Treasury Fund Operations
// =============================================================================

/**
 * POST /treasury/:treasuryId/allocate
 * Allocate funds from treasury to a root-level account
 * Requires canAllocateFunds permission
 */
router.post(
  '/treasury/:treasuryId/allocate',
  authenticateJWT,
  requireTreasuryAdmin({ permission: 'canAllocateFunds' }),
  fundController.allocateFromTreasury
);

/**
 * GET /treasury/:treasuryId/transactions
 * Get transaction history for a treasury
 */
router.get(
  '/treasury/:treasuryId/transactions',
  authenticateJWT,
  requireTreasuryAdmin(),
  fundController.getTreasuryTransactions
);

// =============================================================================
// Account Fund Operations
// =============================================================================

/**
 * POST /account/:accountId/allocate
 * Allocate funds from parent account to child account
 * Requires canAllocateFunds permission
 */
router.post(
  '/account/:accountId/allocate',
  authenticateJWT,
  fundController.allocateFromAccount
);

/**
 * POST /account/:accountId/disburse
 * Disburse funds from account to external recipient
 * Requires canDisburseFunds permission
 */
router.post(
  '/account/:accountId/disburse',
  authenticateJWT,
  fundController.disburseFromAccount
);

/**
 * GET /account/:accountId/transactions
 * Get transaction history for an account
 */
router.get(
  '/account/:accountId/transactions',
  authenticateJWT,
  fundController.getAccountTransactions
);

export default router;
