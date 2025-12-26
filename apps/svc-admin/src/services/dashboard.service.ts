import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';

// Date utility functions (avoiding external dependency)
function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export interface DashboardStats {
  // User metrics
  totalUsers: number;
  activeUsers: number;
  pendingApproval: number;
  pendingOnchain: number;
  frozenUsers: number;
  deniedUsers: number;

  // Transaction metrics
  totalTransactions: number;
  todayTransactions: number;
  weekTransactions: number;

  // Wallet metrics
  totalWallets: number;

  // Admin metrics
  totalAdmins: number;
  activeAdmins: number;

  // Approval metrics
  pendingApprovals: number;

  // Organization metrics
  totalOrganizations: number;

  // Country metrics
  totalCountries: number;

  // System status
  systemStatus: string;
}

export interface UserGrowthData {
  date: string;
  count: number;
}

export interface TransactionVolumeData {
  date: string;
  count: number;
  volume: string;
}

export interface RecentActivity {
  id: string;
  type: 'USER_REGISTERED' | 'USER_APPROVED' | 'USER_DENIED' | 'USER_FROZEN' | 'TRANSACTION' | 'APPROVAL_CREATED';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class DashboardService {
  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const today = new Date();
      const startOfToday = startOfDay(today);
      const weekAgo = subDays(today, 7);

      // Run all queries in parallel for better performance
      const [
        totalUsers,
        activeUsers,
        pendingApproval,
        pendingOnchain,
        frozenUsers,
        deniedUsers,
        totalTransactions,
        todayTransactions,
        weekTransactions,
        totalWallets,
        totalAdmins,
        activeAdmins,
        pendingApprovals,
        totalOrganizations,
        totalCountries,
        systemStatus,
      ] = await Promise.all([
        // User counts
        db.userProfile.count({ where: { deletedAt: null } }),
        db.userProfile.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        db.userProfile.count({ where: { status: { in: ['PENDING_ADMIN_APPROVAL', 'REGISTERED'] }, deletedAt: null } }),
        db.userProfile.count({ where: { status: 'APPROVED_PENDING_ONCHAIN', deletedAt: null } }),
        db.userProfile.count({ where: { isLocked: true, deletedAt: null } }),
        db.userProfile.count({ where: { status: 'DENIED', deletedAt: null } }),

        // Transaction counts
        db.transaction.count(),
        db.transaction.count({ where: { timestamp: { gte: startOfToday } } }),
        db.transaction.count({ where: { timestamp: { gte: weekAgo } } }),

        // Wallet count
        db.wallet.count(),

        // Admin counts
        db.adminUser.count({ where: { deletedAt: null } }),
        db.adminUser.count({ where: { isActive: true, deletedAt: null } }),

        // Pending approvals
        db.approvalRequest.count({ where: { status: 'PENDING' } }),

        // Organization count
        db.organization.count(),

        // Country count
        db.country.count(),

        // System status
        db.systemParameter.findUnique({
          where: { tenantId_paramKey: { tenantId: 'default', paramKey: 'SYSTEM_STATUS' } }
        }),
      ]);

      return {
        totalUsers,
        activeUsers,
        pendingApproval,
        pendingOnchain,
        frozenUsers,
        deniedUsers,
        totalTransactions,
        todayTransactions,
        weekTransactions,
        totalWallets,
        totalAdmins,
        activeAdmins,
        pendingApprovals,
        totalOrganizations,
        totalCountries,
        systemStatus: systemStatus?.paramValue ?? 'OPERATIONAL',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to fetch dashboard stats');
      throw error;
    }
  }

  /**
   * Get user growth data for the last N days
   */
  async getUserGrowth(days: number = 30): Promise<UserGrowthData[]> {
    try {
      const results: UserGrowthData[] = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = formatDate(date);
        const endOfDate = endOfDay(date);

        const count = await db.userProfile.count({
          where: {
            createdAt: { lte: endOfDate },
            deletedAt: null,
          },
        });

        results.push({ date: dateStr, count });
      }

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user growth data');
      throw error;
    }
  }

  /**
   * Get new registrations per day for the last N days
   */
  async getNewRegistrations(days: number = 14): Promise<UserGrowthData[]> {
    try {
      const results: UserGrowthData[] = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = formatDate(date);
        const start = startOfDay(date);
        const end = endOfDay(date);

        const count = await db.userProfile.count({
          where: {
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
        });

        results.push({ date: dateStr, count });
      }

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch new registrations data');
      throw error;
    }
  }

  /**
   * Get transaction volume data for the last N days
   */
  async getTransactionVolume(days: number = 14): Promise<TransactionVolumeData[]> {
    try {
      const results: TransactionVolumeData[] = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = formatDate(date);
        const start = startOfDay(date);
        const end = endOfDay(date);

        const transactions = await db.transaction.findMany({
          where: { timestamp: { gte: start, lte: end } },
          select: { amount: true },
        });

        const count = transactions.length;
        const volume = transactions.reduce((sum: number, tx: { amount: unknown }) => sum + parseFloat(String(tx.amount)), 0);

        results.push({
          date: dateStr,
          count,
          volume: volume.toFixed(2),
        });
      }

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch transaction volume data');
      throw error;
    }
  }

  /**
   * Get user distribution by status
   */
  async getUserStatusDistribution(): Promise<Record<string, number>> {
    try {
      const statuses = await db.userProfile.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { deletedAt: null },
      });

      const distribution: Record<string, number> = {};
      for (const item of statuses) {
        distribution[item.status] = item._count.status;
      }

      return distribution;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user status distribution');
      throw error;
    }
  }

  /**
   * Get user distribution by country
   */
  async getUserCountryDistribution(): Promise<Array<{ country: string; count: number }>> {
    try {
      const countries = await db.userProfile.groupBy({
        by: ['nationalityCountryCode'],
        _count: { nationalityCountryCode: true },
        where: { deletedAt: null, nationalityCountryCode: { not: null } },
        orderBy: { _count: { nationalityCountryCode: 'desc' } },
        take: 10,
      });

      return countries.map((item: { nationalityCountryCode: string | null; _count: { nationalityCountryCode: number } }) => ({
        country: item.nationalityCountryCode || 'Unknown',
        count: item._count.nationalityCountryCode,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user country distribution');
      throw error;
    }
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    try {
      const activities: RecentActivity[] = [];

      // Recent user registrations
      const recentUsers = await db.userProfile.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          profileId: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      });

      for (const user of recentUsers) {
        activities.push({
          id: user.profileId,
          type: 'USER_REGISTERED',
          description: `${user.firstName} ${user.lastName} registered`,
          timestamp: user.createdAt.toISOString(),
          metadata: { status: user.status },
        });
      }

      // Recent approval requests
      const recentApprovals = await db.approvalRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          requestType: true,
          targetResource: true,
          status: true,
          createdAt: true,
        },
      });

      for (const approval of recentApprovals) {
        activities.push({
          id: approval.id,
          type: 'APPROVAL_CREATED',
          description: `${approval.requestType}: ${approval.targetResource}`,
          timestamp: approval.createdAt.toISOString(),
          metadata: { status: approval.status },
        });
      }

      // Sort by timestamp and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch recent activity');
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
