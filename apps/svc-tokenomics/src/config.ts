import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().min(1000).max(65535).default(3002),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  databaseUrl: z.string().url().startsWith('postgresql://'),

  // Redis Configuration
  redisUrl: z.string().url().startsWith('redis://'),

  // JWT Authentication
  jwtSecret: z.string().min(32),

  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Projection Lag Threshold
  projectionLagThresholdMs: z.coerce.number().default(5000),
});

export type TokenomicsConfig = z.infer<typeof configSchema>;

export const tokenomicsConfig: TokenomicsConfig = configSchema.parse({
  port: process.env.TOKENOMICS_SERVICE_PORT || process.env.PORT || 3002,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  projectionLagThresholdMs: Number(process.env.PROJECTION_LAG_THRESHOLD_MS) || 5000,
});
