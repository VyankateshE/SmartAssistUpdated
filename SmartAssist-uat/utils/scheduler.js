require("dotenv").config();
const sequelize = require("../dbConfig/dbConfig");
const cron = require("node-cron");
const moment = require("moment-timezone");
const logger = require("../middlewares/fileLogs/jobLogger");
const rpalogger = require("../middlewares/fileLogs/rpaLogger");
const Leads = require("../models/transactions/leadsModel");
const Tasks = require("../models/transactions/taskModel");
const Events = require("../models/transactions/eventModel");
const Users = require("../models/master/usersModel");
const { sendNotification } = require("./notification");
const getNotificationTemplate = require("./notificationTemplate");
const reminderQueue = require("../queues/reminderQueue");
const { Op } = require("sequelize");
const axios = require("axios");
const https = require("https");
const { postLeadToICS } = require("../exernal_apis/post_ICS");
const dateController = require("./dateFilter");

const httpsAgent = new https.Agent({
  keepAlive: true,
  minVersion: "TLSv1.2",
  rejectUnauthorized: true,
});

const sendNotificationDaily = () => {
  //schedule notification for upcoming tasks and events
  cron.schedule("0 9 * * *", async () => {
    try {
      const today = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

      // Fetch events
      const events = await Events.findAll({
        where: { start_date: today },
        attributes: [
          "event_id",
          "sp_id",
          "subject",
          "start_date",
          "end_date",
          "notification_category",
          "name",
          "PMI",
        ],
      });

      // Fetch tasks
      const tasks = await Tasks.findAll({
        where: {
          due_date: today,
          notification_category: {
            [Op.in]: ["showroom appointment", "send email", "send sms"],
          },
        },
        attributes: [
          "task_id",
          "sp_id",
          "subject",
          "due_date",
          "notification_category",
          "name",
          "PMI",
        ],
      });

      const combinedData = [...events, ...tasks];

      if (combinedData.length === 0) {
        logger.info("No events or tasks found for today.");
        return;
      }

      logger.info(
        `Found total ${combinedData.length} tasks and events for today. Triggering notifications...`
      );

      // Cache users by sp_id to avoid duplicate DB queries
      const userCache = {};

      for (const item of combinedData) {
        const userId = item.sp_id;

        // Cache the user info
        if (!userCache[userId]) {
          userCache[userId] = await Users.findByPk(userId, {
            attributes: ["device_token"],
          });
        }

        const user = userCache[userId];
        if (!user?.device_token) {
          logger.warn(`No device token found for user ${userId}. Skipping.`);
          continue;
        }

        const notificationData = getNotificationTemplate(
          item.subject?.toLowerCase(),
          item
        );

        await sendNotification({
          category: item.notification_category,
          userId,
          deviceToken: user.device_token,
          title: notificationData.title,
          body: notificationData.body,
          content: notificationData.content || null,
        });
      }
    } catch (error) {
      logger.error("Error in cron job:", error);
    }
  });
};
//end

//send notification 30 mins prior

cron.schedule("*/30 * * * *", async () => {
  try {
    const today = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

    const tasks = await Tasks.findAll({
      where: {
        due_date: today,
        time: { [Op.ne]: null },
        subject: {
          [Op.in]: ["Call", "Meeting"],
        },
      },
      attributes: [
        "task_id",
        "sp_id",
        "subject",
        "due_date",
        "time",
        "notification_category",
        "name",
        "PMI",
      ],
    });

    for (const task of tasks) {
      const taskTime = moment.tz(
        `${task.due_date} ${task.time}`,
        ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD H:mm:ss"],
        "Asia/Kolkata"
      );

      const now = moment.tz("Asia/Kolkata");
      const reminderTime = taskTime.clone().subtract(30, "minutes");
      const delay = reminderTime.diff(now);

      // Only schedule if delay is at least 1 second (1000 ms)
      if (delay > 1000) {
        await reminderQueue.add(
          "sendReminder",
          { task },
          {
            delay,
            jobId: `reminder-${task.task_id}`,
          }
        );

        logger.info(
          `⏰ Scheduled reminder for task ${
            task.task_id
          } at ${reminderTime.format("HH:mm")}`
        );
      } else {
        logger.info(
          `⏩ Skipped task ${task.task_id} due to insufficient delay (${delay}ms)`
        );
      }
    }
  } catch (error) {
    logger.error("❌ Error in dailyTaskScheduler:", error);
  }
});

