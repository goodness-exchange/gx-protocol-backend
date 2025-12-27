import { Router } from 'express';
import {
  authenticateAdminJWT,
  requirePermission,
} from '../middlewares/admin-auth.middleware';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createWebhook,
  getWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
} from '../controllers/notification.controller';

// ============================================================================
// Notification Routes
// ============================================================================

const router = Router();

// All routes require authentication
router.use(authenticateAdminJWT);

// ==========================================================================
// Notification Endpoints
// ==========================================================================

/**
 * GET /api/v1/admin/notifications
 * Get notifications for the current admin
 */
router.get('/', getNotifications);

/**
 * GET /api/v1/admin/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', getUnreadCount);

/**
 * PATCH /api/v1/admin/notifications/mark-all-read
 * Mark all notifications as read
 */
router.patch('/mark-all-read', markAllAsRead);

/**
 * PATCH /api/v1/admin/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', markAsRead);

// ==========================================================================
// Webhook Management Endpoints
// Requires specific webhook permissions
// ==========================================================================

/**
 * POST /api/v1/admin/notifications/webhooks
 * Create a new webhook
 * Permission: webhook:create:all (requires MFA)
 */
router.post('/webhooks', requirePermission('webhook:create:all'), createWebhook);

/**
 * GET /api/v1/admin/notifications/webhooks
 * Get all webhooks
 * Permission: webhook:view:all
 */
router.get('/webhooks', requirePermission('webhook:view:all'), getWebhooks);

/**
 * GET /api/v1/admin/notifications/webhooks/:id
 * Get webhook by ID
 * Permission: webhook:view:all
 */
router.get('/webhooks/:id', requirePermission('webhook:view:all'), getWebhookById);

/**
 * PATCH /api/v1/admin/notifications/webhooks/:id
 * Update webhook
 * Permission: webhook:update:all (requires MFA)
 */
router.patch('/webhooks/:id', requirePermission('webhook:update:all'), updateWebhook);

/**
 * DELETE /api/v1/admin/notifications/webhooks/:id
 * Delete webhook
 * Permission: webhook:delete:all (requires MFA)
 */
router.delete('/webhooks/:id', requirePermission('webhook:delete:all'), deleteWebhook);

/**
 * POST /api/v1/admin/notifications/webhooks/:id/regenerate-secret
 * Regenerate webhook secret
 * Permission: webhook:update:all (requires MFA)
 */
router.post('/webhooks/:id/regenerate-secret', requirePermission('webhook:update:all'), regenerateWebhookSecret);

export { router as notificationRoutes };
