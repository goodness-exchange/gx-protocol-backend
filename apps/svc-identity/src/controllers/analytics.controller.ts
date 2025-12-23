import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';
import { logger } from '@gx/core-logger';

/**
 * Analytics Controller
 *
 * Handles HTTP requests for transaction analytics and reporting.
 */

class AnalyticsController {
  /**
   * GET /api/v1/analytics/summary
   * Get analytics summary for a date range
   * Query: startDate, endDate (ISO date strings)
   */
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { startDate, endDate } = req.query;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const summary = await analyticsService.getAnalyticsSummary(
        profileId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting analytics summary');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/spending
   * Get spending breakdown by category
   * Query: startDate, endDate (ISO date strings)
   */
  async getSpending(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { startDate, endDate } = req.query;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const spending = await analyticsService.getSpendingByCategory(
        profileId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: { spending },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting spending breakdown');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/income
   * Get income breakdown by source
   * Query: startDate, endDate (ISO date strings)
   */
  async getIncome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { startDate, endDate } = req.query;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const income = await analyticsService.getIncomeBySource(
        profileId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: { income },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting income breakdown');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/trends/daily
   * Get daily transaction trends
   * Query: startDate, endDate (ISO date strings)
   */
  async getDailyTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { startDate, endDate } = req.query;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const trends = await analyticsService.getDailyTrends(
        profileId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: { trends },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting daily trends');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/trends/monthly
   * Get monthly transaction trends
   * Query: months (number, default 12)
   */
  async getMonthlyTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const months = parseInt(req.query.months as string) || 12;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const trends = await analyticsService.getMonthlyTrends(profileId, months);

      res.json({
        success: true,
        data: { trends },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting monthly trends');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/sub-accounts/:walletId
   * Get sub-account analytics for a wallet
   */
  async getSubAccountAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { walletId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const analytics = await analyticsService.getSubAccountAnalytics(profileId, walletId);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting sub-account analytics');
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/comparison
   * Compare two periods
   * Query: currentStart, currentEnd, previousStart, previousEnd (ISO date strings)
   */
  async getPeriodComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { currentStart, currentEnd, previousStart, previousEnd } = req.query;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
        res.status(400).json({
          error: 'currentStart, currentEnd, previousStart, and previousEnd are required',
        });
        return;
      }

      const comparison = await analyticsService.getPeriodComparison(
        profileId,
        new Date(currentStart as string),
        new Date(currentEnd as string),
        new Date(previousStart as string),
        new Date(previousEnd as string)
      );

      res.json({
        success: true,
        data: { comparison },
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting period comparison');
      next(error);
    }
  }

  /**
   * POST /api/v1/analytics/aggregate/daily
   * Trigger daily analytics aggregation (admin/cron endpoint)
   * Body: { date: ISO date string }
   */
  async aggregateDaily(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { date } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const aggregateDate = date ? new Date(date) : new Date();
      await analyticsService.aggregateDailyAnalytics(profileId, aggregateDate);

      res.json({
        success: true,
        message: 'Daily analytics aggregated',
        date: aggregateDate.toISOString().split('T')[0],
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error aggregating daily analytics');
      next(error);
    }
  }

  /**
   * POST /api/v1/analytics/aggregate/monthly
   * Trigger monthly analytics aggregation (admin/cron endpoint)
   * Body: { year: number, month: number }
   */
  async aggregateMonthly(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { year, month } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const now = new Date();
      const aggregateYear = year || now.getFullYear();
      const aggregateMonth = month || now.getMonth() + 1;

      await analyticsService.aggregateMonthlyAnalytics(profileId, aggregateYear, aggregateMonth);

      res.json({
        success: true,
        message: 'Monthly analytics aggregated',
        year: aggregateYear,
        month: aggregateMonth,
      });
    } catch (error: any) {
      if (error.message === 'Wallet not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error aggregating monthly analytics');
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
