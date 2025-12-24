import { Router } from 'express';
import { deploymentController } from '../controllers/deployment.controller';
import {
  authenticateAdminJWT,
  requireSuperOwner,
  requirePermission,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Deployment Promotion Routes
// All routes require JWT authentication
// ============================================================================

// -----------------------------------------------------------------------------
// Get Deployable Services
// GET /api/v1/admin/deployments/services
// Returns list of services that can be deployed
// -----------------------------------------------------------------------------
router.get(
  '/services',
  authenticateAdminJWT,
  requirePermission('deployment:view'),
  (req, res) => deploymentController.getServices(req, res)
);

// -----------------------------------------------------------------------------
// Get Environments
// GET /api/v1/admin/deployments/environments
// Returns list of environments and valid promotion paths
// -----------------------------------------------------------------------------
router.get(
  '/environments',
  authenticateAdminJWT,
  requirePermission('deployment:view'),
  (req, res) => deploymentController.getEnvironments(req, res)
);

// -----------------------------------------------------------------------------
// Create Deployment Request (Promote)
// POST /api/v1/admin/deployments/promote
// Creates a deployment request that requires SUPER_OWNER approval
// Permission: deployment:create
// -----------------------------------------------------------------------------
router.post(
  '/promote',
  authenticateAdminJWT,
  requirePermission('deployment:create'),
  (req, res) => deploymentController.createDeployment(req, res)
);

// -----------------------------------------------------------------------------
// List Deployments
// GET /api/v1/admin/deployments
// Returns paginated list of deployments with optional filters
// Permission: deployment:view
// -----------------------------------------------------------------------------
router.get(
  '/',
  authenticateAdminJWT,
  requirePermission('deployment:view'),
  (req, res) => deploymentController.listDeployments(req, res)
);

// -----------------------------------------------------------------------------
// Get Single Deployment
// GET /api/v1/admin/deployments/:id
// Returns deployment details, optionally with logs
// Query: ?includeLogs=true
// Permission: deployment:view
// -----------------------------------------------------------------------------
router.get(
  '/:id',
  authenticateAdminJWT,
  requirePermission('deployment:view'),
  (req, res) => deploymentController.getDeployment(req, res)
);

// -----------------------------------------------------------------------------
// Get Deployment Logs
// GET /api/v1/admin/deployments/:id/logs
// Returns deployment execution logs
// Query: ?limit=100&offset=0
// Permission: deployment:view
// -----------------------------------------------------------------------------
router.get(
  '/:id/logs',
  authenticateAdminJWT,
  requirePermission('deployment:view'),
  (req, res) => deploymentController.getDeploymentLogs(req, res)
);

// -----------------------------------------------------------------------------
// Execute Deployment
// POST /api/v1/admin/deployments/:id/execute
// Executes an approved deployment
// SUPER_OWNER only
// Permission: deployment:execute
// -----------------------------------------------------------------------------
router.post(
  '/:id/execute',
  authenticateAdminJWT,
  requireSuperOwner,
  requirePermission('deployment:execute'),
  (req, res) => deploymentController.executeDeployment(req, res)
);

// -----------------------------------------------------------------------------
// Rollback Deployment
// POST /api/v1/admin/deployments/:id/rollback
// Rolls back a deployment to the previous version
// SUPER_OWNER only
// Permission: deployment:rollback
// -----------------------------------------------------------------------------
router.post(
  '/:id/rollback',
  authenticateAdminJWT,
  requireSuperOwner,
  requirePermission('deployment:rollback'),
  (req, res) => deploymentController.rollbackDeployment(req, res)
);

// -----------------------------------------------------------------------------
// Cancel Deployment
// POST /api/v1/admin/deployments/:id/cancel
// Cancels a pending or approved deployment
// Only the requester or SUPER_OWNER can cancel
// -----------------------------------------------------------------------------
router.post(
  '/:id/cancel',
  authenticateAdminJWT,
  (req, res) => deploymentController.cancelDeployment(req, res)
);

export default router;
