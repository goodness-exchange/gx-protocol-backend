/**
 * Data Transfer Objects (DTOs) for Loan Pool Service
 */

import { Request } from 'express';

// ============================================
// Loan Application DTOs
// ============================================

export interface ApplyForLoanRequestDTO {
  borrowerId: string;
  amount: number;
  collateralHash: string;  // Hash of off-chain collateral documents
}

export interface ApplyForLoanResponseDTO {
  commandId: string;
  loanId: string;
  message: string;
}

// ============================================
// Loan Approval DTOs
// ============================================

export interface ApproveLoanRequestDTO {
  loanId: string;
}

export interface ApproveLoanResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Query DTOs
// ============================================

export interface LoanDTO {
  loanId: string;
  borrowerId: string;
  amount: number;
  status: 'PendingApproval' | 'Active' | 'Defaulted' | 'Paid';
  collateralHash: string;
  appliedAt: Date;
  approvedAt?: Date;
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
