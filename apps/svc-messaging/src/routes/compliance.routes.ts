import { Router } from 'express';
import { authenticateJWT, requireSuperOwner } from '../middlewares/auth.middleware';
import { complianceController } from '../controllers/compliance.controller';

const router = Router();

// All routes require SUPER_OWNER authentication
router.use(authenticateJWT);
router.use(requireSuperOwner);

/**
 * POST /api/v1/admin/compliance/decrypt
 * Request decryption of messages (requires approval)
 */
router.post('/decrypt', complianceController.requestDecryption);

/**
 * GET /api/v1/admin/compliance/requests
 * List pending decryption requests
 */
router.get('/requests', complianceController.listRequests);

/**
 * GET /api/v1/admin/compliance/requests/:requestId
 * Get specific decryption request
 */
router.get('/requests/:requestId', complianceController.getRequest);

/**
 * PUT /api/v1/admin/compliance/requests/:requestId/approve
 * Approve decryption request (second SUPER_OWNER)
 */
router.put('/requests/:requestId/approve', complianceController.approveRequest);

/**
 * PUT /api/v1/admin/compliance/requests/:requestId/reject
 * Reject decryption request
 */
router.put('/requests/:requestId/reject', complianceController.rejectRequest);

/**
 * POST /api/v1/admin/compliance/requests/:requestId/execute
 * Execute approved decryption request
 */
router.post('/requests/:requestId/execute', complianceController.executeDecryption);

/**
 * GET /api/v1/admin/compliance/audit
 * Get compliance audit log
 */
router.get('/audit', complianceController.getAuditLog);

/**
 * GET /api/v1/admin/compliance/stats
 * Get compliance statistics
 */
router.get('/stats', complianceController.getStats);

export default router;
