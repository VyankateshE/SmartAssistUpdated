/* eslint-disable no-useless-escape */
require("dotenv").config();
// const moment = require("moment");
// const fs = require("fs");
// const path = require("path");
// const {
//   sendMailForSf,
// } = require("../../middlewares/emails/triggerEmailErrors");
// const sfLogger = require("../../middlewares/fileLogs/sfLogger");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const logger = require("../../middlewares/fileLogs/rpaLogger");
const dateController = require("../../utils/dateFilter");
const { default: axios } = require("axios");

//-------------------------------------------------------update flags----------------------------------------------------------------
//--------------------------------------------------------------------------------------------------------------------------------------------------
exports.flagLead = async (req, res) => {
  const { lead_id, url } = req.body;

  try {
    // Input validation
    if (!lead_id || !url) {
      return res.status(400).json({
        error: "Missing required fields: lead_id and url are required",
      });
    }
    logger.info(
      `Starting lead flag process for lead_id: ${lead_id} with url: ${url}`
    );

    const codeMatch = url.match(/\/lead\/([^\/]+)\//);
    // Update database with transaction support
    const [updatedInstances] = await Leads.update(
      {
        flag: "inactive",
        url,
        cxp_lead_code: codeMatch ? codeMatch[1] : null,
        rpa_name: "assign",
        cxp_posted_at: dateController.CurrentDate(), // Add timestamp
      },
      {
        where: { lead_id: lead_id },
        returning: true,
      }
    );

    const updatedData = updatedInstances[0]?.toJSON();
    logger.info(
      `Lead ${lead_id} with url ${url} successfully updated in database`
    );

    // Make external API call with improved error handling
    try {
      const apiResponse = await axios.post(
        process.env.RPA_URL,

        updatedData,
        {
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          timeout: 30000, // 30 second timeout
          validateStatus: (status) => status < 500,
        }
      );

      if (apiResponse.status >= 200 && apiResponse.status < 300) {
        logger.info(`Reassign lead in progress for`, {
          status: apiResponse.status,
          leadId: lead_id,
        });
      } else {
        logger.warn(
          `External API returned non-success status for lead ${lead_id}`,
          {
            status: apiResponse.status,
            data: apiResponse.data,
            leadId: lead_id,
          }
        );
      }
    } catch (apiError) {
      // Log the API error but don't fail the entire operation
      const errorMessage =
        apiError.response?.data?.message ||
        apiError.message ||
        "Unknown API error";

      logger.error(`Flag inactive failed for lead ${lead_id}`, {
        error: errorMessage,
        status: apiError.response?.status,
        leadId: lead_id,
        url: apiError.config?.url,
      });
    }

    // Return success response
    return res.status(200).json({
      message: `Lead with ID ${lead_id} updated successfully`,
      data: updatedData,
      timestamp: dateController.CurrentDate(),
    });
  } catch (error) {
    // Handle database and other unexpected errors
    logger.error(`Error updating lead ${lead_id}`, {
      error: error.message,
      stack: error.stack,
      leadId: lead_id,
    });

    // Check if it's a database constraint error
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        error: "Foreign key constraint error",
        details: "Referenced lead may not exist",
      });
    }

    // Generic server error
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to update lead. Please try again later.",
    });
  }
};
exports.reassigned = async (req, res) => {
  const { lead_id } = req.body;

  try {
    // Input validation
    if (!lead_id) {
      return res.status(400).json({
        error: "Missing required fields: lead_id and url are required",
      });
    }
    logger.info(`Starting reassign lead flag process for lead_id: ${lead_id}`);

    // Update database with transaction support
    const updatedLead = await Leads.update(
      {
        reassign_flag: "inactive",
      },
      {
        where: { lead_id: lead_id },
      }
    );
    logger.info(`Lead ${lead_id} successfully reassigned in database`);

    // Return success response
    return res.status(200).json({
      message: `Lead with ID ${lead_id} reassigned successfully`,
      data: updatedLead,
      timestamp: dateController.CurrentDate(),
    });
  } catch (error) {
    // Handle database and other unexpected errors
    logger.error(`Error updating lead ${lead_id}`, {
      error: error.message,
      stack: error.stack,
      leadId: lead_id,
    });

    // Check if it's a database constraint error
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        error: "Foreign key constraint error",
        details: "Referenced lead may not exist",
      });
    }

    // Generic server error
    return res.status(500).json(error.message);
  }
};
//end

