/**
 * Data Transfer Objects (DTOs) and Types for Identity Service
 * 
 * These types define the shape of request and response data
 * for the identity service API endpoints.
 */

// ============================================
// Authentication DTOs
// ============================================

export interface LoginRequestDTO {
  email: string;
  password: string;
}

export interface LoginResponseDTO {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDTO;
}

export interface RefreshTokenRequestDTO {
  refreshToken: string;
}

export interface RefreshTokenResponseDTO {
  accessToken: string;
}

// ============================================
// User Registration DTOs
// ============================================

export interface RegisterUserRequestDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNum?: string;
  identityNum?: string;
  nationalityCountryCode?: string;
}

export interface UserProfileDTO {
  profileId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phoneNum: string | null;
  identityNum: string | null;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'CLOSED';
  nationalityCountryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Profile Update DTOs
// ============================================

export interface UpdateProfileRequestDTO {
  firstName?: string;
  lastName?: string;
  phoneNum?: string;
  identityNum?: string;
  nationalityCountryCode?: string;
}

// ============================================
// KYC DTOs
// ============================================

export interface SubmitKYCRequestDTO {
  evidenceHash: string;
  evidenceSize: number;
  evidenceMime: string;
}

export interface KYCStatusDTO {
  kycId: string;
  profileId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  evidenceHash: string | null;
  evidenceSize: number | null;
  evidenceMime: string | null;
  verifiedAt: Date | null;
  verifierDetails: string | null;
  createdAt: Date;
  updatedAt: Date;
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

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
