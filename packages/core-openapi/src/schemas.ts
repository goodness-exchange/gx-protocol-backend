/**
 * Common OpenAPI schema definitions and builders
 * 
 * These utilities help create consistent API schemas across all services
 */

/**
 * Standard error response schema
 */
export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['message', 'statusCode'],
      properties: {
        message: {
          type: 'string',
          description: 'Human-readable error message',
        },
        statusCode: {
          type: 'integer',
          description: 'HTTP status code',
        },
        code: {
          type: 'string',
          description: 'Machine-readable error code (optional)',
        },
        details: {
          type: 'object',
          description: 'Additional error details (optional)',
        },
      },
    },
  },
};

/**
 * Pagination query parameters schema
 */
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
      description: 'Page number (1-indexed)',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Number of items per page',
    },
    sort: {
      type: 'string',
      description: 'Sort field (e.g., "createdAt" or "-createdAt" for descending)',
    },
  },
};

/**
 * Paginated response schema builder
 * 
 * @param itemSchema - Schema for individual items in the results array
 * @returns Complete paginated response schema
 * 
 * @example
 * ```typescript
 * const userSchema = { type: 'object', properties: { id: { type: 'string' } } };
 * const paginatedUsers = paginatedResponseSchema(userSchema);
 * ```
 */
export const paginatedResponseSchema = (itemSchema: any) => ({
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: {
      type: 'array',
      items: itemSchema,
    },
    pagination: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: {
          type: 'integer',
          description: 'Current page number',
        },
        limit: {
          type: 'integer',
          description: 'Items per page',
        },
        total: {
          type: 'integer',
          description: 'Total number of items',
        },
        totalPages: {
          type: 'integer',
          description: 'Total number of pages',
        },
        hasNext: {
          type: 'boolean',
          description: 'Whether there is a next page',
        },
        hasPrev: {
          type: 'boolean',
          description: 'Whether there is a previous page',
        },
      },
    },
  },
});

/**
 * UUID parameter schema
 */
export const uuidParamSchema = {
  type: 'string',
  format: 'uuid',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  description: 'UUID identifier',
};

/**
 * Idempotency key header schema
 */
export const idempotencyKeyHeaderSchema = {
  type: 'string',
  minLength: 16,
  maxLength: 128,
  description: 'Unique key for idempotent requests (UUID recommended)',
  example: '550e8400-e29b-41d4-a716-446655440000',
};

/**
 * Timestamp schema (ISO 8601)
 */
export const timestampSchema = {
  type: 'string',
  format: 'date-time',
  description: 'ISO 8601 timestamp',
  example: '2025-10-15T10:30:00.000Z',
};

/**
 * Common response schemas for standard HTTP status codes
 */
export const commonResponses = {
  400: {
    description: 'Bad Request - Invalid input',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Validation failed',
            statusCode: 400,
            code: 'VALIDATION_ERROR',
          },
        },
      },
    },
  },
  401: {
    description: 'Unauthorized - Authentication required',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Authentication required',
            statusCode: 401,
            code: 'UNAUTHORIZED',
          },
        },
      },
    },
  },
  403: {
    description: 'Forbidden - Insufficient permissions',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Insufficient permissions',
            statusCode: 403,
            code: 'FORBIDDEN',
          },
        },
      },
    },
  },
  404: {
    description: 'Not Found - Resource does not exist',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Resource not found',
            statusCode: 404,
            code: 'NOT_FOUND',
          },
        },
      },
    },
  },
  409: {
    description: 'Conflict - Resource already exists or state conflict',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Resource already exists',
            statusCode: 409,
            code: 'CONFLICT',
          },
        },
      },
    },
  },
  422: {
    description: 'Unprocessable Entity - Semantic validation failed',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Invalid business logic',
            statusCode: 422,
            code: 'UNPROCESSABLE_ENTITY',
          },
        },
      },
    },
  },
  500: {
    description: 'Internal Server Error',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Internal Server Error',
            statusCode: 500,
          },
        },
      },
    },
  },
  503: {
    description: 'Service Unavailable - Service is temporarily unavailable',
    content: {
      'application/json': {
        schema: errorResponseSchema,
        example: {
          error: {
            message: 'Service temporarily unavailable',
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
          },
        },
      },
    },
  },
};

/**
 * Security schemes for OpenAPI specs
 */
export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'JWT token authentication',
  },
  apiKey: {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
    description: 'API key for service-to-service authentication',
  },
};
