import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { authenticateAdminJWT, requirePermission } from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// User Session Routes
// ============================================================================

// Query all user sessions with filters
router.get(
  '/users',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.queryUserSessions
);

// Get sessions for a specific user
router.get(
  '/users/:profileId',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.getUserSessions
);

// Get user session summary
router.get(
  '/users/:profileId/summary',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.getUserSessionSummary
);

// Revoke all sessions for a user
router.delete(
  '/users/:profileId/all',
  authenticateAdminJWT,
  requirePermission('session:revoke:all'),
  sessionController.revokeAllUserSessions
);

// Revoke a specific user session
router.delete(
  '/user/:sessionId',
  authenticateAdminJWT,
  requirePermission('session:revoke:all'),
  sessionController.revokeUserSession
);

// ============================================================================
// Admin Session Routes
// ============================================================================

// Query all admin sessions with filters
router.get(
  '/admins',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.queryAdminSessions
);

// Get admin session summary
router.get(
  '/admins/:adminId/summary',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.getAdminSessionSummary
);

// ============================================================================
// Session Statistics
// ============================================================================

// Get session activity statistics
router.get(
  '/stats',
  authenticateAdminJWT,
  requirePermission('session:view:all'),
  sessionController.getSessionStats
);

export default router;
