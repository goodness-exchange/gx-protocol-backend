import { Request } from 'express';

// ============================================================================
// Admin Role Enum (mirrors Prisma schema)
// ============================================================================

export type AdminRole = 'SUPER_OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'DEVELOPER' | 'AUDITOR';

// ============================================================================
// JWT Payload for Admin Authentication
// ============================================================================

export interface AdminJWTPayload {
  adminId: string;
  username: string;
  email: string;
  role: AdminRole;
  sessionId: string;
  mfaVerified: boolean;
  iat?: number;
  exp?: number;
}

export interface AdminAuthenticatedRequest extends Request {
  admin?: AdminJWTPayload;
  sessionId?: string;
}

// ============================================================================
// Login DTOs
// ============================================================================

export interface AdminLoginRequestDTO {
  username: string;
  password: string;
  deviceFingerprint?: string;
}

export interface AdminLoginResponseDTO {
  success: boolean;
  requiresMfa: boolean;
  mfaMethod?: string;
  // Only returned if MFA not required or after MFA verification
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  admin?: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    role: AdminRole;
  };
  // Temporary token for MFA verification step
  mfaToken?: string;
}

export interface AdminMfaVerifyRequestDTO {
  mfaToken: string;
  code: string;
}

// ============================================================================
// Session DTOs
// ============================================================================

export interface AdminSessionDTO {
  id: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export interface AdminSessionListResponseDTO {
  sessions: AdminSessionDTO[];
  total: number;
}

// ============================================================================
// Password Change DTOs
// ============================================================================

export interface AdminPasswordChangeRequestDTO {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AdminPasswordChangeResponseDTO {
  success: boolean;
  message: string;
  requiresRelogin: boolean;
}

// ============================================================================
// MFA Setup DTOs
// ============================================================================

export interface AdminMfaSetupRequestDTO {
  method: 'TOTP';
}

export interface AdminMfaSetupResponseDTO {
  success: boolean;
  method: string;
  // For TOTP: QR code and secret
  qrCodeDataUrl?: string;
  secret?: string;
  // Verification required to enable
  verificationRequired: boolean;
}

export interface AdminMfaEnableRequestDTO {
  code: string;
}

export interface AdminMfaEnableResponseDTO {
  success: boolean;
  message: string;
  backupCodes?: string[];
}

export interface AdminMfaDisableRequestDTO {
  password: string;
  code: string;
}

// ============================================================================
// Refresh Token DTOs
// ============================================================================

export interface AdminRefreshTokenRequestDTO {
  refreshToken: string;
}

export interface AdminRefreshTokenResponseDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// Profile DTOs
// ============================================================================

export interface AdminProfileResponseDTO {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: AdminRole;
  mfaEnabled: boolean;
  mfaPrimaryMethod: string | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date;
  requirePasswordChange: boolean;
  createdAt: Date;
  permissions: string[];
}

// ============================================================================
// Error Codes
// ============================================================================

export enum AdminAuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  PASSWORD_EXPIRED = 'PASSWORD_EXPIRED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  MFA_INVALID = 'MFA_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  IDLE_TIMEOUT = 'IDLE_TIMEOUT',
  PASSWORD_POLICY_VIOLATION = 'PASSWORD_POLICY_VIOLATION',
  RATE_LIMITED = 'RATE_LIMITED',
}
