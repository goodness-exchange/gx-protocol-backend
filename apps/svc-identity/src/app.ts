import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '@gx/core-logger';
import { 
  errorHandler, 
  requestLogger, 
  metricsMiddleware 
} from '@gx/core-http';
import { identityConfig } from './config';

// Route imports
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import healthRoutes from './routes/health.routes';
import registrationRoutes from './routes/registration.routes';
import adminRoutes from './routes/admin.routes';
import documentsRoutes from './routes/documents.routes';
import validationRoutes from './routes/validation.routes';
import walletRoutes from './routes/wallet.routes';
import beneficiariesRoutes from './routes/beneficiaries.routes';
import transfersRoutes from './routes/transfers.routes';
import notificationsRoutes from './routes/notifications.routes';
import relationshipsRoutes from './routes/relationships.routes';
import qsendRoutes from './routes/qsend.routes';
// Phase 1: Enhanced wallet features
import contextRoutes from './routes/context.routes';
import subaccountsRoutes from './routes/subaccounts.routes';
import categoriesRoutes from './routes/categories.routes';
import tagsRoutes from './routes/tags.routes';
import analyticsRoutes from './routes/analytics.routes';
// Phase 2: Personal Finance Features
import budgetsRoutes from './routes/budgets.routes';
import goalsRoutes from './routes/goals.routes';
import allocationRulesRoutes from './routes/allocation-rules.routes';
// Phase 3: Business & Enterprise Features
import businessRoutes from './routes/business.routes';
// Phase 4: Government & NPO Accounts
import entityAccountsRoutes from './routes/entity-accounts.routes';

/**
 * Creates and configures the Express application
 * 
 * This function sets up:
 * - Security middleware (Helmet)
 * - CORS configuration
 * - Request logging (Pino)
 * - Prometheus metrics
 * - API routes
 * - Error handling
 * 
 * @returns Configured Express application
 */
export function createApp(): Application {
  const app = express();

  // ============================================
  // Security Middleware
  // ============================================
  
  /**
   * Helmet helps secure Express apps by setting HTTP response headers
   * @see https://helmetjs.github.io/
   */
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }));

  /**
   * CORS configuration for cross-origin requests
   * In production, restrict this to specific origins
   */
  app.use(cors({
    origin: identityConfig.nodeEnv === 'production' 
      ? process.env.ALLOWED_ORIGINS?.split(',') 
      : '*',
    credentials: true,
  }));

  // ============================================
  // Body Parsing Middleware
  // ============================================
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ============================================
  // Observability Middleware
  // ============================================
  
  /**
   * Request logging with Pino
   * Logs all incoming requests with correlation IDs
   */
  app.use(requestLogger);

  /**
   * Prometheus metrics collection
   * Exposes /metrics endpoint for scraping
   */
  app.use(metricsMiddleware);

  // ============================================
  // Health Check Routes (before authentication)
  // ============================================
  
  app.use('/', healthRoutes);

  // ============================================
  // API Routes
  // ============================================

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/registration', registrationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1', documentsRoutes);
  app.use('/api/v1/validation', validationRoutes);
  app.use('/api/v1/wallets', walletRoutes);
  app.use('/api/v1/beneficiaries', beneficiariesRoutes);
  app.use('/api/v1/transfers', transfersRoutes);
  app.use('/api/v1/commands', transfersRoutes); // Alias for command status polling
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/relationships', relationshipsRoutes);
  app.use('/api/v1/qsend', qsendRoutes);

  // Phase 1: Enhanced wallet features
  app.use('/api/v1/contexts', contextRoutes);
  app.use('/api/v1', subaccountsRoutes);  // Mounts at /api/v1/sub-accounts, /api/v1/wallets/:id/sub-accounts, etc.
  app.use('/api/v1/categories', categoriesRoutes);
  app.use('/api/v1', tagsRoutes);  // Mounts at /api/v1/transactions/:id/tags, /api/v1/tags/:id
  app.use('/api/v1/analytics', analyticsRoutes);

  // Phase 2: Personal Finance Features
  app.use('/api/v1/budgets', budgetsRoutes);
  app.use('/api/v1', goalsRoutes);  // Mounts at /api/v1/wallets/:id/goals, /api/v1/sub-accounts/:id/goal
  app.use('/api/v1', allocationRulesRoutes);  // Mounts at /api/v1/allocation-rules, /api/v1/wallets/:id/allocate

  // Phase 3: Business & Enterprise Features
  app.use('/api/v1', businessRoutes);  // Mounts at /api/v1/business-accounts/:id/*, /api/v1/employees/:id, etc.

  // Phase 4: Government & NPO Accounts
  app.use('/api/v1', entityAccountsRoutes);  // Mounts at /api/v1/government-accounts/:id/*, /api/v1/npo-accounts/:id/*

  // Legacy alias for frontend compatibility (api/gxcoin -> api/v1)
  app.use('/api/gxcoin/relationships', relationshipsRoutes);

  // ============================================
  // 404 Handler
  // ============================================
  
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });

  // ============================================
  // Error Handler (must be last)
  // ============================================
  
  /**
   * Centralized error handling middleware
   * Catches all errors and returns appropriate responses
   */
  app.use(errorHandler);

  logger.info('Express application configured successfully');

  return app;
}
