const logger = require("./logger");

const requestLogger = (req, res, next) => {
  const userId = req.userId || req.dealerId;
  const requestUrl = req.originalUrl;

  // Log basic request details
  logger.info(`Request to ${requestUrl} by ${userId || "unknown user/dealer"}`);
  next();
};

module.exports = requestLogger;
