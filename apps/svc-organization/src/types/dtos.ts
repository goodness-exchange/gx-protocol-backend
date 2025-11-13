/**
 * Data Transfer Objects (DTOs) for Organization Service
 */

import { Request } from 'express';

// ============================================
// Organization Proposal DTOs
// ============================================

export interface ProposeOrganizationRequestDTO {
  orgId: string;
  orgName: string;
  orgType: 'BUSINESS' | 'NGO' | 'GOVERNMENT';
  stakeholderIds: string[];  // Array of user profile IDs
}

export interface ProposeOrganizationResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Membership Endorsement DTOs
// ============================================

export interface EndorseMembershipRequestDTO {
  orgId: string;
}

export interface EndorseMembershipResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Activation DTOs
// ============================================

export interface ActivateOrganizationRequestDTO {
  orgId: string;
}

export interface ActivateOrganizationResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Authorization Rule DTOs
// ============================================

export interface AuthorizationRule {
  amountThreshold: number;
  requiredApprovers: number;
  approverGroup: string[];  // Array of user profile IDs
}

export interface DefineAuthRuleRequestDTO {
  orgId: string;
  rule: AuthorizationRule;
}

export interface DefineAuthRuleResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Multi-Signature Transaction DTOs
// ============================================

export interface InitiateMultiSigTxRequestDTO {
  orgId: string;
  toUserId: string;
  amount: number;
  remark?: string;
}

export interface InitiateMultiSigTxResponseDTO {
  commandId: string;
  pendingTxId: string;
  message: string;
}

export interface ApproveMultiSigTxRequestDTO {
  pendingTxId: string;
}

export interface ApproveMultiSigTxResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Query DTOs
// ============================================

export interface OrganizationDTO {
  orgId: string;
  orgName: string;
  accountType: 'BUSINESS' | 'NGO' | 'GOVERNMENT';
  status: 'PendingEndorsement' | 'Verified' | 'Locked';
  stakeholders: string[];
  endorsements: Record<string, boolean>;
  rules: AuthorizationRule[];
  createdAt: Date;
  velocityTaxTimerStart?: Date;
  velocityTaxLastCheck?: Date;
  velocityTaxExempt?: boolean;
}

export interface PendingTransactionDTO {
  txId: string;
  orgId: string;
  toId: string;
  amount: number;
  remark: string;
  status: 'Pending' | 'Executed' | 'Rejected';
  requiredApprovals: number;
  approverGroup: string[];
  approvals: Record<string, boolean>;
}

// ============================================
// JWT Payload
// ============================================

export interface JWTPayload {
  profileId: string;
  email: string | null;
  status: string;
  iat?: number;
  exp?: number;
}

// ============================================
// Express Request with User
// ============================================

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