exports.flagTask = async (req, res) => {
  const { task_id, url } = req.body;

  try {
    // Input validation
    if (!task_id || !url) {
      return res.status(400).json({
        error: "Missing required fields: task_id and url are required",
      });
    }
    logger.info(
      `Starting task flag process for task_id: ${task_id} with url : ${url}`
    );

    // Update database with proper field tracking
    const updatedTask = await Tasks.update(
      {
        flag: "inactive",
        url,
        // updated_at: dateController.CurrentDate(), // Add timestamp
      },
      {
        where: { task_id },
        returning: true, // Get the updated record
      }
    );

    if (!updatedTask[0] || updatedTask[0] === 0) {
      logger.warn(`Task with ID ${task_id} not found`);
      return res.status(404).json({
        error: `Task with ID ${task_id} not found`,
      });
    }

    logger.info(
      `Task with ${task_id} and url ${url} successfully updated in database`
    );

    // Get updated data if available
    const updatedData =
      updatedTask[1] && updatedTask[1][0] ? updatedTask[1][0].toJSON() : null;

    // Return success response
    return res.status(200).json({
      message: `Task with ID ${task_id} updated successfully`,
      data: updatedData,
      timestamp: dateController.CurrentDate(),
    });
  } catch (error) {
    // Handle database and other unexpected errors
    logger.error(`Error updating task ${task_id}`, {
      error: error.message,
      stack: error.stack,
      taskId: task_id,
    });

    // Handle specific database errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        error: "Foreign key constraint error",
        details: "Referenced task may not exist",
      });
    }

    if (error.name === "SequelizeConnectionError") {
      logger.error(`Database connection error for task ${task_id}`, {
        error: error.message,
        taskId: task_id,
      });

      return res.status(503).json({
        error: "Service temporarily unavailable",
        message: "Database connection issue. Please try again later.",
      });
    }

    if (error.name === "SequelizeTimeoutError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "Database operation timed out. Please try again.",
      });
    }

    // Generic server error
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to update task. Please try again later.",
    });
  }
};
//end

exports.flagEvent = async (req, res) => {
  const { event_id, url } = req.body;

  try {
    // Input validation
    if (!event_id || !url) {
      return res.status(400).json({
        error: "Missing required fields: event_id and url are required",
      });
    }

    // Validate event_id format (adjust validation as needed)
    if (typeof event_id !== "string" && typeof event_id !== "number") {
      return res.status(400).json({
        error: "Invalid event_id format",
      });
    }

    logger.info(
      `Starting event flag process for event_id: ${event_id} with url : ${url}`
    );

    // Update database with proper field tracking
    const updatedEvent = await Events.update(
      {
        flag: "inactive",
        url,
        // updated_at: dateController.CurrentDate(), // Add timestamp
      },
      {
        where: { event_id },
        returning: true, // Get the updated record
      }
    );

    if (!updatedEvent[0] || updatedEvent[0] === 0) {
      logger.warn(`Event with ID ${event_id} not found`);
      return res.status(404).json({
        error: `Event with ID ${event_id} not found`,
      });
    }

    logger.info(
      `Event with ${event_id} and url ${url} successfully updated in database`
    );

    // Get updated data if available
    const updatedData =
      updatedEvent[1] && updatedEvent[1][0]
        ? updatedEvent[1][0].toJSON()
        : null;

    // Return success response
    return res.status(200).json({
      message: `Event with ID ${event_id} updated successfully`,
      data: updatedData,
      timestamp: dateController.CurrentDate(),
    });
  } catch (error) {
    // Handle database and other unexpected errors
    logger.error(`Error updating event ${event_id}`, {
      error: error.message,
      stack: error.stack,
      eventId: event_id,
    });

    // Handle specific database errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        error: "Foreign key constraint error",
        details: "Referenced event may not exist",
      });
    }

    if (error.name === "SequelizeConnectionError") {
      logger.error(`Database connection error for event ${event_id}`, {
        error: error.message,
        eventId: event_id,
      });

      return res.status(503).json({
        error: "Service temporarily unavailable",
        message: "Database connection issue. Please try again later.",
      });
    }

    if (error.name === "SequelizeTimeoutError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "Database operation timed out. Please try again.",
      });
    }

    // Generic server error
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to update event. Please try again later.",
    });
  }
};

//end

