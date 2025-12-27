import { db as prisma } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import type {
  SessionQueryParams,
  AdminSessionQueryParams,
  DeviceQueryParams,
  UserSessionEntry,
  AdminSessionEntry,
  TrustedDeviceEntry,
  SessionListResponse,
  AdminSessionListResponse,
  DeviceListResponse,
  UserSessionSummary,
  AdminSessionSummary,
  SessionActivityStats,
} from '../types/session.types';

// Database record types
interface UserSessionRecord {
  sessionId: string;
  tenantId: string;
  profileId: string;
  deviceId: string;
  deviceName: string | null;
  deviceOs: string | null;
  ipAddress: string;
  userAgent: string;
  status: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

interface AdminSessionRecord {
  id: string;
  adminId: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string | null;
  lastActivityAt: Date;
  idleTimeoutMins: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  mfaVerifiedAt: Date | null;
}

interface TrustedDeviceRecord {
  deviceId: string;
  tenantId: string;
  profileId: string;
  deviceName: string;
  deviceFingerprint: string;
  deviceOs: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isTrusted: boolean;
  trustVerifiedAt: Date | null;
}

/**
 * Session Service
 * Manages user sessions, admin sessions, and trusted devices
 */
class SessionService {
  /**
   * Query user sessions with filtering and pagination
   */
  async queryUserSessions(params: SessionQueryParams): Promise<SessionListResponse> {
    const { profileId, status, deviceId, startDate, endDate, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (profileId) where.profileId = profileId;
    if (status) where.status = status;
    if (deviceId) where.deviceId = deviceId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
      }),
      prisma.userSession.count({ where }),
    ]);

    const enriched = await this.enrichUserSessions(sessions as UserSessionRecord[]);

    return {
      sessions: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get user sessions for a specific profile
   */
  async getUserSessions(
    profileId: string,
    options: { includeRevoked?: boolean; page?: number; limit?: number } = {}
  ): Promise<SessionListResponse> {
    const { includeRevoked = false, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { profileId };
    if (!includeRevoked) {
      where.status = 'ACTIVE';
      where.revokedAt = null;
    }

    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
      }),
      prisma.userSession.count({ where }),
    ]);

    const enriched = await this.enrichUserSessions(sessions as UserSessionRecord[]);

    return {
      sessions: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get user session summary
   */
  async getUserSessionSummary(profileId: string): Promise<UserSessionSummary> {
    const [activeSessions, totalSessions, trustedDevices, profile] = await Promise.all([
      prisma.userSession.count({ where: { profileId, status: 'ACTIVE', revokedAt: null } }),
      prisma.userSession.count({ where: { profileId } }),
      prisma.trustedDevice.count({ where: { profileId, isTrusted: true } }),
      prisma.userProfile.findUnique({
        where: { profileId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const lastSession = await prisma.userSession.findFirst({
      where: { profileId },
      orderBy: { lastActivityAt: 'desc' },
      select: { lastActivityAt: true, deviceOs: true },
    });

    const recentSessions = await prisma.userSession.findMany({
      where: { profileId },
      orderBy: { lastActivityAt: 'desc' },
      take: 5,
      select: { deviceOs: true },
      distinct: ['deviceOs'],
    });

    return {
      profileId,
      profileName: profile ? `${profile.firstName} ${profile.lastName}` : undefined,
      activeSessions,
      totalSessions,
      lastSessionAt: lastSession?.lastActivityAt.toISOString() || null,
      trustedDevices,
      recentDevices: recentSessions
        .map((s: { deviceOs: string | null }) => s.deviceOs)
        .filter((os: string | null): os is string => os !== null),
    };
  }

  /**
   * Revoke a user session
   */
  async revokeUserSession(
    sessionId: string,
    reason: string,
    actorAdminId: string
  ): Promise<void> {
    await prisma.userSession.update({
      where: { sessionId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: reason || `Revoked by admin ${actorAdminId}`,
      },
    });

    logger.info({ sessionId, actorAdminId }, 'User session revoked by admin');
  }

  /**
   * Revoke all user sessions for a profile
   */
  async revokeAllUserSessions(
    profileId: string,
    reason: string,
    actorAdminId: string
  ): Promise<number> {
    const result = await prisma.userSession.updateMany({
      where: { profileId, status: 'ACTIVE', revokedAt: null },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: reason || `All sessions revoked by admin ${actorAdminId}`,
      },
    });

    logger.info({ profileId, count: result.count, actorAdminId }, 'All user sessions revoked');
    return result.count;
  }

  /**
   * Query admin sessions with filtering and pagination
   */
  async queryAdminSessions(params: AdminSessionQueryParams): Promise<AdminSessionListResponse> {
    const { adminId, includeRevoked = false, startDate, endDate, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (adminId) where.adminId = adminId;
    if (!includeRevoked) where.revokedAt = null;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [sessions, total] = await Promise.all([
      prisma.adminSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
      }),
      prisma.adminSession.count({ where }),
    ]);

    const enriched = await this.enrichAdminSessions(sessions as AdminSessionRecord[]);

    return {
      sessions: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get admin session summary
   */
  async getAdminSessionSummary(adminId: string): Promise<AdminSessionSummary> {
    const [activeSessions, totalSessions, admin] = await Promise.all([
      prisma.adminSession.count({ where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.adminSession.count({ where: { adminId } }),
      prisma.adminUser.findUnique({
        where: { id: adminId },
        select: { username: true, mfaEnabled: true },
      }),
    ]);

    const lastSession = await prisma.adminSession.findFirst({
      where: { adminId },
      orderBy: { lastActivityAt: 'desc' },
      select: { lastActivityAt: true, mfaVerifiedAt: true },
    });

    return {
      adminId,
      adminUsername: admin?.username,
      activeSessions,
      totalSessions,
      lastSessionAt: lastSession?.lastActivityAt.toISOString() || null,
      mfaEnabled: admin?.mfaEnabled || false,
      lastMfaVerifiedAt: lastSession?.mfaVerifiedAt?.toISOString() || null,
    };
  }

  /**
   * Query trusted devices with filtering and pagination
   */
  async queryDevices(params: DeviceQueryParams): Promise<DeviceListResponse> {
    const { profileId, isTrusted, startDate, endDate, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (profileId) where.profileId = profileId;
    if (isTrusted !== undefined) where.isTrusted = isTrusted;

    if (startDate || endDate) {
      where.firstSeenAt = {};
      if (startDate) (where.firstSeenAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.firstSeenAt as Record<string, Date>).lte = endDate;
    }

    const [devices, total] = await Promise.all([
      prisma.trustedDevice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastSeenAt: 'desc' },
      }),
      prisma.trustedDevice.count({ where }),
    ]);

    const enriched = await this.enrichDevices(devices as TrustedDeviceRecord[]);

    return {
      devices: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get devices for a specific user
   */
  async getUserDevices(
    profileId: string,
    options: { isTrusted?: boolean; page?: number; limit?: number } = {}
  ): Promise<DeviceListResponse> {
    const { isTrusted, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { profileId };
    if (isTrusted !== undefined) where.isTrusted = isTrusted;

    const [devices, total] = await Promise.all([
      prisma.trustedDevice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastSeenAt: 'desc' },
      }),
      prisma.trustedDevice.count({ where }),
    ]);

    const enriched = await this.enrichDevices(devices as TrustedDeviceRecord[]);

    return {
      devices: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update device trust status
   */
  async updateDeviceTrust(
    deviceId: string,
    trusted: boolean,
    actorAdminId: string
  ): Promise<void> {
    await prisma.trustedDevice.update({
      where: { deviceId },
      data: {
        isTrusted: trusted,
        trustVerifiedAt: trusted ? new Date() : null,
      },
    });

    logger.info({ deviceId, trusted, actorAdminId }, 'Device trust status updated');
  }

  /**
   * Remove a trusted device
   */
  async removeDevice(deviceId: string, actorAdminId: string): Promise<void> {
    await prisma.trustedDevice.delete({
      where: { deviceId },
    });

    logger.info({ deviceId, actorAdminId }, 'Device removed');
  }

  /**
   * Get session activity statistics
   */
  async getSessionStats(startDate: Date, endDate: Date): Promise<SessionActivityStats> {
    const [activeSessions, revokedSessions, todaySessions] = await Promise.all([
      prisma.userSession.count({ where: { status: 'ACTIVE', revokedAt: null } }),
      prisma.userSession.count({ where: { status: 'REVOKED' } }),
      prisma.userSession.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    // Get unique devices today
    const todayDevices = await prisma.userSession.findMany({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { deviceId: true },
      distinct: ['deviceId'],
    });

    // Get sessions by device OS
    const sessions = await prisma.userSession.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { deviceOs: true, createdAt: true, revokedAt: true },
    });

    // Count by device OS
    const byDeviceMap = new Map<string, number>();
    sessions.forEach((s: { deviceOs: string | null }) => {
      const os = s.deviceOs || 'Unknown';
      byDeviceMap.set(os, (byDeviceMap.get(os) || 0) + 1);
    });

    // Count by day
    const byDayMap = new Map<string, { created: number; revoked: number }>();
    sessions.forEach((s: { createdAt: Date; revokedAt: Date | null }) => {
      const dayKey = s.createdAt.toISOString().split('T')[0];
      const entry = byDayMap.get(dayKey) || { created: 0, revoked: 0 };
      entry.created++;
      if (s.revokedAt) entry.revoked++;
      byDayMap.set(dayKey, entry);
    });

    return {
      totalActiveSessions: activeSessions,
      totalRevokedSessions: revokedSessions,
      sessionsCreatedToday: todaySessions,
      uniqueDevicesToday: todayDevices.length,
      byDevice: Array.from(byDeviceMap.entries())
        .map(([deviceOs, count]) => ({ deviceOs, count }))
        .sort((a, b) => b.count - a.count),
      byDay: Array.from(byDayMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Enrich user sessions with profile names
   */
  private async enrichUserSessions(sessions: UserSessionRecord[]): Promise<UserSessionEntry[]> {
    const profileIds = [...new Set(sessions.map((s) => s.profileId))];

    const profiles = await prisma.userProfile.findMany({
      where: { profileId: { in: profileIds } },
      select: { profileId: true, firstName: true, lastName: true, email: true },
    });

    const profileMap = new Map<string, { name: string; email: string }>(
      profiles.map((p: { profileId: string; firstName: string; lastName: string; email: string }) => [
        p.profileId,
        { name: `${p.firstName} ${p.lastName}`, email: p.email },
      ])
    );

    return sessions.map((s) => {
      const profile = profileMap.get(s.profileId);
      return {
        sessionId: s.sessionId,
        profileId: s.profileId,
        profileName: profile?.name,
        profileEmail: profile?.email,
        deviceId: s.deviceId,
        deviceName: s.deviceName,
        deviceOs: s.deviceOs,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        status: s.status as 'ACTIVE' | 'EXPIRED' | 'REVOKED',
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() || null,
        revokedReason: s.revokedReason,
      };
    });
  }

  /**
   * Enrich admin sessions with admin info
   */
  private async enrichAdminSessions(sessions: AdminSessionRecord[]): Promise<AdminSessionEntry[]> {
    const adminIds = [...new Set(sessions.map((s) => s.adminId))];

    const admins = await prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, username: true, email: true },
    });

    const adminMap = new Map<string, { username: string; email: string }>(
      admins.map((a: { id: string; username: string; email: string }) => [
        a.id,
        { username: a.username, email: a.email },
      ])
    );

    return sessions.map((s) => {
      const admin = adminMap.get(s.adminId);
      return {
        sessionId: s.id,
        adminId: s.adminId,
        adminUsername: admin?.username,
        adminEmail: admin?.email,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceFingerprint: s.deviceFingerprint,
        lastActivityAt: s.lastActivityAt.toISOString(),
        idleTimeoutMins: s.idleTimeoutMins,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() || null,
        revokeReason: s.revokeReason,
        mfaVerifiedAt: s.mfaVerifiedAt?.toISOString() || null,
      };
    });
  }

  /**
   * Enrich devices with profile info
   */
  private async enrichDevices(devices: TrustedDeviceRecord[]): Promise<TrustedDeviceEntry[]> {
    const profileIds = [...new Set(devices.map((d) => d.profileId))];

    const profiles = await prisma.userProfile.findMany({
      where: { profileId: { in: profileIds } },
      select: { profileId: true, firstName: true, lastName: true, email: true },
    });

    const profileMap = new Map<string, { name: string; email: string }>(
      profiles.map((p: { profileId: string; firstName: string; lastName: string; email: string }) => [
        p.profileId,
        { name: `${p.firstName} ${p.lastName}`, email: p.email },
      ])
    );

    return devices.map((d) => {
      const profile = profileMap.get(d.profileId);
      return {
        deviceId: d.deviceId,
        profileId: d.profileId,
        profileName: profile?.name,
        profileEmail: profile?.email,
        deviceName: d.deviceName,
        deviceFingerprint: d.deviceFingerprint,
        deviceOs: d.deviceOs,
        firstSeenAt: d.firstSeenAt.toISOString(),
        lastSeenAt: d.lastSeenAt.toISOString(),
        isTrusted: d.isTrusted,
        trustVerifiedAt: d.trustVerifiedAt?.toISOString() || null,
      };
    });
  }
}

export const sessionService = new SessionService();
