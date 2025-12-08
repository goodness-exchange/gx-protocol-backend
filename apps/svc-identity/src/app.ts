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
