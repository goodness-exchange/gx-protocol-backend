import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

const configSchema = z.object({
  port: z.coerce.number().min(1000).max(65535).default(3006),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().url().startsWith('postgresql://'),
  redisUrl: z.string().url().startsWith('redis://'),
  jwtSecret: z.string().min(32),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  projectionLagThresholdMs: z.coerce.number().default(5000),
  // Email configuration
  resendApiKey: z.string().optional(),
  emailEnabled: z.boolean().default(false),
  emailFromAddress: z.string().email().default('noreply@gxcoin.money'),
  emailFromName: z.string().default('GX Coin Admin'),
  adminDashboardUrl: z.string().url().default('https://admin.gxcoin.money'),
  // Webhook configuration
  webhookTimeoutMs: z.coerce.number().default(10000),
  webhookMaxRetries: z.coerce.number().default(3),
});

export type AdminConfig = z.infer<typeof configSchema>;

export const adminConfig: AdminConfig = configSchema.parse({
  port: process.env.ADMIN_SERVICE_PORT || process.env.PORT || 3006,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  projectionLagThresholdMs: Number(process.env.PROJECTION_LAG_THRESHOLD_MS) || 5000,
  // Email configuration
  resendApiKey: process.env.RESEND_API_KEY,
  emailEnabled: process.env.EMAIL_ENABLED === 'true',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@gxcoin.money',
  emailFromName: process.env.EMAIL_FROM_NAME || 'GX Coin Admin',
  adminDashboardUrl: process.env.ADMIN_DASHBOARD_URL || 'https://admin.gxcoin.money',
  // Webhook configuration
  webhookTimeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS) || 10000,
  webhookMaxRetries: Number(process.env.WEBHOOK_MAX_RETRIES) || 3,
});
