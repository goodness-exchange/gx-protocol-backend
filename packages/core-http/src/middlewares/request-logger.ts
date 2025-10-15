import { logger } from '@gx/core-logger';
import pinoHttp from 'pino-http';

/**
 * Creates a request logging middleware using pino-http.
 * It uses the existing application logger instance for consistency.
 */
export const requestLogger = pinoHttp({
  logger: logger as any, // Type assertion needed due to pino-http type constraints

  // Customize log messages based on response status
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },

  // Serialize request and response for better logging
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // Include query params and headers selectively
      query: req.query,
      // Don't log sensitive headers like authorization
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});