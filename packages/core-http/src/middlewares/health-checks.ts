import { logger } from '@gx/core-logger';
import { Request, Response } from 'express';

/**
 * Health check probe types
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
}

export interface HealthCheckOptions {
  /**
   * Custom health checks to run
   */
  checks?: Record<string, HealthCheckFn>;

  /**
   * Threshold for projection lag in milliseconds (for readiness probe)
   * If projection lag exceeds this, service is not ready
   */
  maxProjectionLagMs?: number;

  /**
   * Custom function to get current projection lag
   */
  getProjectionLag?: () => Promise<number>;
}

/**
 * Liveness probe - /healthz
 * 
 * Returns 200 if the service is alive (can handle requests).
 * Should NOT check external dependencies.
 * 
 * Use: Kubernetes liveness probe to restart unhealthy pods
 */
export function healthzHandler() {
  return async (_req: Request, res: Response) => {
    // Basic liveness check - if we can respond, we're alive
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };
}

/**
 * Readiness probe - /readyz
 * 
 * Returns 200 if the service is ready to accept traffic.
 * SHOULD check critical dependencies and projection lag.
 * 
 * Use: Kubernetes readiness probe to route traffic only to ready pods
 */
export function readyzHandler(options: HealthCheckOptions = {}) {
  const {
    checks = {},
    maxProjectionLagMs = 5000, // Default 5 seconds
    getProjectionLag,
  } = options;

  return async (_req: Request, res: Response) => {
    const results: Record<string, HealthCheckResult> = {};
    let isReady = true;

    // Check projection lag (critical for CQRS architecture)
    if (getProjectionLag) {
      try {
        const lagMs = await getProjectionLag();
        const lagHealthy = lagMs < maxProjectionLagMs;

        results.projectionLag = {
          status: lagHealthy ? 'healthy' : 'unhealthy',
          message: lagHealthy
            ? 'Projection lag within acceptable range'
            : 'Projection lag too high',
          details: {
            currentLagMs: lagMs,
            maxLagMs: maxProjectionLagMs,
          },
        };

        if (!lagHealthy) {
          isReady = false;
        }
      } catch (error) {
        logger.error({ error }, 'Failed to check projection lag');
        results.projectionLag = {
          status: 'unhealthy',
          message: 'Failed to check projection lag',
          details: { error: (error as Error).message },
        };
        isReady = false;
      }
    }

    // Run custom health checks
    for (const [name, checkFn] of Object.entries(checks)) {
      try {
        const result = await checkFn();
        results[name] = result;

        if (result.status === 'unhealthy') {
          isReady = false;
        }
      } catch (error) {
        logger.error({ error, checkName: name }, 'Health check failed');
        results[name] = {
          status: 'unhealthy',
          message: `Check threw error: ${(error as Error).message}`,
        };
        isReady = false;
      }
    }

    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: results,
    });
  };
}

/**
 * Example database health check
 */
export function createDatabaseHealthCheck(
  checkFn: () => Promise<boolean>
): HealthCheckFn {
  return async () => {
    try {
      const isHealthy = await checkFn();
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? 'Database connection ok' : 'Database unreachable',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Database check failed: ${(error as Error).message}`,
      };
    }
  };
}

/**
 * Example Redis health check
 */
export function createRedisHealthCheck(
  checkFn: () => Promise<boolean>
): HealthCheckFn {
  return async () => {
    try {
      const isHealthy = await checkFn();
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? 'Redis connection ok' : 'Redis unreachable',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Redis check failed: ${(error as Error).message}`,
      };
    }
  };
}
