import { Router } from 'express';
import * as governmentController from '../controllers/government.controller';
import * as npoController from '../controllers/npo.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Entity Account Routes
 *
 * Phase 4: Account Types & Integrations
 *
 * Routes for Government and NPO (Not-for-Profit) accounts.
 * All endpoints require JWT authentication.
 */

const router = Router();

// ============================================
// GOVERNMENT ACCOUNTS
// ============================================

/**
 * GET /api/v1/government-accounts
 * List all government accounts
 */
router.get(
  '/government-accounts',
  authenticateJWT,
  governmentController.listGovernmentAccounts
);

/**
 * POST /api/v1/government-accounts
 * Create a government account
 */
router.post(
  '/government-accounts',
  authenticateJWT,
  governmentController.createGovernmentAccount
);

/**
 * GET /api/v1/government-accounts/:id
 * Get a government account
 */
router.get(
  '/government-accounts/:id',
  authenticateJWT,
  governmentController.getGovernmentAccount
);

/**
 * PUT /api/v1/government-accounts/:id
 * Update a government account
 */
router.put(
  '/government-accounts/:id',
  authenticateJWT,
  governmentController.updateGovernmentAccount
);

/**
 * GET /api/v1/government-accounts/:id/dashboard
 * Get government account dashboard
 */
router.get(
  '/government-accounts/:id/dashboard',
  authenticateJWT,
  governmentController.getGovernmentDashboard
);

// Government Signatories
router.get(
  '/government-accounts/:id/signatories',
  authenticateJWT,
  governmentController.listSignatories
);

router.post(
  '/government-accounts/:id/signatories',
  authenticateJWT,
  governmentController.addSignatory
);

router.put(
  '/government-signatories/:signatoryId',
  authenticateJWT,
  governmentController.updateSignatory
);

router.post(
  '/government-signatories/:signatoryId/confirm',
  authenticateJWT,
  governmentController.confirmSignatory
);

router.post(
  '/government-signatories/:signatoryId/revoke',
  authenticateJWT,
  governmentController.revokeSignatory
);

// Government Signatory Rules
router.get(
  '/government-accounts/:id/signatory-rules',
  authenticateJWT,
  governmentController.listSignatoryRules
);

router.post(
  '/government-accounts/:id/signatory-rules',
  authenticateJWT,
  governmentController.createSignatoryRule
);

router.delete(
  '/government-signatory-rules/:ruleId',
  authenticateJWT,
  governmentController.deactivateRule
);

// Government Approvals
router.get(
  '/government-accounts/:id/approvals',
  authenticateJWT,
  governmentController.listApprovals
);

router.post(
  '/government-accounts/:id/approvals',
  authenticateJWT,
  governmentController.createApproval
);

router.post(
  '/government-approvals/:approvalId/vote',
  authenticateJWT,
  governmentController.voteOnApproval
);

// Government Sub-Accounts
router.get(
  '/government-accounts/:id/sub-accounts',
  authenticateJWT,
  governmentController.listSubAccounts
);

router.post(
  '/government-accounts/:id/sub-accounts',
  authenticateJWT,
  governmentController.createSubAccount
);

router.post(
  '/government-sub-accounts/:subAccountId/allocate',
  authenticateJWT,
  governmentController.updateSubAccountAllocation
);

// ============================================
// NPO (NOT-FOR-PROFIT) ACCOUNTS
// ============================================

/**
 * GET /api/v1/npo-accounts
 * List all NPO accounts
 */
router.get(
  '/npo-accounts',
  authenticateJWT,
  npoController.listNPOAccounts
);

/**
 * POST /api/v1/npo-accounts
 * Create an NPO account
 */
router.post(
  '/npo-accounts',
  authenticateJWT,
  npoController.createNPOAccount
);

/**
 * GET /api/v1/npo-accounts/:id
 * Get an NPO account
 */
router.get(
  '/npo-accounts/:id',
  authenticateJWT,
  npoController.getNPOAccount
);

/**
 * PUT /api/v1/npo-accounts/:id
 * Update an NPO account
 */
router.put(
  '/npo-accounts/:id',
  authenticateJWT,
  npoController.updateNPOAccount
);

/**
 * GET /api/v1/npo-accounts/:id/dashboard
 * Get NPO account dashboard
 */
router.get(
  '/npo-accounts/:id/dashboard',
  authenticateJWT,
  npoController.getNPODashboard
);

// NPO Signatories
router.get(
  '/npo-accounts/:id/signatories',
  authenticateJWT,
  npoController.listSignatories
);

router.post(
  '/npo-accounts/:id/signatories',
  authenticateJWT,
  npoController.addSignatory
);

router.put(
  '/npo-signatories/:signatoryId',
  authenticateJWT,
  npoController.updateSignatory
);

router.post(
  '/npo-signatories/:signatoryId/confirm',
  authenticateJWT,
  npoController.confirmSignatory
);

router.post(
  '/npo-signatories/:signatoryId/revoke',
  authenticateJWT,
  npoController.revokeSignatory
);

// NPO Signatory Rules
router.get(
  '/npo-accounts/:id/signatory-rules',
  authenticateJWT,
  npoController.listSignatoryRules
);

router.post(
  '/npo-accounts/:id/signatory-rules',
  authenticateJWT,
  npoController.createSignatoryRule
);

// NPO Approvals
router.get(
  '/npo-accounts/:id/approvals',
  authenticateJWT,
  npoController.listApprovals
);

router.post(
  '/npo-accounts/:id/approvals',
  authenticateJWT,
  npoController.createApproval
);

router.post(
  '/npo-approvals/:approvalId/vote',
  authenticateJWT,
  npoController.voteOnApproval
);

// NPO Programs
router.get(
  '/npo-accounts/:id/programs',
  authenticateJWT,
  npoController.listPrograms
);

router.post(
  '/npo-accounts/:id/programs',
  authenticateJWT,
  npoController.createProgram
);

router.put(
  '/npo-programs/:programId/status',
  authenticateJWT,
  npoController.updateProgramStatus
);

// NPO Donations
router.get(
  '/npo-accounts/:id/donations',
  authenticateJWT,
  npoController.listDonations
);

router.post(
  '/npo-accounts/:id/donations',
  authenticateJWT,
  npoController.recordDonation
);

router.post(
  '/npo-donations/:donationId/receipt',
  authenticateJWT,
  npoController.issueTaxReceipt
);

router.get(
  '/npo-accounts/:id/donors/public',
  npoController.getPublicDonorList  // Public endpoint, no auth required
);

export default router;
