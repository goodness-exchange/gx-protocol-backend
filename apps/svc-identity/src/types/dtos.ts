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
  fullName: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface UserProfileDTO {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  dateOfBirth: Date | null;
  kycStatus: 'not_started' | 'pending' | 'approved' | 'rejected';
  trustScore: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Profile Update DTOs
// ============================================

export interface UpdateProfileRequestDTO {
  fullName?: string;
  phone?: string;
  dateOfBirth?: string;
}

// ============================================
// KYC DTOs
// ============================================

export interface SubmitKYCRequestDTO {
  documentType: 'passport' | 'national_id' | 'drivers_license';
  documentNumber: string;
  documentFrontImage: string; // Base64 or URL
  documentBackImage?: string; // Base64 or URL
  selfieImage: string; // Base64 or URL
}

export interface KYCStatusDTO {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  documentType: string;
  documentNumber: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}

// ============================================
// JWT Payload
// ============================================

export interface JWTPayload {
  userId: string;
  email: string;
  kycStatus: string;
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