// Update lead_age daily at midnight
const calcLeadAge = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const leads = await Leads.findAll({ where: { deleted: false } });

      for (const lead of leads) {
        const createdDate = moment(lead.created_at);
        const today = moment();
        const leadAge = today.diff(createdDate, "days");

        await lead.update({ lead_age: leadAge });
      }

      logger.info("Lead ages updated successfully.");
    } catch (error) {
      logger.error("Error updating lead ages:", error);
    }
  });
};
//end

const addUrl = async () => {
  try {
    const [taskData, eventData] = await Promise.all([
      Tasks.findAll({
        where: {
          lead_url: null,
        },
      }),
      Events.findAll({
        where: {
          lead_url: null,
        },
      }),
    ]);

    for (const task of taskData) {
      const lead = await Leads.findByPk(task.lead_id, { raw: true });
      if (lead && lead.url) {
        await Tasks.update(
          { lead_url: lead.url },
          { where: { task_id: task.task_id } }
        );
      }
    }
    for (const event of eventData) {
      const lead = await Leads.findByPk(event.lead_id, { raw: true });
      if (lead && lead.url) {
        await Events.update(
          { lead_url: lead.url },
          { where: { event_id: event.event_id } }
        );
      }
    }
  } catch (err) {
    logger.error("Error in addUrl function:", err);
  }
};

const sendToExternalAPI = async (data, message) => {
  try {
    const res = await axios.post(process.env.RPA_URL, data, {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "identity", // Disable gzip/br compression
      },
      timeout: 15000, // optional: timeout to avoid long-hangs
    });

    rpalogger.info(
      `✅ ${message} Data sent successfully to RPA`,
      res.data?.message || res.statusText
    );
  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data || err.message;

    console.error("❌ Main API ERROR:", errMsg);
    rpalogger.error(
      `❌ Failed to post main to RPA API (Status: ${status}): ${errMsg}`
    );
  }
};
const sendTaskToRPA = async (data, message) => {
  try {
    const res = await axios.post(process.env.TASK_URL, data, {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "identity", // Disable gzip/br compression
      },
      timeout: 15000, // optional: timeout to avoid long-hangs
    });

    rpalogger.info(
      `✅ ${message} Data sent successfully to RPA`,
      res.data?.message || res.statusText
    );
  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data || err.message;

    console.error("❌ Task API ERROR:", errMsg);
    rpalogger.error(
      `❌ Failed to post Task RPA API (Status: ${status}): ${errMsg}`
    );
  }
};
const sendEventToRPA = async (data, message) => {
  // try {
  //   const res = await axios.post(process.env.EVENT_URL, data, {
  //     httpsAgent,
  //     headers: {
  //       "Content-Type": "application/json",
  //       "Accept-Encoding": "identity", // Disable gzip/br compression
  //     },
  //     timeout: 15000, // optional: timeout to avoid long-hangs
  //   });

  //   rpalogger.info(
  //     `✅ ${message} Data sent successfully to RPA`,
  //     res.data?.message || res.statusText
  //   );
  // } catch (err) {
  //   const status = err.response?.status;
  //   const errMsg = err.response?.data || err.message;

  //   console.error("❌ Event API ERROR:", errMsg);
  //   rpalogger.error(
  //     `❌ Failed to post Event RPA API (Status: ${status}): ${errMsg}`
  //   );
  // }
};

