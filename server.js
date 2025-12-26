const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cron = require('node-cron');
// const preventSleep = require('./preventSleep');

dotenv.config({ path: './config.env' });

//listen to uncaught exceptions
//uncaught exceptions are exceptions that are not handled by express
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

const app = require('./app');

mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
  .then(() => {
    console.log('DB connected successfully');
    
    // Initialize scheduled jobs after database connection
    initializeScheduledJobs();
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

const port = process.env.PORT || 8080;
//start server
const server = app.listen(port, () => {
  console.log(`App running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Server listening on port ${port}`);
  // preventSleep.preventSleep();
});

//listen to unhandled promise rejection
//this will not catch error in synchronous code
//this will catch error in asynchronous code
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
  });
};

// Handle SIGTERM (used by PM2 and most process managers)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Initialize scheduled jobs
 * Runs background tasks at specified intervals
 */
function initializeScheduledJobs() {
  const { checkAndDowngradeExpiredSubscriptions } = require('./utils/subscriptionExpiryJob');

  // Run subscription expiry check daily at 2:00 AM
  // Cron format: minute hour day month day-of-week
  // '0 2 * * *' = Every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('\n⏰ Running scheduled subscription expiry check...');
    try {
      const count = await checkAndDowngradeExpiredSubscriptions();
      console.log(`✅ Scheduled job completed. Downgraded ${count} subscription(s).`);
    } catch (error) {
      console.error('❌ Error in scheduled subscription expiry check:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('✅ Scheduled jobs initialized:');
  console.log('   - Subscription expiry check: Daily at 2:00 AM UTC');

  // Optional: Run immediately on startup for testing (comment out in production)
  // Uncomment the following lines if you want to check on server startup
  checkAndDowngradeExpiredSubscriptions()
    .then(count => {
      console.log(`✅ Initial subscription check completed. Downgraded ${count} subscription(s).`);
    })
    .catch(error => {
      console.error('❌ Error in initial subscription check:', error);
    });
}
