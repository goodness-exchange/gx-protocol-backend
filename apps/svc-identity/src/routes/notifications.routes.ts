import { Router, Response } from 'express';
import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { authenticateJWT } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../types/dtos';

/**
 * Notifications Routes
 *
 * Provides notification management endpoints for the in-app notification center.
 * Users can view, mark as read, and manage their notifications.
 */

const router = Router();

/**
 * GET /api/v1/notifications
 * Get user's notifications with pagination
 *
 * @query limit - Number of notifications (default: 20, max: 100)
 * @query offset - Pagination offset (default: 0)
 * @query status - Filter by status: UNREAD, READ, ARCHIVED (optional)
 * @returns {notifications: Notification[], total: number, unreadCount: number}
 */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const statusFilter = req.query.status as string | undefined;

    // Build where clause
    const where: any = {
      recipientId: profileId,
    };

    if (statusFilter && ['UNREAD', 'READ', 'ARCHIVED'].includes(statusFilter)) {
      where.status = statusFilter;
    }

    // Fetch notifications with pagination
    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          notificationId: true,
          type: true,
          title: true,
          message: true,
          actionUrl: true,
          actionRequired: true,
          status: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where }),
      db.notification.count({
        where: {
          recipientId: profileId,
          status: 'UNREAD',
        },
      }),
    ]);

    res.status(200).json({
      notifications,
      total,
      unreadCount,
      pagination: {
        limit,
        offset,
        hasMore: offset + notifications.length < total,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch notifications');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch notifications',
    });
  }
});

/**
 * GET /api/v1/notifications/unread-count
 * Get count of unread notifications (for badge display)
 *
 * @returns {unreadCount: number}
 */
router.get('/unread-count', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const unreadCount = await db.notification.count({
      where: {
        recipientId: profileId,
        status: 'UNREAD',
      },
    });

    res.status(200).json({ unreadCount });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch unread count');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch unread count',
    });
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a notification as read
 *
 * @param id - Notification ID
 * @returns {success: true}
 */
router.patch('/:id/read', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;
    const { id } = req.params;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    // Verify notification belongs to user
    const notification = await db.notification.findFirst({
      where: {
        notificationId: id,
        recipientId: profileId,
      },
    });

    if (!notification) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Notification not found',
      });
      return;
    }

    await db.notification.update({
      where: { notificationId: id },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to mark notification as read');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to mark notification as read',
    });
  }
});

/**
 * PATCH /api/v1/notifications/mark-all-read
 * Mark all notifications as read
 *
 * @returns {success: true, count: number}
 */
router.patch('/mark-all-read', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const result = await db.notification.updateMany({
      where: {
        recipientId: profileId,
        status: 'UNREAD',
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      count: result.count,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to mark all notifications as read');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to mark all notifications as read',
    });
  }
});

export default router;
