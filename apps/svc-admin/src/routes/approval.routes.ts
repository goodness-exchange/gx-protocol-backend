import { Router } from 'express';
import { approvalController } from '../controllers/approval.controller';
import {
  authenticateAdminJWT,
  requireSuperOwner,
  requirePermission,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Approval Workflow Routes
// All routes require JWT authentication
// ============================================================================

// -----------------------------------------------------------------------------
// Create Approval Request
// POST /api/v1/admin/approvals
// Any authenticated admin can create approval requests
// Permission: approval:create
// -----------------------------------------------------------------------------
router.post(
  '/',
  authenticateAdminJWT,
  requirePermission('approval:create'),
  (req, res) => approvalController.createApproval(req, res)
);

// -----------------------------------------------------------------------------
// List Approval Requests
// GET /api/v1/admin/approvals
// SUPER_OWNER sees all, others see only their own
// Permission: approval:view
// -----------------------------------------------------------------------------
router.get(
  '/',
  authenticateAdminJWT,
  requirePermission('approval:view'),
  (req, res) => approvalController.listApprovals(req, res)
);

// -----------------------------------------------------------------------------
// Get Pending Approvals Count (for dashboard)
// GET /api/v1/admin/approvals/pending-count
// SUPER_OWNER only (for dashboard indicator)
// -----------------------------------------------------------------------------
router.get(
  '/pending-count',
  authenticateAdminJWT,
  requireSuperOwner,
  (req, res) => approvalController.getPendingCount(req, res)
);

// -----------------------------------------------------------------------------
// Get Single Approval Request
// GET /api/v1/admin/approvals/:id
// SUPER_OWNER sees all, others see only their own
// Permission: approval:view
// -----------------------------------------------------------------------------
router.get(
  '/:id',
  authenticateAdminJWT,
  requirePermission('approval:view'),
  (req, res) => approvalController.getApproval(req, res)
);

// -----------------------------------------------------------------------------
// Vote on Approval Request (Approve/Reject)
// POST /api/v1/admin/approvals/:id/vote
// SUPER_OWNER only
// Permission: approval:approve (for approve) or approval:reject (for reject)
// -----------------------------------------------------------------------------
router.post(
  '/:id/vote',
  authenticateAdminJWT,
  requireSuperOwner,
  (req, res) => approvalController.voteOnApproval(req, res)
);

// -----------------------------------------------------------------------------
// Cancel Approval Request
// POST /api/v1/admin/approvals/:id/cancel
// Only the requester can cancel their own request
// -----------------------------------------------------------------------------
router.post(
  '/:id/cancel',
  authenticateAdminJWT,
  (req, res) => approvalController.cancelApproval(req, res)
);

// -----------------------------------------------------------------------------
// Execute Approved Action
// POST /api/v1/admin/approvals/:id/execute
// SUPER_OWNER only - executes the approved action
// -----------------------------------------------------------------------------
router.post(
  '/:id/execute',
  authenticateAdminJWT,
  requireSuperOwner,
  (req, res) => approvalController.executeApproval(req, res)
);

export default router;
