import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

/**
 * Health Check Routes
 *
 * These endpoints are used by orchestrators (Kubernetes, Docker Swarm, etc.)
 * to determine service health and readiness.
 *
 * - /health: Basic health check (always returns 200 if service is running)
 * - /readyz: Readiness probe (checks dependencies like DB, Redis, projection lag)
 * - /livez: Liveness probe (checks if service is alive and responding)
 */

const router = Router();

/**
 * GET /health
 * Basic health check endpoint
 * Returns 200 if the service is running
 */
router.get('/health', healthController.health);

/**
 * GET /readyz
 * Readiness probe endpoint
 * Returns 200 if service is ready to accept traffic
 * Returns 503 if service is not ready (DB down, projection lag too high, etc.)
 */
router.get('/readyz', healthController.readiness);

/**
 * GET /livez
 * Liveness probe endpoint
 * Returns 200 if service is alive
 * Returns 503 if service should be restarted
 */
router.get('/livez', healthController.liveness);

export default router;
