import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file variables into process.env
// This should be done before any other code reads from process.env
dotenv.config();

/**
 * Defines the schema for all environment variables used in the application.
 * Zod will validate process.env against this schema.
 */
const envSchema = z.object({
    // variable for the logger
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

    // Infrastructure URLs
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Service Ports
    // process.env values are strings, so we coerce them to numbers
    IDENTITY_SERVICE_PORT: z.coerce.number().int().positive(),
    TOKENOMICS_SERVICE_PORT: z.coerce.number().int().positive(),

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