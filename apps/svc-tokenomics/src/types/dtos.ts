/**
 * Data Transfer Objects (DTOs) for Tokenomics Service
 */

import { Request } from 'express';

// ============================================
// Transfer DTOs
// ============================================

export interface TransferRequestDTO {
  fromUserId: string;
  toUserId: string;
  amount: number;
  remark?: string;
}

export interface TransferResponseDTO {
  commandId: string;
  message: string;
}

// ============================================
// Genesis Distribution DTOs
// ============================================

export interface GenesisDistributionRequestDTO {
  userId: string;
  userType: 'individual' | 'business' | 'government' | 'organization';
  countryCode: string;
}

// ============================================
// Balance DTOs
// ============================================

export interface WalletBalanceDTO {
  walletId: string;
  profileId: string;
  balance: number;
  updatedAt: Date;
}

export interface TreasuryBalanceDTO {
  countryCode: string;
  balance: number;
  updatedAt: Date;
}

// ============================================
// Transaction DTOs
// ============================================

export interface TransactionDTO {
  offTxId: string;
  onChainTxId: string | null;
  walletId: string;
  type: 'SEND' | 'RECEIVE' | 'GENESIS' | 'FEE' | 'TAX';
  counterparty: string;
  amount: number;
  fee: number;
  remark: string | null;
  timestamp: Date;
  blockNumber: bigint | null;
}

// ============================================
// Freeze/Unfreeze DTOs
// ============================================

export interface FreezeWalletRequestDTO {
  walletId: string;
  reason: string;
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
