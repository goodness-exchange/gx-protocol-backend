import { Router, Request, Response } from 'express';
import { db } from '@gx/core-db';
import { register } from 'prom-client';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Quick database connectivity check
    await db.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      service: 'svc-messaging',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'svc-messaging',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Readiness check endpoint
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await db.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ready',
      service: 'svc-messaging',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      service: 'svc-messaging',
      error: 'Service not ready',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end();
  }
});

export default router;
