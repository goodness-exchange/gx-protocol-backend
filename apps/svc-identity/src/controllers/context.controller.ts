import { Request, Response, NextFunction } from 'express';
import { contextService } from '../services/context.service';
import { logger } from '@gx/core-logger';

/**
 * Context Controller
 *
 * Handles HTTP requests for account context management (SSO switching).
 */

class ContextController {
  /**
   * GET /api/v1/contexts
   * Get all contexts for the authenticated user
   */
  async getContexts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const contexts = await contextService.getUserContexts(profileId);

      res.json({
        success: true,
        data: { contexts },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting contexts');
      next(error);
    }
  }

  /**
   * GET /api/v1/contexts/current
   * Get the current (default) context for the authenticated user
   */
  async getCurrentContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const context = await contextService.getCurrentContext(profileId);

      if (!context) {
        res.status(404).json({ error: 'No context found' });
        return;
      }

      res.json({
        success: true,
        data: { context },
      });
    } catch (error) {
      logger.error({ error }, 'Error getting current context');
      next(error);
    }
  }

  /**
   * POST /api/v1/contexts/switch
   * Switch to a different context
   */
  async switchContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { contextId } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!contextId) {
        res.status(400).json({ error: 'contextId is required' });
        return;
      }

      const result = await contextService.switchContext(profileId, contextId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === 'Context not found or not accessible') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error switching context');
      next(error);
    }
  }

  /**
   * PUT /api/v1/contexts/:contextId/default
   * Set a context as the default
   */
  async setDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { contextId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const context = await contextService.setDefaultContext(profileId, contextId);

      res.json({
        success: true,
        data: { context },
      });
    } catch (error: any) {
      if (error.message === 'Context not found or not accessible') {
        res.status(404).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error setting default context');
      next(error);
    }
  }

  /**
   * POST /api/v1/contexts/personal
   * Create personal context (typically called during registration)
   */
  async createPersonalContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const context = await contextService.createPersonalContext(profileId);

      res.status(201).json({
        success: true,
        data: { context },
      });
    } catch (error: any) {
      if (error.message === 'Personal context already exists') {
        res.status(409).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error creating personal context');
      next(error);
    }
  }

  /**
   * POST /api/v1/contexts/business
   * Create business context (when user gains access to a business account)
   */
  async createBusinessContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { businessAccountId, name, icon } = req.body;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!businessAccountId || !name) {
        res.status(400).json({ error: 'businessAccountId and name are required' });
        return;
      }

      const context = await contextService.createBusinessContext(
        profileId,
        businessAccountId,
        name,
        icon
      );

      res.status(201).json({
        success: true,
        data: { context },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('already exists')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error creating business context');
      next(error);
    }
  }

  /**
   * DELETE /api/v1/contexts/:contextId
   * Deactivate a context (business only)
   */
  async deactivateContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profileId = (req as any).user?.profileId;
      const { contextId } = req.params;

      if (!profileId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await contextService.deactivateContext(profileId, contextId);

      res.json({
        success: true,
        message: 'Context deactivated',
      });
    } catch (error: any) {
      if (error.message === 'Context not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'Cannot deactivate personal context') {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error({ error }, 'Error deactivating context');
      next(error);
    }
  }
}

export const contextController = new ContextController();
