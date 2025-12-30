const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
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
const universityRouter = require('./routers/universityRouter');
const grantingRouter = require('./routers/grantingRouter');
const logRouter = require('./routers/logRouter');
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

//set secure http header - configure to allow images
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));

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

// Serve static files from uploads directory with CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static('uploads')  );

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Rate limiters with different limits for different endpoint types
// This prevents legitimate users from hitting limits while still protecting against abuse

// General API rate limiter - more lenient for authenticated users
const generalLimiter = rateLimit({
  max: process.env.NODE_ENV === 'production' ? 10000 : 50000, // Increased from 100 to 10000
  windowMs: 15 * 60 * 1000, // 15 minutes (was 1 hour)
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use real IP when behind Apache proxy
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  // Custom key generator to handle Apache proxy properly
  keyGenerator: (req) => {
    // Try to get real IP from various headers (Apache proxy)
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const clientIp = forwarded 
      ? forwarded.split(',')[0].trim() 
      : realIp || req.ip;
    return clientIp;
  },
});

// Stricter limiter for authentication endpoints (login, signup, password reset)
const authLimiter = rateLimit({
  max: process.env.NODE_ENV === 'production' ? 20 : 100, // 20 requests per 15 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: {
    status: 'error',
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    return forwarded 
      ? forwarded.split(',')[0].trim() 
      : realIp || req.ip;
  },
});

// Lenient limiter for polling endpoints (notifications, user status checks)
const pollingLimiter = rateLimit({
  max: process.env.NODE_ENV === 'production' ? 200 : 1000, // 200 requests per 15 minutes
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: {
    status: 'error',
    message: 'Too many polling requests. Please wait a moment.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    return forwarded 
      ? forwarded.split(',')[0].trim() 
      : realIp || req.ip;
  },
});

// Apply general limiter to all API routes
app.use('/api', generalLimiter);

// Apply stricter limiter to authentication routes
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/signup', authLimiter);
app.use('/api/v1/users/forgotPassword', authLimiter);
app.use('/api/v1/users/resetPassword', authLimiter);
app.use('/api/v1/users/resendVerificationEmail', authLimiter);

// Apply lenient limiter to polling endpoints
app.use('/api/v1/notifications/unread-count', pollingLimiter);
app.use('/api/v1/users/me', pollingLimiter);
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
app.use('/api/v1/universities', universityRouter);
app.use('/api/v1/grantings', grantingRouter);
app.use('/api/v1/logs', logRouter);

//global middleware to handle unhandled routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

//middleware error handling if middleware with four parameters
app.use(globalErrorHandler);
//-----------------------------------------------------------------------------------------------------------------
module.exports = app;
