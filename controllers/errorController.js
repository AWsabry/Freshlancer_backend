const AppError = require('../utils/AppError');

const handleCastErrorDB = (err) => {
  const message = `The information you provided is not valid. Please check and try again.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  // Extract field name from error
  let field = 'This information';
  let message = 'This information is already registered. Please use a different one.';

  if (err.keyValue) {
    const keys = Object.keys(err.keyValue);
    if (keys.length > 0) {
      const fieldName = keys[0];
      if (fieldName === 'email') {
        message = 'This email address is already registered. Please use a different email or try logging in.';
      } else if (fieldName === 'name') {
        message = 'This name is already taken. Please use a different name.';
      } else {
        message = `This ${fieldName} is already registered. Please use a different one.`;
      }
    }
  }

  return new AppError(message, 400);
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
  return new AppError(message, 400);
};

const handleJsonWebTokenError = () =>
  new AppError('Your session is invalid. Please sign in again to continue.', 401);

const handleTokenExpiredError = () =>
  new AppError('Your session has expired. Please sign in again to continue.', 401);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
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
    });
    //programming or other unknown error: don't leak error details
    //all error that throw by any other package
  } else {
    // Log full error details for debugging (server-side only)
    console.error('❌ UNEXPECTED ERROR:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
    });
    
    // Provide more helpful error messages based on error type
    let errorMessage = 'Something went wrong on our end. Please try again or contact support if the issue persists.';
    
    // Handle specific error types with more helpful messages
    if (err.name === 'MongoServerError' || err.name === 'MongoError') {
      if (err.code === 11000) {
        // Duplicate key error - should be caught earlier, but just in case
        errorMessage = 'This information is already registered. Please use a different one.';
      } else if (err.code === 11001) {
        errorMessage = 'Database error occurred. Please try again.';
      } else {
        errorMessage = 'Database connection error. Please try again in a moment.';
      }
    } else if (err.name === 'ValidationError') {
      // Mongoose validation error - should be caught earlier
      errorMessage = 'Invalid data provided. Please check your input and try again.';
    } else if (err.name === 'CastError') {
      // Invalid ID format - should be caught earlier
      errorMessage = 'Invalid information provided. Please check and try again.';
    } else if (err.message && err.message.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    } else if (err.message && err.message.includes('network')) {
      errorMessage = 'Network error occurred. Please check your connection and try again.';
    } else if (err.message && err.message.includes('ECONNREFUSED')) {
      errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
    }
    
    res.status(err.statusCode || 500).json({
      status: 'error',
      message: errorMessage,
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Log error details for debugging (in both dev and prod)
  console.error('🔴 Error caught:', {
    path: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode,
    name: err.name,
    message: err.message,
    isOperational: err.isOperational,
  });
  
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

    //handle validation error of JWT token
    if (error.name === 'JsonWebTokenError') {
      error = handleJsonWebTokenError();
    }

    //handle expiration error of JWT token
    if (error.name === 'TokenExpiredError') {
      error = handleTokenExpiredError();
    }

    // Handle Mongoose errors
    if (error.name === 'MongoServerError' || error.name === 'MongoError') {
      if (error.code === 11000) {
        error = handleDuplicateFieldsDB(error);
      }
    }

    // Handle network/connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      error = new AppError('Service temporarily unavailable. Please try again in a moment.', 503);
    }

    sendErrorProd(error, res);
  } else {
    // Fallback for any other environment
    sendErrorDev(err, res);
  }
};