const checkAndSendTasks = async () => {
  try {
    const tasks = await Tasks.findAll({
      where: {
        flag: "active",
        error_flag: "inactive",
        url: null,
        lead_url: { [Op.ne]: null },
      },
      raw: true,
    });
    if (tasks.length === 0) {
      logger.info(
        "=====================================No new tasks found to process.================================="
      );
    }
    for (const task of tasks) {
      const dueDate = moment(task.due_date, "YYYY-MM-DD").format("DD/MM/YYYY");
      const finalData = { ...task, dueDate, rpa_name: "taskcreate" };
      await sendTaskToRPA(finalData, "Task");
    }
  } catch (err) {
    logger.error("Task check failed:", err.message);
  }
};
const checkAndSendEvents = async () => {
  try {
    const events = await Events.findAll({
      where: {
        flag: "active",
        error_flag: "inactive",
        url: null,
        lead_url: { [Op.ne]: null },
      },
      raw: true,
    });
    if (events.length === 0) {
      logger.info(
        "=====================================No new events found to process.================================="
      );
    }
    for (const event of events) {
      const startDate = moment(event.start_date).format("DD-MMM-YYYY");
      const finalData = { ...event, startDate, rpa_name: "eventcreate" };
      await sendEventToRPA(finalData, "Event");
    }
  } catch (err) {
    logger.error("Event check failed:", err.message);
  }
};
const checkAndSendLeads = async () => {
  try {
    const leads = await Leads.findAll({
      where: {
        flag: "active",
        error_flag: "inactive",
        url: null,
        converted: false,
      },
      raw: true,
    });
    if (leads.length === 0) {
      logger.info(
        "=====================================Leads not found to process.================================="
      );
    }
    for (const lead of leads) {
      const finalData = { ...lead, rpa_name: "leadcreate" };
      await sendToExternalAPI(finalData, "Lead");
    }
  } catch (err) {
    logger.error("Lead check failed:", err.message);
  }
};
const checkAssignee = async () => {
  try {
    const leads = await Leads.findAll({
      where: {
        reassign_flag: "active",
        url: {
          [Op.ne]: null,
        },
      },
      raw: true,
    });
    if (leads.length === 0) {
      logger.info(
        "=====================================Leads not found to reassign.================================="
      );
    }
    for (const lead of leads) {
      const finalData = { ...lead, rpa_name: "assign" };
      await sendToExternalAPI(finalData, "Reassign Lead");
    }
  } catch (err) {
    logger.error("Lead reassign check failed:", err.message);
  }
};
const checkAndSendUpTasks = async () => {
  try {
    const tasks = await Tasks.findAll({
      where: {
        update_flag: "active",
        error_flag: "inactive",
        flag: "inactive",
        updated: true,
        url: { [Op.ne]: null },
      },
      raw: true,
    });

    if (tasks.length === 0) {
      logger.info(
        "=====================================No updated tasks found to process.================================="
      );
      return;
    }

    for (const task of tasks) {
      try {
        const dueDate = moment(task.due_date).format("DD/MM/YYYY");
        const finalData = { ...task, dueDate, rpa_name: "taskupdate" };
        await sendTaskToRPA(finalData, "Updated Task");
      } catch (err) {
        logger.error(
          `❌ Failed to process task ID ${task.id || "unknown"}: ${err.message}`
        );
      }
    }
  } catch (err) {
    logger.error("Task update check failed:", err.message);
  }
};

