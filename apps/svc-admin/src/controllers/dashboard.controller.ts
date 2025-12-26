import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { dashboardService } from '../services/dashboard.service';
import type { AuthenticatedRequest } from '../types/dtos';

class DashboardController {
  /**
   * GET /api/v1/admin/dashboard/stats
   * Get comprehensive dashboard statistics
   */
  getStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = await dashboardService.getDashboardStats();
      res.status(200).json(stats);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch dashboard stats');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch dashboard statistics',
      });
    }
  };

  /**
   * GET /api/v1/admin/dashboard/user-growth
   * Get user growth data for charts
   */
  getUserGrowth = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const data = await dashboardService.getUserGrowth(Math.min(days, 90));
      res.status(200).json({ data });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user growth data');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch user growth data',
      });
    }
  };

  /**
   * GET /api/v1/admin/dashboard/new-registrations
   * Get new registrations per day
   */
  getNewRegistrations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const days = parseInt(req.query.days as string) || 14;
      const data = await dashboardService.getNewRegistrations(Math.min(days, 30));
      res.status(200).json({ data });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch new registrations data');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch new registrations data',
      });
    }
  };

  /**
   * GET /api/v1/admin/dashboard/transaction-volume
   * Get transaction volume data for charts
   */
  getTransactionVolume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const days = parseInt(req.query.days as string) || 14;
      const data = await dashboardService.getTransactionVolume(Math.min(days, 30));
      res.status(200).json({ data });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch transaction volume data');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch transaction volume data',
      });
    }
  };

  /**
   * GET /api/v1/admin/dashboard/user-distribution
   * Get user distribution by status
   */
  getUserDistribution = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const statusDistribution = await dashboardService.getUserStatusDistribution();
      const countryDistribution = await dashboardService.getUserCountryDistribution();
      res.status(200).json({
        byStatus: statusDistribution,
        byCountry: countryDistribution,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user distribution data');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch user distribution data',
      });
    }
  };

  /**
   * GET /api/v1/admin/dashboard/recent-activity
   * Get recent activity feed
   */
  getRecentActivity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const activities = await dashboardService.getRecentActivity(Math.min(limit, 50));
      res.status(200).json({ activities });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch recent activity');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch recent activity',
      });
    }
  };
}

export const dashboardController = new DashboardController();
