/**
 * Data Transfer Objects (DTOs) for Governance Service
 */

import { Request } from 'express';

// ============================================
// Proposal DTOs
// ============================================

export interface SubmitProposalRequestDTO {
  targetParam: string;
  newValue: string;
  proposerId: string;
}

export interface SubmitProposalResponseDTO {
  commandId: string;
  proposalId: string;
  message: string;
}

// ============================================
// Voting DTOs
// ============================================

export interface VoteOnProposalRequestDTO {
  proposalId: string;
  vote: boolean;  // true = for, false = against
  voterId: string;
}

export interface VoteOnProposalResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Execution DTOs
// ============================================

export interface ExecuteProposalRequestDTO {
  proposalId: string;
}

export interface ExecuteProposalResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Query DTOs
// ============================================

export interface ProposalDTO {
  proposalId: string;
  targetParam: string;
  newValue: string;
  proposerId: string;
  status: 'Active' | 'Passed' | 'Failed' | 'Executed';
  forVotes: number;
  againstVotes: number;
  endTime: Date;
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
