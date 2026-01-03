import { Request, Response } from 'express';
import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';

export const healthController = {
  /**
   * Basic health check
   */
  async health(_req: Request, res: Response): Promise<void> {
    res.json({ status: 'ok', service: 'svc-government', timestamp: new Date().toISOString() });
  },

  /**
   * Readiness check (includes database connectivity)
   */
  async readiness(_req: Request, res: Response): Promise<void> {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({
        status: 'ready',
        service: 'svc-government',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Readiness check failed');
      res.status(503).json({
        status: 'not ready',
        service: 'svc-government',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  },

  /**
   * Liveness check
   */
  async liveness(_req: Request, res: Response): Promise<void> {
    res.json({
      status: 'alive',
      service: 'svc-government',
      timestamp: new Date().toISOString(),
    });
  },
};
