/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting to protect against DoS attacks and abuse.
 * Uses in-memory store for simplicity (can be upgraded to Redis for distributed systems).
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Maximum number of requests allowed per window
   * @default 100
   */
  maxRequests?: number;

  /**
   * Message to send when rate limit is exceeded
   * @default "Too many requests, please try again later."
   */
  message?: string;

  /**
   * HTTP status code to send when rate limit is exceeded
   * @default 429
   */
  statusCode?: number;

  /**
   * Key generator function to identify unique clients
   * @default Uses IP address (req.ip)
   */
  keyGenerator?: (req: Request) => string;

  /**
   * Skip function to bypass rate limiting for certain requests
   * @default undefined (no skipping)
   */
  skip?: (req: Request) => boolean;

  /**
   * Handler function called when rate limit is exceeded
   * @default undefined (uses default response)
   */
  handler?: (req: Request, res: Response) => void;

  /**
   * Whether to include rate limit info in response headers
   * @default true
   */
  standardHeaders?: boolean;

  /**
   * Whether to include legacy X-RateLimit headers
   * @default false
   */
  legacyHeaders?: boolean;
}

/**
 * Client request tracking record
 */
interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * In-memory store for rate limit tracking
 */
class RateLimitStore {
  private store: Map<string, ClientRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private windowMs: number) {
    // Clean up expired records every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Increment request count for a client
   */
  increment(key: string): { count: number; resetTime: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      // Create new record or reset expired record
      const newRecord: ClientRecord = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.store.set(key, newRecord);
      return newRecord;
    }

    // Increment existing record
    record.count++;
    this.store.set(key, record);
    return record;
  }

  /**
   * Get current count for a client
   */
  get(key: string): ClientRecord | undefined {
    const record = this.store.get(key);
    if (!record) {
      return undefined;
    }

    const now = Date.now();
    if (now > record.resetTime) {
      this.store.delete(key);
      return undefined;
    }

    return record;
  }

  /**
   * Reset count for a client
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clean up expired records
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.store.delete(key));

    if (keysToDelete.length > 0) {
      logger.debug(
        { cleanedRecords: keysToDelete.length },
        'Rate limit store cleanup completed'
      );
    }
  }

  /**
   * Destroy the store and clear cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }

  /**
   * Get total number of tracked clients
   */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Default key generator using IP address
 */
const defaultKeyGenerator = (req: Request): string => {
  // Try to get real IP from proxy headers first
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * Create rate limiting middleware
 *
 * @param config - Rate limit configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createRateLimitMiddleware } from '@gx/core-http';
 *
 * // Basic rate limiting (100 requests per minute)
 * const limiter = createRateLimitMiddleware();
 * app.use('/api', limiter);
 *
 * // Strict rate limiting for login endpoint (5 requests per minute)
 * const loginLimiter = createRateLimitMiddleware({
 *   windowMs: 60000,
 *   maxRequests: 5,
 *   message: 'Too many login attempts, please try again later.',
 * });
 * app.post('/api/auth/login', loginLimiter, loginHandler);
 *
 * // Custom key generator (by user ID)
 * const userLimiter = createRateLimitMiddleware({
 *   keyGenerator: (req) => req.user?.profileId || req.ip,
 * });
 * ```
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 100,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    keyGenerator = defaultKeyGenerator,
    skip,
    handler,
    standardHeaders = true,
    legacyHeaders = false,
  } = config;

  const store = new RateLimitStore(windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting if skip function returns true
    if (skip && skip(req)) {
      return next();
    }

    // Generate unique key for this client
    const key = keyGenerator(req);

    // Increment request count
    const { count, resetTime } = store.increment(key);

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, maxRequests - count);
    const resetTimeSeconds = Math.ceil(resetTime / 1000);

    // Add standard rate limit headers
    if (standardHeaders) {
      res.setHeader('RateLimit-Limit', maxRequests.toString());
      res.setHeader('RateLimit-Remaining', remaining.toString());
      res.setHeader('RateLimit-Reset', resetTimeSeconds.toString());
    }

    // Add legacy X-RateLimit headers
    if (legacyHeaders) {
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());
    }

    // Check if rate limit exceeded
    if (count > maxRequests) {
      logger.warn(
        {
          key,
          count,
          maxRequests,
          windowMs,
          ip: req.ip,
          path: req.path,
          method: req.method,
        },
        'Rate limit exceeded'
      );

      // Add Retry-After header
      const retryAfterSeconds = Math.ceil((resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds.toString());

      // Use custom handler if provided
      if (handler) {
        return handler(req, res);
      }

      // Default response
      res.status(statusCode).json({
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // Log rate limit info for monitoring
    if (count % 10 === 0) {
      logger.debug(
        {
          key,
          count,
          remaining,
          resetTime: new Date(resetTime).toISOString(),
        },
        'Rate limit status'
      );
    }

    next();
  };
}

/**
 * Pre-configured strict rate limiter for authentication endpoints
 * 5 requests per minute per IP
 */
export const strictRateLimiter = createRateLimitMiddleware({
  windowMs: 60000, // 1 minute
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again later.',
});

/**
 * Pre-configured moderate rate limiter for public API endpoints
 * 60 requests per minute per IP
 */
export const moderateRateLimiter = createRateLimitMiddleware({
  windowMs: 60000, // 1 minute
  maxRequests: 60,
  message: 'Too many requests, please try again later.',
});

/**
 * Pre-configured lenient rate limiter for authenticated endpoints
 * 200 requests per minute per user
 */
export const lenientRateLimiter = createRateLimitMiddleware({
  windowMs: 60000, // 1 minute
  maxRequests: 200,
  message: 'Request quota exceeded, please try again later.',
  keyGenerator: (req: any) => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user?.profileId || defaultKeyGenerator(req);
  },
});
