import { Resend } from 'resend';
import * as crypto from 'crypto';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { adminConfig } from '../config';
import type {
  AdminNotificationEvent,
  ApprovalNotificationData,
  NotificationPayload,
  NotificationResult,
  WebhookPayload,
  WebhookDeliveryResult,
  NotificationRecipient,
  CreateWebhookDTO,
  UpdateWebhookDTO,
  WebhookResponseDTO,
  AdminNotificationResponseDTO,
} from '../types/notification.types';

// ============================================================================
// Internal Types (for mapping Prisma results)
// ============================================================================

interface WebhookRecord {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdById: string;
  lastTriggeredAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  readAt: Date | null;
  createdAt: Date;
}

// ============================================================================
// Notification Service
// ============================================================================

/**
 * Admin Notification Service
 *
 * Handles multi-channel notifications for the admin approval workflow:
 * - In-app notifications stored in database
 * - Email notifications via Resend
 * - Webhook dispatching with HMAC signatures
 */
class NotificationService {
  private resend: Resend | null = null;

  constructor() {
    if (adminConfig.resendApiKey) {
      this.resend = new Resend(adminConfig.resendApiKey);
    }
  }

  // ==========================================================================
  // Main Notification Methods
  // ==========================================================================

  /**
   * Send notification for approval request created
   */
  async notifyApprovalCreated(data: ApprovalNotificationData): Promise<NotificationResult> {
    const payload: NotificationPayload = {
      event: 'ADMIN_APPROVAL_REQUESTED',
      title: 'New Approval Request',
      message: `${data.requester.displayName} has requested approval for: ${data.action}`,
      actionUrl: `/approvals/${data.approvalId}`,
      resourceType: 'ApprovalRequest',
      resourceId: data.approvalId,
      metadata: { requestType: data.requestType, reason: data.reason },
    };

    // Get all SUPER_OWNER admins to notify (except requester)
    const superOwners = await this.getSuperOwners(data.requester.id);

    return this.sendNotifications(payload, superOwners, data);
  }

  /**
   * Send notification for approval approved
   */
  async notifyApprovalApproved(data: ApprovalNotificationData): Promise<NotificationResult> {
    const payload: NotificationPayload = {
      event: 'ADMIN_APPROVAL_APPROVED',
      title: 'Approval Request Approved',
      message: `Your request "${data.action}" has been approved by ${data.approver?.displayName}`,
      actionUrl: `/approvals/${data.approvalId}`,
      resourceType: 'ApprovalRequest',
      resourceId: data.approvalId,
    };

    // Notify the requester
    const recipients: NotificationRecipient[] = [{
      id: data.requester.id,
      email: data.requester.email,
      username: data.requester.username,
      displayName: data.requester.displayName,
      role: data.requester.role,
    }];

    return this.sendNotifications(payload, recipients, data);
  }

  /**
   * Send notification for approval rejected
   */
  async notifyApprovalRejected(data: ApprovalNotificationData): Promise<NotificationResult> {
    const payload: NotificationPayload = {
      event: 'ADMIN_APPROVAL_REJECTED',
      title: 'Approval Request Rejected',
      message: `Your request "${data.action}" has been rejected by ${data.approver?.displayName}. Reason: ${data.rejectionReason || 'Not specified'}`,
      actionUrl: `/approvals/${data.approvalId}`,
      resourceType: 'ApprovalRequest',
      resourceId: data.approvalId,
    };

    const recipients: NotificationRecipient[] = [{
      id: data.requester.id,
      email: data.requester.email,
      username: data.requester.username,
      displayName: data.requester.displayName,
      role: data.requester.role,
    }];

    return this.sendNotifications(payload, recipients, data);
  }

  /**
   * Send notification for approval cancelled
   */
  async notifyApprovalCancelled(data: ApprovalNotificationData): Promise<NotificationResult> {
    const payload: NotificationPayload = {
      event: 'ADMIN_APPROVAL_CANCELLED',
      title: 'Approval Request Cancelled',
      message: `Approval request "${data.action}" has been cancelled`,
      actionUrl: `/approvals/${data.approvalId}`,
      resourceType: 'ApprovalRequest',
      resourceId: data.approvalId,
    };

    // Notify all SUPER_OWNERS
    const superOwners = await this.getSuperOwners();

    return this.sendNotifications(payload, superOwners, data);
  }

