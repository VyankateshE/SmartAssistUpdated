require("dotenv").config();
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const logger = require("../../middlewares/fileLogs/logger");
const moment = require("moment");
const { Op } = require("sequelize");
const responses = require("../../utils/globalResponse");

//events of date
const viewEventsOfDate = async (req, res) => {
  try {
    const { date, user_id } = req.query;
    const formattedDate = moment(date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");

    const whereCondition = {
      start_date: formattedDate,
      sp_id: user_id ? user_id : req.userId,
      deleted: false,
    };

    const event = await Events.findAndCountAll({
      where: whereCondition,
      order: [["start_time", "ASC"]],
    });
    logger.info(
      `Request made by User ${req.userId} for viewing events of date ${formattedDate}`
    );

    return responses.success(res, `Events fetched ${process.env.ST201}`, event);
  } catch (error) {
    logger.error(
      `Failed to fetch events of date by user ${req.userId}: ${error.message}`
    );
    console.error("Error fetching events:", error);
    return responses.serverError(res, `Something went wrong`);
  }
};
//end

//tasks of date
const viewTasksOfDate = async (req, res) => {
  try {
    const { date, subject, user_id } = req.query;
    const formattedDate = moment(date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const whereCondition = {
      due_date: formattedDate,
      sp_id: user_id ? user_id : req.userId,
      deleted: false,
    };
    if (subject) {
      whereCondition.subject = subject;
    }
    const tasks = await Tasks.findAndCountAll({
      where: whereCondition,
      order: [["due_date", "ASC"]],
    });

    logger.info(
      `Request made by User ${req.userId} for viewing tasks of date ${formattedDate}`
    );
    return responses.success(res, `Tasks fetched ${process.env.ST201}`, tasks);
  } catch (error) {
    logger.error(
      `Failed to fetch tasks of date by user ${req.userId}:${error.message}`
    );
    console.error("Error fetching tasks:", error);
    return responses.badRequest(res, "Something went wrong");
  }
};
//end

//get all tasks & events of date
const activitiesOfDate = async (req, res) => {
  try {
    const { date, category, user_id } = req.query;
    const formattedDate = moment(date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const whereCondition = {
      due_date: formattedDate,
      sp_id: user_id || req.userId,
      deleted: false,
    };
    if (category) {
      whereCondition.category = category;
    }
    const data = await Promise.all([
      Tasks.findAndCountAll({
        where: whereCondition,
        order: [["time", "ASC"]],
        attributes: [
          "task_id",
          "category",
          "subject",
          "PMI",
          "remarks",
          "due_date",
          "status",
          "time",
          "name",
          "lead_id",
          "completed",
        ],
      }),
      Events.findAndCountAll({
        where: whereCondition,
        order: [["start_time", "ASC"]],
        attributes: [
          "event_id",
          "category",
          "lead_id",
          "subject",
          "remarks",
          "start_time",
          "due_date",
          "start_date",
          "status",
          "name",
          "mobile",
          "PMI",
          "location",
          "completed",
        ],
      }),
    ]);

    logger.info(
      `Request made by User ${req.userId} for viewing tasks of date ${formattedDate}`
    );
    return responses.success(res, `Activities fetched ${process.env.ST201}`, {
      tasks: data[0].rows,
      events: data[1].rows,
    });
  } catch (error) {
    logger.error(
      `Failed to fetch activities of date by user ${req.userId}:${error.message}`
    );
    console.error("Error fetching activities:", error);
    return responses.badRequest(res, "Something went wrong");
  }
};

//get all tasks/events count
const viewDataCountForDate = async (req, res) => {
  try {
    const { date } = req.query;
    const formattedDate = moment(date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const data = await Promise.all([
      //upcoming followups
      Tasks.count({
        where: {
          due_date: { [Op.gt]: [formattedDate] },
          sp_id: req.userId,
          deleted: false,
        },
      }),
      //overdue followups
      Tasks.count({
        where: {
          due_date: { [Op.lt]: [formattedDate] },
          sp_id: req.userId,
          deleted: false,
        },
      }),
      //upcoming appointments
      Events.count({
        where: {
          start_date: { [Op.gt]: [formattedDate] },
          subject: { [Op.ne]: "Test Drive" },
          sp_id: req.userId,
          deleted: false,
        },
      }),
      //overdue appointments
      Events.count({
        where: {
          start_date: { [Op.lt]: [formattedDate] },
          subject: { [Op.ne]: "Test Drive" },
          sp_id: req.userId,
          deleted: false,
        },
      }),
      //upcoming test drives
      Events.count({
        where: {
          start_date: { [Op.gt]: [formattedDate] },
          subject: "Test Drive",
          sp_id: req.userId,
          deleted: false,
        },
      }),
      //overdue test drives
      Events.count({
        where: {
          start_date: { [Op.lt]: [formattedDate] },
          subject: "Test Drive",
          sp_id: req.userId,
          deleted: false,
        },
      }),
    ]);
    return responses.success(res, `Data count fetched ${process.env.ST201}`, {
      //count
      upcomingFollowupsCount: data[0],
      overdueFollowupsCount: data[1],
      upcomingAppointmentsCount: data[2],
      overdueAppointmentsCount: data[3],
      upcomingTestDrivesCount: data[4],
      overdueTestDrivesCount: data[5],
    });
  } catch (error) {
    logger.error(
      `Failed to fetch tasks and events of date by user ${req.userId}`
    );
    console.error("Error fetching tasks and events:", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  viewEventsOfDate,
  viewTasksOfDate,
  viewDataCountForDate,
  activitiesOfDate,
};
