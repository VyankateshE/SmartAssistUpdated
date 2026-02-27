const Queue = require("bull");
require("dotenv").config();

// Redis Cloud connection
const reminderQueue = new Queue("reminderQueue", {
  redis: {
    host: process.env.CLIENT_HOST,
    port: process.env.CLIENT_PORT,
    password: process.env.CLIENT_PWD,
  },
});

module.exports = reminderQueue;
