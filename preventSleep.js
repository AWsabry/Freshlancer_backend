const path = require('path');
const axios = require('axios');

require(path.join(__dirname, 'utils', 'loadEnv')).loadEnv();
const hostUrl = process.env.HOST_URL;
const wakeUpPeriod = process.env.WAKE_UP_PERIOD; // in minutes
exports.preventSleep = () => {
  const url = hostUrl;
  setInterval(() => {
    axios
      .get(url)
      .then((response) => {
        console.log('🤓➡ : preventing sleep... 😉');
      })
      .catch((error) => {
        console.log('🤓➡ : preventing sleep... 😉');
      });
  }, 60000 * wakeUpPeriod); //ms*m
};
