/**
 * Allocation Rules Routes
 * API routes for automatic allocation rule management
 * Phase 2: Personal Finance Features
 */

import { Router } from 'express';
import { allocationRulesController } from '../controllers/allocation-rules.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

// ============================================
// Allocation Rules CRUD
// ============================================

/**
 * POST /api/v1/allocation-rules
 * Create a new allocation rule
 * Body: { walletId, subAccountId, name, ruleType, triggerType, ... }
 */
router.post('/allocation-rules', authenticateJWT, allocationRulesController.createRule);

/**
 * PUT /api/v1/allocation-rules/:ruleId
 * Update an allocation rule
 */
router.put('/allocation-rules/:ruleId', authenticateJWT, allocationRulesController.updateRule);

/**
 * DELETE /api/v1/allocation-rules/:ruleId
 * Delete an allocation rule
 */
router.delete('/allocation-rules/:ruleId', authenticateJWT, allocationRulesController.deleteRule);

/**
 * GET /api/v1/allocation-rules/preview
 * Preview allocations without executing
 * Query: walletId (required), amount (required), triggerType?
 */
router.get('/allocation-rules/preview', authenticateJWT, allocationRulesController.previewAllocations);

/**
 * POST /api/v1/allocation-rules/process-scheduled
 * Process scheduled allocations (admin/cron endpoint)
 */
router.post('/allocation-rules/process-scheduled', authenticateJWT, allocationRulesController.processScheduled);

// ============================================
// Manual Allocation
// ============================================

/**
 * POST /api/v1/wallets/:walletId/allocate
 * Execute manual allocation
 * Body: { subAccountId, amount, description? }
 */
router.post('/wallets/:walletId/allocate', authenticateJWT, allocationRulesController.manualAllocate);

// ============================================
// Allocation History
// ============================================

/**
 * GET /api/v1/sub-accounts/:subAccountId/allocations
 * Get allocation history for a sub-account
 * Query: limit?, offset?, startDate?, endDate?
 */
router.get('/sub-accounts/:subAccountId/allocations', authenticateJWT, allocationRulesController.getAllocationHistory);

export default router;
