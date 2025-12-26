const axios = require('axios');
const { handleNetworkError } = require('./networkErrorHandler');
const logger = require('./logger');

/**
 * Enhanced HTTP client with automatic error handling and interceptors
 * Provides consistent error handling for all external API calls
 */
const httpClient = axios.create({
  timeout: 30000, // 30 seconds default timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Log requests
httpClient.interceptors.request.use(
  (config) => {
    logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('HTTP Request Error:', error);
    return Promise.reject(handleNetworkError(error, 'HTTP Request'));
  }
);

// Response interceptor - Handle errors
httpClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle network errors (connection refused, timeout, etc.)
    if (error.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'].includes(error.code)) {
      return Promise.reject(handleNetworkError(error, error.config?.url || 'External API'));
    }

    // Handle request timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return Promise.reject(handleNetworkError(error, error.config?.url || 'External API'));
    }

    // Handle HTTP errors
    if (error.response) {
      const { status, statusText, data } = error.response;
      logger.error(`HTTP Error ${status}:`, { 
        url: error.config?.url, 
        method: error.config?.method,
        statusText, 
        data 
      });
      
      // Don't transform operational errors (if they're already AppError instances)
      if (data?.isOperational) {
        return Promise.reject(data);
      }
    }

    // Transform to network error
    return Promise.reject(handleNetworkError(error, error.config?.url || 'External API'));
  }
);

module.exports = httpClient;

