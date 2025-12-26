const dotenv = require('dotenv');
const mongoose = require('mongoose');
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
