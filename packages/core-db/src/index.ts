import { config } from '@gx/core-config';
import { logger } from '@gx/core-logger';
import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the Prisma client instance.
// This prevents creating new connections on every hot reload in development.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Configure Prisma client options with explicit typing
interface PrismaLogConfig {
  emit: 'event';
  level: 'query' | 'info' | 'warn' | 'error';
}

const prismaOptions: {
  log?: PrismaLogConfig[];
} = {};

// Enable query logging in development based on the log level.
if (config.NODE_ENV === 'development') {
  prismaOptions.log = [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ];
}

const prisma = globalThis.prisma ?? new PrismaClient(prismaOptions);

if (config.NODE_ENV === 'development') {
  // Event handlers for logging - types are inferred from Prisma
  prisma.$on('query' as never, (e: unknown) => logger.trace(e, 'Prisma query'));
  prisma.$on('info' as never, (e: unknown) => logger.info(e, 'Prisma info'));
  prisma.$on('warn' as never, (e: unknown) => logger.warn(e, 'Prisma warning'));
  prisma.$on('error' as never, (e: unknown) => logger.error(e, 'Prisma error'));
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * The singleton, pre-configured Prisma Client instance.
 *
 * This client is configured with structured logging that integrates
 * with the application's core logger.
 */
export const db = prisma;

// Also export all Prisma types for convenience
export * from '@prisma/client';