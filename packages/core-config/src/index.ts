import dotenv from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Try to load .env from multiple possible locations
const possibleEnvPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
];

for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`[core-config] Loaded environment from: ${envPath}`);
      break;
    }
  }
}

/**
 * Defines the schema for all environment variables used in the application.
 * Zod will validate process.env against this schema.
 */
const envSchema = z.object({
    // variable for the logger
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

    // Infrastructure URLs
    // Use .string() instead of .url() to support PostgreSQL/Redis connection strings
    // which may contain special characters that don't pass strict URL validation
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    // Service Ports
    // process.env values are strings, so we coerce them to numbers
    IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(3001),
    TOKENOMICS_SERVICE_PORT: z.coerce.number().int().positive().default(3002),

    // Security
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
});

/**
 * A type-safe, validated configuration object.
 *
 * This object is derived from parsing `process.env` with our schema.
 * If any environment variables are missing or invalid, the `parse` method
 * will throw an error, preventing the application from starting with a
 * bad configuration.
 */
export const config = envSchema.parse(process.env);

// We can also export the inferred type if needed elsewhere
export type AppConfig = z.infer<typeof envSchema>;