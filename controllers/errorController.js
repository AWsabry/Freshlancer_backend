const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { handleNetworkError } = require('../utils/networkErrorHandler');

const handleCastErrorDB = (err) => {
  const message = `The information you provided is not valid. Please check and try again.`;
  return AppError.badRequest(message, 'INVALID_ID_FORMAT');
};

const handleDuplicateFieldsDB = (err) => {
  const keys = err.keyValue ? Object.keys(err.keyValue) : [];
  const fieldName = keys[0] || 'This information';
  let message = 'This information is already registered. Please use a different one.';

  if (keys.length > 0) {
    if (fieldName === 'email') {
      message = 'This email address is already registered. Please use a different email or try logging in.';
    } else if (fieldName === 'name') {
      message = 'This name is already taken. Please use a different name.';
    } else if (fieldName === 'jobApplication') {
      message = 'A contract already exists for this application.';
    } else {
      message = `This ${fieldName} is already registered. Please use a different one.`;
    }
  }

  return AppError.badRequest(message, 'DUPLICATE_FIELD', { field: fieldName });
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => {
    // Make validation messages more user-friendly
    let message = el.message;
    const field = el.path || 'This field';
    
    // Convert field path to user-friendly name
    const getFieldName = (path) => {
      // Handle nested paths like "studentProfile.experienceLevel"
      const parts = path.split('.');
      const lastPart = parts[parts.length - 1];
      
      // Convert camelCase to Title Case with spaces
      const friendlyName = lastPart
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
      
      // Special cases for common fields
      const fieldMap = {
        'experienceLevel': 'Experience Level',
        'yearsOfExperience': 'Years of Experience',
        'hourlyRate': 'Hourly Rate',
        'socialLinks': 'Social Links',
        'universityLink': 'University Link',
        'companyName': 'Company Name',
        'companySize': 'Company Size',
      };
      
      return fieldMap[friendlyName] || friendlyName;
    };
    
    const fieldName = getFieldName(field);

    // Handle enum validation errors
    if (message.includes('is not a valid enum value') || message.includes('must be either')) {
      let enumValues = [];
      
      // Extract enum values from error message or properties
      if (el.properties && el.properties.enumValues) {
        enumValues = el.properties.enumValues;
      } else if (message.includes('must be either')) {
        // Extract from message like "must be either: Male or Female"
        const match = message.match(/must be either: (.+)/);
        if (match) {
          enumValues = match[1].split(' or ').map(v => v.trim());
        }
      }
      
      // Handle empty string values
      if (el.value === '' || el.value === null || el.value === undefined) {
        if (enumValues.length > 0) {
          return `${fieldName} is required. Please select one of: ${enumValues.join(', ')}`;
        } else {
          return `${fieldName} is required. Please select a valid option.`;
        }
      }
      
      // Handle invalid enum values
      if (enumValues.length > 0) {
        return `${fieldName} must be one of: ${enumValues.join(', ')}. Please select a valid option.`;
      } else {
        return `${fieldName} has an invalid value. Please select a valid option.`;
      }
    }

    // Clean up mongoose validation messages
    if (message.includes('Path')) {
      message = message.replace(/Path `(\w+)` /g, '');
    }
    
    if (message.includes('is required')) {
      message = `${fieldName} is required`;
    }
    
    if (message.includes('is shorter than')) {
      message = `${fieldName} is too short. Please enter at least ${el.properties?.minlength || 'the required'} characters`;
    }
    
    if (message.includes('is longer than')) {
      message = `${fieldName} is too long. Please enter no more than ${el.properties?.maxlength || 'the allowed'} characters`;
    }
    
    if (message.includes('must be valid')) {
      message = `${fieldName} has an invalid value. Please check and try again.`;
    }

    return message;
  });

  const message = errors.join('. ');
  return AppError.badRequest(message, 'VALIDATION_ERROR', { errors });
};

const handleJsonWebTokenError = () =>
  AppError.unauthorized('Your session is invalid. Please sign in again to continue.', 'INVALID_TOKEN');

const handleTokenExpiredError = () =>
  AppError.unauthorized('Your session has expired. Please sign in again to continue.', 'TOKEN_EXPIRED');

