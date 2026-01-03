import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '@gx/core-logger';
import { errorHandler, requestLogger, metricsMiddleware } from '@gx/core-http';
import { governmentConfig } from './config';
import {
  healthRoutes,
  treasuryRoutes,
  administratorRoutes,
  accountRoutes,
  signatoryRoutes,
  fundRoutes,
} from './routes';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin:
        governmentConfig.nodeEnv === 'production'
          ? process.env.ALLOWED_ORIGINS?.split(',')
          : '*',
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging and metrics
  app.use(requestLogger);
  app.use(metricsMiddleware);

  // Routes
  app.use('/', healthRoutes);
  app.use('/api/v1/government/treasury', treasuryRoutes);
  app.use('/api/v1/government/administrators', administratorRoutes);
  app.use('/api/v1/government/accounts', accountRoutes);
  app.use('/api/v1/government/signatory', signatoryRoutes);
  app.use('/api/v1/government/funds', fundRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });

  // Error handler
  app.use(errorHandler);

  logger.info('Government service Express application configured successfully');

  return app;
}
