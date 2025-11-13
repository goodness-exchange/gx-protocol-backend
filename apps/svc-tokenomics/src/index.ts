import { createApp } from './app';
import { tokenomicsConfig } from './config';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';

/**
 * Tokenomics Service - Entry Point
 *
 * This service handles:
 * - Token transfers between users
 * - Genesis allocation distribution
 * - Wallet balance queries
 * - Treasury balance management
 * - Transaction history
 * - Wallet freeze/unfreeze operations (admin)
 *
 * Architecture Pattern: CQRS
 * - Write operations → OutboxCommand table
 * - Read operations → Wallet/Transaction tables (projected from events)
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
    const server = app.listen(tokenomicsConfig.port, () => {
      logger.info({
        port: tokenomicsConfig.port,
        nodeEnv: tokenomicsConfig.nodeEnv,
        logLevel: tokenomicsConfig.logLevel,
      }, '🚀 Tokenomics Service started successfully');

      logger.info(`
        ╔════════════════════════════════════════╗
        ║   GX Tokenomics Service                ║
        ║   Port: ${tokenomicsConfig.port}                        ║
        ║   Environment: ${tokenomicsConfig.nodeEnv.padEnd(23)}║
        ║   Health: http://localhost:${tokenomicsConfig.port}/health  ║
        ║   Metrics: http://localhost:${tokenomicsConfig.port}/metrics ║
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
    logger.error({ error }, 'Failed to start Tokenomics Service');
    process.exit(1);
  }
}

// Start the service
start();
