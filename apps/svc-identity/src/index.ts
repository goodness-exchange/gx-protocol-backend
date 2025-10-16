import { createApp } from './app';
import { identityConfig } from './config';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';

/**
 * Identity Service - Entry Point
 * 
 * This service handles:
 * - User authentication (JWT)
 * - User registration and profile management
 * - KYC verification workflows
 * - Identity-related CQRS commands
 * 
 * Architecture Pattern: CQRS
 * - Write operations → OutboxCommand table
 * - Read operations → UserProfile table (projected from events)
 */

/**
 * Graceful shutdown handler
 * Ensures clean shutdown of database connections and HTTP server
 */
async function shutdown(signal: string, server: any): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close database connections
  try {
    await db.$disconnect();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connections');
  }

  process.exit(0);
}

/**
 * Application startup
 */
async function start(): Promise<void> {
  try {
    // Validate database connection
    logger.info('Connecting to database...');
    await db.$connect();
    logger.info('Database connected successfully');

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(identityConfig.port, () => {
      logger.info({
        port: identityConfig.port,
        nodeEnv: identityConfig.nodeEnv,
        logLevel: identityConfig.logLevel,
      }, '🚀 Identity Service started successfully');

      logger.info(`
        ╔════════════════════════════════════════╗
        ║   GX Identity Service                  ║
        ║   Port: ${identityConfig.port}                        ║
        ║   Environment: ${identityConfig.nodeEnv.padEnd(23)}║
        ║   Health: http://localhost:${identityConfig.port}/health  ║
        ║   Metrics: http://localhost:${identityConfig.port}/metrics ║
        ╚════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM', server));
    process.on('SIGINT', () => shutdown('SIGINT', server));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start Identity Service');
    process.exit(1);
  }
}

// Start the service
start();