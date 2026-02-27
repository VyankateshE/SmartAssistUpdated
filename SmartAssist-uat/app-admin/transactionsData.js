require("dotenv").config();
const { Op, literal } = require("sequelize");
const logger = require("../middlewares/fileLogs/admin-logger");
const dateController = require("../utils/dateFilter");
const responses = require("../utils/globalResponse");
const Leads = require("../models/transactions/leadsModel");
const Tasks = require("../models/transactions/taskModel");
const Events = require("../models/transactions/eventModel");
const Users = require("../models/master/usersModel");
const CallLogs = require("../models/transactions/callLogsModel");
const { getRangeDate } = require("../utils/getDateRange");
const moment = require("moment-timezone");

const getTeamMembers = async (req, res) => {
  try {
    const manager = await Users.findByPk(req.query.userId, {
      attributes: ["user_id", "team_id"],
    });
    const teamMembers = await Users.findAll({
      where: {
        user_id: { [Op.ne]: req.query.userId },
        team_id: manager.team_id,
        deleted: false,
      },
    });

    if (!teamMembers.length) {
      return responses.success(res, "No team members found.", []);
    }

    // Fetching tasks and events using created_by and sp_id
    const teamMemberData = await Promise.all(
      teamMembers.map(async (member) => {
        const [tasks, events] = await Promise.all([
          Tasks.findAll({ where: { sp_id: member.user_id } }),
          Events.findAll({ where: { sp_id: member.user_id } }),
        ]);

        return {
          ...member.toJSON(),
          tasks,
          events,
        };
      })
    );

    return responses.success(
      res,
      `Team members with tasks and events fetched ${process.env.ST201}`,
      teamMemberData
    );
  } catch (error) {
    logger.error(
      `Failed to fetch team members by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const allLeads = async (req, res) => {
  try {
    const { userId } = req.query;
    const user = await Users.findByPk(userId, {
      attributes: ["dealer_id", "user_id"],
    });
    const whereCondition = {
      dealer_id: user.dealer_id,
      sp_id: user.user_id,
      // converted: false,
      deleted: false,
    };
    // let condition;
    // if (queryObj) {
    //   condition = { ...whereCondition, ...queryObj };
    // }
    // if (queryObj.created_at) {
    //   const date = req.query.created_at;
    //   condition.created_at = {
    //     [Op.gte]: new Date(`${date}T00:00:00`),
    //     [Op.lt]: new Date(`${date}T23:59:59`),
    //   };
    // }

    const leads = await Leads.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
    });

    logger.info(`Request made by user ${req.userId} for viewing Leads`);

    return responses.success(res, `Leads fetched ${process.env.ST201}`, leads);
  } catch (error) {
    logger.error(
      `Failed request attempt made by user ${req.userId} for leads at ${req.originalUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};

const teamEnquiries = async (req, res) => {
  try {
    const adminUser = await Users.findByPk(req.query.userId);
    // const queryObj = req.query;
    const whereCondition = {
      dealer_id: adminUser.dealer_id,
      team_id: adminUser.team_id,
      converted: false,
      deleted: false,
    };

    // let condition;
    // if (queryObj) {
    //   condition = { ...whereCondition, ...queryObj };
    // }
    const leads = await Leads.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
    });
    logger.info(`Request made by user ${req.userId} for viewing Leads`);
    return responses.success(res, `Leads fetched ${process.env.ST201}`, leads);
  } catch (error) {
    logger.error(
      `Failed request attempt made by user ${req.userId} for leads at ${req.originalUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};

const getLeadById = async (req, res) => {
  try {
    const leadId = req.params.leadId;

    const lead = await Leads.findByPk(leadId);

    logger.info(
      `Request made by user ${req.userId} for viewing Lead with ID ${leadId}`
    );
    return responses.success(res, `Lead fetched ${process.env.ST201}`, lead);
  } catch (error) {
    const requestUrl = req.originalUrl;
    logger.error(
      `Failed request attempt made by user ${req.userId} for lead at ${requestUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};

const leadHistory = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const user_id = req.query.userId;
    const whereCondition = {
      lead_id: leadId,
      deleted: false,
      sp_id: user_id,
    };
    const data = await Promise.all([
      //completed tasks before today's date
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: "Completed",
          completed: true,
        },
        order: [["due_date", "ASC"]],
      }),

      //all upcoming tasks today & in future
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "ASC"]],
      }),
      //all overdue tasks today
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.and]: [
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),

      //completed events before today's date
      Events.findAll({
        where: {
          ...whereCondition,
          status: "Finished",
          completed: true,
        },
        order: [["start_date", "ASC"]],
      }),

      //all upcoming events today & in future
      Events.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Finished" },
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
        },
        order: [["start_date", "ASC"]],
      }),
      //all overdue events today
      Events.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Finished" },
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
        },
        order: [["start_date", "DESC"]],
      }),
    ]);
    return responses.success(res, `Data fetched`, {
      completedTasks: data[0],
      upcomingTasks: data[1],
      overdueTasks: data[2],
      completedEvents: data[3],
      upcomingEvents: data[4],
      overdueEvents: data[5],
    });
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    return responses.serverError(res, error.message);
  }
};

