import { createApp } from './app';
import { governanceConfig } from './config';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';

async function shutdown(signal: string, server: any): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    await db.$disconnect();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connections');
  }

  process.exit(0);
}

async function start(): Promise<void> {
  try {
    logger.info('Connecting to database...');
    await db.$connect();
    logger.info('Database connected successfully');

    const app = createApp();

    const server = app.listen(governanceConfig.port, () => {
      logger.info({
        port: governanceConfig.port,
        nodeEnv: governanceConfig.nodeEnv,
        logLevel: governanceConfig.logLevel,
      }, '🚀 Governance Service started successfully');

      logger.info(`
        ╔════════════════════════════════════════╗
        ║   GX Governance Service                ║
        ║   Port: ${governanceConfig.port}                        ║
        ║   Environment: ${governanceConfig.nodeEnv.padEnd(23)}║
        ║   Health: http://localhost:${governanceConfig.port}/health  ║
        ║   Metrics: http://localhost:${governanceConfig.port}/metrics ║
        ╚════════════════════════════════════════╝
      `);
    });

    process.on('SIGTERM', () => shutdown('SIGTERM', server));
    process.on('SIGINT', () => shutdown('SIGINT', server));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start Governance Service');
    process.exit(1);
  }
}

start();
