import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { AdminAuthenticatedRequest } from '../types/admin-auth.types';
import type { CreateWebhookDTO, UpdateWebhookDTO } from '../types/notification.types';

// ============================================================================
// Notification Controller
// ============================================================================

/**
 * Get notifications for the current admin
 */
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AdminAuthenticatedRequest;
    const adminId = authReq.admin!.adminId;

    const { limit, offset, status } = req.query;

    const result = await notificationService.getNotifications(adminId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      status: status as string | undefined,
    });

    res.json({
      success: true,
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AdminAuthenticatedRequest;
    const adminId = authReq.admin!.adminId;

    const result = await notificationService.getNotifications(adminId, { limit: 0 });

    res.json({
      success: true,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AdminAuthenticatedRequest;
    const adminId = authReq.admin!.adminId;
    const { id } = req.params;

    await notificationService.markAsRead(adminId, id);

    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AdminAuthenticatedRequest;
    const adminId = authReq.admin!.adminId;

    const count = await notificationService.markAllAsRead(adminId);

    res.json({
      success: true,
      message: `${count} notifications marked as read`,
      count,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Webhook Controller
// ============================================================================

/**
 * Create a new webhook
 */
export async function createWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AdminAuthenticatedRequest;
    const adminId = authReq.admin!.adminId;
    const dto = req.body as CreateWebhookDTO;

    // Validate required fields
    if (!dto.name || !dto.url || !dto.events || dto.events.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'name, url, and events are required' },
      });
      return;
    }

    const webhook = await notificationService.createWebhook(adminId, dto);

    res.status(201).json({
      success: true,
      webhook,
      message: 'Webhook created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all webhooks
 */
export async function getWebhooks(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const webhooks = await notificationService.getWebhooks();

    res.json({
      success: true,
      webhooks,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get webhook by ID
 */
export async function getWebhookById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const webhook = await notificationService.getWebhookById(id);

    if (!webhook) {
      res.status(404).json({
        success: false,
        error: { message: 'Webhook not found' },
      });
      return;
    }

    res.json({
      success: true,
      webhook,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update webhook
 */
export async function updateWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const dto = req.body as UpdateWebhookDTO;

    const webhook = await notificationService.updateWebhook(id, dto);

    if (!webhook) {
      res.status(404).json({
        success: false,
        error: { message: 'Webhook not found' },
      });
      return;
    }

    res.json({
      success: true,
      webhook,
      message: 'Webhook updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete webhook
 */
export async function deleteWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    await notificationService.deleteWebhook(id);

    res.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Regenerate webhook secret
 */
export async function regenerateWebhookSecret(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const newSecret = await notificationService.regenerateWebhookSecret(id);

    res.json({
      success: true,
      secret: newSecret,
      message: 'Webhook secret regenerated. Please update your integration.',
    });
  } catch (error) {
    next(error);
  }
}
