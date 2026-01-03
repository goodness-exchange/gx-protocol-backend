import { Router } from 'express';
import { signatoryController } from '../controllers';
import { authenticateJWT, requireTreasuryAdmin } from '../middlewares';

const router = Router();

// =============================================================================
// Treasury-level signatory rules
// =============================================================================

/**
 * GET /treasury/:treasuryId/rules
 * Get signatory rules for a treasury
 */
router.get(
  '/treasury/:treasuryId/rules',
  authenticateJWT,
  requireTreasuryAdmin(),
  signatoryController.getTreasuryRules
);

/**
 * POST /treasury/:treasuryId/rules
 * Create a signatory rule for a treasury
 * Requires canConfigureRules permission
 */
router.post(
  '/treasury/:treasuryId/rules',
  authenticateJWT,
  requireTreasuryAdmin({ permission: 'canConfigureRules' }),
  signatoryController.createTreasuryRule
);

/**
 * GET /treasury/:treasuryId/pending
 * Get pending transactions for a treasury
 */
router.get(
  '/treasury/:treasuryId/pending',
  authenticateJWT,
  requireTreasuryAdmin(),
  signatoryController.getTreasuryPendingTransactions
);

// =============================================================================
// Account-level signatory rules
// =============================================================================

/**
 * GET /account/:accountId/rules
 * Get signatory rules for an account
 */
router.get(
  '/account/:accountId/rules',
  authenticateJWT,
  signatoryController.getAccountRules
);

/**
 * POST /treasury/:treasuryId/account/:accountId/rules
 * Create a signatory rule for an account
 * Requires canConfigureRules permission
 */
router.post(
  '/treasury/:treasuryId/account/:accountId/rules',
  authenticateJWT,
  requireTreasuryAdmin({ permission: 'canConfigureRules' }),
  signatoryController.createAccountRule
);

/**
 * GET /account/:accountId/pending
 * Get pending transactions for an account
 */
router.get(
  '/account/:accountId/pending',
  authenticateJWT,
  signatoryController.getAccountPendingTransactions
);

// =============================================================================
// Pending transaction actions
// =============================================================================

/**
 * POST /pending/:pendingTxId/vote
 * Vote on a pending transaction
 */
router.post(
  '/pending/:pendingTxId/vote',
  authenticateJWT,
  signatoryController.voteOnTransaction
);

/**
 * POST /pending/:pendingTxId/cancel
 * Cancel a pending transaction (only initiator can cancel)
 */
router.post(
  '/pending/:pendingTxId/cancel',
  authenticateJWT,
  signatoryController.cancelTransaction
);

export default router;
