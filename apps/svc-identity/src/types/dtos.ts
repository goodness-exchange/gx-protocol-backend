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

export interface AddressDTO {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isVerified: boolean;
  verifiedAt?: Date | null;
}

export interface UserProfileDTO {
  profileId: string;
  email: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phoneNum: string | null;
  identityNum: string | null;
  status: string;
  nationalityCountryCode: string | null;
  nationalityCountryName?: string | null;
  // Personal details
  dateOfBirth?: Date | null;
  gender?: string | null;
  placeOfBirth?: string | null;
  // National ID (KYR)
  nationalIdNumber?: string | null;
  nationalIdIssuedAt?: Date | null;
  nationalIdExpiresAt?: Date | null;
  // Passport (KYR)
  passportNumber?: string | null;
  passportIssuingCountry?: string | null;
  passportIssuedAt?: Date | null;
  passportExpiresAt?: Date | null;
  // Employment (KYR)
  employmentStatus?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  workEmail?: string | null;
  workPhoneNum?: string | null;
  // Compliance flags
  isPEP?: boolean;
  pepDetails?: string | null;
  // Current address
  address?: AddressDTO | null;
  // Account lock status
  isLocked?: boolean;
  lockReason?: string | null;
  lockedAt?: Date | null;
  // Admin review
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  denialReason?: string | null;
  // Blockchain identity
  fabricUserId?: string | null;
  onchainStatus?: string | null;
  onchainRegisteredAt?: Date | null;
  // Timestamps
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

// ============================================
// Relationship (KYR) DTOs
// ============================================

export type RelationType =
  | 'FATHER'
  | 'MOTHER'
  | 'SPOUSE'
  | 'CHILD'
  | 'SIBLING'
  | 'BUSINESS_PARTNER'
  | 'DIRECTOR'
  | 'WORKPLACE_ASSOCIATE'
  | 'FRIEND';

export type RelationshipStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'DECEASED'
  | 'DIVORCED'
  | 'NOT_APPLICABLE';

export interface CreateRelationshipRequestDTO {
  email: string;
  relationType: RelationType;
}

export interface RelationshipDTO {
  relationshipId: string;
  relationType: RelationType;
  status: RelationshipStatus;
  relatedProfile?: {
    profileId: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
  relatedEmail?: string | null;
  pointsAwarded: number;
  confirmedAt?: Date | null;
  createdAt: Date;
}

export interface TrustScoreDTO {
  familyScore: number;
  businessScore: number;
  friendsScore: number;
  totalScore: number;
  lastCalculatedAt: Date | null;
}

export interface RelationshipsResponseDTO {
  relationships: RelationshipDTO[];
  pendingInvites: RelationshipDTO[];
  trustScore: TrustScoreDTO | null;
}

// ============================================
// Q Send (QR Payment Request) DTOs
// ============================================

export type QSendStatus = 'ACTIVE' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface CreateQSendRequestDTO {
  amount: number;
  description?: string;
  reference?: string;
  validitySeconds?: number;  // Default 300 (5 minutes)
}

export interface QSendRequestDTO {
  id: string;
  requestCode: string;
  qrData: string;          // Base64 encoded QR payload
  amount: number;
  description: string | null;
  reference: string | null;
  status: QSendStatus;
  createdAt: Date;
  expiresAt: Date;
  validitySeconds: number;
  remainingSeconds: number; // Calculated field
  // Creator info
  creatorProfileId: string;
  creatorName: string;
  creatorFabricId: string;
  // Payer info (when paid)
  payerProfileId: string | null;
  payerName: string | null;
  paidAt: Date | null;
  onChainTxId: string | null;
}

export interface QSendPayRequestDTO {
  requestCode: string;     // The QS-XXXXXXXX code from QR
}

export interface QSendPayResponseDTO {
  status: 'pending' | 'confirmed' | 'failed';
  commandId: string;
  message: string;
  request: QSendRequestDTO;
}

export interface QSendVerifyRequestDTO {
  qrData: string;          // The scanned QR data
}

export interface QSendVerifyResponseDTO {
  valid: boolean;
  request: QSendRequestDTO | null;
  error?: string;
}

export interface QSendDashboardDTO {
  stats: {
    totalRequests: number;
    activeRequests: number;
    paidRequests: number;
    expiredRequests: number;
    cancelledRequests: number;
    totalAmountRequested: number;
    totalAmountReceived: number;
  };
  recentRequests: QSendRequestDTO[];
}

export interface QSendListQueryDTO {
  status?: QSendStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}
