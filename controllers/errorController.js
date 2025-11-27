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

    // Clean up mongoose validation messages
    if (message.includes('Path')) {
      message = message.replace(/Path `(\w+)` /g, '');
    }
    if (message.includes('is required')) {
      const field = el.path || 'This field';
      const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
      message = `${fieldName} is required`;
    }
    if (message.includes('is shorter than')) {
      const field = el.path || 'This field';
      const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
      message = `${fieldName} is too short. Please enter at least ${el.properties?.minlength || 'the required'} characters`;
    }
    if (message.includes('is longer than')) {
      const field = el.path || 'This field';
      const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
      message = `${fieldName} is too long. Please enter no more than ${el.properties?.maxlength || 'the allowed'} characters`;
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
    console.error('ERROR', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong on our end. Please try again or contact support if the issue persists.',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = Object.assign(err);

    //handle cast error when we try to find a document with an invalid id
    if (error.name === 'CastError') error = handleCastErrorDB(error);

    //handle duplicate fields error when we try to create a document with a field that already exist in the database
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);

    //handle validation error when we try to create a document with invalid data
    if (error.name === 'ValidationError')
      error = handleValidationErrorDB(error);

    //handle validation error of JWT token
    if (error.name === 'JsonWebTokenError') error = handleJsonWebTokenError();

    //handle expiration error of JWT token
    if (error.name === 'TokenExpiredError') error = handleTokenExpiredError();

    sendErrorProd(error, res);
  }
};