  /**
   * Send notification for approval executed
   */
  async notifyApprovalExecuted(data: ApprovalNotificationData): Promise<NotificationResult> {
    const payload: NotificationPayload = {
      event: 'ADMIN_APPROVAL_EXECUTED',
      title: 'Approval Request Executed',
      message: `Your approved request "${data.action}" has been executed`,
      actionUrl: `/approvals/${data.approvalId}`,
      resourceType: 'ApprovalRequest',
      resourceId: data.approvalId,
    };

    const recipients: NotificationRecipient[] = [{
      id: data.requester.id,
      email: data.requester.email,
      username: data.requester.username,
      displayName: data.requester.displayName,
      role: data.requester.role,
    }];

    return this.sendNotifications(payload, recipients, data);
  }

  // ==========================================================================
  // Core Notification Logic
  // ==========================================================================

  /**
   * Send notifications through all channels
   */
  private async sendNotifications(
    payload: NotificationPayload,
    recipients: NotificationRecipient[],
    approvalData: ApprovalNotificationData
  ): Promise<NotificationResult> {
    const result: NotificationResult = {
      success: true,
      errors: [],
    };

    // 1. Create in-app notifications
    try {
      for (const recipient of recipients) {
        const notification = await db.adminNotification.create({
          data: {
            recipientId: recipient.id,
            type: payload.event,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl,
            resourceType: payload.resourceType,
            resourceId: payload.resourceId,
          },
        });
        result.inAppNotificationId = notification.id;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to create in-app notification';
      result.errors?.push(errMsg);
      logger.error({ error }, 'Failed to create in-app notification');
    }

    // 2. Send email notifications (if enabled)
    if (adminConfig.emailEnabled && this.resend) {
      try {
        for (const recipient of recipients) {
          await this.sendEmailNotification(recipient, payload, approvalData);
        }
        result.emailSent = true;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Failed to send email';
        result.errors?.push(errMsg);
        logger.error({ error }, 'Failed to send email notification');
      }
    }

    // 3. Dispatch webhooks
    try {
      const webhookResults = await this.dispatchWebhooks(payload.event, approvalData);
      result.webhookDeliveries = webhookResults;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to dispatch webhooks';
      result.errors?.push(errMsg);
      logger.error({ error }, 'Failed to dispatch webhooks');
    }

    result.success = (result.errors?.length || 0) === 0;
    return result;
  }

  // ==========================================================================
  // Email Methods
  // ==========================================================================

  /**
   * Send email notification to a recipient
   */
  private async sendEmailNotification(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    data: ApprovalNotificationData
  ): Promise<void> {
    if (!this.resend) {
      logger.warn('Email sending skipped - Resend not configured');
      return;
    }

    const html = this.generateEmailHtml(payload, data);

    await this.resend.emails.send({
      from: `${adminConfig.emailFromName} <${adminConfig.emailFromAddress}>`,
      to: recipient.email,
      subject: `[GX Admin] ${payload.title}`,
      html,
    });

    logger.info({ to: recipient.email, event: payload.event }, 'Email notification sent');

    // Update notification with email sent status
    if (payload.resourceId) {
      await db.adminNotification.updateMany({
        where: {
          recipientId: recipient.id,
          resourceId: payload.resourceId,
        },
        data: {
          sentViaEmail: true,
          emailSentAt: new Date(),
        },
      });
    }
  }

  /**
   * Generate HTML email content
   */
  private generateEmailHtml(payload: NotificationPayload, data: ApprovalNotificationData): string {
    const actionUrl = payload.actionUrl
      ? `${adminConfig.adminDashboardUrl}${payload.actionUrl}`
      : adminConfig.adminDashboardUrl;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #470A69; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">GX Coin Admin</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">${payload.title}</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                ${payload.message}
              </p>

              <!-- Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding-bottom: 8px;">Request Type:</td>
                        <td style="color: #1f2937; font-size: 14px; padding-bottom: 8px; text-align: right;">${data.requestType}</td>
                      </tr>
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding-bottom: 8px;">Action:</td>
                        <td style="color: #1f2937; font-size: 14px; padding-bottom: 8px; text-align: right;">${data.action}</td>
                      </tr>
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding-bottom: 8px;">Requester:</td>
                        <td style="color: #1f2937; font-size: 14px; padding-bottom: 8px; text-align: right;">${data.requester.displayName}</td>
                      </tr>
                      <tr>
                        <td style="color: #6b7280; font-size: 14px;">Reason:</td>
                        <td style="color: #1f2937; font-size: 14px; text-align: right;">${data.reason}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" style="display: inline-block; background-color: #470A69; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View in Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                This is an automated message from GX Coin Admin. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // ==========================================================================
  // Webhook Methods
  // ==========================================================================

  /**
   * Dispatch webhooks for an event
   */
  private async dispatchWebhooks(
    event: AdminNotificationEvent,
    data: ApprovalNotificationData
  ): Promise<WebhookDeliveryResult[]> {
    const results: WebhookDeliveryResult[] = [];

    // Find all active webhooks subscribed to this event
    const webhooks = await db.adminWebhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
    });

    for (const webhook of webhooks) {
      const result = await this.deliverWebhook(webhook, event, data);
      results.push(result);
    }

    return results;
  }

