/**
 * Audit Log Types
 * Types for querying and displaying admin audit trails
 */

// Define AuditEventType locally (matches Prisma schema enum)
export type AuditEventType =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_REGISTERED'
  | 'PROFILE_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'KYC_SUBMITTED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'TRANSACTION_INITIATED'
  | 'TRANSACTION_APPROVED'
  | 'TRANSACTION_REJECTED'
  | 'TRANSACTION_COMPLETED'
  | 'TRANSACTION_FAILED'
  | 'WALLET_CREATED'
  | 'BENEFICIARY_ADDED'
  | 'BENEFICIARY_REMOVED'
  | 'RELATIONSHIP_INVITED'
  | 'RELATIONSHIP_CONFIRMED'
  | 'RELATIONSHIP_REJECTED'
  | 'BUSINESS_SIGNATORY_ADDED'
  | 'BUSINESS_SIGNATORY_REVOKED'
  | 'ADMIN_ACCOUNT_FROZEN'
  | 'ADMIN_ACCOUNT_UNFROZEN'
  | 'ADMIN_ACCOUNT_CLOSED'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'DEVICE_TRUSTED'
  | 'DEVICE_UNTRUSTED';

// Audit log query parameters
export interface AuditLogQueryParams {
  profileId?: string;        // Filter by target user
  actorId?: string;          // Filter by admin who performed action
  eventType?: AuditEventType | AuditEventType[];
  startDate?: Date;
  endDate?: Date;
  resourceType?: string;
  resourceId?: string;
  page?: number;
  limit?: number;
}

// Audit log entry (for API response)
export interface AuditLogEntry {
  auditId: string;
  eventType: AuditEventType;
  actorProfileId: string | null;
  actorName?: string;
  targetProfileId: string | null;
  targetName?: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  previousValue: unknown | null;
  newValue: unknown | null;
  metadata: unknown | null;
  timestamp: string;
}

// Audit log list response
export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// User activity summary
export interface UserActivitySummary {
  profileId: string;
  totalEvents: number;
  lastActivityAt: string | null;
  eventBreakdown: Record<string, number>;
}

// Admin activity summary
export interface AdminActivitySummary {
  adminId: string;
  adminName: string;
  totalActions: number;
  lastActionAt: string | null;
  actionBreakdown: Record<string, number>;
}

// Event type display configuration
export const AUDIT_EVENT_DISPLAY: Record<AuditEventType, { label: string; category: string; severity: 'low' | 'medium' | 'high' }> = {
  USER_LOGIN: { label: 'User Login', category: 'auth', severity: 'low' },
  USER_LOGOUT: { label: 'User Logout', category: 'auth', severity: 'low' },
  USER_REGISTERED: { label: 'User Registered', category: 'account', severity: 'medium' },
  PROFILE_UPDATED: { label: 'Profile Updated', category: 'account', severity: 'low' },
  PASSWORD_CHANGED: { label: 'Password Changed', category: 'auth', severity: 'medium' },
  KYC_SUBMITTED: { label: 'KYC Submitted', category: 'kyc', severity: 'medium' },
  KYC_APPROVED: { label: 'KYC Approved', category: 'kyc', severity: 'high' },
  KYC_REJECTED: { label: 'KYC Rejected', category: 'kyc', severity: 'high' },
  TRANSACTION_INITIATED: { label: 'Transaction Initiated', category: 'transaction', severity: 'medium' },
  TRANSACTION_APPROVED: { label: 'Transaction Approved', category: 'transaction', severity: 'high' },
  TRANSACTION_REJECTED: { label: 'Transaction Rejected', category: 'transaction', severity: 'high' },
  TRANSACTION_COMPLETED: { label: 'Transaction Completed', category: 'transaction', severity: 'medium' },
  TRANSACTION_FAILED: { label: 'Transaction Failed', category: 'transaction', severity: 'medium' },
  WALLET_CREATED: { label: 'Wallet Created', category: 'wallet', severity: 'medium' },
  BENEFICIARY_ADDED: { label: 'Beneficiary Added', category: 'beneficiary', severity: 'medium' },
  BENEFICIARY_REMOVED: { label: 'Beneficiary Removed', category: 'beneficiary', severity: 'medium' },
  RELATIONSHIP_INVITED: { label: 'Relationship Invited', category: 'relationship', severity: 'low' },
  RELATIONSHIP_CONFIRMED: { label: 'Relationship Confirmed', category: 'relationship', severity: 'low' },
  RELATIONSHIP_REJECTED: { label: 'Relationship Rejected', category: 'relationship', severity: 'low' },
  BUSINESS_SIGNATORY_ADDED: { label: 'Business Signatory Added', category: 'business', severity: 'high' },
  BUSINESS_SIGNATORY_REVOKED: { label: 'Business Signatory Revoked', category: 'business', severity: 'high' },
  ADMIN_ACCOUNT_FROZEN: { label: 'Account Frozen', category: 'admin', severity: 'high' },
  ADMIN_ACCOUNT_UNFROZEN: { label: 'Account Unfrozen', category: 'admin', severity: 'high' },
  ADMIN_ACCOUNT_CLOSED: { label: 'Account Closed', category: 'admin', severity: 'high' },
  SESSION_CREATED: { label: 'Session Created', category: 'session', severity: 'low' },
  SESSION_REVOKED: { label: 'Session Revoked', category: 'session', severity: 'medium' },
  DEVICE_TRUSTED: { label: 'Device Trusted', category: 'device', severity: 'medium' },
  DEVICE_UNTRUSTED: { label: 'Device Untrusted', category: 'device', severity: 'medium' },
};
