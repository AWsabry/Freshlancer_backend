const AppError = require('./AppError');
const logger = require('./logger');

/**
 * Enhanced network error handler
 * Categorizes and handles various network/connection errors
 * @param {Error} error - The error object
 * @param {string} context - Context where error occurred (e.g., 'Paymob API', 'Email Service')
 * @returns {AppError} Formatted AppError instance
 */
const handleNetworkError = (error, context = '') => {
  const errorCode = error.code || error.errno;
  const errorMessage = error.message || '';

  // Connection refused errors
  if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
    logger.error(`Connection refused ${context}:`, {
      code: errorCode,
      message: errorMessage,
      stack: error.stack,
    });
    return AppError.serviceUnavailable(
      'Unable to connect to the service. Please try again in a moment.',
      'CONNECTION_REFUSED',
      { service: context }
    );
  }

  // Timeout errors
  if (errorCode === 'ETIMEDOUT' || errorCode === 'ESOCKETTIMEDOUT' || errorMessage.includes('timeout')) {
    logger.error(`Connection timeout ${context}:`, {
      code: errorCode,
      message: errorMessage,
      timeout: error.timeout,
    });
    return AppError.serviceUnavailable(
      'Request timed out. The service is taking too long to respond. Please try again.',
      'CONNECTION_TIMEOUT',
      { service: context, timeout: error.timeout }
    );
  }

  // Network unreachable
  if (errorCode === 'ENOTFOUND' || errorCode === 'ENETUNREACH' || errorMessage.includes('ENOTFOUND')) {
    logger.error(`Network unreachable ${context}:`, {
      code: errorCode,
      message: errorMessage,
    });
    return AppError.serviceUnavailable(
      'Network error. Please check your internet connection and try again.',
      'NETWORK_UNREACHABLE',
      { service: context }
    );
  }

  // DNS errors
  if (errorCode === 'EAI_AGAIN' || errorMessage.includes('DNS') || errorMessage.includes('getaddrinfo')) {
    logger.error(`DNS error ${context}:`, {
      code: errorCode,
      message: errorMessage,
    });
    return AppError.serviceUnavailable(
      'DNS resolution failed. Please check your internet connection and try again.',
      'DNS_ERROR',
      { service: context }
    );
  }

  // SSL/TLS errors
  if (errorCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
      errorCode === 'CERT_HAS_EXPIRED' ||
      errorCode === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      errorMessage.includes('certificate') ||
      errorMessage.includes('SSL') ||
      errorMessage.includes('TLS')) {
    logger.error(`SSL/TLS error ${context}:`, {
      code: errorCode,
      message: errorMessage,
    });
    return AppError.serverError(
      'Secure connection error. Please contact support.',
      'SSL_ERROR',
      { service: context }
    );
  }

  // HTTP errors (from axios)
  if (error.response) {
    const status = error.response.status;
    const statusText = error.response.statusText;
    
    if (status >= 500) {
      logger.error(`External service error ${context}:`, {
        status,
        statusText,
        url: error.config?.url,
        data: error.response.data,
      });
      return AppError.serviceUnavailable(
        'External service is currently unavailable. Please try again later.',
        'EXTERNAL_SERVICE_ERROR',
        { service: context, status, statusText }
      );
    }
    
    if (status === 429) {
      return AppError.badRequest(
        'Too many requests. Please wait a moment and try again.',
        'RATE_LIMIT_EXCEEDED',
        { service: context }
      );
    }

    if (status === 401 || status === 403) {
      return AppError.unauthorized(
        'Authentication failed with external service. Please contact support.',
        'EXTERNAL_AUTH_ERROR',
        { service: context }
      );
    }
  }

  // Generic network error
  logger.error(`Network error ${context}:`, {
    code: errorCode,
    message: errorMessage,
    stack: error.stack,
  });
  return AppError.serviceUnavailable(
    'Network error occurred. Please check your connection and try again.',
    'NETWORK_ERROR',
    { service: context, code: errorCode }
  );
};

/**
 * Retry wrapper for network operations with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.retryDelay - Initial retry delay in ms (default: 1000)
 * @param {string[]} options.retryableErrors - List of error codes to retry (default: common network errors)
 * @param {string} options.context - Context for logging
 * @returns {Promise} Result of the operation
 */
const withRetry = async (operation, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'],
    context = ''
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorCode = error.code || error.errno;
      
      // Check if error is retryable
      const isRetryable = retryableErrors.some(code => 
        errorCode === code || error.message?.includes(code)
      );

      // Also retry on 5xx errors
      const isServerError = error.response && error.response.status >= 500;

      if ((!isRetryable && !isServerError) || attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`Retry attempt ${attempt}/${maxRetries} for ${context} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

module.exports = {
  handleNetworkError,
  withRetry,
};

