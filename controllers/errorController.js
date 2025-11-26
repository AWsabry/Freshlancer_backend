const AppError = require('../utils/AppError');

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJsonWebTokenError = () =>
  new AppError('invalid token, please login again', 401);

const handleTokenExpiredError = () =>
  new AppError('expired token, please login again', 401);

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
      message: 'internal server error!!!',
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
