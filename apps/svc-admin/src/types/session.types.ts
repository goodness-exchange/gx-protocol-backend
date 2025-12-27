/**
 * Session and Device Types
 * Types for session management and device tracking
 */

// Session status enum (matches Prisma schema)
export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

// User session entry for API response
export interface UserSessionEntry {
  sessionId: string;
  profileId: string;
  profileName?: string;
  profileEmail?: string;
  deviceId: string;
  deviceName: string | null;
  deviceOs: string | null;
  ipAddress: string;
  userAgent: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

// Admin session entry for API response
export interface AdminSessionEntry {
  sessionId: string;
  adminId: string;
  adminUsername?: string;
  adminEmail?: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string | null;
  lastActivityAt: string;
  idleTimeoutMins: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  mfaVerifiedAt: string | null;
  isCurrent?: boolean;
}

// Trusted device entry for API response
export interface TrustedDeviceEntry {
  deviceId: string;
  profileId: string;
  profileName?: string;
  profileEmail?: string;
  deviceName: string;
  deviceFingerprint: string;
  deviceOs: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isTrusted: boolean;
  trustVerifiedAt: string | null;
}

// Session list response
export interface SessionListResponse {
  sessions: UserSessionEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Admin session list response
export interface AdminSessionListResponse {
  sessions: AdminSessionEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Device list response
export interface DeviceListResponse {
  devices: TrustedDeviceEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Query parameters for sessions
export interface SessionQueryParams {
  profileId?: string;
  status?: SessionStatus;
  deviceId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// Query parameters for admin sessions
export interface AdminSessionQueryParams {
  adminId?: string;
  includeRevoked?: boolean;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// Query parameters for devices
export interface DeviceQueryParams {
  profileId?: string;
  isTrusted?: boolean;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// Session summary for a user
export interface UserSessionSummary {
  profileId: string;
  profileName?: string;
  activeSessions: number;
  totalSessions: number;
  lastSessionAt: string | null;
  trustedDevices: number;
  recentDevices: string[];
}

// Admin session summary
export interface AdminSessionSummary {
  adminId: string;
  adminUsername?: string;
  activeSessions: number;
  totalSessions: number;
  lastSessionAt: string | null;
  mfaEnabled: boolean;
  lastMfaVerifiedAt: string | null;
}

// Session activity statistics
export interface SessionActivityStats {
  totalActiveSessions: number;
  totalRevokedSessions: number;
  sessionsCreatedToday: number;
  uniqueDevicesToday: number;
  byDevice: Array<{ deviceOs: string; count: number }>;
  byDay: Array<{ date: string; created: number; revoked: number }>;
}

// Revoke session request
export interface RevokeSessionRequest {
  reason?: string;
}

// Trust/untrust device request
export interface TrustDeviceRequest {
  trusted: boolean;
}
