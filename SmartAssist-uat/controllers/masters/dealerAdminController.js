const fs = require("fs");
const path = require("path");
const logErrorToDB = require("../../middlewares/dbLogs/authDbLogs");
const logger = require("../../middlewares/fileLogs/logger");
const rpaLogger = require("../../middlewares/fileLogs/rpaLogger");
const Targets = require("../../models/master/targetMasterModel");
const getNotificationTemplate = require("../../utils/notificationTemplate");
const { sendNotification } = require("../../utils/notification");
const { Op, Sequelize, literal } = require("sequelize");
const moment = require("moment");
const {
  validateInput,
  validateEmail,
  validatePhoneNumber,
} = require("../../middlewares/validators/validatorMiddleware");
const Dealers = require("../../models/master/dealerModel");
const Roles = require("../../models/master/roleModel");
const TeamMaster = require("../../models/master/teamMasterModel");
const Users = require("../../models/master/usersModel");
const { trimStringValues } = require("../../utils/formatter");
const responses = require("../../utils/globalResponse");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const {
  createUserInMax,
  suspendUserInMax,
} = require("../../exernal_apis/users_Maximizer");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const LeadActivity = require("../../models/auditLogs/lead_activity");
const { Parser } = require("json2csv");
const SftpClient = require("ssh2-sftp-client");
const dateController = require("../../utils/dateFilter");
const Vehicles = require("../../models/master/vehicleModel");
const sequelize = require("../../dbConfig/dbConfig");
const { default: axios } = require("axios");

const sftp = new SftpClient();
const showProfile = async (req, res) => {
  try {
    const { dealerId } = req;
    const dealer = await Dealers.findByPk(dealerId);
    return responses.success(
      res,
      `Profile fetched ${process.env.ST201}`,
      dealer
    );
  } catch (error) {
    console.error("Error fetching dealer:", error);
    return responses.serverError(res, error.message);
  }
};

//create user as dealer
const createUser = async (req, res) => {
  try {
    const { userId } = req;
    const bodyObj = req.body;

    // formatting
    const formattedName = trimStringValues([bodyObj.fname, bodyObj.lname]);

    // validate user data
    validateEmail(bodyObj.email);
    validateInput([formattedName[0], formattedName[1]]);
    validatePhoneNumber([bodyObj.phone]);

    const dealer = await Dealers.findByPk(req.dealerId);

    const role = await Roles.findOne({
      where: { role_name: bodyObj.user_role },
    });

    const team = await TeamMaster.findByPk(bodyObj.team_id);

    // Check if email or acc id already exists in the database
    const isDuplicate = await Users.findOne({
      where: { email: bodyObj.email },
    });

    if (isDuplicate) {
      logger.warn(`
        Duplicate record attempt for user with email ${bodyObj.email} by user ${userId}
      `);
      return responses.badRequest(res, `User ${process.env.IS_DUPLICATE}`);
    }

    if (!role) {
      logger.error(`Role ${bodyObj.user_role} not found`);
      return responses.notFound(res, `Role ${process.env.ST404}`);
    }

    const user = await Users.create({
      ...bodyObj,
      dealer_id: req.dealerId,
      fname: formattedName[0],
      lname: formattedName[1],
      name: formattedName[0] + " " + formattedName[1],
      dealer_name: dealer.dealer_name,
      dealer_code: dealer.dealer_code,
      corporate_id: userId,
      team_name: team.team_name,
      role_id: role.role_id,
      last_login: new Date(),
      last_pwd_change: new Date(),
    });

    if (user.team_role === "Owner") {
      await TeamMaster.update(
        {
          team_lead_id: user.user_id,
          team_lead_email: user.email,
        },
        { where: { team_id: user.team_id } }
      );
    } else {
      logger.error(Error`updating teams data`);
    }

    let supervisorEmail = "";

    if (bodyObj.user_role === "PS") {
      if (userId) {
        const sm = await Users.findOne({
          where: { user_id: userId, user_role: "SM" },
        });
        supervisorEmail = sm ? sm.email : dealer.dealer_email || "";
      } else {
        supervisorEmail = dealer.dealer_email || "";
      }
    } else if (bodyObj.user_role === "SM") {
      supervisorEmail = dealer.dealer_email || "";
    }
    const csvData = [
      {
        "Partner Code": dealer.dealer_email,
        "First Name": user.fname,
        "Work Email": user.email,
        "Access Role Name": "Partner Admin",
        Supervisor: supervisorEmail,
        Phone: user.phone || "",
        "User Status": user.isActive ? "active" : "disabled",
        Retailer: dealer.dealer_name,
        Vertical: "Retail Sales",
        Profile: bodyObj.user_role || "Product Specialist",
      },
    ];

    const fields = [
      "Partner Code",
      "First Name",
      "Work Email",
      "Access Role Name",
      "Supervisor",
      "Phone",
      "User Status",
      "Retailer",
      "Vertical",
      "Profile",
    ];

    const opts = { fields, header: !fs.existsSync("users.csv") };
    const parser = new Parser(opts);
    const csv = parser.parse(csvData);
    fs.appendFileSync("users.csv", csv + "\n");
    await sftp.connect({
      host: process.env.XOXO_host,
      port: process.env.XOXO_port,
      username: process.env.XOXO_username,
      password: process.env.XOXO_pwd,
    });
    const remotePath = "/uploads/users.csv";
    await sftp.put("users.csv", remotePath);
    await sftp.end();
    logger.info(`
      User created successfully by user ${userId} with account Id ${bodyObj.user_account_id}`);

    responses.created(res, "User created & CSV uploaded successfully", user);

    // Create user in Maximizer
    const maximizerResult = await createUserInMax(user);

    if (maximizerResult?.error) {
      console.error(`Maximizer user creation failed for ${user.email}`);
    } else {
      logger.info(`Maximizer response: ${JSON.stringify(maximizerResult)}`);
    }
  } catch (error) {
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    logger.error(`
      Error creating User by user ${req.dealerId} at ${req.originalUrl}: ${error.message}`);

    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    responses.badRequest(res, error.message);
  }
};