const handleMulterError = (err) => {
  // Handle multer file filter errors
  if (err.message && err.message.includes('Invalid file type')) {
    return AppError.badRequest(err.message, 'INVALID_FILE_TYPE');
  }
  
  // Handle file size limit errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const maxSize = err.limit ? (err.limit / (1024 * 1024)).toFixed(1) : '10';
    return AppError.badRequest(
      `File size exceeds the maximum limit of ${maxSize}MB. Please upload a smaller file.`,
      'FILE_TOO_LARGE',
      { maxSize: `${maxSize}MB` }
    );
  }
  
  // Handle other multer errors
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return AppError.badRequest(
      'Unexpected file field. Please check the file upload form.',
      'UNEXPECTED_FILE_FIELD',
      { field: err.field }
    );
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return AppError.badRequest(
      'Too many files uploaded. Please reduce the number of files.',
      'TOO_MANY_FILES',
      { limit: err.limit }
    );
  }
  
  // Generic multer error
  return AppError.badRequest(
    err.message || 'File upload error. Please try again.',
    'UPLOAD_ERROR',
    { code: err.code }
  );
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    ...(err.errorCode && { errorCode: err.errorCode }),
    ...(err.details && { details: err.details }),
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  //operational, trusted error: send message to client
  //all error that we created using AppError class
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      ...(err.errorCode && { errorCode: err.errorCode }),
      ...(err.details && { details: err.details }),
    });
    //programming or other unknown error: don't leak error details
    //all error that throw by any other package
  } else {
    // Log full error details for debugging (server-side only)
    logger.error('❌ UNEXPECTED ERROR:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
    });
    
    // Handle network errors with enhanced handler
    if (err.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'].includes(err.code)) {
      const networkError = handleNetworkError(err);
      return res.status(networkError.statusCode).json({
        status: networkError.status,
        message: networkError.message,
        errorCode: networkError.errorCode,
      });
    }

    // Handle specific error types with more helpful messages
    let errorMessage = 'Something went wrong on our end. Please try again or contact support if the issue persists.';
    let errorCode = 'INTERNAL_ERROR';
    
    if (err.name === 'MongoServerError' || err.name === 'MongoError') {
      if (err.code === 11000) {
        errorMessage = 'This information is already registered. Please use a different one.';
        errorCode = 'DUPLICATE_FIELD';
      } else if (err.code === 11001) {
        errorMessage = 'Database error occurred. Please try again.';
        errorCode = 'DATABASE_ERROR';
      } else {
        errorMessage = 'Database connection error. Please try again in a moment.';
        errorCode = 'DATABASE_CONNECTION_ERROR';
      }
    } else if (err.name === 'ValidationError') {
      errorMessage = 'Invalid data provided. Please check your input and try again.';
      errorCode = 'VALIDATION_ERROR';
    } else if (err.name === 'CastError') {
      errorMessage = 'Invalid information provided. Please check and try again.';
      errorCode = 'INVALID_ID_FORMAT';
    } else if (err.message && err.message.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
      errorCode = 'REQUEST_TIMEOUT';
    } else if (err.message && err.message.includes('network')) {
      errorMessage = 'Network error occurred. Please check your connection and try again.';
      errorCode = 'NETWORK_ERROR';
    }
    
    res.status(err.statusCode || 500).json({
      status: 'error',
      message: errorMessage,
      errorCode,
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Log error details for debugging (in both dev and prod)
  logger.error('🔴 Error caught:', {
    path: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode,
    name: err.name,
    message: err.message,
    errorCode: err.errorCode,
    isOperational: err.isOperational,
  });
  
  // Handle multer errors in all environments
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    err = handleMulterError(err);
  }

  // Handle JWT errors in all environments (must be before environment check)
  //handle validation error of JWT token
  if (err.name === 'JsonWebTokenError') {
    err = handleJsonWebTokenError();
  }

  //handle expiration error of JWT token
  if (err.name === 'TokenExpiredError') {
    err = handleTokenExpiredError();
  }

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    // Create a copy of the error to avoid mutating the original
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;
    error.code = err.code;

    //handle cast error when we try to find a document with an invalid id
    if (error.name === 'CastError') {
      error = handleCastErrorDB(error);
    }

    //handle duplicate fields error when we try to create a document with a field that already exist in the database
    if (error.code === 11000) {
      error = handleDuplicateFieldsDB(error);
    }

    //handle validation error when we try to create a document with invalid data
    if (error.name === 'ValidationError') {
      error = handleValidationErrorDB(error);
    }

    //handle multer errors (file upload errors)
    if (error.name === 'MulterError' || error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      error = handleMulterError(error);
    }

    // Handle Mongoose errors
    if (error.name === 'MongoServerError' || error.name === 'MongoError') {
      if (error.code === 11000) {
        error = handleDuplicateFieldsDB(error);
      }
    }

    // Handle network/connection errors with enhanced handler
    if (error.code && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'].includes(error.code)) {
      error = handleNetworkError(error);
    }

    sendErrorProd(error, res);
  } else {
    // Fallback for any other environment
    sendErrorDev(err, res);
  }
};
