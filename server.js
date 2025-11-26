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
  .then(() => console.log('DB connected successfully'));

//console.log(process.env);
const port = process.env.PORT || 8080;
//start server
const server = app.listen(port, () => {
  console.log(`listening on port ${port}`);
  // preventSleep.preventSleep();
});

//listen to unhandled promise rejection
//this will not catch error in synchronous code
//this will catch error in asynchronous code
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
