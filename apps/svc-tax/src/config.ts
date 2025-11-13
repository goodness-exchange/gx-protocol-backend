import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

const configSchema = z.object({
  port: z.coerce.number().min(1000).max(65535).default(3007),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().url().startsWith('postgresql://'),
  redisUrl: z.string().url().startsWith('redis://'),
  jwtSecret: z.string().min(32),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  projectionLagThresholdMs: z.coerce.number().default(5000),
});

export type TaxConfig = z.infer<typeof configSchema>;

export const taxConfig: TaxConfig = configSchema.parse({
  port: process.env.TAX_SERVICE_PORT || process.env.PORT || 3007,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  projectionLagThresholdMs: Number(process.env.PROJECTION_LAG_THRESHOLD_MS) || 5000,
});
