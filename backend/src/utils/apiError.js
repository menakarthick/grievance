'use strict';

// Error categories fixed by docs/12-Standard-Response-Formats.md §12.2 and
// docs/13-HTTP-Status-Codes.md's status-to-category mapping.
const CATEGORIES = Object.freeze({
  VALIDATION: 'validation',
  BUSINESS: 'business',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  SERVER: 'server',
});

class ApiError extends Error {
  constructor({ statusCode, category, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.category = category;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, ApiError);
  }

  static validation(message, details) {
    return new ApiError({
      statusCode: 400,
      category: CATEGORIES.VALIDATION,
      code: 'VALIDATION_ERROR',
      message,
      details,
    });
  }

  static unauthorized(code = 'UNAUTHENTICATED', message = 'Authentication is required.') {
    return new ApiError({ statusCode: 401, category: CATEGORIES.AUTHENTICATION, code, message });
  }

  static forbidden(code = 'FORBIDDEN', message = 'You do not have permission to perform this action.') {
    return new ApiError({ statusCode: 403, category: CATEGORIES.AUTHORIZATION, code, message });
  }

  static notFound(code = 'ROUTE_NOT_FOUND', message = 'The requested resource was not found.') {
    return new ApiError({ statusCode: 404, category: CATEGORIES.BUSINESS, code, message });
  }

  static conflict(code, message) {
    return new ApiError({ statusCode: 409, category: CATEGORIES.BUSINESS, code, message });
  }

  static unprocessable(code, message, details) {
    return new ApiError({ statusCode: 422, category: CATEGORIES.BUSINESS, code, message, details });
  }

  static internal(message = 'An unexpected error occurred.') {
    return new ApiError({
      statusCode: 500,
      category: CATEGORIES.SERVER,
      code: 'INTERNAL_SERVER_ERROR',
      message,
    });
  }
}

module.exports = { ApiError, CATEGORIES };