//end

const updateUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const bodyObj = req.body;
    const formattedName = trimStringValues([bodyObj.fname, bodyObj.lname]);

    validateInput([formattedName[0], formattedName[1]]);
    validateEmail(bodyObj.email);
    validatePhoneNumber([bodyObj.phone]);

    const user = await Users.update(
      {
        ...bodyObj,
        dealer_id: req.dealerId,
        name: formattedName[0] + formattedName[1],
        fname: formattedName[0],
        lname: formattedName[1],
      },
      { where: { user_id: userId }, returning: true }
    );

    return responses.success(res, `User updated ${process.env.ST201}`, user);
  } catch (error) {
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    logger.error(
      `Error updating User by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
    );

    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    console.error("Error updating user:", error);
    return responses.serverError(res, error.message);
  }
};

const getAllUsersByDealer = async (req, res) => {
  try {
    const users = await Users.findAndCountAll({
      where: {
        deleted: false,
        dealer_id: req.dealerId,
        user_role: { [Op.in]: ["PS", "SM"] },
      },

      order: [["updated_at", "DESC"]],
    });
    logger.info(`Users data requested by User ${req.userId}`);

    return responses.success(res, `Users fetched ${process.env.ST201}`, users);
  } catch (error) {
    logger.error(
      `Fetching Users attempt failed by user ${req.userId}: ${error.message}`
    );
    return responses.serverError(error.message);
  }
};

//check for duplicates
const existingExcellence = async (req, res) => {
  try {
    const { excellence } = req.query;
    const existingRecord = await Users.findOne({
      where: { excellence: excellence },
    });
    if (existingRecord) {
      return responses.success(
        res,
        "Excelllence id already exists, try another one",
        existingRecord
      );
    }
    return responses.success(
      res,
      "Excellence id is available, you are good to go"
    );
  } catch (error) {
    logger.error("Error checking for duplicate Excellence id:", error);
    return responses.serverError(res, error.message);
  }
};

//GET ALL TEAMS UNDER DEALER
const getAllTeams = async (req, res) => {
  try {
    const teams = await TeamMaster.findAndCountAll({
      where: { deleted: false, dealer_id: req.dealerId },
      order: [["updated_at", "DESC"]],
    });

    logger.info(`Teams data requested by User ${req.userId}`);

    return responses.success(res, `Teams fetched ${process.env.ST201}`, teams);
  } catch (error) {
    logger.error(
      `Fetching Teams attempt failed by user ${req.userId}: ${error.message}`
    );
    return responses.serverError(error.message);
  }
};

//data against user
const dataAgainstUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await Users.findByPk(userId);
    const data = await Promise.all([
      Leads.findAndCountAll({
        where: {
          owner_acc_id: user.user_account_id,
          deleted: false,
          converted: false,
        },
        order: [["updated_at", "DESC"]],
      }),
      Leads.findAndCountAll({
        where: { sp_id: user.user_id, deleted: false, converted: true },
        order: [["updated_at", "DESC"]],
      }),
      Tasks.findAndCountAll({
        where: { sp_id: user.user_id, deleted: false },
        order: [["updated_at", "DESC"]],
      }),
      Events.findAndCountAll({
        where: {
          assigned_to: user.name,
          deleted: false,
          subject: "Test Drive",
        },
        order: [["updated_at", "DESC"]],
      }),
      Tasks.findAndCountAll({
        where: {
          assigned_to: user.name,
          deleted: false,
          subject: {
            [Op.in]: [
              "Meeting",
              "Showroom appointment",
              "Service Appointment",
              "Trade in evaluation",
            ],
          },
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);

    logger.info(
      `Request made by dealer ${req.dealerId} for viewing Leads against user with ID ${userId}`
    );

    return responses.success(res, `Data fetched ${process.env.ST201}`, {
      leads: data[0],
      opportunities: data[1],
      tasks: data[2],
      testDrives: data[3],
      appointments: data[4],
    });
  } catch (error) {
    const requestUrl = req.originalUrl;
    logger.error(
      `Failed request attempt made by dealer ${req.dealerId} for leads against user at ${requestUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await Users.findByPk(userId);
    const deleteData = await Users.update(
      {
        deleted: true,
      },
      { where: { user_id: userId } }
    );
    if (deleteData > 0) {
      logger.info(
        `User deleted successfully by dealer ${req.dealerId} for user ID ${userId}`
      );
      responses.success(res, `User deleted ${process.env.ST201}`);
      const maximizerResult = await suspendUserInMax(user);

      if (maximizerResult?.error) {
        console.error(`Maximizer user deletion failed for ${user.email}`);
      } else {
        console.log(`Maximizer response: ${JSON.stringify(maximizerResult)}`);
      }
    } else {
      return responses.badRequest(res, `User ${process.env.NOT_DELETED}`);
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    logger.error(
      `Error deleting user by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const getAllLeads = async (req, res) => {
  try {
    const {
      user_id,
      pmi,
      source,
      status,
      search = "",
      start_date,
      end_date,
    } = req.query;

    // ✅ Handle optional pagination
    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = page && limit ? (page - 1) * limit : null;

    // Handle date range
    let dateRange = null;
    if (start_date && end_date) {
      dateRange = {
        start: moment(start_date).startOf("day").format("YYYY-MM-DD HH:mm:ss"),
        end: moment(end_date).endOf("day").format("YYYY-MM-DD HH:mm:ss"),
      };
    }

    // Base where condition
    let whereCondition = {
      deleted: false,
      dealer_id: req.dealerId,
    };

    // Optional filters mapping
    const optionalFilters = {
      sp_id: user_id,
      PMI: pmi,
      lead_source: source,
      status: status,
    };

    Object.entries(optionalFilters).forEach(([key, value]) => {
      if (value) whereCondition[key] = value;
    });

    // Search filter
    if (search.trim() !== "") {
      const searchFields = ["lead_name", "email", "PMI", "mobile"];
      whereCondition = {
        ...whereCondition,
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${search.trim()}%` },
        })),
      };
    }

    // Date range filter
    if (dateRange) {
      whereCondition.created_at = {
        [Op.between]: [dateRange.start, dateRange.end],
      };
    }

    // ✅ Build query object dynamically
    const queryOptions = {
      where: whereCondition,
      order: [["updated_at", "DESC"]],
      raw: true,
    };

    // Apply pagination only if limit is provided
    if (limit) {
      queryOptions.limit = limit;
      queryOptions.offset = offset || 0;
    }

    const result = await Leads.findAndCountAll(queryOptions);

    const totalRecords = result.count || 0;
    const totalPages = limit ? Math.ceil(totalRecords / limit) : 1;

    const responseData = {
      leads: result.rows || [],
      pagination: limit
        ? {
            currentPage: page,
            totalPages,
            totalRecords,
            limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          }
        : null, // ✅ Hide pagination if not used
      search,
    };

    logger.info(
      `Fetch leads attempt by dealer ${req.dealerId} - Page: ${
        page || "All"
      }, Search: "${search}", Total: ${totalRecords}`
    );

    return responses.success(res, "Leads fetched successfully", responseData);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};

