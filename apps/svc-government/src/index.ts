import { createApp } from './app';
import { governmentConfig } from './config';
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

    const server = app.listen(governmentConfig.port, () => {
      logger.info(
        { port: governmentConfig.port, nodeEnv: governmentConfig.nodeEnv },
        'Government Service started successfully'
      );
      logger.info(`
        ╔════════════════════════════════════════════╗
        ║   GX Government Service                    ║
        ║   Port: ${governmentConfig.port}                            ║
        ║   Environment: ${governmentConfig.nodeEnv.padEnd(27)}║
        ║   Health: http://localhost:${governmentConfig.port}/health      ║
        ║   Metrics: http://localhost:${governmentConfig.port}/metrics     ║
        ╚════════════════════════════════════════════╝
      `);
    });

    process.on('SIGTERM', () => shutdown('SIGTERM', server));
    process.on('SIGINT', () => shutdown('SIGINT', server));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start Government Service');
    process.exit(1);
  }
}

start();
