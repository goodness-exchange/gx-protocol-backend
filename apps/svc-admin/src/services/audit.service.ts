import { createHash } from 'crypto';
import { db as prisma } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import type {
  AuditEventType,
  AuditLogQueryParams,
  AuditLogEntry,
  AuditLogListResponse,
  UserActivitySummary,
  AdminActivitySummary,
} from '../types/audit.types';

// Define types for Prisma query results
interface AuditLogRecord {
  auditId: string;
  tenantId: string;
  eventType: string;
  actorProfileId: string | null;
  targetProfileId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
  sessionId: string | null;
  previousValue: unknown | null;
  newValue: unknown | null;
  metadata: unknown | null;
  eventHash: string;
  timestamp: Date;
}

/**
 * Audit Service
 * Provides comprehensive audit log querying and user activity tracking
 */
class AuditService {
  /**
   * Query audit logs with filtering and pagination
   */
  async queryAuditLogs(params: AuditLogQueryParams): Promise<AuditLogListResponse> {
    const {
      profileId,
      actorId,
      eventType,
      startDate,
      endDate,
      resourceType,
      resourceId,
      page = 1,
      limit = 50,
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause dynamically
    const where: any = {};

    if (profileId) {
      where.targetProfileId = profileId;
    }

    if (actorId) {
      where.actorProfileId = actorId;
    }

    if (eventType) {
      if (Array.isArray(eventType)) {
        where.eventType = { in: eventType };
      } else {
        where.eventType = eventType;
      }
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Enrich with actor/target names
    const enrichedLogs = await this.enrichLogsWithNames(logs);

    return {
      logs: enrichedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit logs for a specific user (target)
   */
  async getUserAuditLogs(
    profileId: string,
    options: { page?: number; limit?: number; eventTypes?: AuditEventType[] } = {}
  ): Promise<AuditLogListResponse> {
    return this.queryAuditLogs({
      profileId,
      eventType: options.eventTypes,
      page: options.page,
      limit: options.limit,
    });
  }

  /**
   * Get audit logs performed by an admin (actor)
   */
  async getAdminAuditLogs(
    adminId: string,
    options: { page?: number; limit?: number; eventTypes?: AuditEventType[] } = {}
  ): Promise<AuditLogListResponse> {
    return this.queryAuditLogs({
      actorId: adminId,
      eventType: options.eventTypes,
      page: options.page,
      limit: options.limit,
    });
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(profileId: string): Promise<UserActivitySummary> {
    const logs = await prisma.auditLog.findMany({
      where: { targetProfileId: profileId },
      select: {
        eventType: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    const eventBreakdown: Record<string, number> = {};
    logs.forEach((log: { eventType: string; timestamp: Date }) => {
      eventBreakdown[log.eventType] = (eventBreakdown[log.eventType] || 0) + 1;
    });

    return {
      profileId,
      totalEvents: logs.length,
      lastActivityAt: logs[0]?.timestamp.toISOString() || null,
      eventBreakdown,
    };
  }

  /**
   * Get admin activity summary
   */
  async getAdminActivitySummary(adminId: string): Promise<AdminActivitySummary> {
    // Get admin info
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { username: true },
    });

    const logs = await prisma.auditLog.findMany({
      where: { actorProfileId: adminId },
      select: {
        eventType: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    const actionBreakdown: Record<string, number> = {};
    logs.forEach((log: { eventType: string; timestamp: Date }) => {
      actionBreakdown[log.eventType] = (actionBreakdown[log.eventType] || 0) + 1;
    });

    return {
      adminId,
      adminName: admin?.username || 'Unknown',
      totalActions: logs.length,
      lastActionAt: logs[0]?.timestamp.toISOString() || null,
      actionBreakdown,
    };
  }

  /**
   * Create an audit log entry
   */
  async createAuditLog(params: {
    tenantId: string;
    eventType: AuditEventType;
    actorProfileId?: string;
    targetProfileId?: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    sessionId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
  }): Promise<AuditLogEntry> {
    // Generate event hash for tamper detection
    const hashData = JSON.stringify({
      eventType: params.eventType,
      actorProfileId: params.actorProfileId,
      targetProfileId: params.targetProfileId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      timestamp: new Date().toISOString(),
    });
    const eventHash = createHash('sha256').update(hashData).digest('hex');

    const log = await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        eventType: params.eventType,
        actorProfileId: params.actorProfileId,
        targetProfileId: params.targetProfileId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceId: params.deviceId,
        sessionId: params.sessionId,
        previousValue: params.previousValue as any,
        newValue: params.newValue as any,
        metadata: params.metadata as any,
        eventHash,
      },
    });

    logger.info(
      { auditId: log.auditId, eventType: params.eventType },
      'Audit log created'
    );

    return this.mapToAuditLogEntry(log);
  }

  /**
   * Get recent activity across all users (for dashboard)
   */
  async getRecentActivity(
    options: { limit?: number; eventTypes?: AuditEventType[] } = {}
  ): Promise<AuditLogEntry[]> {
    const { limit = 20, eventTypes } = options;

    const where: any = {};
    if (eventTypes && eventTypes.length > 0) {
      where.eventType = { in: eventTypes };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit,
      orderBy: { timestamp: 'desc' },
    });

    return this.enrichLogsWithNames(logs);
  }

  /**
   * Get activity statistics for a date range
   */
  async getActivityStats(startDate: Date, endDate: Date): Promise<{
    totalEvents: number;
    byEventType: Record<string, number>;
    byDay: { date: string; count: number }[];
  }> {
    const logs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        eventType: true,
        timestamp: true,
      },
    });

    const byEventType: Record<string, number> = {};
    const byDayMap: Record<string, number> = {};

    logs.forEach((log: { eventType: string; timestamp: Date }) => {
      // Count by event type
      byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;

      // Count by day
      const dayKey = log.timestamp.toISOString().split('T')[0];
      byDayMap[dayKey] = (byDayMap[dayKey] || 0) + 1;
    });

    const byDay = Object.entries(byDayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalEvents: logs.length,
      byEventType,
      byDay,
    };
  }

  /**
   * Enrich audit logs with actor/target names
   */
  private async enrichLogsWithNames(logs: AuditLogRecord[]): Promise<AuditLogEntry[]> {
    // Collect unique profile IDs
    const profileIds = new Set<string>();
    logs.forEach((log: AuditLogRecord) => {
      if (log.actorProfileId) profileIds.add(log.actorProfileId);
      if (log.targetProfileId) profileIds.add(log.targetProfileId);
    });

    // Fetch user profiles
    const profiles = await prisma.userProfile.findMany({
      where: { profileId: { in: Array.from(profileIds) } },
      select: { profileId: true, firstName: true, lastName: true, email: true },
    });

    // Fetch admin users (actors might be admins)
    const admins = await prisma.adminUser.findMany({
      where: { id: { in: Array.from(profileIds) } },
      select: { id: true, username: true },
    });

    // Create lookup maps
    const profileMap = new Map<string, string>(
      profiles.map((p: { profileId: string; firstName: string; lastName: string }) => [
        p.profileId,
        `${p.firstName} ${p.lastName}`,
      ])
    );
    const adminMap = new Map<string, string>(
      admins.map((a: { id: string; username: string }) => [a.id, a.username])
    );

    // Enrich logs
    return logs.map((log: AuditLogRecord) => this.mapToAuditLogEntry(log, profileMap, adminMap));
  }

  /**
   * Map database record to AuditLogEntry
   */
  private mapToAuditLogEntry(
    log: AuditLogRecord,
    profileMap?: Map<string, string>,
    adminMap?: Map<string, string>
  ): AuditLogEntry {
    let actorName: string | undefined;
    let targetName: string | undefined;

    if (profileMap && adminMap) {
      if (log.actorProfileId) {
        actorName =
          adminMap.get(log.actorProfileId) || profileMap.get(log.actorProfileId);
      }
      if (log.targetProfileId) {
        targetName = profileMap.get(log.targetProfileId);
      }
    }

    return {
      auditId: log.auditId,
      eventType: log.eventType as AuditEventType,
      actorProfileId: log.actorProfileId,
      actorName,
      targetProfileId: log.targetProfileId,
      targetName,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      previousValue: log.previousValue,
      newValue: log.newValue,
      metadata: log.metadata,
      timestamp: log.timestamp.toISOString(),
    };
  }
}

export const auditService = new AuditService();
