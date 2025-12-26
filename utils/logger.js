const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Logger utility for consistent logging across the application
 * In production, integrate with proper logging service (Winston, Pino, etc.)
 */
const logger = {
  /**
   * Log info messages (only in development)
   * @param {...any} args - Arguments to log
   */
  info: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
    // In production, send to logging service
  },

  /**
   * Log error messages (always logged)
   * @param {...any} args - Arguments to log
   */
  error: (...args) => {
    console.error(...args);
    // In production, send to error tracking service (Sentry, etc.)
  },

  /**
   * Log warning messages (only in development)
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log debug messages (only in development)
   * @param {...any} args - Arguments to log
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },
};

module.exports = logger;

