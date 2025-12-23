import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Analytics Routes
 *
 * Provides transaction analytics, spending summaries, and trend analysis.
 * All endpoints require JWT authentication.
 */

const router = Router();

// ============================================
// Analytics Summary & Breakdown
// ============================================

/**
 * GET /api/v1/analytics/summary
 * Get comprehensive analytics summary for a date range
 * Query: startDate, endDate (ISO date strings)
 */
router.get('/summary', authenticateJWT, analyticsController.getSummary);

/**
 * GET /api/v1/analytics/spending
 * Get spending breakdown by category
 * Query: startDate, endDate (ISO date strings)
 */
router.get('/spending', authenticateJWT, analyticsController.getSpending);

/**
 * GET /api/v1/analytics/income
 * Get income breakdown by source/category
 * Query: startDate, endDate (ISO date strings)
 */
router.get('/income', authenticateJWT, analyticsController.getIncome);

// ============================================
// Trends
// ============================================

/**
 * GET /api/v1/analytics/trends/daily
 * Get daily transaction trends
 * Query: startDate, endDate (ISO date strings)
 */
router.get('/trends/daily', authenticateJWT, analyticsController.getDailyTrends);

/**
 * GET /api/v1/analytics/trends/monthly
 * Get monthly transaction trends
 * Query: months (number, default 12)
 */
router.get('/trends/monthly', authenticateJWT, analyticsController.getMonthlyTrends);

// ============================================
// Sub-Account Analytics
// ============================================

/**
 * GET /api/v1/analytics/sub-accounts/:walletId
 * Get sub-account analytics for a wallet
 */
router.get('/sub-accounts/:walletId', authenticateJWT, analyticsController.getSubAccountAnalytics);

// ============================================
// Period Comparison
// ============================================

/**
 * GET /api/v1/analytics/comparison
 * Compare two periods (month-over-month, year-over-year, etc.)
 * Query: currentStart, currentEnd, previousStart, previousEnd (ISO date strings)
 */
router.get('/comparison', authenticateJWT, analyticsController.getPeriodComparison);

// ============================================
// Aggregation (Admin/Cron endpoints)
// ============================================

/**
 * POST /api/v1/analytics/aggregate/daily
 * Trigger daily analytics aggregation
 * Body: { date?: ISO date string }
 */
router.post('/aggregate/daily', authenticateJWT, analyticsController.aggregateDaily);

/**
 * POST /api/v1/analytics/aggregate/monthly
 * Trigger monthly analytics aggregation
 * Body: { year?: number, month?: number }
 */
router.post('/aggregate/monthly', authenticateJWT, analyticsController.aggregateMonthly);

export default router;
