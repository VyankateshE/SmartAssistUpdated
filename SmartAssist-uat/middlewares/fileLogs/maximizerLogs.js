const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const moment = require("moment-timezone");

// Set desired IANA timezone, e.g., Asia/Kolkata for IST
const TIMEZONE = "Asia/Kolkata";
const TIMESTAMP_FORMAT = "YYYY-MM-DD HH:mm:ss";

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => moment().tz(TIMEZONE).format(TIMESTAMP_FORMAT),
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    // Separate file transport for "info" logs
    new DailyRotateFile({
      filename: path.join(__dirname, "../../maximizer-logs", "info-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "info",
      zippedArchive: false,
      maxSize: "20m",
      maxFiles: "28d",
    }),
    // Separate file transport for "error" logs
    new DailyRotateFile({
      filename: path.join(
        __dirname,
        "../../maximizer-logs",
        "error-%DATE%.log"
      ),
      datePattern: "YYYY-MM-DD",
      level: "error",
      zippedArchive: false,
      maxSize: "20m",
      maxFiles: "28d",
    }),
    // Optional console transport
    // new winston.transports.Console({
    //   format: winston.format.simple(),
    // }),
  ],
});

module.exports = logger;
