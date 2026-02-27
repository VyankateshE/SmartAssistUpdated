const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const moment = require("moment-timezone");
// Choose your timezone, e.g., "Asia/Kolkata" (IST)
const TIMEZONE = "Asia/Kolkata";
const TIMESTAMP_FORMAT = "YYYY-MM-DD HH:mm:ss";

const logger = winston.createLogger({
  format: winston.format.combine(
    // Use moment-timezone to produce the timestamp string
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
      filename: path.join(__dirname, "../../logs", "info-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "info",
      zippedArchive: false,
      maxSize: "20m",
      maxFiles: "28d",
    }),
    // Separate file transport for "error" logs
    new DailyRotateFile({
      filename: path.join(__dirname, "../../logs", "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      zippedArchive: false,
      maxSize: "20m",
      maxFiles: "28d",
    }),
    // Console transport
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

module.exports = logger;
