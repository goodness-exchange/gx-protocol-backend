import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '@gx/core-logger';
import { errorHandler, requestLogger, metricsMiddleware } from '@gx/core-http';
import { adminConfig } from './config';
import adminRoutes from './routes/admin.routes';
import adminAuthRoutes from './routes/admin-auth.routes';
import approvalRoutes from './routes/approval.routes';
import deploymentRoutes from './routes/deployment.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { notificationRoutes } from './routes/notification.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): Application {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } } }));
  app.use(cors({ origin: adminConfig.nodeEnv === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use('/', healthRoutes);
  app.use('/api/v1/admin/auth', adminAuthRoutes);
  app.use('/api/v1/admin/approvals', approvalRoutes);
  app.use('/api/v1/admin/deployments', deploymentRoutes);
  app.use('/api/v1/admin/notifications', notificationRoutes);
  app.use('/api/v1/admin/dashboard', dashboardRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found`, path: req.path });
  });
  app.use(errorHandler);
  logger.info('Express application configured successfully');
  return app;
}
