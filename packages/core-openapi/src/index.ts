import fs from 'fs';

import { logger } from '@gx/core-logger';
import { Express, RequestHandler } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import * as yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

/**
 * Configuration options for OpenAPI middleware
 */
export interface OpenApiMiddlewareOptions {
  /**
   * Absolute path to the OpenAPI YAML specification file
   */
  apiSpecPath: string;

  /**
   * Path to serve Swagger UI documentation (default: /api-docs)
   */
  docsPath?: string;

  /**
   * Whether to validate incoming requests (default: true)
   */
  validateRequests?: boolean;

  /**
   * Whether to validate outgoing responses (default: false in production)
   * Useful in development to catch schema drift
   */
  validateResponses?: boolean;

  /**
   * Custom error handler for validation errors
   */
  errorHandler?: RequestHandler;

  /**
   * Whether to serve Swagger UI (default: true, disable in production if needed)
   */
  enableSwaggerUI?: boolean;
}

/**
 * Creates and configures OpenAPI middleware for an Express application.
 *
 * This function performs the following tasks:
 * 1. Loads and parses the OpenAPI YAML specification
 * 2. Sets up Swagger UI to serve interactive API documentation
 * 3. Configures request/response validation to enforce the API contract
 *
 * @param app - The Express application instance
 * @param options - Configuration options for the middleware
 * @throws Error if the spec file cannot be read or parsed
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { applyOpenApiMiddleware } from '@gx/core-openapi';
 * import path from 'path';
 *
 * const app = express();
 * const specPath = path.join(__dirname, 'openapi.yaml');
 *
 * applyOpenApiMiddleware(app, {
 *   apiSpecPath: specPath,
 *   validateRequests: true,
 *   validateResponses: process.env.NODE_ENV === 'development',
 * });
 * ```
 */
export const applyOpenApiMiddleware = (
  app: Express,
  options: OpenApiMiddlewareOptions
): void => {
  const {
    apiSpecPath,
    docsPath = '/api-docs',
    validateRequests = true,
    validateResponses = false,
    enableSwaggerUI = true,
  } = options;

  // 1. Load and parse the OpenAPI specification file
  try {
    if (!fs.existsSync(apiSpecPath)) {
      throw new Error(`OpenAPI spec file not found at: ${apiSpecPath}`);
    }

    const apiSpec = yaml.load(fs.readFileSync(apiSpecPath, 'utf8'));

    logger.info(
      {
        specPath: apiSpecPath,
        docsPath,
        validateRequests,
        validateResponses,
      },
      'Loading OpenAPI specification'
    );

    // 2. Serve the interactive Swagger UI documentation
    if (enableSwaggerUI) {
      app.use(
        docsPath,
        swaggerUi.serve,
        swaggerUi.setup(apiSpec as swaggerUi.JsonObject, {
          customSiteTitle: 'GX Coin Protocol API Documentation',
          customCss: '.swagger-ui .topbar { display: none }',
        })
      );
      logger.info({ docsPath }, 'Swagger UI enabled');
    }

    // 3. Apply the OpenAPI request validator middleware
    app.use(
      OpenApiValidator.middleware({
        apiSpec: apiSpecPath,
        validateRequests,
        validateResponses,
        // Validate security (authentication/authorization)
        validateSecurity: true,
        // Ignore undocumented paths (return 404 instead of validation error)
        ignorePaths: /.*\/health.*/,
      })
    );

    logger.info('OpenAPI validation middleware applied');
  } catch (error) {
    logger.error(
      { error, specPath: apiSpecPath },
      'Failed to load OpenAPI specification'
    );
    throw error;
  }
};

/**
 * Legacy function signature for backward compatibility
 * @deprecated Use applyOpenApiMiddleware with options object instead
 */
export const applyOpenApiMiddlewareSimple = (
  app: Express,
  specPath: string
): void => {
  applyOpenApiMiddleware(app, { apiSpecPath: specPath });
};

// Export schema utilities
export * from './schemas';