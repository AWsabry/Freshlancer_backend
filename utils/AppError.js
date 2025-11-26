class AppError extends Error {
  constructor(message, statusCode) {
    //Error class has a constructor that receive a message
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    //pass stack trace to the error object
    Error.captureStackTrace(this, this.constructor);
  }
}
module.exports = AppError;
