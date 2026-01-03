import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

const configSchema = z.object({
  port: z.coerce.number().min(1000).max(65535).default(3008),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().url().startsWith('postgresql://'),
  redisUrl: z.string().url().startsWith('redis://'),
  jwtSecret: z.string().min(32),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  // Fabric configuration
  fabricMspId: z.string().optional(),
  fabricPeerEndpoint: z.string().optional(),
  fabricChannelName: z.string().optional(),
  fabricChaincodeName: z.string().optional(),
  // Multi-sig configuration
  defaultApprovalExpiryHours: z.coerce.number().default(72),
  maxApprovalExpiryHours: z.coerce.number().default(168),
  // External API configuration
  externalApiRateLimitPerMinute: z.coerce.number().default(60),
  webhookTimeoutMs: z.coerce.number().default(10000),
  webhookMaxRetries: z.coerce.number().default(3),
});

export type GovernmentConfig = z.infer<typeof configSchema>;

export const governmentConfig: GovernmentConfig = configSchema.parse({
  port: process.env.GOVERNMENT_SERVICE_PORT || process.env.PORT || 3008,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  // Fabric configuration
  fabricMspId: process.env.FABRIC_MSP_ID,
  fabricPeerEndpoint: process.env.FABRIC_PEER_ENDPOINT,
  fabricChannelName: process.env.FABRIC_CHANNEL_NAME,
  fabricChaincodeName: process.env.FABRIC_CHAINCODE_NAME,
  // Multi-sig configuration
  defaultApprovalExpiryHours: Number(process.env.DEFAULT_APPROVAL_EXPIRY_HOURS) || 72,
  maxApprovalExpiryHours: Number(process.env.MAX_APPROVAL_EXPIRY_HOURS) || 168,
  // External API configuration
  externalApiRateLimitPerMinute: Number(process.env.EXTERNAL_API_RATE_LIMIT) || 60,
  webhookTimeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS) || 10000,
  webhookMaxRetries: Number(process.env.WEBHOOK_MAX_RETRIES) || 3,
});
