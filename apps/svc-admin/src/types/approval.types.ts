// ============================================================================
// Approval Workflow Types and DTOs
// Phase 3: Multi-party approval system for critical operations
// ============================================================================

// ============================================================================
// Enums (mirrors Prisma schema)
// ============================================================================

export type ApprovalType =
  | 'DEPLOYMENT_PROMOTION'
  | 'USER_FREEZE'
  | 'TREASURY_OPERATION'
  | 'SYSTEM_PAUSE'
  | 'CONFIG_CHANGE'
  | 'ADMIN_ROLE_CHANGE';

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

// ============================================================================
// Request DTOs
// ============================================================================

export interface CreateApprovalRequestDTO {
  requestType: ApprovalType;
  action: string;
  targetResource?: string;
  payload?: Record<string, unknown>;
  reason: string;
}

export interface VoteApprovalRequestDTO {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface ListApprovalsQueryDTO {
  status?: ApprovalStatus;
  requestType?: ApprovalType;
  requesterId?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface ApprovalRequestDTO {
  id: string;
  requestType: ApprovalType;
  action: string;
  targetResource: string | null;
  payload: Record<string, unknown> | null;
  reason: string;
  status: ApprovalStatus;

  // Requester info
  requester: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };

  // Approver info (if approved/rejected)
  approver?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;

  // Timestamps
  createdAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;

  // Token info (only for requester)
  approvalToken?: string;
  tokenExpiresAt?: Date | null;

  // Execution tracking
  executedAt: Date | null;
  executionResult: Record<string, unknown> | null;
}

export interface ApprovalListResponseDTO {
  approvals: ApprovalRequestDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateApprovalResponseDTO {
  success: boolean;
  approval: ApprovalRequestDTO;
  message: string;
}

export interface VoteApprovalResponseDTO {
  success: boolean;
  approval: ApprovalRequestDTO;
  message: string;
}

export interface CancelApprovalResponseDTO {
  success: boolean;
  message: string;
}

export interface ExecuteApprovalResponseDTO {
  success: boolean;
  approval: ApprovalRequestDTO;
  executionResult: Record<string, unknown>;
  message: string;
}

// ============================================================================
// Error Codes
// ============================================================================

export enum ApprovalErrorCode {
  NOT_FOUND = 'APPROVAL_NOT_FOUND',
  ALREADY_PROCESSED = 'APPROVAL_ALREADY_PROCESSED',
  EXPIRED = 'APPROVAL_EXPIRED',
  UNAUTHORIZED = 'APPROVAL_UNAUTHORIZED',
  INVALID_TOKEN = 'APPROVAL_INVALID_TOKEN',
  MAX_PENDING_EXCEEDED = 'MAX_PENDING_APPROVALS_EXCEEDED',
  SELF_APPROVAL_NOT_ALLOWED = 'SELF_APPROVAL_NOT_ALLOWED',
  EXECUTION_FAILED = 'APPROVAL_EXECUTION_FAILED',
}

// ============================================================================
// Internal Types
// ============================================================================

export interface ApprovalExecutionContext {
  approvalId: string;
  requestType: ApprovalType;
  action: string;
  targetResource: string | null;
  payload: Record<string, unknown> | null;
  requesterId: string;
  approverId: string;
}

export interface ApprovalExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
