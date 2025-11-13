import promMiddleware from 'express-prometheus-middleware';

/**
 * Prometheus metrics middleware configuration.
 * 
 * Exposes /metrics endpoint for Prometheus scraping.
 * Automatically tracks:
 * - HTTP request duration (histogram)
 * - HTTP request count (counter)
 * - In-flight requests (gauge)
 * 
 * Metrics include labels: method, route, status_code
 */

export interface MetricsOptions {
  /**
   * Path to expose metrics (default: /metrics)
   */
  metricsPath?: string;

  /**
   * Whether to collect default Node.js metrics (default: true)
   */
  collectDefaultMetrics?: boolean;

  /**
   * Prefix for metric names (default: http_)
   */
  prefix?: string;
}

/**
 * Create Prometheus metrics middleware
 */
export function createMetricsMiddleware(options: MetricsOptions = {}) {
  const {
    metricsPath = '/metrics',
    collectDefaultMetrics = true,
    prefix = 'http_',
  } = options;

  return promMiddleware({
    metricsPath,
    collectDefaultMetrics,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10], // seconds
    requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400], // bytes
    responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400], // bytes
    prefix,
    customLabels: [], // Must be an array, even if empty
    
    // Normalize paths to avoid high cardinality
    // e.g., /api/v1/users/123 -> /api/v1/users/:id
    normalizePath: [
      ['/api/v1/users/:id', '/api/v1/users/#ID'],
      ['/api/v1/wallets/:id', '/api/v1/wallets/#ID'],
      ['/api/v1/transactions/:id', '/api/v1/transactions/#ID'],
    ],
  });
}

/**
 * Default metrics middleware with sensible defaults
 */
export const metricsMiddleware = createMetricsMiddleware();
