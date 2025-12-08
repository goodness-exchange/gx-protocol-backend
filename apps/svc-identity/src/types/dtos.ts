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
  middleName?: string | null;
  lastName: string;
  phoneNum: string | null;
  identityNum: string | null;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'CLOSED';
  nationalityCountryCode: string | null;
  // Additional fields for KYC/KYR pre-fill
  dateOfBirth?: Date | null;
  gender?: string | null;
  placeOfBirth?: string | null;
  denialReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Profile Update DTOs
// ============================================

export interface UpdateProfileRequestDTO {
  // Basic identity
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  phoneNum?: string;
  dateOfBirth?: string;
  gender?: string;
  placeOfBirth?: string | null;
  nationalityCountryCode?: string;

  // National ID (KYR)
  nationalIdNumber?: string | null;
  nationalIdIssuedAt?: string | null;
  nationalIdExpiresAt?: string | null;

  // Passport (KYR - optional)
  passportNumber?: string | null;
  passportIssuingCountry?: string | null;
  passportIssuedAt?: string | null;
  passportExpiresAt?: string | null;

  // Employment (KYR)
  employmentStatus?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  workEmail?: string | null;
  workPhoneNum?: string | null;

  // PEP (KYR)
  isPEP?: boolean;
  pepDetails?: string | null;

  // Address (will be stored separately)
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  addressCountry?: string;

  // Legacy field
  identityNum?: string;
}

// ============================================
// KYC DTOs
// ============================================

export interface KYCDocumentDTO {
  type: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'PROOF_OF_ADDRESS' | 'SELFIE_PHOTO' | 'OTHER';
  side?: 'FRONT' | 'BACK';
  hash: string;
  size: number;
  mimeType: string;
  fileName: string;
  documentNumber?: string;
  issuingCountry?: string;
  issuedDate?: string;
  expiryDate?: string;
}

export interface SubmitKYCRequestDTO {
  evidenceHash: string;
  evidenceSize: number;
  evidenceMime: string;
  documents?: KYCDocumentDTO[];
  documentType?: string;
  documentNumber?: string;
  issuingCountry?: string;
  issuedDate?: string;
  expiryDate?: string;
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