  /**
   * Deliver a webhook payload
   */
  private async deliverWebhook(
    webhook: { id: string; url: string; secret: string; headers: unknown },
    event: AdminNotificationEvent,
    data: ApprovalNotificationData
  ): Promise<WebhookDeliveryResult> {
    const timestamp = new Date().toISOString();

    const payload: WebhookPayload = {
      event,
      timestamp,
      data,
    };

    // Generate HMAC signature
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(payloadString)
      .digest('hex');

    payload.signature = signature;

    // Create delivery record
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: event,
        payload: payload as object,
        status: 'PENDING',
        attempts: 1,
      },
    });

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-GX-Signature': `sha256=${signature}`,
      'X-GX-Event': event,
      'X-GX-Timestamp': timestamp,
      'X-GX-Delivery': delivery.id,
    };

    // Add custom headers if configured
    if (webhook.headers && typeof webhook.headers === 'object') {
      Object.assign(headers, webhook.headers);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), adminConfig.webhookTimeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      const success = response.ok;

      // Update delivery record
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: success ? 'SUCCESS' : 'FAILED',
          httpStatus: response.status,
          response: responseText.substring(0, 1000),
          deliveredAt: success ? new Date() : null,
        },
      });

      // Update webhook health
      await db.adminWebhook.update({
        where: { id: webhook.id },
        data: {
          lastTriggeredAt: new Date(),
          ...(success
            ? { lastSuccessAt: new Date(), failureCount: 0 }
            : { lastFailureAt: new Date(), failureCount: { increment: 1 } }),
        },
      });

      logger.info({
        webhookId: webhook.id,
        event,
        success,
        httpStatus: response.status,
      }, 'Webhook delivered');

      return {
        webhookId: webhook.id,
        success,
        httpStatus: response.status,
        deliveryId: delivery.id,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';

      // Update delivery record with failure
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          error: errMsg,
        },
      });

      // Update webhook health
      await db.adminWebhook.update({
        where: { id: webhook.id },
        data: {
          lastTriggeredAt: new Date(),
          lastFailureAt: new Date(),
          failureCount: { increment: 1 },
        },
      });

      logger.error({ webhookId: webhook.id, event, error: errMsg }, 'Webhook delivery failed');

      return {
        webhookId: webhook.id,
        success: false,
        error: errMsg,
        deliveryId: delivery.id,
      };
    }
  }

  // ==========================================================================
  // Webhook Management Methods
  // ==========================================================================

  /**
   * Create a new webhook
   */
  async createWebhook(adminId: string, dto: CreateWebhookDTO): Promise<WebhookResponseDTO> {
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await db.adminWebhook.create({
      data: {
        name: dto.name,
        url: dto.url,
        secret,
        events: dto.events,
        headers: dto.headers || null,
        createdById: adminId,
      },
    });

    logger.info({ webhookId: webhook.id, name: dto.name }, 'Webhook created');

    return this.mapWebhookToDTO(webhook);
  }

  /**
   * Get all webhooks for admin
   */
  async getWebhooks(): Promise<WebhookResponseDTO[]> {
    const webhooks = await db.adminWebhook.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return webhooks.map((w: WebhookRecord) => this.mapWebhookToDTO(w));
  }

  /**
   * Get webhook by ID
   */
  async getWebhookById(id: string): Promise<WebhookResponseDTO | null> {
    const webhook = await db.adminWebhook.findUnique({
      where: { id },
    });

    return webhook ? this.mapWebhookToDTO(webhook) : null;
  }

  /**
   * Update webhook
   */
  async updateWebhook(id: string, dto: UpdateWebhookDTO): Promise<WebhookResponseDTO | null> {
    const webhook = await db.adminWebhook.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.url && { url: dto.url }),
        ...(dto.events && { events: dto.events }),
        ...(dto.headers !== undefined && { headers: dto.headers }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    logger.info({ webhookId: id }, 'Webhook updated');

    return this.mapWebhookToDTO(webhook);
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(id: string): Promise<boolean> {
    await db.adminWebhook.delete({
      where: { id },
    });

    logger.info({ webhookId: id }, 'Webhook deleted');

    return true;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateWebhookSecret(id: string): Promise<string> {
    const newSecret = crypto.randomBytes(32).toString('hex');

    await db.adminWebhook.update({
      where: { id },
      data: { secret: newSecret },
    });

    logger.info({ webhookId: id }, 'Webhook secret regenerated');

    return newSecret;
  }

  // ==========================================================================
  // Notification Management Methods
  // ==========================================================================

  /**
   * Get notifications for an admin user
   */
  async getNotifications(
    adminId: string,
    options: { limit?: number; offset?: number; status?: string }
  ): Promise<{ notifications: AdminNotificationResponseDTO[]; total: number; unreadCount: number }> {
    const where = {
      recipientId: adminId,
      ...(options.status && { status: options.status }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      db.adminNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      db.adminNotification.count({ where }),
      db.adminNotification.count({
        where: { recipientId: adminId, status: 'UNREAD' },
      }),
    ]);

    return {
      notifications: notifications.map((n: NotificationRecord) => this.mapNotificationToDTO(n)),
      total,
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(adminId: string, notificationId: string): Promise<boolean> {
    await db.adminNotification.updateMany({
      where: { id: notificationId, recipientId: adminId },
      data: { status: 'READ', readAt: new Date() },
    });

    return true;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(adminId: string): Promise<number> {
    const result = await db.adminNotification.updateMany({
      where: { recipientId: adminId, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    });

    return result.count;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get all SUPER_OWNER admins
   */
  private async getSuperOwners(excludeId?: string): Promise<NotificationRecipient[]> {
    const admins = await db.adminUser.findMany({
      where: {
        role: 'SUPER_OWNER',
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
      },
    });

    return admins;
  }

  /**
   * Map webhook to response DTO
   */
  private mapWebhookToDTO(webhook: {
    id: string;
    name: string;
    url: string;
    events: string[];
    isActive: boolean;
    createdById: string;
    lastTriggeredAt: Date | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    failureCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): WebhookResponseDTO {
    return {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      createdById: webhook.createdById,
      lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() || null,
      lastSuccessAt: webhook.lastSuccessAt?.toISOString() || null,
      lastFailureAt: webhook.lastFailureAt?.toISOString() || null,
      failureCount: webhook.failureCount,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
    };
  }

  /**
   * Map notification to response DTO
   */
  private mapNotificationToDTO(notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    actionUrl: string | null;
    resourceType: string | null;
    resourceId: string | null;
    status: string;
    readAt: Date | null;
    createdAt: Date;
  }): AdminNotificationResponseDTO {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      resourceType: notification.resourceType,
      resourceId: notification.resourceId,
      status: notification.status,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}

export const notificationService = new NotificationService();