const getAllUsers = async (req, res) => {
  try {
    const [users, all_vehicles, all_sources, all_status] = await Promise.all([
      Users.findAndCountAll({
        where: { dealer_id: req.dealerId },
        order: [["name", "ASC"]],
        attributes: ["user_id", "name"],
      }),
      Leads.findAll({
        attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("PMI")), "PMI"]],
        raw: true,
      }),
      Leads.findAll({
        attributes: [
          [
            Sequelize.fn("DISTINCT", Sequelize.col("lead_source")),
            "lead_source",
          ],
        ],
        raw: true,
      }),
      Leads.findAll({
        attributes: [
          [Sequelize.fn("DISTINCT", Sequelize.col("status")), "status"],
        ],
        raw: true,
      }),
    ]);

    const dropDownData = {
      all_vehicles: all_vehicles.map((item) => item.PMI),
      all_sources: all_sources.map((item) => item.lead_source),
      all_status: all_status.map((item) => item.status),
      all_users: users.rows.map((user) => ({
        id: user.user_id,
        name: user.name,
      })),
    };

    logger.info(`Users data requested by User ${req.userId}`);
    return responses.success(res, `Filter data fetched ${process.env.ST201}`, {
      dropDownData,
    });
  } catch (error) {
    logger.error(
      `Fetching Users attempt failed by user ${req.userId}: ${error.message}`
    );
    return responses.badRequest(res, error.message);
  }
};

const getLeadById = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { dealerId } = req;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const lead = await Leads.findOne({
      where: { lead_id: leadId, dealer_id: dealerId, deleted: false },
      raw: true,
    });

    if (!lead) {
      return responses.notFound(
        res,
        "Lead not found or not accessible for this dealer"
      );
    }

    // ---- Fetch last activity date ----
    const [latestTask, latestEvent] = await Promise.all([
      Tasks.findOne({
        where: { lead_id: leadId, dealer_id: dealerId, deleted: false },
        order: [["updated_at", "DESC"]],
        attributes: ["due_date"],
        raw: true,
      }),
      Events.findOne({
        where: { lead_id: leadId, dealer_id: dealerId, deleted: false },
        order: [["updated_at", "DESC"]],
        attributes: ["due_date"],
        raw: true,
      }),
    ]);

    const taskDate = latestTask?.due_date || null;
    const eventDate = latestEvent?.due_date || null;

    const last_activity_date =
      taskDate && eventDate
        ? new Date(taskDate) > new Date(eventDate)
          ? taskDate
          : eventDate
        : taskDate || eventDate || null;

    lead.last_due_date = last_activity_date;

    // ---- Fetch upcoming & overdue tasks ----
    const [upcomingTasks, overdueTasks] = await Promise.all([
      Tasks.findAndCountAll({
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
          deleted: false,
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
          status: { [Op.ne]: "Completed" },
        },
        order: [["due_date", "ASC"]],
        limit,
        offset,
      }),
      Tasks.findAndCountAll({
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
          deleted: false,
          [Op.and]: [
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
          ],
          status: { [Op.ne]: "Completed" },
        },
        order: [["due_date", "DESC"]],
        limit,
        offset,
      }),
    ]);

    // ---- Fetch upcoming, overdue & completed events ----
    const [upcomingEvents, overdueEvents, completedEvents] = await Promise.all([
      Events.findAndCountAll({
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
          deleted: false,
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
          status: { [Op.ne]: "Finished" },
        },
        order: [["start_date", "ASC"]],
        limit,
        offset,
      }),
      Events.findAndCountAll({
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
          deleted: false,
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
          status: { [Op.ne]: "Finished" },
        },
        order: [["start_date", "DESC"]],
        limit,
        offset,
      }),
      Events.findAndCountAll({
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
          deleted: false,
          status: "Finished",
        },
        order: [["start_date", "DESC"]],
        limit,
        offset,
      }),
    ]);

    const pagination = (count) => {
      const totalRecords = count;
      const totalPages = Math.ceil(totalRecords / limit);
      return {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    };

    return responses.success(res, "Lead details fetched successfully", {
      lead,
      upcoming: {
        tasks: upcomingTasks.rows,
        events: upcomingEvents.rows,
        paginationTasks: pagination(upcomingTasks.count),
        paginationEvents: pagination(upcomingEvents.count),
      },
      overdue: {
        tasks: overdueTasks.rows,
        events: overdueEvents.rows,
        paginationTasks: pagination(overdueTasks.count),
        paginationEvents: pagination(overdueEvents.count),
      },
      completed: {
        events: completedEvents.rows,
        paginationEvents: pagination(completedEvents.count),
      },
    });
  } catch (err) {
    console.error("Error fetching lead details:", err);
    return responses.serverError(res, err.message);
  }
};

