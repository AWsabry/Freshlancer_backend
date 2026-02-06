const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cron = require('node-cron');
// const preventSleep = require('./preventSleep');

// Load config from same directory as server.js (works regardless of process cwd / PM2)
dotenv.config({ path: path.join(__dirname, 'config.env') });

//listen to uncaught exceptions
//uncaught exceptions are exceptions that are not handled by express
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

const app = require('./app');

// Connect to MongoDB
// Note: If your DATABASE connection string contains query parameters like w=majority, wtimeout, j, fsync,
// these should be removed from the URL and handled by mongoose options if needed.
// The useUnifiedTopology option addresses the Server Discovery deprecation warning.
mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    // Write concern is handled automatically by mongoose
    // If you need custom write concern, use: writeConcern: { w: 'majority', wtimeout: 5000 }
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

// Initialize WebSocket server
const { initializeWebSocket } = require('./websocket');
initializeWebSocket(server);

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
  const { runDailyBackup } = require('./utils/backup/databaseBackup');
  const { sendInactiveUserEmails } = require('./utils/inactiveUserEmailJob');

  // Run subscription expiry check daily at 5:00 PM Egypt time
  // Cron format: minute hour day month day-of-week
  // '0 17 * * *' = Every day at 5:00 PM (17:00 in 24-hour format)
  cron.schedule('0 17 * * *', async () => {
    console.log('\n⏰ Running scheduled subscription expiry check...');
    try {
      const count = await checkAndDowngradeExpiredSubscriptions();
      console.log(`✅ Scheduled job completed. Downgraded ${count} subscription(s).`);
    } catch (error) {
      console.error('❌ Error in scheduled subscription expiry check:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Africa/Cairo'
  });

  // Run database backup daily at 2:00 AM Egypt time
  // Cron format: minute hour day month day-of-week
  // '0 2 * * *' = Every day at 2:00 AM (02:00 in 24-hour format)
  cron.schedule('0 2 * * *', async () => {
    console.log('\n⏰ Running scheduled database backup...');
    try {
      await runDailyBackup();
      console.log('✅ Scheduled database backup completed successfully.');
    } catch (error) {
      console.error('❌ Error in scheduled database backup:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Africa/Cairo'
  });

  // Send weekly emails to inactive users every Monday at 10:00 AM Egypt time
  // Cron format: minute hour day month day-of-week
  // '0 10 * * 1' = Every Monday at 10:00 AM (1 = Monday, 0 = Sunday)
  cron.schedule('0 10 * * 1', async () => {
    console.log('\n⏰ Running weekly inactive user email job...');
    try {
      const result = await sendInactiveUserEmails();
      console.log(`✅ Weekly inactive user emails completed. Sent: ${result.totalSent}, Failed: ${result.totalFailed}`);
    } catch (error) {
      console.error('❌ Error in weekly inactive user email job:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Africa/Cairo'
  });

  console.log('✅ Scheduled jobs initialized:');
  console.log('   - Subscription expiry check: Daily at 5:00 PM Egypt time (Africa/Cairo)');
  console.log('   - Database backup: Daily at 2:00 AM Egypt time (Africa/Cairo)');
  console.log('   - Inactive user emails: Weekly on Monday at 10:00 AM Egypt time (Africa/Cairo)');

  // Run subscription check on server startup/reload
  // This ensures expired subscriptions are downgraded immediately when server restarts
  console.log('\n🔍 Running initial subscription validity check on startup...');
  checkAndDowngradeExpiredSubscriptions()
    .then(count => {
      if (count > 0) {
        console.log(`✅ Initial subscription check completed. Downgraded ${count} expired subscription(s).`);
      } else {
        console.log(`✅ Initial subscription check completed. All subscriptions are valid.`);
      }
    })
    .catch(error => {
      console.error('❌ Error in initial subscription check:', error);
    });
}
