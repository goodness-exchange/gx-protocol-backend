import { Router } from 'express';
import { categoriesController } from '../controllers/categories.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Categories Routes
 *
 * Manages transaction categories for organizing and tracking spending.
 * All endpoints require JWT authentication.
 */

const router = Router();

// ============================================
// Category CRUD
// ============================================

/**
 * GET /api/v1/categories
 * Get all categories for the authenticated user
 * Query: includeCount=true to include transaction counts
 */
router.get('/', authenticateJWT, categoriesController.getCategories);

/**
 * GET /api/v1/categories/spending-summary
 * Get category spending summary for a period
 * Query: startDate, endDate (ISO date strings)
 */
router.get('/spending-summary', authenticateJWT, categoriesController.getSpendingSummary);

/**
 * POST /api/v1/categories/initialize
 * Initialize default categories for a user
 */
router.post('/initialize', authenticateJWT, categoriesController.initializeCategories);

/**
 * GET /api/v1/categories/:categoryId
 * Get a single category
 */
router.get('/:categoryId', authenticateJWT, categoriesController.getCategory);

/**
 * GET /api/v1/categories/:categoryId/transactions
 * Get transactions tagged with a category
 */
router.get('/:categoryId/transactions', authenticateJWT, categoriesController.getTransactionsByCategory);

/**
 * POST /api/v1/categories
 * Create a new category
 */
router.post('/', authenticateJWT, categoriesController.createCategory);

/**
 * PUT /api/v1/categories/:categoryId
 * Update a category
 */
router.put('/:categoryId', authenticateJWT, categoriesController.updateCategory);

/**
 * DELETE /api/v1/categories/:categoryId
 * Delete a category (non-system only)
 */
router.delete('/:categoryId', authenticateJWT, categoriesController.deleteCategory);

export default router;
