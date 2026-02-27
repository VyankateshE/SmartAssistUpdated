require("dotenv").config();
const logger = require("../../middlewares/fileLogs/logger");
const rpaLogger = require("../../middlewares/fileLogs/rpaLogger");
const path = require("path");
const moment = require("moment-timezone");
const fs = require("fs");
const logErrorToDB = require("../../middlewares/dbLogs/transactDbLogs");
const { sendNotification } = require("../../utils/notification");
const getNotificationTemplate = require("../../utils/notificationTemplate");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const { Op, literal } = require("sequelize");
const responses = require("../../utils/globalResponse");
const dateController = require("../../utils/dateFilter");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Users = require("../../models/master/usersModel");
const TaskActivity = require("../../models/auditLogs/task_activity");
const LeadActivity = require("../../models/auditLogs/lead_activity");
const { default: axios } = require("axios");

//create task
const createFollowup = async (req, res) => {
  try {
    const recordId = req.params.recordId;
    const { userId, userEmail } = req;
    const bodyObj = req.body;

    const formattedDate = moment(bodyObj.due_date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const dueDate = moment(formattedDate, "YYYY-MM-DD").format("DD/MM/YYYY");

    const [lead, assignee] = await Promise.all([
      Leads.findByPk(recordId),
      Users.findByPk(bodyObj.sp_id ? bodyObj.sp_id : req.userId),
    ]);
    if (req.userId !== lead.sp_id) {
      return responses.unauthorized(
        res,
        "You are not authorized to create Follow up for this Enquiry"
      );
    }

    const newTaskForLead = await Tasks.create({
      ...bodyObj,
      sp_id: bodyObj.sp_id ? bodyObj.sp_id : req.userId,
      comments: bodyObj.remarks,
      notification_category: "followups",
      category: "followups",
      due_date: formattedDate,
      assigned_to: assignee.name,
      owner_email: assignee.email,
      lead_id: recordId,
      updated_by: userEmail,
      created_by: userId,
      PMI: lead.PMI,
      brand: lead.brand,
      mobile: lead.mobile,
      vehicle_id: lead.vehicle_id,
      lead_email: lead.email,
      houseOfBrand: lead.houseOfBrand,
      lead_url: lead.url,
      opp_url: lead.opp_url || null,
      name: lead.lead_name,
      cxp_lead_code: lead.cxp_lead_code,
      corporate_id: lead.corporate_id,
      dealer_id: lead.dealer_id,
      rpa_name: "taskcreate",
    });

    if (newTaskForLead) {
      const taskData = newTaskForLead.toJSON();
      responses.created(
        res,
        `Task created ${process.env.ST201}`,
        newTaskForLead
      );
      await TaskActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: taskData.task_id,
        action: "Create",
        new_value: JSON.stringify(taskData),
        original_value: JSON.stringify(taskData),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.warn(
          `Failed to log activity for ${taskData.task_id}: ${err.message}`
        );
      });

      if (taskData.subject !== "Call") {
        try {
          const notificationData = getNotificationTemplate(
            taskData.subject.toLowerCase(),
            taskData
          );

          await sendNotification({
            category: "followups",
            userId: assignee.user_id,
            recordId: taskData.lead_id,
            deviceToken: assignee.device_token,
            title: notificationData.title,
            body: notificationData.body,
            content: notificationData.content || null,
          });
        } catch (notificationError) {
          logger.error(
            `Failed to send notification for Task of Lead ID ${recordId} to user ${assignee.user_id}: ${notificationError.message}`
          );
        }
      }
      if (lead.url != null) {
        try {
          const res = await axios.post(
            process.env.TASK_URL,

            { ...taskData, dueDate },
            { headers: { "Content-Type": "application/json" } }
          );

          rpaLogger.info(
            `Task create with ${taskData.task_id} sent to RPA`,
            res.data
          );
        } catch (err) {
          console.error(
            "Task create API err:",
            err.response?.data || err.message
          );
          rpaLogger.error(
            `Failed to post task create API: ${
              err.response?.data?.message || err.message
            }`
          );
        }
      }

      if (lead.status === "New" && lead.url != null) {
        const [count, updatedRows] = await Leads.update(
          { status: "Follow Up", updated: true, update_flag: "active" },
          { where: { lead_id: recordId }, returning: true }
        );

        if (count > 0 && updatedRows.length > 0) {
          const updatedLeadData = updatedRows[0].get({ plain: true });
          await LeadActivity.create({
            userId: req.userId,
            userEmail: req.userEmail,
            userRole: req.userRole,
            recordId: updatedLeadData.lead_id,
            action: "Update",
            new_value: JSON.stringify(updatedLeadData),
            original_value: JSON.stringify(lead),
            modiified_at: dateController.CurrentDate(),
          }).catch((err) => {
            logger.warn(
              `Failed to log activity for ${updatedLeadData.lead_id}: ${err.message}`
            );
          });

          try {
            const apiRes = await axios.post(
              process.env.RPA_URL,
              { ...updatedLeadData, rpa_name: "leadupdate" },
              { headers: { "Content-Type": "application/json" } }
            );

            rpaLogger.info(`Lead with Id ${recordId} sent to RPA`, apiRes.data);
          } catch (err) {
            rpaLogger.error(
              "Lead Update API err:",
              err.response?.data || err.message
            );
            rpaLogger.error(
              `Failed to post Lead update API: ${
                err.response?.data?.message || err.message
              }`
            );
          }
        }
      }
    }
    logger.info(
      `Task created successfully by User ${userId} for lead ${recordId}`
    );
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    // Log error details
    logger.error(
      `Error creating Task by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Get the most recent error log file
    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    // Send email with error log if the log file exists
    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error.message);
  }
};
//end

//create appointment
const createAppointment = async (req, res) => {
  try {
    const { userId, userEmail } = req;
    const recordId = req.params.recordId;
    const bodyObj = req.body;
    const [lead, assignee] = await Promise.all([
      Leads.findByPk(recordId),
      Users.findByPk(bodyObj.sp_id ? bodyObj.sp_id : req.userId),
    ]);

    //date formatting
    const formattedDate = moment(bodyObj.due_date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const dueDate = moment(formattedDate, "YYYY-MM-DD").format("DD/MM/YYYY");

    if (req.userId !== lead.sp_id) {
      return responses.unauthorized(
        res,
        "You are not authorized to create Appointment for this Enquiry"
      );
    }

    const newTaskForLeads = await Tasks.create({
      ...bodyObj,
      sp_id: bodyObj.sp_id ? bodyObj.sp_id : req.userId,
      comments: bodyObj.remarks,
      notification_category: "followups",
      category: "followups",
      due_date: formattedDate,
      assigned_to: assignee.name,
      owner_email: assignee.email,
      lead_id: recordId,
      updated_by: userEmail,
      created_by: userId,
      PMI: lead.PMI,
      brand: lead.brand,
      mobile: lead.mobile,
      vehicle_id: lead.vehicle_id,
      lead_email: lead.email,
      houseOfBrand: lead.houseOfBrand,
      lead_url: lead.url,
      opp_url: lead.opp_url || null,
      name: lead.lead_name,
      cxp_lead_code: lead.cxp_lead_code,
      corporate_id: lead.corporate_id,
      dealer_id: lead.dealer_id,
      rpa_name: "taskcreate",
    });

    if (newTaskForLeads) {
      const taskData = newTaskForLeads.toJSON();
      responses.created(
        res,
        `Appointment task created ${process.env.ST201}`,
        newTaskForLeads
      );
      logger.info(
        `Appointment task created successfully by User ${userId} for Lead ${recordId}`
      );
      await TaskActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: taskData.task_id,
        action: "Create",
        new_value: JSON.stringify(taskData),
        original_value: JSON.stringify(taskData),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.warn(
          `Failed to log activity for ${taskData.task_id}: ${err.message}`
        );
      });
      if (lead.url != null) {
        try {
          const res = await axios.post(
            process.env.TASK_URL,
            { ...taskData, dueDate },
            { headers: { "Content-Type": "application/json" } }
          );

          rpaLogger.info(
            `Task create with ${taskData.task_id} sent to RPA`,
            res.data
          );
        } catch (err) {
          console.error(
            "Task create API err:",
            err.response?.data || err.message
          );
          rpaLogger.error(
            `Failed to post task create API: ${
              err.response?.data?.message || err.message
            }`
          );
        }
      }

      if (taskData.subject !== "Meeting") {
        try {
          const notificationData = getNotificationTemplate(
            taskData.subject.toLowerCase(),
            taskData
          );

          await sendNotification({
            category: "appointment",
            userId: assignee.user_id,
            recordId: taskData.lead_id,
            deviceToken: assignee.device_token,
            title: notificationData.title,
            body: notificationData.body,
            content: notificationData.content || null,
          });
        } catch (notificationError) {
          logger.error(
            `Failed to send notification for new appointment of Lead ID ${recordId} to user ${assignee.user_id}: ${notificationError.message}`
          );
        }
      }
    } else {
      return responses.badRequest(
        res,
        `Appointment created successfully, Failed to send notification`
      );
    }
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    // Log error details
    logger.error(
      `Error creating Task by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Get the most recent error log file
    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    // Send email with error log if the log file exists
    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error.message);
  }
};
//end