const getCallLogsOfLead = async (req, res) => {
  try {
    const { category, range, mobile } = req.query;
    const whereCondition = {
      mobile: mobile,
    };

    if (category) {
      whereCondition.call_type = category;
    }
    if (range) {
      const fromDate = getRangeDate(range);
      if (fromDate) {
        whereCondition.call_date = {
          [Op.gte]: fromDate,
        };
      }
    }
    const logs = await CallLogs.findAndCountAll({
      where: whereCondition,
      order: [["call_date", "DESC"]],
    });
    const duration = logs.rows.reduce((acc, curr) => {
      return acc + parseInt(curr.call_duration || "0");
    }, 0);
    const mins = Math.floor((duration % 3600) / 60);

    //count of call category
    const allLogs = await CallLogs.findAll({
      where: whereCondition,
    });

    // Count types
    const count = { all: allLogs.length };
    for (const log of allLogs) {
      const type = log.call_type;
      count[type] = (count[type] || 0) + 1;
    }

    return responses.success(res, "Call logs fetched successfully", {
      logs,
      totalDurationInMins: mins,
      category_counts: count,
    });
  } catch (error) {
    console.error("Error fetching call logs:", error);
    return responses.serverError(res, error.message);
  }
};

const viewAllTasks = async (req, res) => {
  try {
    const { category, userId } = req.query;
    const whereCondition = {
      sp_id: userId,
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
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
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

const viewAllAppointments = async (req, res) => {
  try {
    const { category, userId } = req.query;
    const whereCondition = {
      sp_id: userId,
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
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
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

const getAllEvents = async (req, res) => {
  try {
    const { category, userId } = req.query;
    const whereCondition = { sp_id: userId, deleted: false };

    if (category) {
      whereCondition.category = category;
    }

    const events = await Promise.all([
      //all
      Events.findAndCountAll({
        where: whereCondition,
        order: [["start_date", "DESC"]],
        limit: 100,
      }),
      //upcoming
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Finished", "No Show"],
          },
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
      //overdue
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Finished", "No Show"],
          },
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
    ]);
    //end
    logger.info(`Request made by user ${req.userId} to view all events`);
    return responses.success(res, `Events data fetched ${process.env.ST201}`, {
      allEvents: events[0],
      upcomingEvents: events[1],
      overdueEvents: events[2],
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return responses.badRequest(res, error.message);
  }
};

const activitiesOfDate = async (req, res) => {
  try {
    const { date, category, userId } = req.query;
    const formattedDate = moment(date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const whereCondition = {
      due_date: formattedDate,
      sp_id: userId,
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

const getAllFavLeads = async (req, res) => {
  try {
    const leads = await Leads.findAndCountAll({
      where: { favourite: true, sp_id: req.query.userId },
      order: [["updated_at", "DESC"]],
    });

    return responses.success(
      res,
      `Favourite leads fetched ${process.env.ST201}`,
      leads
    );
  } catch (error) {
    console.error("Error fetching favourite leads", error);
    return responses.serverError(res, error.message);
  }
};

const getAllFavAppointments = async (req, res) => {
  try {
    const events = await Promise.all([
      //upcoming appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //overdue appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //all appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);
    return responses.success(
      res,
      `Favourite Appointments fetched ${process.env.ST201}`,
      {
        upcomingAppointments: events[0],
        overdueAppointments: events[1],
        allAppointments: events[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite Appointments", error);
    return responses.serverError(res, error.message);
  }
};

const getAllFavFollowUps = async (req, res) => {
  try {
    const tasks = await Promise.all([
      //upcoming tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),
      //overdue tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.lt]: dateController.yesterdayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),
      //all tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          sp_id: req.query.userId,
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);

    return responses.success(
      res,
      `Favourite Follow-ups fetched ${process.env.ST201}`,
      {
        upcomingTasks: tasks[0],
        overdueTasks: tasks[1],
        allTasks: tasks[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite tasks", error);
    return responses.serverError(res, error.message);
  }
};

const getAllFavTestDrives = async (req, res) => {
  try {
    const events = await Promise.all([
      //upcoming test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: "Test Drive",
          start_date: {
            [Op.between]: [
              dateController.todayDate,
              dateController.oneWeekLaterDate,
            ],
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //overdue test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: "Test Drive",
          start_date: {
            [Op.between]: [
              dateController.oneWeekBeforeDate,
              dateController.yesterdayDate,
            ],
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //all test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.query.userId,
          deleted: false,
          subject: "Test Drive",
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);

    return responses.success(
      res,
      `Favourite test drives fetched ${process.env.ST201}`,
      {
        upcomingDrives: events[0],
        overdueDrives: events[1],
        allDrives: events[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite Test Drives", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  allLeads,
  teamEnquiries,
  getLeadById,
  leadHistory,
  getCallLogsOfLead,
  viewAllTasks,
  viewAllAppointments,
  getAllEvents,
  getTeamMembers,
  activitiesOfDate,
  getAllFavLeads,
  getAllFavAppointments,
  getAllFavFollowUps,
  getAllFavTestDrives,
};
