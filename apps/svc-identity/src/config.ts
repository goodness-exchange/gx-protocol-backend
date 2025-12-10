import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

/**
 * Configuration schema for the Identity Service
 * 
 * This schema validates all required environment variables using Zod.
 * It provides type-safe access to configuration throughout the service.
 * 
 * @see https://github.com/colinhacks/zod for Zod documentation
 */
const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().min(1000).max(65535).default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  databaseUrl: z.string().url().startsWith('postgresql://'),

  // Redis Configuration
  redisUrl: z.string().url().startsWith('redis://'),

  // JWT Authentication
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('24h'),
  jwtRefreshExpiresIn: z.string().default('7d'),

  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Idempotency
  enableIdempotency: z.coerce.boolean().default(true),
  idempotencyTtlHours: z.coerce.number().default(24),

  // Projection Lag Threshold (for readiness checks)
  projectionLagThresholdMs: z.coerce.number().default(5000),

  // API Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Feature Flags
  // When false, document upload returns mock response (for development without storage)
  documentUploadEnabled: z.coerce.boolean().default(false),

  // Email Configuration (Resend)
  resendApiKey: z.string().optional(),
  emailFromAddress: z.string().email().default('noreply@gxcoin.money'),
  emailFromName: z.string().default('GX Coin'),
  emailEnabled: z.coerce.boolean().default(false),
  appUrl: z.string().url().default('https://app.gxcoin.money'),
});

/**
 * Type-safe configuration object
 */
export type IdentityConfig = z.infer<typeof configSchema>;

/**
 * Validates and exports the configuration
 * 
 * @throws {Error} If required environment variables are missing or invalid
 */
export const identityConfig: IdentityConfig = configSchema.parse({
  port: process.env.IDENTITY_SERVICE_PORT || process.env.PORT || 3001,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRY || '24h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  enableIdempotency: process.env.ENABLE_IDEMPOTENCY !== 'false',
  idempotencyTtlHours: Number(process.env.IDEMPOTENCY_TTL_HOURS) || 24,
  projectionLagThresholdMs: Number(process.env.PROJECTION_LAG_THRESHOLD_MS) || 5000,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  documentUploadEnabled: process.env.DOCUMENT_UPLOAD_ENABLED === 'true',
  // Email Configuration
  resendApiKey: process.env.RESEND_API_KEY,
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@gxcoin.money',
  emailFromName: process.env.EMAIL_FROM_NAME || 'GX Coin',
  emailEnabled: process.env.EMAIL_ENABLED === 'true',
  appUrl: process.env.APP_URL || 'https://app.gxcoin.money',
});
