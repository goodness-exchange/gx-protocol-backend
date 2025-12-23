/**
 * Budgets Routes
 * API routes for budget period management
 * Phase 2: Personal Finance Features
 */

import { Router } from 'express';
import { budgetsController } from '../controllers/budgets.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

/**
 * POST /api/v1/budgets
 * Create a new budget period
 * Body: { walletId, subAccountId?, periodType, budgetAmount, startDate?, endDate?, alertThreshold? }
 */
router.post('/', authenticateJWT, budgetsController.createBudget);

/**
 * GET /api/v1/budgets
 * List budget periods
 * Query: walletId (required), subAccountId?, status?, active?, limit?, offset?
 */
router.get('/', authenticateJWT, budgetsController.listBudgets);

/**
 * GET /api/v1/budgets/summary
 * Get budget summary for a wallet
 * Query: walletId (required), periodType?
 */
router.get('/summary', authenticateJWT, budgetsController.getBudgetSummary);

/**
 * GET /api/v1/budgets/:budgetId
 * Get budget by ID
 */
router.get('/:budgetId', authenticateJWT, budgetsController.getBudget);

/**
 * PUT /api/v1/budgets/:budgetId
 * Update a budget
 * Body: { budgetAmount?, alertThreshold?, status? }
 */
router.put('/:budgetId', authenticateJWT, budgetsController.updateBudget);

/**
 * DELETE /api/v1/budgets/:budgetId
 * Delete a budget
 */
router.delete('/:budgetId', authenticateJWT, budgetsController.deleteBudget);

/**
 * POST /api/v1/budgets/check-alerts
 * Check budget alerts (admin/scheduled job endpoint)
 */
router.post('/check-alerts', authenticateJWT, budgetsController.checkAlerts);

/**
 * POST /api/v1/budgets/complete-expired
 * Complete expired budgets (admin/scheduled job endpoint)
 */
router.post('/complete-expired', authenticateJWT, budgetsController.completeExpired);

/**
 * POST /api/v1/budgets/auto-create-monthly
 * Auto-create monthly budgets for a wallet
 * Body: { walletId }
 */
router.post('/auto-create-monthly', authenticateJWT, budgetsController.autoCreateMonthly);

export default router;
