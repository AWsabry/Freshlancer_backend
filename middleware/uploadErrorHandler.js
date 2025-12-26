const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Enhanced multer error handler middleware
 * Handles all file upload errors with specific, user-friendly messages
 */
const handleUploadError = (err, req, res, next) => {
  if (!err) return next();

  // Multer errors
  if (err.name === 'MulterError') {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        const maxSize = err.limit / (1024 * 1024); // Convert to MB
        return next(AppError.badRequest(
          `File size exceeds the maximum limit of ${maxSize}MB. Please upload a smaller file.`,
          'FILE_TOO_LARGE',
          { maxSize: `${maxSize}MB`, fileSize: err.field }
        ));

      case 'LIMIT_UNEXPECTED_FILE':
        return next(AppError.badRequest(
          'Unexpected file field detected. Please check your upload form.',
          'UNEXPECTED_FILE_FIELD',
          { field: err.field }
        ));

      case 'LIMIT_FILE_COUNT':
        return next(AppError.badRequest(
          'Too many files uploaded. Please reduce the number of files.',
          'TOO_MANY_FILES',
          { limit: err.limit }
        ));

      case 'LIMIT_PART_COUNT':
        return next(AppError.badRequest(
          'Upload form has too many parts. Please simplify your request.',
          'TOO_MANY_PARTS'
        ));

      case 'LIMIT_FIELD_KEY':
        return next(AppError.badRequest(
          'Upload form field name is too long.',
          'FIELD_NAME_TOO_LONG'
        ));

      case 'LIMIT_FIELD_VALUE':
        return next(AppError.badRequest(
          'Upload form field value is too long.',
          'FIELD_VALUE_TOO_LONG'
        ));

      case 'LIMIT_FIELD_COUNT':
        return next(AppError.badRequest(
          'Upload form has too many fields.',
          'TOO_MANY_FIELDS'
        ));

      default:
        logger.error('Unhandled Multer error:', err);
        return next(AppError.badRequest(
          'File upload failed. Please check your file and try again.',
          'UPLOAD_ERROR',
          { code: err.code }
        ));
    }
  }

  // File system errors
  if (err.code === 'ENOENT') {
    logger.error('File not found error:', err);
    return next(AppError.serverError(
      'File storage error. Please try again or contact support.',
      'FILE_STORAGE_ERROR'
    ));
  }

  if (err.code === 'EACCES' || err.code === 'EPERM') {
    logger.error('File permission error:', err);
    return next(AppError.serverError(
      'File permission error. Please contact support.',
      'FILE_PERMISSION_ERROR'
    ));
  }

  if (err.code === 'ENOSPC') {
    logger.error('Storage space full:', err);
    return next(AppError.serverError(
      'Storage space is full. Please contact support.',
      'STORAGE_FULL'
    ));
  }

  // Disk space errors
  if (err.message && err.message.includes('space')) {
    logger.error('Insufficient storage:', err);
    return next(AppError.serverError(
      'Insufficient storage space. Please contact support.',
      'INSUFFICIENT_STORAGE'
    ));
  }

  // Pass through if not a file upload error
  next(err);
};

/**
 * Wrapper for multer upload middleware with error handling
 * @param {Function} uploadMiddleware - Multer middleware instance
 * @returns {Function} Wrapped middleware with error handling
 */
const uploadWithErrorHandling = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  };
};

module.exports = {
  handleUploadError,
  uploadWithErrorHandling,
};

