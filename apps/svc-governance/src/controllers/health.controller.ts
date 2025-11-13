import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { governanceConfig } from '../config';

class HealthController {
  health = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'ok',
      service: 'svc-governance',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };

  readiness = async (_req: Request, res: Response): Promise<void> => {
    const checks: Record<string, { status: string; message?: string; value?: any }> = {};
    let isReady = true;

    try {
      await db.$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy' };
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      checks.database = { status: 'unhealthy', message: (error as Error).message };
      isReady = false;
    }

    try {
      const projectorState = await db.projectorState.findFirst({
        orderBy: { updatedAt: 'desc' },
      });

      if (projectorState) {
        const lagMs = Date.now() - projectorState.updatedAt.getTime();

        if (lagMs > governanceConfig.projectionLagThresholdMs) {
          checks.projectionLag = {
            status: 'unhealthy',
            message: 'Projection lag exceeds threshold',
            value: { lagMs, threshold: governanceConfig.projectionLagThresholdMs },
          };
          isReady = false;
        } else {
          checks.projectionLag = {
            status: 'healthy',
            value: { lagMs },
          };
        }
      } else {
        checks.projectionLag = {
          status: 'unknown',
          message: 'No projector state found (fresh deployment)',
        };
      }
    } catch (error) {
      logger.error({ error }, 'Projection lag check failed');
      checks.projectionLag = {
        status: 'error',
        message: (error as Error).message,
      };
    }

    const status = isReady ? 200 : 503;
    res.status(status).json({
      status: isReady ? 'ready' : 'not_ready',
      service: 'svc-governance',
      timestamp: new Date().toISOString(),
      checks,
    });
  };

  liveness = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'alive',
      service: 'svc-governance',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  };
}

export const healthController = new HealthController();
