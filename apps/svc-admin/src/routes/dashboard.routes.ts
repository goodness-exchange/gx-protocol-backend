import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import {
  authenticateAdminJWT,
  requirePermission,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Dashboard Routes
// Provides metrics and analytics for the admin dashboard
// All routes require authentication and report:view:dashboard permission
// ============================================================================

// Get comprehensive dashboard statistics
// GET /api/v1/admin/dashboard/stats
router.get(
  '/stats',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getStats
);

// Get user growth data for charts
// GET /api/v1/admin/dashboard/user-growth?days=30
router.get(
  '/user-growth',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getUserGrowth
);

// Get new registrations per day
// GET /api/v1/admin/dashboard/new-registrations?days=14
router.get(
  '/new-registrations',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getNewRegistrations
);

// Get transaction volume data
// GET /api/v1/admin/dashboard/transaction-volume?days=14
router.get(
  '/transaction-volume',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getTransactionVolume
);

// Get user distribution (by status and country)
// GET /api/v1/admin/dashboard/user-distribution
router.get(
  '/user-distribution',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getUserDistribution
);

// Get recent activity feed
// GET /api/v1/admin/dashboard/recent-activity?limit=10
router.get(
  '/recent-activity',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  dashboardController.getRecentActivity
);

export default router;