const getAllOpportunities = async (req, res) => {
  try {
    const opportunities = await Leads.findAndCountAll({
      where: {
        deleted: false,
        converted: true,
      },
      order: [["updated_at", "DESC"]],
    });
    return responses.success(
      res,
      `Opportunities fetched ${process.env.ST201}`,
      opportunities
    );
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    return responses.serverError(res, error.message);
  }
};

//
const getOppById = async (req, res) => {
  try {
    const oppId = req.params.oppId;
    const opportunity = await Leads.findOne({
      where: { lead_id: oppId },
    });

    logger.info(
      `Request made by dealer ${req.dealerId} for viewing Opportunities`
    );
    return responses.success(
      res,
      `Opportunity info fetched ${process.env.ST201}`,
      opportunity
    );
  } catch (err) {
    logger.error(
      `Failed request attempt made by dealer ${req.dealerId} for opportunities at ${req.originalUrl}: ${err.message}`
    );
    console.error("Error fetching opportunity:", err);
    return responses.serverError(res, err.message);
  }
};

// Creating Targets for dealers
const createTarget = async (req, res) => {
  try {
    const payload = req.body;
    const { range } = req.query;

    if (!Array.isArray(payload) || payload.length === 0) {
      return responses.error(res, "Payload must be a non-empty array.");
    }

    const updateResults = await Promise.all(
      payload.map(async (item) => {
        const { user_id, enquiries, orders, testDrives } = item;

        const userData = await Users.findByPk(user_id, {
          attributes: ["user_id", "email", "name"],
        });

        if (!userData) {
          return { user_id, status: "Skipped - user not found" };
        }

        const targetCondition = {
          user_id,
          user_email: userData.email,
          user_name: userData.name,
          dealer_id: req.dealerId,
          range,
        };

        const existingTarget = await Targets.findOne({
          where: targetCondition,
        });

        if (existingTarget) {
          await Targets.update(
            { enquiries, orders, testDrives },
            { where: targetCondition }
          );
          return { user_id, status: "Updated" };
        } else {
          await Targets.create({
            ...targetCondition,
            enquiries,
            orders,
            testDrives,
          });
          return { user_id, status: "Created" };
        }
      })
    );

    responses.success(res, "Targets processed successfully.", updateResults);
  } catch (error) {
    console.error("Error setting targets for users:", error.message);
    return responses.serverError(
      res,
      `Server error while setting targets for users\n${error.message}`
    );
  }
};

