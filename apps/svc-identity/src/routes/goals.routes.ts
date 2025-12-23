/**
 * Goals Routes
 * API routes for savings goals management
 * Phase 2: Personal Finance Features
 */

import { Router } from 'express';
import { goalsController } from '../controllers/goals.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

// ============================================
// Wallet-level goals endpoints
// ============================================

/**
 * GET /api/v1/wallets/:walletId/goals
 * Get all goals summary for a wallet
 */
router.get('/wallets/:walletId/goals', authenticateJWT, goalsController.getGoalsSummary);

/**
 * GET /api/v1/wallets/:walletId/goals/upcoming
 * Get upcoming goal deadlines
 * Query: days? (default: 30)
 */
router.get('/wallets/:walletId/goals/upcoming', authenticateJWT, goalsController.getUpcomingDeadlines);

/**
 * GET /api/v1/wallets/:walletId/goals/overdue
 * Get overdue goals
 */
router.get('/wallets/:walletId/goals/overdue', authenticateJWT, goalsController.getOverdueGoals);

/**
 * GET /api/v1/wallets/:walletId/goals/off-track
 * Get off-track goals
 */
router.get('/wallets/:walletId/goals/off-track', authenticateJWT, goalsController.getOffTrackGoals);

// ============================================
// Sub-account goal endpoints
// ============================================

/**
 * PUT /api/v1/sub-accounts/:subAccountId/goal
 * Set or update a goal for a sub-account
 * Body: { goalAmount, goalName?, goalDeadline? }
 */
router.put('/sub-accounts/:subAccountId/goal', authenticateJWT, goalsController.setGoal);

/**
 * DELETE /api/v1/sub-accounts/:subAccountId/goal
 * Remove goal from a sub-account
 */
router.delete('/sub-accounts/:subAccountId/goal', authenticateJWT, goalsController.removeGoal);

/**
 * GET /api/v1/sub-accounts/:subAccountId/goal
 * Get goal progress for a sub-account
 */
router.get('/sub-accounts/:subAccountId/goal', authenticateJWT, goalsController.getGoalProgress);

/**
 * GET /api/v1/sub-accounts/:subAccountId/goal/milestones
 * Get goal milestones (25%, 50%, 75%, 90%, 100%)
 */
router.get('/sub-accounts/:subAccountId/goal/milestones', authenticateJWT, goalsController.getGoalMilestones);

/**
 * GET /api/v1/sub-accounts/:subAccountId/goal/suggestion
 * Get suggested contribution amount
 * Query: frequency (required: daily | weekly | monthly)
 */
router.get('/sub-accounts/:subAccountId/goal/suggestion', authenticateJWT, goalsController.getSuggestedContribution);

export default router;
