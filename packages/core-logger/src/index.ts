import pino from 'pino';
import { config } from '@gxc/core-config';

/**
 * Configuration for the Pino logger.
 * In development, we use 'pino-pretty' for human-readable, colorful logs.
 * In production, we output structured JSON logs for machine parsing.
 */
const loggerOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
};

if (config.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  };
}

/**
 * The singleton logger instance for the entire application.
 *
 * It is pre-configured based on the environment.
 *
 * @example
 * import { logger } from '@gxc/core-logger';
 * logger.info('This is an informational message.');
 * logger.error({ err: new Error('Something failed') }, 'An error occurred.');
 */
export const logger = pino(loggerOptions);