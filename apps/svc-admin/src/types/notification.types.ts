// ============================================================================
// Admin Notification Types
// ============================================================================

/**
 * Notification event types for the admin approval workflow
 */
export type AdminNotificationEvent =
  | 'ADMIN_APPROVAL_REQUESTED'
  | 'ADMIN_APPROVAL_APPROVED'
  | 'ADMIN_APPROVAL_REJECTED'
  | 'ADMIN_APPROVAL_CANCELLED'
  | 'ADMIN_APPROVAL_EXPIRED'
  | 'ADMIN_APPROVAL_EXECUTED';

/**
 * Notification channel configuration
 */
export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  webhook: boolean;
}

/**
 * Base notification payload
 */
export interface NotificationPayload {
  event: AdminNotificationEvent;
  title: string;
  message: string;
  actionUrl?: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Approval request notification data
 */
export interface ApprovalNotificationData {
  approvalId: string;
  requestType: string;
  action: string;
  reason: string;
  requester: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    role: string;
  };
  approver?: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    role: string;
  };
  targetResource?: string;
  payload?: unknown;
  rejectionReason?: string;
  tokenExpiresAt?: Date;
}

/**
 * Email notification request
 */
export interface EmailNotificationRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  event: AdminNotificationEvent;
  timestamp: string;
  data: ApprovalNotificationData;
  signature?: string;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  webhookId: string;
  success: boolean;
  httpStatus?: number;
  error?: string;
  deliveryId: string;
}

/**
 * Notification service result
 */
export interface NotificationResult {
  success: boolean;
  inAppNotificationId?: string;
  emailSent?: boolean;
  webhookDeliveries?: WebhookDeliveryResult[];
  errors?: string[];
}

/**
 * Admin user info for notification recipients
 */
export interface NotificationRecipient {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * Webhook configuration for creating/updating webhooks
 */
export interface WebhookConfig {
  name: string;
  url: string;
  events: AdminNotificationEvent[];
  headers?: Record<string, string>;
}

/**
 * Create webhook request DTO
 */
export interface CreateWebhookDTO {
  name: string;
  url: string;
  events: AdminNotificationEvent[];
  headers?: Record<string, string>;
}

/**
 * Update webhook request DTO
 */
export interface UpdateWebhookDTO {
  name?: string;
  url?: string;
  events?: AdminNotificationEvent[];
  headers?: Record<string, string>;
  isActive?: boolean;
}

/**
 * Webhook response DTO
 */
export interface WebhookResponseDTO {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdById: string;
  lastTriggeredAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin notification response DTO
 */
export interface AdminNotificationResponseDTO {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * Error codes for notification operations
 */
export enum NotificationErrorCode {
  WEBHOOK_NOT_FOUND = 'WEBHOOK_NOT_FOUND',
  WEBHOOK_DELIVERY_FAILED = 'WEBHOOK_DELIVERY_FAILED',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
}