//view all tasks
const viewAllTasks = async (req, res) => {
  try {
    const { category } = req.query;
    const whereCondition = {
      sp_id: req.userId,
      subject: {
        [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
      },
      deleted: false,
    };

    if (category) {
      whereCondition.category = category;
    }
    const tasks = await Promise.all([
      //all
      Tasks.findAndCountAll({
        where: whereCondition,
        order: [["due_date", "ASC"]],
        limit: 100,
      }),
      //upcoming
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Completed", "Deferred"],
          },
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
      //overdue 7 days
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Completed", "Deferred"],
          },
          [Op.and]: [
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
          ],
        },
        order: [["due_date", "DESC"]],
      }),
    ]);

    logger.info(`Request made by user ${req.userId} to view all tasks`);
    return responses.success(res, `Tasks fetched successfully`, {
      allTasks: tasks[0],
      upcomingWeekTasks: tasks[1],
      overdueWeekTasks: tasks[2],
    });
  } catch (error) {
    logger.error(`Failed to fetch tasks by user ${req.userId}`);
    return responses.serverError(res, error.message);
  }
};
//end
//view all tasks
const viewAllAppointments = async (req, res) => {
  try {
    const { category } = req.query;
    const whereCondition = {
      sp_id: req.userId,
      subject: {
        [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
      },
      deleted: false,
    };

    if (category) {
      whereCondition.category = category;
    }
    const tasks = await Promise.all([
      //all
      Tasks.findAndCountAll({
        where: whereCondition,
        order: [["due_date", "ASC"]],
        limit: 100,
      }),
      //upcoming
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Completed", "Deferred"],
          },
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
      //overdue
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Completed", "Deferred"],
          },
          [Op.and]: [
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
          ],
        },
        order: [["due_date", "DESC"]],
      }),
    ]);

    logger.info(`Request made by user ${req.userId} to view all tasks`);
    return responses.success(res, `Tasks fetched successfully`, {
      allTasks: tasks[0],
      upcomingWeekTasks: tasks[1],
      overdueWeekTasks: tasks[2],
    });
  } catch (error) {
    logger.error(`Failed to fetch tasks by user ${req.userId}`);
    return responses.serverError(res, error.message);
  }
};
//end

