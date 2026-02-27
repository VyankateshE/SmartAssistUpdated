const errorLogs = require("../../models/errorLogs/master-errorLogsModel");

const logErrorToDB = async ({
  reqUrl,
  errorType,
  errorMessage,
  failedRecord,
  userId = null,
}) => {
  try {
    await errorLogs.create({
      error_req: reqUrl,
      error_type: errorType,
      error_message: errorMessage,
      failed_record: failedRecord,
      user_id: userId,
    });
  } catch (loggingError) {
    console.error("Failed to log error to the database:", loggingError.message);
  }
};

module.exports = logErrorToDB;
