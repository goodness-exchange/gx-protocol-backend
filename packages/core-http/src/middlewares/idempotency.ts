import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { logger } from '@gx/core-logger';

/**
 * Idempotency middleware for write operations (POST, PUT, PATCH, DELETE).
 * Requires clients to send an X-Idempotency-Key header.
 * 
 * How it works:
 * 1. Client sends X-Idempotency-Key header with a unique key (UUID recommended)
 * 2. First request: Process normally, store response in idempotency store
 * 3. Duplicate request: Return cached response immediately
 * 
 * Storage is delegated to a store implementation (in-memory, Redis, or database).
 */

export interface IdempotencyStore {
  /**
   * Get a cached response for an idempotency key
   */
  get(key: string): Promise<CachedResponse | null>;

  /**
   * Store a response for an idempotency key
   */
  set(key: string, response: CachedResponse, ttlSeconds: number): Promise<void>;
}

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

export interface IdempotencyOptions {
  /**
   * Storage backend for idempotency keys
   */
  store: IdempotencyStore;

  /**
   * TTL for idempotency keys in seconds (default: 24 hours)
   */
  ttl?: number;

  /**
   * HTTP methods to apply idempotency to (default: POST, PUT, PATCH, DELETE)
   */
  methods?: string[];

  /**
   * Whether to require idempotency key (default: true)
   * If false, requests without the header will proceed normally
   */
  required?: boolean;

  /**
   * Custom header name (default: X-Idempotency-Key)
   */
  headerName?: string;
}

/**
 * Create an idempotency middleware
 */
export function idempotencyMiddleware(options: IdempotencyOptions) {
  const {
    store,
    ttl = 86400, // 24 hours default
    methods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    required = true,
    headerName = 'X-Idempotency-Key',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only apply to specified HTTP methods
    if (!methods.includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.header(headerName);

    // If no key provided
    if (!idempotencyKey) {
      if (required) {
        return res.status(400).json({
          error: {
            message: `${headerName} header is required for ${req.method} requests`,
            statusCode: 400,
          },
        });
      }
      return next(); // Proceed without idempotency
    }

    // Validate key format (should be UUID or similar)
    if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return res.status(400).json({
        error: {
          message: `${headerName} must be between 16 and 128 characters`,
          statusCode: 400,
        },
      });
    }

    // Create a composite key including tenant, method, path, and body hash
    const tenantId = (req as any).tenantId || 'default'; // Tenant from auth middleware
    const bodyHash = createHash('sha256')
      .update(JSON.stringify(req.body || {}))
      .digest('hex')
      .substring(0, 16);

    const compositeKey = `${tenantId}:${req.method}:${req.path}:${bodyHash}:${idempotencyKey}`;

    try {
      // Check if we've seen this request before
      const cached = await store.get(compositeKey);

      if (cached) {
        logger.info(
          {
            idempotencyKey,
            method: req.method,
            path: req.path,
            statusCode: cached.statusCode,
          },
          'Returning cached response for idempotent request'
        );

        // Return the cached response
        res.status(cached.statusCode);
        if (cached.headers) {
          Object.entries(cached.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return res.json(cached.body);
      }

      // Intercept the response to cache it
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      let responseBody: any;

      // Override res.json
      res.json = function (body: any) {
        responseBody = body;
        return originalJson(body);
      } as any;

      // Override res.send
      res.send = function (body: any) {
        responseBody = body;
        return originalSend(body);
      } as any;

      // Hook into response finish event
      res.on('finish', async () => {
        // Only cache successful responses (2xx and 3xx)
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const cacheEntry: CachedResponse = {
            statusCode: res.statusCode,
            headers: {
              'content-type': res.getHeader('content-type') as string,
            },
            body: responseBody,
          };

          try {
            await store.set(compositeKey, cacheEntry, ttl);
            logger.debug(
              {
                idempotencyKey,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
              },
              'Cached response for idempotent request'
            );
          } catch (error) {
            logger.error(
              { error, idempotencyKey },
              'Failed to cache idempotent response'
            );
            // Don't fail the request if caching fails
          }
        }
      });

      next();
    } catch (error) {
      logger.error({ error, idempotencyKey }, 'Idempotency middleware error');
      // On error, proceed without idempotency to avoid blocking requests
      next();
    }
  };
}

/**
 * In-memory idempotency store (for development/testing only)
 * For production, use Redis or database-backed store
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, { data: CachedResponse; expiresAt: number }>();

  async get(key: string): Promise<CachedResponse | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(
    key: string,
    response: CachedResponse,
    ttlSeconds: number
  ): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { data: response, expiresAt });

    // Cleanup expired entries periodically
    if (this.cache.size % 100 === 0) {
      this.cleanup();
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
