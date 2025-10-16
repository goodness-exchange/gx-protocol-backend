import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { identityConfig } from '../config';

/**
 * Health Check Controller
 * 
 * Provides endpoints for monitoring service health, readiness, and liveness.
 * These endpoints are used by orchestrators (Kubernetes, Docker Swarm, etc.)
 * to determine when to route traffic to the service or restart it.
 */

class HealthController {
  /**
   * Basic health check
   * Returns 200 if the service is running
   * 
   * @route GET /health
   */
  health = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'ok',
      service: 'svc-identity',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };

  /**
   * Readiness probe
   * Checks if the service is ready to accept traffic
   * 
   * Checks:
   * - Database connectivity
   * - Projection lag (must be below threshold)
   * 
   * @route GET /readyz
   */
  readiness = async (_req: Request, res: Response): Promise<void> => {
    const checks: Record<string, { status: string; message?: string; value?: any }> = {};
    let isReady = true;

    // 1. Check database connectivity
    try {
      await db.$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy' };
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      checks.database = { status: 'unhealthy', message: (error as Error).message };
      isReady = false;
    }

    // 2. Check projection lag
    try {
      const projectorState = await db.projectorState.findFirst({
        orderBy: { lastProcessedAt: 'desc' },
      });

      if (projectorState && projectorState.lastProcessedAt) {
        const lagMs = Date.now() - projectorState.lastProcessedAt.getTime();
        
        if (lagMs > identityConfig.projectionLagThresholdMs) {
          checks.projectionLag = {
            status: 'unhealthy',
            message: 'Projection lag exceeds threshold',
            value: { lagMs, threshold: identityConfig.projectionLagThresholdMs },
          };
          isReady = false;
        } else {
          checks.projectionLag = {
            status: 'healthy',
            value: { lagMs },
          };
        }
      } else {
        // No projector state yet (fresh deployment)
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
      // Don't fail readiness for projection lag check errors
    }

    const status = isReady ? 200 : 503;
    res.status(status).json({
      status: isReady ? 'ready' : 'not_ready',
      service: 'svc-identity',
      timestamp: new Date().toISOString(),
      checks,
    });
  };

  /**
   * Liveness probe
   * Checks if the service is alive and responding
   * 
   * @route GET /livez
   */
  liveness = async (_req: Request, res: Response): Promise<void> => {
    // Simple check - if we can respond, we're alive
    res.status(200).json({
      status: 'alive',
      service: 'svc-identity',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  };
}

export const healthController = new HealthController();