//update opportunities to flag inactive that has been inserted in salesforce
exports.flagOpps = async (req, res) => {
  try {
    const { lead_id, opp_url } = req.body;
    const codeMatch = opp_url.match(/\/opportunity\/([^\/]+)\//);
    const updatedOpps = await Leads.update(
      {
        update_flag: "inactive",
        opp_url,
        cxp_opp_code: codeMatch ? codeMatch[1] : null,
      },
      { where: { lead_id: lead_id } }
    );
    if (updatedOpps > 0) {
      return res.status(200).json({
        message: `opportunity with lead Id ${lead_id} updated successfully`,
      });
    }
    return res.status(404).json({ message: "Opportunity not found" });
  } catch (error) {
    // const { lead_id } = req.body;
    // // Log error details
    // sfLogger.error(`Error updating lead ${lead_id} in salesforce`);

    // // Get the most recent error log file
    // const logDir = path.join(__dirname, "../../sfLogs");
    // const logFiles = fs
    //   .readdirSync(logDir)
    //   .filter((file) => file.startsWith("sferror-"))
    //   .sort();

    // const latestLogFilePath =
    //   logFiles.length > 0
    //     ? path.join(logDir, logFiles[logFiles.length - 1])
    //     : null;

    // // Send email with error log if the log file exists
    // if (latestLogFilePath) {
    //   await sendMailForSf(latestLogFilePath);
    // }

    return res.status(400).json({ error: error.message });
  }
};
//end

//---------------------------------------------------------change update status of records----------------------------------------------------------
//--------------------------------------------------------------------------------------------------------------------------------------------------

//update leads to updated : false that has been updated in salesforce
exports.updateLeadAsFalse = async (req, res) => {
  try {
    const { lead_id } = req.body;
    const updatedLead = await Leads.update(
      { updated: false, update_flag: "inactive" },
      { where: { lead_id: lead_id } }
    );
    if (updatedLead > 0) {
      logger.info(`Updated Lead with Id ${lead_id} flagged inactive`);
      return res.status(200).json({
        message: `lead with Id ${lead_id} updated successfully by RPA`,
      });
    }
    logger.warn(`Lead with Id ${lead_id} not found for update`);
    return res.status(404).json({ message: "Lead not found" });
  } catch (error) {
    const { lead_id } = req.body;
    logger.error(`Error flagging lead ${lead_id} as update-inactive`, {
      error: error.message,
    });
    // const { lead_id } = req.body;
    // // Log error details
    // sfLogger.error(`Error updating lead ${lead_id} in salesforce`);

    // // Get the most recent error log file
    // const logDir = path.join(__dirname, "../../sfLogs");
    // const logFiles = fs
    //   .readdirSync(logDir)
    //   .filter((file) => file.startsWith("sferror-"))
    //   .sort();

    // const latestLogFilePath =
    //   logFiles.length > 0
    //     ? path.join(logDir, logFiles[logFiles.length - 1])
    //     : null;

    // // Send email with error log if the log file exists
    // if (latestLogFilePath) {
    //   await sendMailForSf(latestLogFilePath);
    // }

    return res.status(400).json({ error: error.message });
  }
};
//end

//update tasks to updated : false that has been updated in salesforce
exports.updateTaskAsFalse = async (req, res) => {
  try {
    const { task_id } = req.body;
    const updatedTask = await Tasks.update(
      { updated: false, update_flag: "inactive" },
      { where: { task_id: task_id } }
    );
    if (updatedTask > 0) {
      logger.info(`Updated Task with Id ${task_id} flagged inactive`);
      return res
        .status(200)
        .json({ message: `task with Id ${task_id} updated successfully` });
    }
    logger.warn(`Task with Id ${task_id} not found for update`);
    return res.status(404).json({ message: "Task not found" });
  } catch (error) {
    const { task_id } = req.body;
    logger.error(`Error flagging task ${task_id} as update-inactive`, {
      error: error.message,
    });
    return res.status(400).json({ error: error.message });
  }
};
//end

//update events to updated : false that has been updated in salesforce
exports.updateEventAsFalse = async (req, res) => {
  try {
    const { event_id } = req.body;
    // const eventIds = dataArr.map((event) => {
    //   return event.event_id;
    // });
    const updatedEvent = await Events.update(
      { updated: false, update_flag: "inactive" },
      { where: { event_id } }
    );
    if (updatedEvent > 0) {
      logger.info(`Updated Event with Id ${event_id} flagged inactive`);
      return res
        .status(200)
        .json({ message: `Event with Id ${event_id} updated successfully` });
    }
    logger.warn(`Event with Id ${event_id} not found for update`);

    return res.status(404).json({ message: "Event not found" });
  } catch (error) {
    const { event_id } = req.body;
    logger.error(`Error flagging event ${event_id} as update-inactive`, {
      error: error.message,
    });

    return res.status(400).json({ error: error.message });
  }
};
//end

//update opportunities to updated : false that has been updated in salesforce
exports.updateOppsAsFalse = async (req, res) => {
  try {
    const dataArr = req.body;
    const oppIds = dataArr.map((opp) => {
      return opp.lead_id;
    });
    const updatedOpps = await Leads.update(
      { updated: false },
      { where: { lead_id: oppIds } }
    );
    if (updatedOpps > 0) {
      logger.info(
        `Updated Opportunities with lead Ids ${oppIds} flagged inactive`
      );
      return res.status(200).json({
        message: `opportunities with lead Ids ${oppIds} updated successfully`,
      });
    }
    logger.warn(`Opportunities with lead Ids ${oppIds} not found for update`);
    return res.status(404).json({ message: "Opportunity not found" });
  } catch (error) {
    logger.error(`Error flagging opportunities as update-inactive`, {
      error: error.message,
    });
    // const { lead_id } = req.body;
    // // Log error details
    // sfLogger.error(`Error updating lead ${lead_id} in salesforce`);

    // // Get the most recent error log file
    // const logDir = path.join(__dirname, "../../sfLogs");
    // const logFiles = fs
    //   .readdirSync(logDir)
    //   .filter((file) => file.startsWith("sferror-"))
    //   .sort();

    // const latestLogFilePath =
    //   logFiles.length > 0
    //     ? path.join(logDir, logFiles[logFiles.length - 1])
    //     : null;

    // // Send email with error log if the log file exists
    // if (latestLogFilePath) {
    //   await sendMailForSf(latestLogFilePath);
    // }

    return res.status(400).json({ error: error.message });
  }
};
//end

//---------------------------------------------------------change error status of records----------------------------------------------------------
//--------------------------------------------------------------------------------------------------------------------------------------------------

exports.errorLead = async (req, res) => {
  try {
    const { lead_id } = req.body;
    const updatedLead = await Leads.update(
      { error_flag: "active" },
      { where: { lead_id: lead_id } }
    );
    if (updatedLead > 0) {
      return res
        .status(200)
        .json({ message: `lead with Id ${lead_id} marked as errored` });
    }
    return res.status(404).json({ message: "Lead not found" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
exports.errorTask = async (req, res) => {
  try {
    const { task_id } = req.body;
    const updatedTask = await Tasks.update(
      { error_flag: "active" },
      { where: { task_id: task_id } }
    );
    if (updatedTask > 0) {
      return res
        .status(200)
        .json({ message: `task with Id ${task_id} marked as errored` });
    }
    return res.status(404).json({ message: "Task not found" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
exports.errorEvent = async (req, res) => {
  try {
    const { event_id } = req.body;
    const updatedEvent = await Events.update(
      { error_flag: "active" },
      { where: { event_id: event_id } }
    );
    if (updatedEvent > 0) {
      return res
        .status(200)
        .json({ message: `Event with Id ${event_id} marked as errored` });
    }
    return res.status(404).json({ message: "Event not found" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

//----------------------------------------------------------------debugging-------------------------------------------------------------------------------
exports.getLeadsData = async (req, res) => {
  const leads = await Leads.findAll({
    order: [["created_at", "DESC"]],
    limit: 1000,
  });
  res.status(200).json(leads);
};
exports.getTasksData = async (req, res) => {
  const tasks = await Tasks.findAll({
    order: [["updated_at", "DESC"]],
    limit: 1000,
  });
  res.status(200).json(tasks);
};
exports.getEventsData = async (req, res) => {
  const events = await Events.findAll({
    order: [["updated_at", "DESC"]],
    limit: 1000,
  });
  res.status(200).json(events);
};
exports.getOppsData = async (req, res) => {
  const opps = await Leads.findAll({
    where: { converted: true },
    order: [["updated_at", "DESC"]],
  });
  res.status(200).json(opps);
};
