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

    // Handle HTTP errors (4xx/5xx from server) - pass through so callers get real status and body
    if (error.response) {
      const { status, statusText, data } = error.response;
      logger.error(`HTTP Error ${status}:`, {
        url: error.config?.url,
        method: error.config?.method,
        statusText,
        data,
      });
      if (data?.isOperational) {
        return Promise.reject(data);
      }
      // Reject with original error so callers can read error.response.status and error.response.data
      return Promise.reject(error);
    }

    // Transform to network error only when there was no response (real network failure)
    return Promise.reject(handleNetworkError(error, error.config?.url || 'External API'));
  }
);

module.exports = httpClient;

