import { z } from 'zod';
import { config as dotenvConfig } from '@gx/core-config';

/**
 * Configuration schema for the Messaging Service
 *
 * This schema validates all required environment variables using Zod.
 * It provides type-safe access to configuration throughout the service.
 */
const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().min(1000).max(65535).default(3007),
  wsPort: z.coerce.number().min(1000).max(65535).default(3008),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  databaseUrl: z.string().url().startsWith('postgresql://'),

  // Redis Configuration (for Socket.io adapter and presence)
  redisUrl: z.string().url().startsWith('redis://'),

  // JWT Authentication (shared with identity service)
  jwtSecret: z.string().min(32),

  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Voice Message Storage (S3)
  s3BucketVoice: z.string().default('gx-voice-messages'),
  s3Region: z.string().default('us-east-1'),
  s3Endpoint: z.string().optional(), // Custom S3 endpoint for MinIO/Wasabi/etc
  s3ForcePathStyle: z.coerce.boolean().default(false), // Required for MinIO
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),

  // Voice Message Limits
  maxVoiceDurationMs: z.coerce.number().min(1000).max(300000).default(60000), // 60 seconds
  maxVoiceFileSizeMb: z.coerce.number().min(1).max(50).default(10),

  // Group Chat Limits
  maxGroupParticipants: z.coerce.number().min(2).max(500).default(100),

  // Message Limits
  maxMessageSizeBytes: z.coerce.number().min(1000).max(1000000).default(65536), // 64KB

  // Master Key Configuration
  masterKeyEnabled: z.coerce.boolean().default(true),
  masterKeyHsmUrl: z.string().url().optional(),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(60 * 1000), // 1 minute
  rateLimitMaxMessages: z.coerce.number().default(60), // 60 messages per minute
  rateLimitMaxKeyRequests: z.coerce.number().default(10), // 10 key requests per minute

  // WebSocket Configuration
  wsHeartbeatIntervalMs: z.coerce.number().default(25000),
  wsHeartbeatTimeoutMs: z.coerce.number().default(60000),

  // Feature Flags
  voiceMessagesEnabled: z.coerce.boolean().default(true),
  groupMessagesEnabled: z.coerce.boolean().default(true),
  typingIndicatorsEnabled: z.coerce.boolean().default(true),
  readReceiptsEnabled: z.coerce.boolean().default(true),

  // CORS
  allowedOrigins: z.string().default('*'),
});

/**
 * Type-safe configuration object
 */
export type MessagingConfig = z.infer<typeof configSchema>;

/**
 * Validates and exports the configuration
 *
 * @throws {Error} If required environment variables are missing or invalid
 */
export const messagingConfig: MessagingConfig = configSchema.parse({
  port: process.env.MESSAGING_SERVICE_PORT || process.env.PORT || 3007,
  wsPort: process.env.WEBSOCKET_PORT || 3008,
  nodeEnv: dotenvConfig.NODE_ENV || process.env.NODE_ENV || 'development',
  databaseUrl: dotenvConfig.DATABASE_URL || process.env.DATABASE_URL,
  redisUrl: dotenvConfig.REDIS_URL || process.env.REDIS_URL,
  jwtSecret: dotenvConfig.JWT_SECRET || process.env.JWT_SECRET,
  logLevel: dotenvConfig.LOG_LEVEL || process.env.LOG_LEVEL || 'info',

  // S3 Configuration
  s3BucketVoice: process.env.S3_BUCKET_VOICE || 'gx-voice-messages',
  s3Region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

  // Limits
  maxVoiceDurationMs: Number(process.env.MAX_VOICE_DURATION_MS) || 60000,
  maxVoiceFileSizeMb: Number(process.env.MAX_VOICE_FILE_SIZE_MB) || 10,
  maxGroupParticipants: Number(process.env.MAX_GROUP_PARTICIPANTS) || 100,
  maxMessageSizeBytes: Number(process.env.MAX_MESSAGE_SIZE_BYTES) || 65536,

  // Master Key
  masterKeyEnabled: process.env.MASTER_KEY_ENABLED !== 'false',
  masterKeyHsmUrl: process.env.MASTER_KEY_HSM_URL,

  // Rate Limiting
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  rateLimitMaxMessages: Number(process.env.RATE_LIMIT_MAX_MESSAGES) || 60,
  rateLimitMaxKeyRequests: Number(process.env.RATE_LIMIT_MAX_KEY_REQUESTS) || 10,

  // WebSocket
  wsHeartbeatIntervalMs: Number(process.env.WS_HEARTBEAT_INTERVAL_MS) || 25000,
  wsHeartbeatTimeoutMs: Number(process.env.WS_HEARTBEAT_TIMEOUT_MS) || 60000,

  // Feature Flags
  voiceMessagesEnabled: process.env.VOICE_MESSAGES_ENABLED !== 'false',
  groupMessagesEnabled: process.env.GROUP_MESSAGES_ENABLED !== 'false',
  typingIndicatorsEnabled: process.env.TYPING_INDICATORS_ENABLED !== 'false',
  readReceiptsEnabled: process.env.READ_RECEIPTS_ENABLED !== 'false',

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
});
