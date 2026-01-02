/**
 * Public Routes
 *
 * These endpoints are accessible without authentication.
 * Used for transparency and public information disclosure.
 */

import { Router, Request, Response } from 'express';
import { supplyService } from '../services/supply.service';
import { logger } from '@gx/core-logger';

const router = Router();

/**
 * GET /api/public/supply
 *
 * Public transparency endpoint for supply information.
 * No authentication required.
 *
 * Returns simplified supply data with human-readable values:
 * - Total supply (max, minted, available)
 * - Per-pool breakdown (percentage minted)
 * - Last update timestamp
 */
router.get('/supply', async (_req: Request, res: Response): Promise<void> => {
  try {
    const publicSupply = await supplyService.getPublicSupply();

    // Add cache headers for public data (cache for 1 minute)
    res.set('Cache-Control', 'public, max-age=60');

    res.status(200).json(publicSupply);
  } catch (error) {
    logger.error({ error }, 'Failed to get public supply');
    res.status(500).json({
      error: 'Service Unavailable',
      message: 'Unable to retrieve supply information at this time',
    });
  }
});

export default router;