//get all targets for dealer
const getAllTargets = async (req, res) => {
  try {
    const { range } = req.query;
    // Fetch all users
    const users = await Users.findAll({
      where: {
        dealer_id: req.dealerId,
        user_role: { [Op.in]: ["PS", "SM"] },
      },
    });

    // For each user, fetch targets
    const usersWithTargets = await Promise.all(
      users.map(async (user) => {
        const targets = await Targets.findAll({
          where: { user_id: user.user_id, range },
          attributes: ["enquiries", "orders", "testDrives"],
        });
        return {
          user: user,
          targets: targets.length > 0 ? targets : 0,
        };
      })
    );

    logger.info(`Target data requested by Dealer ${req.dealerId}`);
    return responses.success(
      res,
      "Users and their targets retrieved successfully.",
      usersWithTargets
    );
  } catch (error) {
    logger.error(
      `Fetching Users and Targets attempt failed by user ${req.dealerId}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

//end
// const getAllEvents = async (req, res) => {
//   try {
//     const { category } = req.query;

//     const whereCondition = { dealer_id: req.dealerId, deleted: false };

//     if (category) {
//       whereCondition.category = category;
//     }

//     const events = await Promise.all([
//       //all
//       Events.findAndCountAll({ where: whereCondition }),
//       //upcoming 7 days
//       Events.findAndCountAll({
//         where: {
//           ...whereCondition,
//           start_date: {
//             [Op.between]: [
//               dateController.todayDate,
//               dateController.oneWeekLaterDate,
//             ],
//           },
//         },
//       }),
//       //overdue 7 days
//       Events.findAndCountAll({
//         where: {
//           ...whereCondition,
//           start_date: {
//             [Op.between]: [
//               dateController.oneWeekBeforeDate,
//               dateController.yesterdayDate,
//             ],
//           },
//         },
//       }),
//     ]);
//     //end
//     logger.info(`Request made by dealer ${req.dealerId} to view all events`);
//     return responses.success(res, `Events data fetched ${process.env.ST201}`, {
//       allEvents: events[0],
//       upcomingEvents: events[1],
//       overdueEvents: events[2],
//     });
//   } catch (error) {
//     console.error("Error fetching events:", error);
//     logger.error(
//       `Error fetching events by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
//     );
//     return responses.serverError(res, error.message);
//   }
// };
//changes
//end
const getAllEvents = async (req, res) => {
  try {
    const { category } = req.query;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || "";
    const limit = req.query.limt ? parseInt(req.query.limit) : 10;
    const offset = (page - 1) * limit;
    let whereCondition = { dealer_id: req.dealerId, deleted: false };

    if (category) {
      whereCondition.category = category;
    }

    if (search && search.trim() !== "") {
      const searchFields = [
        "lead_name",
        "email",
        "PMI",
        "mobile",
        "subject",
        "location",
        "model",
      ];
      whereCondition = {
        ...whereCondition,
        [Op.or]: searchFields.map((field) => ({
          [field]: {
            [Op.iLike]: `%${search.trim()}%`,
          },
        })),
      };
    }

    const events = await Promise.all([
      //all
      Events.findAndCountAll({
        where: whereCondition,
        order: [["updated_at", "DESC"]],
        limit: limit,
        offset: offset,
      }),
      //upcoming 7 days
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          start_date: {
            [Op.between]: [
              dateController.todayDate,
              dateController.oneWeekLaterDate,
            ],
          },
        },
        order: [["start_date", "ASC"]],
        limit: limit,
        offset: offset,
      }),

      //overdue 7 days
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          start_date: {
            [Op.between]: [
              dateController.oneWeekBeforeDate,
              dateController.yesterdayDate,
            ],
          },
        },
        order: [["start_date", "DESC"]],
        limit: limit,
        offset: offset,
      }),
    ]);

    const createPaginationData = (eventResult, page, limit) => {
      const totalRecords = eventResult.count;
      const totalPages = Math.ceil(totalRecords / limit);

      return {
        // Your original structure
        count: eventResult.count,
        rows: eventResult.rows,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalRecords: totalRecords,
          limit: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    };

    const responseData = {
      allEvents: createPaginationData(events[0], page, limit),
      upcomingEvents: createPaginationData(events[1], page, limit),
      overdueEvents: createPaginationData(events[2], page, limit),
      filters: {
        search: search.trim(),
        category: category,
        currentPage: page,
        searchFields: [
          "lead_name",
          "email",
          "PMI",
          "mobile",
          "subject",
          "location",
          "model",
        ],
      },
      totalAllEvents: events[0].count,
      totalUpcomingEvents: events[1].count,
      totalOverdueEvents: events[2].count,
    };

    //end
    logger.info(`Request made by dealer ${req.dealerId} to view all events`);
    return responses.success(
      res,
      `Events data fetched ${process.env.ST201}`,
      responseData
    );
  } catch (error) {
    console.error("Error fetching events:", error);
    logger.error(
      `Error fetching events by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};
//end

const viewAllTasks = async (req, res) => {
  try {
    const { category } = req.query;
    const whereCondition = { dealer_id: req.dealerId, deleted: false };
    if (category) {
      whereCondition.category = category;
    }
    const tasks = await Promise.all([
      //all
      Tasks.findAndCountAll({ where: whereCondition }),
      //upcoming 7 days
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          start_date: {
            [Op.between]: [
              dateController.todayDate,
              dateController.oneWeekLaterDate,
            ],
          },
        },
      }),
      //overdue 7 days
      Tasks.findAndCountAll({
        where: {
          ...whereCondition,
          start_date: {
            [Op.between]: [
              dateController.oneWeekBeforeDate,
              dateController.yesterdayDate,
            ],
          },
        },
      }),
    ]);

    responses.success(res, `Tasks data fetched ${process.env.ST201}`, {
      allTasks: tasks[0],
      upcomingTasks: tasks[1],
      overdueTasks: tasks[2],
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    logger.error(
      `Error fetching tasks by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const viewTaskById = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const task = await Tasks.findOne({
      where: { task_id: taskId },
    });
    logger.info(
      `Request made by dealer ${req.dealerId} for viewing Task with ID ${taskId}`
    );
    return responses.success(
      res,
      `Task info fetched ${process.env.ST201}`,
      task
    );
  } catch (error) {
    logger.error(
      `Failed request attempt made by dealer ${req.dealerId} for tasks at ${req.originalUrl}: ${error.message}`
    );
    console.error("Error fetching task:", error);
    return responses.serverError(res, error.message);
  }
};

