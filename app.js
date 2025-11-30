const express = require('express');
const morgan = require('morgan');
//const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mondoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const userRouter = require('./routers/userRouter');
const jobPostRouter = require('./routers/jobPostRouter');
const jobApplicationRouter = require('./routers/jobApplicationRouter');
const studentVerificationRouter = require('./routers/studentVerificationRouter');
const subscriptionRouter = require('./routers/subscriptionRouter');
const clientPackageRouter = require('./routers/clientPackageRouter');
const profileViewRouter = require('./routers/profileViewRouter');
const notificationRouter = require('./routers/notificationRouter');
const transactionRouter = require('./routers/transactionRouter');
const adminRouter = require('./routers/adminRouter');
const paymobRouter = require('./routers/paymobRouter');
const couponRouter = require('./routers/couponRouter');
const startupRouter = require('./routers/startupRouter');
const contactRouter = require('./routers/contactRouter');
const categoryRouter = require('./routers/categoryRouter');
const AppError = require('./utils/AppError');
const globalErrorHandler = require('./controllers/errorController');

const app = express();
app.enable('trust proxy');
//----------------------------------------------------------------------------------------------------------------
//GLOBAL MIDDLEWARE

//Implement CORS
app.use(cors());

//for non-simple requests
app.options('*', cors());

//set secure http header
app.use(helmet());

//body parser and limit the body to 10kb only
app.use(express.json({ limit: '10kb' }));

//pares the cookie coming in req
app.use(cookieParser());

//data sensitization against noSQL query injection
app.use(mondoSanitize());

//data sensitization against XSS
app.use(xssClean());

//prevent parameter pollution (?sort=name&sort=email)
app.use(hpp());

//compress the text sent to client using Gzip
app.use(compression());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

//limit the req rate per hour
// const limiter = rateLimit({
//   max: 100,
//   windowMs: 60 * 60 * 1000,
//   message: 'you reached the max number of request please try again in hour',
// });
// app.use('/api', limiter);
//-----------------------------------------------------------------------------------------------------------------
//mounting middleware
app.use('/api/v1/users', userRouter);
app.use('/api/v1/jobs', jobPostRouter);
app.use('/api/v1/applications', jobApplicationRouter);
app.use('/api/v1/verifications', studentVerificationRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/packages', clientPackageRouter);
app.use('/api/v1/profiles', profileViewRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/transactions', transactionRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/paymob', paymobRouter);
app.use('/api/v1/coupons', couponRouter);
app.use('/api/v1/startups', startupRouter);
app.use('/api/v1/contacts', contactRouter);
app.use('/api/v1/categories', categoryRouter);

//global middleware to handle unhandled routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

//middleware error handling if middleware with four parameters
app.use(globalErrorHandler);
//-----------------------------------------------------------------------------------------------------------------
module.exports = app;