const checkAndSendUpEvents = async () => {
  try {
    const events = await Events.findAll({
      where: {
        update_flag: "active",
        error_flag: "inactive",
        updated: true,
        url: { [Op.ne]: null },
      },
      raw: true,
    });
    if (events.length === 0) {
      logger.info(
        "=====================================No updated events found to process.================================="
      );
    }
    for (const event of events) {
      const startDate = moment(event.start_date).format("DD-MMM-YYYY");
      const finalData = { ...event, startDate, rpa_name: "eventupdate" };
      await sendEventToRPA(finalData, "Updated Event");
    }
  } catch (err) {
    logger.error("Event check failed:", err.message);
  }
};
const checkAndSendUpLeads = async () => {
  try {
    const leads = await Leads.findAll({
      where: {
        update_flag: "active",
        updated: true,
        converted: false,
        url: { [Op.ne]: null },
      },
      raw: true,
    });
    if (leads.length === 0) {
      logger.info(
        "=====================================updated Leads not found to process.================================="
      );
    }
    for (const lead of leads) {
      const finalData = { ...lead, rpa_name: "leadupdate" };
      await sendToExternalAPI(finalData, "Updated Lead");
    }
  } catch (err) {
    logger.error("Lead check failed:", err.message);
  }
};
const checkAndSendOpps = async () => {
  try {
    const leads = await Leads.findAll({
      where: {
        converted: true,
        opp_flag: "active",
        updated: true,
        url: { [Op.ne]: null },
      },
      raw: true,
    });
    if (leads.length === 0) {
      logger.info(
        "=====================================Opportunities not found to process.================================="
      );
    }
    for (const lead of leads) {
      const finalData = { ...lead, rpa_name: "opp" };
      await sendToExternalAPI(finalData, "New Opportunities");
    }
  } catch (err) {
    logger.error("Opp check failed:", err.message);
  }
};
const checkAndLeadsToICS = async () => {
  const transaction = await sequelize.transaction();
  try {
    // Step 1: Fetch leads with row-level lock (safe across clusters)
    const leads = await Leads.findAll({
      where: {
        ics_posted: false,
        lead_source: { [Op.in]: ["OEM Web & Digital", "Retailer Website"] },
        created_at: { [Op.gte]: dateController.twoDaysAgo },
      },
      transaction,
      lock: true, // lock rows so another cluster cannot fetch them
      skipLocked: true, // skip any rows already locked by another cluster
    });

    if (leads.length === 0) {
      logger.info(`No data to post in ICS. ${dateController.twoDaysAgo}`);
      await transaction.commit();
      return;
    }

    // Step 2: Immediately mark these leads as claimed
    const leadIds = leads.map((l) => l.lead_id);
    await Leads.update(
      { ics_posted: true, ics_posted_at: dateController.CurrentDate() },
      { where: { lead_id: { [Op.in]: leadIds } }, transaction }
    );

    // Commit transaction → releases locks
    await transaction.commit();

    // Step 3: Process leads outside the transaction
    for (const lead of leads) {
      try {
        const user = await Users.findByPk(lead.sp_id, {
          attributes: ["excellence"],
          raw: true,
        });

        await postLeadToICS(lead, user);
      } catch (err) {
        logger.error(`Failed posting lead ${lead.lead_id}: ${err.message}`);
      }
    }
  } catch (err) {
    await transaction.rollback();
    logger.error("Leads check for ICS failed:", err);
  }
};

// Run every script
cron.schedule("*/1 * * * *", async () => {
  //await addUrl();
  const minute = new Date().getMinutes();
  if (minute % 60 === 0) await addUrl();
  if (minute % 10 === 0) await checkAndSendLeads();
  if (minute % 11 === 0) await checkAssignee();
  if (minute % 40 === 0) await checkAndSendOpps();
  if (minute % 15 === 0) await checkAndSendEvents();
  if (minute % 60 === 0) await checkAndSendUpLeads();
  if (minute % 45 === 0) await checkAndSendUpEvents();
  if (minute % 30 === 0) await checkAndSendTasks();
});

// Run ICS posting at 9 AM daily
cron.schedule("0 10 * * *", async () => {
  await checkAndLeadsToICS();
});

// Runs every 2 hours, at the top of the hour (00:00, 02:00, etc.)
cron.schedule("*/30 * * * *", async () => {
  await checkAndSendUpTasks();
});
module.exports = {
  sendNotificationDaily,
  calcLeadAge,
  checkAndSendLeads,
  checkAndSendEvents,
  checkAndSendTasks,
  checkAndSendUpLeads,
  checkAndSendUpTasks,
  checkAndSendUpEvents,
  checkAndSendOpps,
  checkAssignee,
};
