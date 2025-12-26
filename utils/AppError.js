/**
 * Enhanced AppError class with error codes and static factory methods
 * Provides better error categorization and frontend error handling
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errorCode = errorCode; // For frontend error handling
    this.details = details; // Additional error context
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  // Static factory methods for common errors
  static badRequest(message, errorCode = 'BAD_REQUEST', details = null) {
    return new AppError(message, 400, errorCode, details);
  }

  static unauthorized(message = 'Unauthorized access', errorCode = 'UNAUTHORIZED') {
    return new AppError(message, 401, errorCode);
  }

  static forbidden(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    return new AppError(message, 403, errorCode);
  }

  static notFound(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    return new AppError(message, 404, errorCode);
  }

  static conflict(message, errorCode = 'CONFLICT', details = null) {
    return new AppError(message, 409, errorCode, details);
  }

  static serverError(message = 'Internal server error', errorCode = 'INTERNAL_ERROR') {
    return new AppError(message, 500, errorCode);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', errorCode = 'SERVICE_UNAVAILABLE') {
    return new AppError(message, 503, errorCode);
  }
}

module.exports = AppError;
