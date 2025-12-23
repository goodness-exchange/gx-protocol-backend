import { Router } from 'express';
import { categoriesController } from '../controllers/categories.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Tags Routes
 *
 * Manages transaction tagging with categories.
 * All endpoints require JWT authentication.
 */

const router = Router();

/**
 * GET /api/v1/transactions/:transactionId/tags
 * Get all tags for a transaction
 */
router.get('/transactions/:transactionId/tags', authenticateJWT, categoriesController.getTransactionTags);

/**
 * POST /api/v1/transactions/:transactionId/tags
 * Tag a transaction with a category
 * Body: { categoryId: string, notes?: string }
 */
router.post('/transactions/:transactionId/tags', authenticateJWT, categoriesController.tagTransaction);

/**
 * DELETE /api/v1/tags/:tagId
 * Remove a tag from a transaction
 */
router.delete('/tags/:tagId', authenticateJWT, categoriesController.untagTransaction);

export default router;
