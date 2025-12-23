import { Request, Response, NextFunction } from 'express';
import { categoriesService } from '../services/categories.service';
import { logger } from '@gx/core-logger';

/**
 * Categories Controller
 *
 * Handles HTTP requests for transaction category management.
 */

class CategoriesController {
  /**
   * GET /api/v1/categories
   * Get all categories for the authenticated user
   */
  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const includeCount = req.query.includeCount === 'true';

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const categories = await categoriesService.getCategories(profileId, includeCount);

      res.json({
        success: true,
        data: { categories },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting categories');
      next(error);
    }
  }

  /**
   * GET /api/v1/categories/:categoryId
   * Get a single category
   */
  async getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { categoryId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const category = await categoriesService.getCategory(profileId, categoryId);

      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.json({
        success: true,
        data: { category },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting category');
      next(error);
    }
  }

  /**
   * POST /api/v1/categories
   * Create a new category
   */
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { name, description, color, icon, isIncome, sortOrder } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const category = await categoriesService.createCategory(profileId, {
        name,
        description,
        color,
        icon,
        isIncome,
        sortOrder,
      });

      res.status(201).json({
        success: true,
        data: { category },
      });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error creating category');
      next(error);
    }
  }

  /**
   * PUT /api/v1/categories/:categoryId
   * Update a category
   */
  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { categoryId } = req.params;
      const updates = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const category = await categoriesService.updateCategory(profileId, categoryId, updates);

      res.json({
        success: true,
        data: { category },
      });
    } catch (error: any) {
      if (error.message === 'Category not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error updating category');
      next(error);
    }
  }

  /**
   * DELETE /api/v1/categories/:categoryId
   * Delete a category
   */
  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { categoryId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await categoriesService.deleteCategory(profileId, categoryId);

      res.json({
        success: true,
        message: 'Category deleted',
      });
    } catch (error: any) {
      if (error.message === 'Category not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'Cannot delete system category') {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error deleting category');
      next(error);
    }
  }

  /**
   * POST /api/v1/transactions/:transactionId/tags
   * Tag a transaction with a category
   */
  async tagTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { transactionId } = req.params;
      const { categoryId, notes } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!categoryId) {
        res.status(400).json({ error: 'categoryId is required' });
        return;
      }

      const tag = await categoriesService.tagTransaction(profileId, transactionId, categoryId, notes);

      res.status(201).json({
        success: true,
        data: { tag },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('already tagged')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error tagging transaction');
      next(error);
    }
  }

  /**
   * DELETE /api/v1/tags/:tagId
   * Remove a tag from a transaction
   */
  async untagTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { tagId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await categoriesService.untagTransaction(profileId, tagId);

      res.json({
        success: true,
        message: 'Tag removed',
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error removing tag');
      next(error);
    }
  }

  /**
   * GET /api/v1/transactions/:transactionId/tags
   * Get all tags for a transaction
   */
  async getTransactionTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transactionId } = req.params;
      const tags = await categoriesService.getTransactionTags(transactionId);

      res.json({
        success: true,
        data: { tags },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting transaction tags');
      next(error);
    }
  }

  /**
   * GET /api/v1/categories/:categoryId/transactions
   * Get transactions by category
   */
  async getTransactionsByCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { categoryId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await categoriesService.getTransactionsByCategory(profileId, categoryId, limit, offset);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === 'Category not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error getting transactions by category');
      next(error);
    }
  }

  /**
   * POST /api/v1/categories/initialize
   * Initialize default categories for a user
   */
  async initializeCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await categoriesService.initializeDefaultCategories(profileId);

      res.json({
        success: true,
        message: 'Default categories initialized',
      });
    } catch (error) {
      logger.error({ error }, 'Error initializing categories');
      next(error);
    }
  }

  /**
   * GET /api/v1/categories/spending-summary
   * Get category spending summary for a period
   */
  async getSpendingSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const summary = await categoriesService.getCategorySpendingSummary(
        profileId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting spending summary');
      next(error);
    }
  }
}

export const categoriesController = new CategoriesController();
