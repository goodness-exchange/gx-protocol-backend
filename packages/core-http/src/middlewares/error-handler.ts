import { Request, Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';

interface HttpError extends Error {
  statusCode?: number;
}

/**
 * A centralized Express error handler middleware.
 * It catches all errors, logs them, and sends a standardized
 * JSON error response to the client.
 */
export const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction // Prefix with underscore to indicate intentionally unused
) => {
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal Server Error';

  // Log the full error, especially for 500s
  logger.error(
    {
      err,
      statusCode,
      path: req.path,
      method: req.method,
    },
    'An error occurred in the HTTP request pipeline'
  );

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
    },
  });
};