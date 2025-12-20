import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { adminConfig } from '../config';
import {
  AdminJWTPayload,
  AdminLoginRequestDTO,
  AdminLoginResponseDTO,
  AdminMfaVerifyRequestDTO,
  AdminPasswordChangeRequestDTO,
  AdminPasswordChangeResponseDTO,
  AdminMfaSetupResponseDTO,
  AdminMfaEnableRequestDTO,
  AdminMfaEnableResponseDTO,
  AdminSessionDTO,
  AdminProfileResponseDTO,
  AdminAuthErrorCode,
  AdminRole,
} from '../types/admin-auth.types';

// ============================================================================
// Internal Types (for mapping Prisma results)
// ============================================================================

interface SessionRecord {
  id: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

interface RolePermissionRecord {
  permission: { code: string };
}

// ============================================================================
// Constants
// ============================================================================

const ACCESS_TOKEN_EXPIRY = '15m';
const MFA_TOKEN_EXPIRY = '5m';
const BACKUP_CODES_COUNT = 10;

// Idle timeout in minutes by role
const IDLE_TIMEOUT_BY_ROLE: Record<AdminRole, number> = {
  SUPER_OWNER: 60,
  SUPER_ADMIN: 45,
  ADMIN: 30,
  MODERATOR: 30,
  DEVELOPER: 30,
  AUDITOR: 30,
};

// ============================================================================
// Helper Functions
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

async function getRbacConfig() {
  const config = await db.rbacConfig.findUnique({ where: { id: 'default' } });
  return config || {
    adminIdleTimeoutMins: 30,
    superOwnerIdleTimeoutMins: 60,
    maxLoginAttempts: 5,
    lockoutDurationMins: 30,
    minPasswordLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    mfaTotpIssuer: 'GXCoin Admin',
  };
}

function validatePasswordPolicy(password: string, config: Awaited<ReturnType<typeof getRbacConfig>>): string | null {
  if (password.length < config.minPasswordLength) {
    return `Password must be at least ${config.minPasswordLength} characters`;
  }
  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (config.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (config.requireNumbers && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

// ============================================================================
// Admin Auth Service
// ============================================================================

class AdminAuthService {
  /**
   * Authenticate admin user and return tokens or MFA challenge
   */
  async login(
    dto: AdminLoginRequestDTO,
    ipAddress: string,
    userAgent: string
  ): Promise<AdminLoginResponseDTO> {
    const config = await getRbacConfig();

    // Find admin by username or email
    const admin = await db.adminUser.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: dto.username },
        ],
        deletedAt: null,
      },
    });

    if (!admin) {
      logger.warn({ username: dto.username, ip: ipAddress }, 'Admin login failed: user not found');
      throw { code: AdminAuthErrorCode.INVALID_CREDENTIALS, message: 'Invalid username or password' };
    }

