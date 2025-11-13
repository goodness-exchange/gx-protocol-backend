import { createApp } from './app';
import { taxConfig } from './config';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';

async function shutdown(signal: string, server: any): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  server.close(() => logger.info('HTTP server closed'));
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
    const server = app.listen(taxConfig.port, () => {
      logger.info({ port: taxConfig.port, nodeEnv: taxConfig.nodeEnv }, '🚀 Tax Service started successfully');
      logger.info(`
        ╔════════════════════════════════════════╗
        ║   GX Tax Service                       ║
        ║   Port: ${taxConfig.port}                        ║
        ║   Environment: ${taxConfig.nodeEnv.padEnd(23)}║
        ║   Health: http://localhost:${taxConfig.port}/health  ║
        ║   Metrics: http://localhost:${taxConfig.port}/metrics ║
        ╚════════════════════════════════════════╝
      `);
    });
    process.on('SIGTERM', () => shutdown('SIGTERM', server));
    process.on('SIGINT', () => shutdown('SIGINT', server));
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start Tax Service');
    process.exit(1);
  }
}

start();
