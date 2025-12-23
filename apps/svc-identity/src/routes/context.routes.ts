import { Router } from 'express';
import { contextController } from '../controllers/context.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Context Routes
 *
 * Manages account contexts for SSO switching between personal and business wallets.
 * All endpoints require JWT authentication.
 */

const router = Router();

/**
 * GET /api/v1/contexts
 * Get all contexts for the authenticated user
 */
router.get('/', authenticateJWT, contextController.getContexts);

/**
 * GET /api/v1/contexts/current
 * Get the current (default) context
 */
router.get('/current', authenticateJWT, contextController.getCurrentContext);

/**
 * POST /api/v1/contexts/switch
 * Switch to a different context
 * Body: { contextId: string }
 */
router.post('/switch', authenticateJWT, contextController.switchContext);

/**
 * PUT /api/v1/contexts/:contextId/default
 * Set a context as the default
 */
router.put('/:contextId/default', authenticateJWT, contextController.setDefault);

/**
 * POST /api/v1/contexts/personal
 * Create personal context (called during registration)
 */
router.post('/personal', authenticateJWT, contextController.createPersonalContext);

/**
 * POST /api/v1/contexts/business
 * Create business context
 * Body: { businessAccountId: string, name: string, icon?: string }
 */
router.post('/business', authenticateJWT, contextController.createBusinessContext);

/**
 * DELETE /api/v1/contexts/:contextId
 * Deactivate a context (business only)
 */
router.delete('/:contextId', authenticateJWT, contextController.deactivateContext);

export default router;
