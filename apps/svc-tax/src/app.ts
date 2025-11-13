import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '@gx/core-logger';
import { errorHandler, requestLogger, metricsMiddleware } from '@gx/core-http';
import { taxConfig } from './config';
import taxRoutes from './routes/tax.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): Application {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } } }));
  app.use(cors({ origin: taxConfig.nodeEnv === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use('/', healthRoutes);
  app.use('/api/v1', taxRoutes);
  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found`, path: req.path });
  });
  app.use(errorHandler);
  logger.info('Express application configured successfully');
  return app;
}