//get all tasks of lead in descending order
const viewAllTasksOfLead = async (req, res) => {
  try {
    const { category } = req.query;
    const leadId = req.params.leadId;
    const whereCondition = {
      subject: {
        [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
      },
      lead_id: leadId,
      deleted: false,
      sp_id: req.userId,
    };

    if (category) {
      whereCondition.category = category;
    }

    const tasks = await Promise.all([
      //all
      Tasks.findAndCountAll({ where: whereCondition }),

      //upcoming
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "ASC"]],
      }),

      //overdue
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
          ],
        },
      }),
    ]);

    return responses.success(res, `Tasks fetched successfully`, {
      allTasks: tasks[0],
      upcomingWeekTasks: tasks[1],
      overdueWeekTasks: tasks[2],
    });
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    return responses.serverError(res, error.message);
  }
};
const viewAllAppointmentsOfLead = async (req, res) => {
  try {
    const { category } = req.query;
    const leadId = req.params.leadId;
    const whereCondition = {
      lead_id: leadId,
      deleted: false,
      sp_id: req.userId,
      subject: {
        [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
      },
    };

    if (category) {
      whereCondition.category = category;
    }

    const tasks = await Promise.all([
      //all
      Tasks.findAndCountAll({ where: whereCondition }),

      //upcoming
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "ASC"]],
      }),

      //overdue
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
          ],
        },
      }),
    ]);

    return responses.success(res, `Tasks fetched successfully`, {
      allTasks: tasks[0],
      upcomingWeekTasks: tasks[1],
      overdueWeekTasks: tasks[2],
    });
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//view one task
const viewTaskById = async (req, res) => {
  try {
    const taskId = req.params.taskId;

    const task = await Tasks.findOne({
      where: { task_id: taskId },
    });
    logger.info(
      `Request made by User ${req.userId} for viewing task ${taskId}`
    );
    return responses.success(res, `Task fetched successfully`, task);
  } catch (error) {
    const taskId = req.params.taskId;
    logger.error(
      `Failed to fetch task by user ${req.userId} for task ${taskId}`
    );
    console.error("Error fetching task:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//update task
const updateTask = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const { userId, userEmail } = req;
    const bodyObj = req.body;
    const task = await Tasks.findByPk(taskId);
    const due_date_format = bodyObj?.due_date
      ? moment(bodyObj.due_date, "DD-MM-YYYY").local().format("YYYY-MM-DD")
      : task.due_date;
    const dueDate = moment(due_date_format).format("DD/MM/YYYY");
    if (req.userId !== task.sp_id) {
      return responses.unauthorized(
        res,
        "You are not authorized to Update Follow up for this Enquiry"
      );
    }

    const updateObj = {
      ...bodyObj,
      completed:
        bodyObj.status === "Completed" || bodyObj.status === "Deferred",

      completed_at:
        bodyObj.status === "Completed" || bodyObj.status === "Deferred"
          ? dateController.CurrentDate()
          : null,

      updated_at: dateController.CurrentDate(),
      remarks: bodyObj.comments,
      updated_by: userEmail,
      rpa_name: "taskupdate",
      updated: true,
      update_flag: "active",
    };

    if (due_date_format) {
      updateObj.due_date = due_date_format;
    }
    const [affectedRows, updateTask] = await Tasks.update(updateObj, {
      where: { task_id: taskId },
      returning: true,
    });

    if (affectedRows > 0) {
      responses.success(res, `Task updated ${process.env.ST201}`, updateTask);
      const [updatedData] = updateTask.map((task) => task.dataValues);
      await TaskActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: taskId,
        action: "Update",
        new_value: JSON.stringify(updatedData),
        original_value: JSON.stringify(task),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.warn(`Failed to log activity for ${taskId}: ${err.message}`);
      });

      if (task.url != null) {
        const finalData = { ...updatedData, dueDate };
        try {
          const res = await axios.post(process.env.TASK_URL, finalData, {
            headers: { "Content-Type": "application/json" },
          });

          rpaLogger.info(
            `Task update data ${updatedData} sent to RPA`,
            res.data
          );
        } catch (err) {
          console.error(
            "Task update API err:",
            err.response?.data || err.message
          );
          rpaLogger.error(
            `Failed to post Task update API: ${
              err.response?.data?.message || err.message
            }`
          );
        }
      }

      if (bodyObj.sp_id != task.sp_id) {
        const [assignee, notificationData] = await Promise.all([
          Users.findByPk(bodyObj.sp_id, {
            attributes: ["user_id", "device_token"],
          }),
          getNotificationTemplate(task.subject.toLowerCase(), task),
        ]);

        sendNotification({
          category: task.notification_category,
          userId: assignee.user_id,
          recordId: task.lead_id,
          deviceToken: assignee.device_token,
          title: notificationData.title,
          body: notificationData.body,
          content: notificationData.content || null,
        }).catch((notificationError) => {
          logger.error(
            `Failed to send notification for task ID ${taskId} to user ${assignee.user_id}: ${notificationError.message}`
          );
        });
      }
      logger.info(
        `Task updated successfully by user ${userId} for record ${taskId}`
      );
    }
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    // Log error details
    logger.error(
      `Error updating Task by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Get the most recent error log file
    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    // Send email with error log if the log file exists
    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    responses.badRequest(res, error.message);
  }
};
//end//

//delete task
const deleteTask = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const deleteData = await Tasks.update(
      {
        deleted: true,
      },
      { where: { task_id: taskId } }
    );
    if (deleteData > 0) {
      logger.info(
        `Task data deleted successfully by user ${req.userId} for record ${taskId}`
      );
      return responses.success(res, `Task deleted successfully`);
    }
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    // Log error details
    logger.error(
      `Error deleting Task by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Get the most recent error log file
    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    // Send email with error log if the log file exists
    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error.message);
  }
};
//end//

module.exports = {
  createFollowup,
  createAppointment,
  viewAllTasks,
  viewAllAppointments,
  viewAllTasksOfLead,
  viewAllAppointmentsOfLead,
  viewTaskById,
  updateTask,
  deleteTask,
};
