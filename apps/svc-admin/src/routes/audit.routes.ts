import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
import {
  authenticateAdminJWT,
  requirePermission,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Audit Log Routes
// Provides comprehensive audit trail querying and activity tracking
// All routes require authentication and audit:view permission
// ============================================================================

// Get available event types for filtering
// GET /api/v1/admin/audit/event-types
router.get(
  '/event-types',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getEventTypes
);

// Get activity statistics for a date range
// GET /api/v1/admin/audit/stats?startDate=2025-01-01&endDate=2025-12-31
router.get(
  '/stats',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getStats
);

// Get recent activity across all users
// GET /api/v1/admin/audit/recent?limit=20&eventTypes=KYC_APPROVED,KYC_REJECTED
router.get(
  '/recent',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getRecentActivity
);

// Query audit logs with filters
// GET /api/v1/admin/audit/logs?profileId=xxx&actorId=xxx&eventType=KYC_APPROVED&page=1&limit=50
router.get(
  '/logs',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.queryLogs
);

// Get audit logs for a specific user
// GET /api/v1/admin/audit/users/:profileId?page=1&limit=50&eventTypes=USER_LOGIN,KYC_SUBMITTED
router.get(
  '/users/:profileId',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getUserLogs
);

// Get user activity summary
// GET /api/v1/admin/audit/users/:profileId/summary
router.get(
  '/users/:profileId/summary',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getUserSummary
);

// Get audit logs performed by an admin
// GET /api/v1/admin/audit/admins/:adminId?page=1&limit=50
router.get(
  '/admins/:adminId',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getAdminLogs
);

// Get admin activity summary
// GET /api/v1/admin/audit/admins/:adminId/summary
router.get(
  '/admins/:adminId/summary',
  authenticateAdminJWT,
  requirePermission('audit:view:all'),
  auditController.getAdminSummary
);

export default router;
