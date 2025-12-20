import { Router } from 'express';
import { authenticateAdminJWT } from '../middlewares/admin-auth.middleware';
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
// Webhook Management Endpoints (SUPER_OWNER only)
// ==========================================================================

/**
 * POST /api/v1/admin/notifications/webhooks
 * Create a new webhook
 */
router.post('/webhooks', createWebhook);

/**
 * GET /api/v1/admin/notifications/webhooks
 * Get all webhooks
 */
router.get('/webhooks', getWebhooks);

/**
 * GET /api/v1/admin/notifications/webhooks/:id
 * Get webhook by ID
 */
router.get('/webhooks/:id', getWebhookById);

/**
 * PATCH /api/v1/admin/notifications/webhooks/:id
 * Update webhook
 */
router.patch('/webhooks/:id', updateWebhook);

/**
 * DELETE /api/v1/admin/notifications/webhooks/:id
 * Delete webhook
 */
router.delete('/webhooks/:id', deleteWebhook);

/**
 * POST /api/v1/admin/notifications/webhooks/:id/regenerate-secret
 * Regenerate webhook secret
 */
router.post('/webhooks/:id/regenerate-secret', regenerateWebhookSecret);

export { router as notificationRoutes };