const reassignLead = async (req, res) => {
  try {
    const { user_id, leadIds } = req.body;

    if (!leadIds?.length || !user_id)
      return responses.badRequest(res, "Missing user_id or leadIds");

    const oldLeads = await Leads.findAll({
      where: { lead_id: leadIds },
      raw: true,
    });

    if (!oldLeads.length)
      return responses.badRequest(res, "No leads found for reassignment");

    const user = await Users.findByPk(user_id, {
      attributes: ["user_id", "name", "email"],
    });
    if (!user) return responses.badRequest(res, "Invalid user_id");

    await Leads.update(
      {
        lead_owner: user.name,
        owner_email: user.email,
        sp_id: user_id,
        updated_by: req.userEmail,
        reassign_flag: "active",
        updated: true,
      },
      { where: { lead_id: leadIds } }
    );

    logger.info(`Leads ${leadIds} reassigned to ${user_id} by ${req.userId}`);

    const newLeads = await Leads.findAll({
      where: { lead_id: leadIds },
      raw: true,
    });

    const oldMap = Object.fromEntries(oldLeads.map((l) => [l.lead_id, l]));
    const newMap = Object.fromEntries(newLeads.map((l) => [l.lead_id, l]));

    // Pre-fetch notification and token safely
    const [assignee, notificationData] = await Promise.allSettled([
      Users.findByPk(user_id, { attributes: ["user_id", "device_token"] }),
      getNotificationTemplate("leads", req.body),
    ]);

    const deviceToken =
      assignee.status === "fulfilled" ? assignee.value?.device_token : null;
    const notification =
      notificationData.status === "fulfilled" ? notificationData.value : {};

    // Process each lead safely
    const results = await Promise.allSettled(
      newLeads.map(async (lead) => {
        const oldState = oldMap[lead.lead_id] || {};
        const newState = newMap[lead.lead_id] || {};

        try {
          // Lead Activity Log
          await LeadActivity.create({
            userId: req.userId,
            userEmail: req.userEmail,
            userRole: req.userRole,
            recordId: lead.lead_id,
            action: "Reassign",
            original_value: JSON.stringify(oldState),
            new_value: JSON.stringify(newState),
            modified_at: dateController.CurrentDate(),
          }).catch((err) => {
            logger.warn(
              `Failed to log activity for ${lead.lead_id}: ${err.message}`
            );
          });

          // RPA Integration
          try {
            const apiRes = await axios.post(
              process.env.RPA_URL,
              { ...newState, rpa_name: "assign" },
              {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
              }
            );
            rpaLogger.info(
              `Lead ${lead.lead_id} reassigned successfully to RPA: ${
                apiRes.data?.message || "Success"
              }`
            );
          } catch (rpaErr) {
            rpaLogger.error(
              `RPA update failed for lead ${lead.lead_id}: ${rpaErr.message}`
            );
          }

          // Push Notification
          if (deviceToken && notification?.title && notification?.body) {
            try {
              await sendNotification({
                category: "leads",
                userId: user_id,
                recordId: lead.lead_id,
                deviceToken,
                title: notification.title,
                body: notification.body,
                content: notification.content || null,
              });
            } catch (notifErr) {
              logger.warn(
                `Notification failed for ${lead.lead_id}: ${notifErr.message}`
              );
            }
          }
        } catch (err) {
          logger.error(`Error processing lead ${lead.lead_id}: ${err.message}`);
          throw err;
        }
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    const total = leadIds.length;

    logger.info(
      `Lead reassignment completed. Total: ${total}, Failed: ${failed}`
    );

    return responses.success(
      res,
      failed
        ? `Reassignment completed with ${failed} failures.`
        : `All ${total} leads reassigned successfully.`,
      { total, failed }
    );
  } catch (error) {
    logger.error(
      `Error updating leads by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    try {
      const logDir = path.join(__dirname, "../../logs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("error-"))
        .sort();
      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await handleErrorAndSendLog(latestLogFilePath);
      }
    } catch (logErr) {
      logger.warn(`Failed to send error log: ${logErr.message}`);
    }

    return responses.badRequest(res, error.message);
  }
};

const reassignTestDrive = async (req, res) => {
  try {
    const { user_id, eventIds } = req.body;
    if (
      !user_id ||
      !eventIds ||
      !Array.isArray(eventIds) ||
      eventIds.length === 0
    ) {
      return responses.badRequest(res, "Invalid user_id or eventIds provided");
    }

    // Single database query for user data
    const user = await Users.findByPk(user_id, {
      attributes: [
        "user_id",
        "fname",
        "lname",
        "team_id",
        "device_token",
        "dealer_id",
      ],
    });

    if (!user) {
      return responses.badRequest(res, "User not found");
    }

    const userName = `${user.fname} ${user.lname}`;
    const updateResult = await sequelize.transaction(async (transaction) => {
      return await Events.update(
        {
          sp_id: user_id,
          dealer_id: user.dealer_id,
          owner_email: user.email,
          team_id: user.team_id,
          assigned_to: userName,
          updated_by: req.userEmail,
          updated: true,
        },
        {
          where: {
            event_id: eventIds,
            subject: "Test Drive",
            deleted: false,
          },
          transaction,
        }
      );
    });

    const updatedCount = updateResult[0];

    if (updatedCount === 0) {
      return responses.badRequest(res, "No test drives were updated");
    }

    logger.info(
      `Test Drives ${eventIds} reassigned to ${user_id} by ${req.userId}`
    );
    responses.success(res, `Test Drives reassigned successfully`, updatedCount);

    setImmediate(async () => {
      try {
        await processTestDriveBackgroundTasks(
          user_id,
          eventIds,
          user.device_token,
          userName,
          req.body
        );
      } catch (backgroundError) {
        logger.error(
          `Background processing failed for test drives ${eventIds}: ${backgroundError.message}`
        );
      }
    });
  } catch (error) {
    logger.error(
      `Error updating test drives by user ${req.dealerEmail} at ${req.originalUrl}: ${error.message}`
    );

    responses.badRequest(res, "Failed to reassign test drives");
  }
};

// Separate function for background processing
const processTestDriveBackgroundTasks = async (
  user_id,
  eventIds,
  deviceToken,
  userName
) => {
  try {
    // Fetch all updated test drives with related lead information
    const updatedTestDrives = await Events.findAll({
      where: {
        event_id: eventIds,
        subject: "Test Drive",
        deleted: false,
      },
      include: [
        {
          model: Leads,
          as: "lead", // Adjust association alias as needed
          attributes: ["lead_id", "name", "mobile", "email"],
          required: false,
        },
      ],
      raw: false,
    });

    // Process external API calls and notifications in parallel
    const apiPromises = updatedTestDrives.map(async (testDrive) => {
      try {
        const testDriveData = {
          event_id: testDrive.event_id,
          sp_id: testDrive.sp_id,
          lead_id: testDrive.lead_id,
          start_date: testDrive.start_date,
          start_time: testDrive.start_time,
          name: testDrive.name,
          subject: testDrive.subject,
          assigned_to: userName,
          rpa_name: "reassign_testdrive",
        };

        const apiRes = await axios.post(process.env.RPA_URL, testDriveData, {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        });

        rpaLogger.info(
          `Test Drive ${testDrive.event_id} sent to external API successfully: ${apiRes.data.message}`
        );
      } catch (apiError) {
        rpaLogger.error(
          `Failed to post test drive ${testDrive.event_id} to external API: ${
            apiError.response?.data?.message || apiError.message
          }`
        );
      }
    });

    const notificationPromises = updatedTestDrives.map(async (testDrive) => {
      const notificationData = await getNotificationTemplate("testdrive", {
        event_id: testDrive.event_id,
        name: testDrive.name,
        start_date: testDrive.start_date,
        start_time: testDrive.start_time,
        lead: testDrive.lead,
      });

      await sendNotification({
        category: "testdrive",
        userId: user_id,
        recordId: testDrive.event_id,
        deviceToken: deviceToken,
        title: notificationData.title,
        body: notificationData.body,
        content: notificationData.content || null,
      });
    });

    // Execute all background tasks in parallel
    await Promise.allSettled([...apiPromises, ...notificationPromises]);
  } catch (error) {
    logger.error(
      `Test drive background task processing failed: ${error.message}`
    );
  }
};

const updateLeadByDealer = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { dealerId } = req;

    const lead = await Leads.findOne({
      where: {
        lead_id: leadId,
        dealer_id: dealerId,
      },
      attributes: ["sp_id", "status", "dealer_id"],
    });
    if (!lead) {
      return responses.badRequest(res, "Lead not found or access denied");
    }
    const bodyObj = req.body;
    if (bodyObj.status === "Lost" && lead.status !== "Lost") {
      bodyObj.lost_created_at = dateController.CurrentDate();
    }
    const [affectedRows, updatedLead] = await Leads.update(
      {
        ...bodyObj,
        updated_by: req.userEmail,
        updated: true,
        rpa_name: "leadupdate",
        dealer_id: dealerId,
      },
      {
        where: {
          lead_id: leadId,
          dealer_id: dealerId,
        },
        returning: true,
      }
    );

    if (affectedRows > 0) {
      const [updatedData] = updatedLead.map((lead) => lead.dataValues);

      try {
        const apiResponse = await axios.post(process.env.RPA_URL, updatedData, {
          headers: { "Content-Type": "application/json" },
        });
        logger.info(
          "lead update successfully -------->",
          apiResponse.data.message
        );
      } catch (err) {
        console.error(" API err:", err.response?.data || err.message);
        logger.error(
          `Failed to post lead API: ${
            err.response?.data?.message || err.message
          }`
        );
      }
      if (bodyObj.sp_id !== lead.sp_id) {
        const newAssignee = await Users.findOne({
          where: {
            user_id: bodyObj.sp_id,
            dealer_id: dealerId,
          },
          attributes: ["user_id", "device_token"],
        });

        if (!newAssignee) {
          logger.warn(
            `User ${bodyObj.sp_id} does not belong to dealer ${dealerId}`
          );
        } else {
          const notificationData = await getNotificationTemplate(
            "leads",
            bodyObj
          );

          sendNotification({
            category: "leads",
            userId: newAssignee.user_id,
            recordId: leadId,
            deviceToken: newAssignee.device_token,
            title: notificationData.title,
            body: notificationData.body,
            content: notificationData.content || null,
          }).catch((notificationError) => {
            logger.error(
              `Failed to send notification for lead ID ${leadId} to user ${newAssignee.user_id}: ${notificationError.message}`
            );
          });
        }
      }

      logger.info(`Lead ${leadId} updated successfully by dealer ${dealerId}`);

      return responses.success(
        res,
        `Enquiry updated ${process.env.ST201}`,
        updatedLead
      );
    } else {
      return responses.badRequest(res, "No lead was updated or access denied");
    }
  } catch (error) {
    logger.error(
      `Error updating lead by dealer ${req.dealer_id} at ${req.originalUrl}: ${error.message}`
    );

    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error.message);
  }
};

const getAllVehicles = async (req, res) => {
  try {
    const { vehicle_name } = req.query;
    const { dealerId } = req;

    const whereCondition = { deleted: false, dealer_id: dealerId };
    if (vehicle_name) {
      whereCondition.vehicle_name = vehicle_name;
    }

    const vehicles = await Vehicles.findAll({
      where: whereCondition,
      attributes: [
        "vehicle_id",
        "vehicle_name",
        "asset_name",
        "VIN",
        "brand",
        "YOM",
        "identity",
        "type",
        "houseOfBrand",
      ],
      order: [["updated_at", "DESC"]],
      raw: true,
    });

    const uniqueVehicle = [...new Set(vehicles.map((v) => v.vehicle_name))];

    const flatVehicles = vehicles.map((v) => ({
      vehicle_id: v.vehicle_id,
      vehicle_name: v.vehicle_name,
      asset_name: v.asset_name,
      type: v.type,
      YOM: v.YOM,
      VIN: v.VIN,
      brand: v.brand,
      identity: v.identity,
      houseOfBrand: v.houseOfBrand,
    }));

    const responseData = {
      uniqueVehicle,
      vehicles: flatVehicles,
    };

    return responses.success(
      res,
      `Vehicles fetched ${process.env.ST201}`,
      responseData
    );
  } catch (error) {
    console.error("Error getting Vehicles", error);
    return responses.serverError(res, error.message);
  }
};

const addVariant = async (req, res) => {
  try {
    const dealer = await Dealers.findByPk(req.dealerId);
    const bodyObj = req.body;
    const created = await Vehicles.create({
      ...bodyObj,
      brand: "Land Rover",
      corporate_id: dealer.corporate_id,
      dealer_id: req.dealerId,
    });
    return responses.success(res, "Variant(s) added successfully", created);
  } catch (error) {
    console.error("Error creating variant:", error);
    return responses.serverError(res, error.message);
  }
};

const updateVariant = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const bodyObj = req.body;

    const vehicle = await Vehicles.findOne({
      where: { vehicle_id: vehicleId },
    });
    if (!vehicle) {
      console.error("Vehicle not found for update:", vehicleId);
      return responses.notFound(res, "Vehicle not found or not accessible");
    }
    const updatedVariant = await Vehicles.update(
      {
        ...bodyObj,
      },
      {
        where: { vehicle_id: vehicleId },
        returning: true,
      }
    );

    return responses.success(res, "Variant updated successfully", {
      vehicle_id: vehicleId,
      updatedVariant,
    });
  } catch (error) {
    console.error("Error updating variant:", error);
    return responses.serverError(res, error.message);
  }
};

const deleteVariant = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { variant_id, variant } = req.body;
    const { dealerId } = req;

    if (!variant_id && !variant) {
      return responses.badRequest(
        res,
        "variant_id or variant name is required to delete a variant"
      );
    }

    const vehicle = await Vehicles.findOne({
      where: { vehicle_id: vehicleId, dealer_id: dealerId, deleted: false },
    });

    if (!vehicle) {
      return responses.notFound(res, "Vehicle not found or not accessible");
    }

    const beforeCount = vehicle.asset_name.length;

    vehicle.asset_name = vehicle.asset_name.filter((v) => {
      if (variant_id) return v.variant_id !== variant_id;
      if (variant) return v.variant !== variant;
      return true;
    });

    if (beforeCount === vehicle.asset_name.length) {
      return responses.notFound(res, "Variant not found for this vehicle");
    }

    vehicle.changed("asset_name", true);
    await vehicle.save();

    return responses.success(res, "Variant deleted successfully", {
      vehicle_id: vehicleId,
      deletedVariant: variant_id || variant,
    });
  } catch (error) {
    console.error("Error deleting variant:", error);
    return responses.serverError(res, error.message);
  }
};

const getAllTD = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    // Base where condition
    let whereCondition = {
      dealer_id: req.dealerId,
      deleted: false,
      subject: "Test Drive",
      completed: false,
      status: "Planned",
    };

    // If search query provided, allow searching in specific fields
    if (search && search.trim() !== "") {
      const searchFields = [
        "lead_email",
        "email",
        "PMI",
        "mobile",
        "location",
        "model",
        "subject",
        "due_date",
      ];
      whereCondition = {
        ...whereCondition,
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${search.trim()}%` },
        })),
      };
    }

    const result = await Events.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const totalRecords = result.count;
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const responseData = {
      events: result.rows,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRecords,
        limit: limit,
        hasNextPage: hasNextPage,
        hasPreviousPage: hasPreviousPage,
      },
      search: search,
    };

    logger.info(
      `Fetch Test Drive events attempt by dealer ${req.dealerId} - Page: ${page}, Search: "${search}", Total: ${totalRecords}`
    );

    return responses.success(
      res,
      `Events data fetched ${process.env.ST201}`,
      responseData
    );
  } catch (error) {
    console.error("Error fetching events:", error);
    logger.error(
      `Error fetching events by dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  showProfile,
  createUser,
  updateUser,
  getAllUsersByDealer,
  getAllTeams,
  dataAgainstUser,
  deleteUser,
  getAllLeads,
  getLeadById,
  getAllOpportunities,
  getOppById,
  createTarget,
  getAllTargets,
  getAllEvents,
  viewAllTasks,
  viewTaskById,
  existingExcellence,
  reassignLead,
  reassignTestDrive,
  getAllTD,
  updateLeadByDealer,
  getAllVehicles,
  addVariant,
  updateVariant,
  deleteVariant,
  getAllUsers,
};