    // Check if account is locked
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const remainingMins = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
      logger.warn({ adminId: admin.id, ip: ipAddress }, 'Admin login failed: account locked');
      throw { code: AdminAuthErrorCode.ACCOUNT_LOCKED, message: `Account is locked. Try again in ${remainingMins} minutes.` };
    }

    // Check if account is active
    if (!admin.isActive) {
      logger.warn({ adminId: admin.id, ip: ipAddress }, 'Admin login failed: account disabled');
      throw { code: AdminAuthErrorCode.ACCOUNT_DISABLED, message: 'Account has been disabled' };
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!isValidPassword) {
      // Increment failed attempts
      const newFailedAttempts = admin.loginFailedAttempts + 1;
      const shouldLock = newFailedAttempts >= config.maxLoginAttempts;

      await db.adminUser.update({
        where: { id: admin.id },
        data: {
          loginFailedAttempts: newFailedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + config.lockoutDurationMins * 60 * 1000)
            : null,
        },
      });

      logger.warn({ adminId: admin.id, ip: ipAddress, attempts: newFailedAttempts }, 'Admin login failed: invalid password');

      if (shouldLock) {
        throw { code: AdminAuthErrorCode.ACCOUNT_LOCKED, message: `Account locked after ${config.maxLoginAttempts} failed attempts` };
      }

      throw { code: AdminAuthErrorCode.INVALID_CREDENTIALS, message: 'Invalid username or password' };
    }

    // Reset failed attempts on successful password verification
    await db.adminUser.update({
      where: { id: admin.id },
      data: {
        loginFailedAttempts: 0,
        lockedUntil: null,
      },
    });

    // Check if MFA is enabled
    if (admin.mfaEnabled && admin.totpSecret) {
      // Generate temporary MFA token
      const mfaToken = jwt.sign(
        { adminId: admin.id, purpose: 'mfa_verification' },
        adminConfig.jwtSecret,
        { expiresIn: MFA_TOKEN_EXPIRY }
      );

      logger.info({ adminId: admin.id, ip: ipAddress }, 'Admin login: MFA required');

      return {
        success: true,
        requiresMfa: true,
        mfaMethod: admin.mfaPrimaryMethod || 'TOTP',
        mfaToken,
      };
    }

    // No MFA - create session and return tokens
    return this.createSessionAndTokens(admin, ipAddress, userAgent, dto.deviceFingerprint);
  }

  /**
   * Verify MFA code and complete login
   */
  async verifyMfa(
    dto: AdminMfaVerifyRequestDTO,
    ipAddress: string,
    userAgent: string
  ): Promise<AdminLoginResponseDTO> {
    // Verify MFA token
    let decoded: { adminId: string; purpose: string };
    try {
      decoded = jwt.verify(dto.mfaToken, adminConfig.jwtSecret) as typeof decoded;
    } catch {
      throw { code: AdminAuthErrorCode.SESSION_EXPIRED, message: 'MFA session expired. Please login again.' };
    }

    if (decoded.purpose !== 'mfa_verification') {
      throw { code: AdminAuthErrorCode.MFA_INVALID, message: 'Invalid MFA token' };
    }

    const admin = await db.adminUser.findUnique({
      where: { id: decoded.adminId },
    });

    if (!admin || !admin.totpSecret) {
      throw { code: AdminAuthErrorCode.MFA_INVALID, message: 'MFA not configured' };
    }

    // Verify TOTP code
    const isValidCode = authenticator.verify({
      token: dto.code,
      secret: admin.totpSecret,
    });

    // Check backup codes if TOTP fails
    if (!isValidCode) {
      const backupCodeHash = hashToken(dto.code.toUpperCase());
      const backupCodeIndex = admin.mfaBackupCodes.findIndex((c: string) => c === backupCodeHash);

      if (backupCodeIndex === -1) {
        logger.warn({ adminId: admin.id, ip: ipAddress }, 'Admin MFA verification failed');
        throw { code: AdminAuthErrorCode.MFA_INVALID, message: 'Invalid verification code' };
      }

      // Remove used backup code
      const updatedBackupCodes = [...admin.mfaBackupCodes];
      updatedBackupCodes.splice(backupCodeIndex, 1);
      await db.adminUser.update({
        where: { id: admin.id },
        data: { mfaBackupCodes: updatedBackupCodes },
      });

      logger.info({ adminId: admin.id }, 'Admin used backup code for MFA');
    }

    logger.info({ adminId: admin.id, ip: ipAddress }, 'Admin MFA verification successful');

    return this.createSessionAndTokens(admin, ipAddress, userAgent, undefined, true);
  }

  /**
   * Create session and generate tokens
   */
  private async createSessionAndTokens(
    admin: { id: string; username: string; email: string; displayName: string; role: AdminRole },
    ipAddress: string,
    userAgent: string,
    deviceFingerprint?: string,
    mfaVerified = false
  ): Promise<AdminLoginResponseDTO> {
    const idleTimeoutMins = IDLE_TIMEOUT_BY_ROLE[admin.role];
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours max

    // Generate tokens
    const accessToken = generateSecureToken();
    const refreshToken = generateSecureToken();

    // Create session
    const session = await db.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(refreshToken),
        ipAddress,
        userAgent,
        deviceFingerprint,
        idleTimeoutMins,
        expiresAt: sessionExpiresAt,
        mfaVerifiedAt: mfaVerified ? new Date() : null,
      },
    });

    // Generate JWT access token
    const jwtPayload: AdminJWTPayload = {
      adminId: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      sessionId: session.id,
      mfaVerified,
    };

    const jwtToken = jwt.sign(jwtPayload, adminConfig.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });

    // Update last login
    await db.adminUser.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Log audit
    await this.logAudit(admin.id, 'auth:login', 'AdminSession', session.id, ipAddress, userAgent, session.id);

    logger.info({ adminId: admin.id, sessionId: session.id, ip: ipAddress }, 'Admin login successful');

    return {
      success: true,
      requiresMfa: false,
      accessToken: jwtToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string, ipAddress: string, userAgent: string) {
    const refreshTokenHash = hashToken(refreshToken);

    const session = await db.adminSession.findUnique({
      where: { refreshTokenHash },
      include: { admin: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw { code: AdminAuthErrorCode.SESSION_EXPIRED, message: 'Session expired. Please login again.' };
    }

    // Check idle timeout
    const idleTimeoutMs = session.idleTimeoutMins * 60 * 1000;
    if (Date.now() - session.lastActivityAt.getTime() > idleTimeoutMs) {
      await db.adminSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokeReason: 'Idle timeout' },
      });
      throw { code: AdminAuthErrorCode.IDLE_TIMEOUT, message: 'Session timed out due to inactivity' };
    }

    // Generate new tokens
    const newAccessToken = generateSecureToken();
    const newRefreshToken = generateSecureToken();

    // Update session
    await db.adminSession.update({
      where: { id: session.id },
      data: {
        tokenHash: hashToken(newAccessToken),
        refreshTokenHash: hashToken(newRefreshToken),
        lastActivityAt: new Date(),
        ipAddress,
        userAgent,
      },
    });

    const jwtPayload: AdminJWTPayload = {
      adminId: session.admin.id,
      username: session.admin.username,
      email: session.admin.email,
      role: session.admin.role,
      sessionId: session.id,
      mfaVerified: !!session.mfaVerifiedAt,
    };

    const jwtToken = jwt.sign(jwtPayload, adminConfig.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });

    return {
      accessToken: jwtToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Logout and revoke session
   */
  async logout(sessionId: string, adminId: string, ipAddress: string, userAgent: string): Promise<void> {
    await db.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: 'User logout' },
    });

    await this.logAudit(adminId, 'auth:logout', 'AdminSession', sessionId, ipAddress, userAgent, sessionId);
    logger.info({ adminId, sessionId }, 'Admin logout successful');
  }

  /**
   * Logout all sessions except current
   */
  async logoutAllSessions(adminId: string, currentSessionId: string, ipAddress: string, userAgent: string): Promise<number> {
    const result = await db.adminSession.updateMany({
      where: {
        adminId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason: 'Logout all sessions' },
    });

    await this.logAudit(adminId, 'auth:logout_all', 'AdminUser', adminId, ipAddress, userAgent, currentSessionId);
    logger.info({ adminId, revokedCount: result.count }, 'Admin logout all sessions');

    return result.count;
  }

  /**
   * Get active sessions for admin
   */
  async getSessions(adminId: string, currentSessionId: string): Promise<AdminSessionDTO[]> {
    const sessions = await db.adminSession.findMany({
      where: {
        adminId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    return sessions.map((s: SessionRecord) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceFingerprint: s.deviceFingerprint || undefined,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string, adminId: string, currentSessionId: string, ipAddress: string, userAgent: string): Promise<void> {
    const session = await db.adminSession.findFirst({
      where: { id: sessionId, adminId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    await db.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: 'Revoked by user' },
    });

    await this.logAudit(adminId, 'auth:session_revoke', 'AdminSession', sessionId, ipAddress, userAgent, currentSessionId);
  }

  /**
   * Change password
   */
  async changePassword(
    adminId: string,
    dto: AdminPasswordChangeRequestDTO,
    ipAddress: string,
    userAgent: string,
    sessionId: string
  ): Promise<AdminPasswordChangeResponseDTO> {
    const config = await getRbacConfig();

    const admin = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!isValidPassword) {
      throw { code: AdminAuthErrorCode.INVALID_CREDENTIALS, message: 'Current password is incorrect' };
    }

    // Validate new password matches confirmation
    if (dto.newPassword !== dto.confirmPassword) {
      throw { code: AdminAuthErrorCode.PASSWORD_POLICY_VIOLATION, message: 'Passwords do not match' };
    }

    // Validate password policy
    const policyError = validatePasswordPolicy(dto.newPassword, config);
    if (policyError) {
      throw { code: AdminAuthErrorCode.PASSWORD_POLICY_VIOLATION, message: policyError };
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(dto.newPassword, admin.passwordHash);
    if (isSamePassword) {
      throw { code: AdminAuthErrorCode.PASSWORD_POLICY_VIOLATION, message: 'New password must be different from current password' };
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update password
    await db.adminUser.update({
      where: { id: adminId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        requirePasswordChange: false,
      },
    });

    // Revoke all other sessions
    await db.adminSession.updateMany({
      where: {
        adminId,
        id: { not: sessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason: 'Password changed' },
    });

    await this.logAudit(adminId, 'auth:password_change', 'AdminUser', adminId, ipAddress, userAgent, sessionId);
    logger.info({ adminId }, 'Admin password changed successfully');

    return {
      success: true,
      message: 'Password changed successfully',
      requiresRelogin: false,
    };
  }

  /**
   * Setup MFA (generate TOTP secret and QR code)
   */
  async setupMfa(adminId: string): Promise<AdminMfaSetupResponseDTO> {
    const admin = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    if (admin.mfaEnabled) {
      throw new Error('MFA is already enabled');
    }

    const config = await getRbacConfig();

    // Generate TOTP secret
    const secret = authenticator.generateSecret();

    // Store temporarily (not enabled yet)
    await db.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: secret },
    });

    // Generate QR code
    const otpauthUrl = authenticator.keyuri(admin.email, config.mfaTotpIssuer, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      success: true,
      method: 'TOTP',
      qrCodeDataUrl,
      secret,
      verificationRequired: true,
    };
  }

  /**
   * Enable MFA after verification
   */
  async enableMfa(
    adminId: string,
    dto: AdminMfaEnableRequestDTO,
    ipAddress: string,
    userAgent: string,
    sessionId: string
  ): Promise<AdminMfaEnableResponseDTO> {
    const admin = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || !admin.totpSecret) {
      throw new Error('MFA setup not initiated');
    }

    if (admin.mfaEnabled) {
      throw new Error('MFA is already enabled');
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: dto.code,
      secret: admin.totpSecret,
    });

    if (!isValid) {
      throw { code: AdminAuthErrorCode.MFA_INVALID, message: 'Invalid verification code' };
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(c => hashToken(c));

    // Enable MFA
    await db.adminUser.update({
      where: { id: adminId },
      data: {
        mfaEnabled: true,
        mfaPrimaryMethod: 'TOTP',
        mfaBackupCodes: hashedBackupCodes,
      },
    });

    await this.logAudit(adminId, 'auth:mfa_enable', 'AdminUser', adminId, ipAddress, userAgent, sessionId);
    logger.info({ adminId }, 'Admin MFA enabled');

    return {
      success: true,
      message: 'MFA enabled successfully',
      backupCodes,
    };
  }

  /**
   * Disable MFA
   */
  async disableMfa(
    adminId: string,
    password: string,
    code: string,
    ipAddress: string,
    userAgent: string,
    sessionId: string
  ): Promise<void> {
    const admin = await db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    if (!admin.mfaEnabled) {
      throw new Error('MFA is not enabled');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
    if (!isValidPassword) {
      throw { code: AdminAuthErrorCode.INVALID_CREDENTIALS, message: 'Invalid password' };
    }

    // Verify MFA code
    const isValidCode = authenticator.verify({
      token: code,
      secret: admin.totpSecret!,
    });

    if (!isValidCode) {
      throw { code: AdminAuthErrorCode.MFA_INVALID, message: 'Invalid verification code' };
    }

    // Disable MFA
    await db.adminUser.update({
      where: { id: adminId },
      data: {
        mfaEnabled: false,
        mfaPrimaryMethod: null,
        totpSecret: null,
        mfaBackupCodes: [],
      },
    });

    await this.logAudit(adminId, 'auth:mfa_disable', 'AdminUser', adminId, ipAddress, userAgent, sessionId);
    logger.info({ adminId }, 'Admin MFA disabled');
  }

  /**
   * Get admin profile with permissions
   */
  async getProfile(adminId: string): Promise<AdminProfileResponseDTO> {
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    // Get role permissions
    const rolePermissions = await db.rolePermission.findMany({
      where: { role: admin.role },
      include: { permission: true },
    });

    const permissions = [
      ...rolePermissions.map((rp: RolePermissionRecord) => rp.permission.code),
      ...admin.customPermissions,
    ];

    return {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
      mfaEnabled: admin.mfaEnabled,
      mfaPrimaryMethod: admin.mfaPrimaryMethod,
      lastLoginAt: admin.lastLoginAt,
      passwordChangedAt: admin.passwordChangedAt,
      requirePasswordChange: admin.requirePasswordChange,
      createdAt: admin.createdAt,
      permissions,
    };
  }

  /**
   * Update session activity (for idle timeout tracking)
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    await db.adminSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  /**
   * Validate session is still active (not expired, not revoked, not idle timeout)
   */
  async validateSession(sessionId: string): Promise<{ valid: boolean; reason?: string }> {
    const session = await db.adminSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (session.revokedAt) {
      return { valid: false, reason: session.revokeReason || 'Session revoked' };
    }

    if (session.expiresAt < new Date()) {
      return { valid: false, reason: 'Session expired' };
    }

    // Check idle timeout
    const idleTimeoutMs = session.idleTimeoutMins * 60 * 1000;
    if (Date.now() - session.lastActivityAt.getTime() > idleTimeoutMs) {
      await db.adminSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokeReason: 'Idle timeout' },
      });
      return { valid: false, reason: 'Session timed out due to inactivity' };
    }

    return { valid: true };
  }

  /**
   * Log audit event
   */
  private async logAudit(
    adminId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    ipAddress: string,
    userAgent: string,
    sessionId?: string,
    previousValue?: object,
    newValue?: object
  ): Promise<void> {
    // Get last audit log for hash chain
    const lastLog = await db.adminAuditLog.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    const eventData = {
      adminId,
      action,
      resourceType,
      resourceId,
      timestamp: new Date().toISOString(),
    };

    const eventHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(eventData) + (lastLog?.eventHash || ''))
      .digest('hex');

    await db.adminAuditLog.create({
      data: {
        adminId,
        action,
        category: this.getAuditCategory(action),
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        sessionId,
        previousValue: previousValue ? JSON.parse(JSON.stringify(previousValue)) : undefined,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
        eventHash,
        previousHash: lastLog?.eventHash,
      },
    });
  }

  private getAuditCategory(action: string): 'SYSTEM' | 'USER' | 'FINANCIAL' | 'DEPLOYMENT' | 'AUDIT' | 'CONFIG' {
    if (action.startsWith('auth:')) return 'SYSTEM';
    if (action.startsWith('user:')) return 'USER';
    if (action.startsWith('treasury:') || action.startsWith('financial:')) return 'FINANCIAL';
    if (action.startsWith('deployment:')) return 'DEPLOYMENT';
    if (action.startsWith('audit:')) return 'AUDIT';
    if (action.startsWith('config:')) return 'CONFIG';
    return 'SYSTEM';
  }
}

export const adminAuthService = new AdminAuthService();
