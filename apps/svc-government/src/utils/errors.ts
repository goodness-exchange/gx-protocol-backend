/**
 * Custom error class with status code support
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'AppError';

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Create an AppError from an error code enum value
 */
export function createError(code: string, statusCode: number, message: string): AppError {
  return new AppError(code, statusCode, message);
}
