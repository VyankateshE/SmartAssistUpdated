require("dotenv").config();
const { Sequelize } = require("sequelize");
const Dealers = require("../../models/master/dealerModel");
const Targets = require("../../models/master/targetMasterModel");
const Users = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const logger = require("../../middlewares/fileLogs/logger");
const logErrorToDB = require("../../middlewares/dbLogs/masterDbLogs");
const fs = require("fs");
const path = require("path");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const sequelize = require("../../dbConfig/dbConfig");
const { Op } = require("sequelize");
const {
  validateInput,
  validatePhoneNumber,
  validateEmail,
} = require("../../middlewares/validators/validatorMiddleware");
const { trimStringValues } = require("../../utils/formatter");
const responses = require("../../utils/globalResponse");
const dateController = require("../../utils/dateFilter");

// Add a new dealer
const addDealer = async (req, res) => {
  try {
    const { corporate_id } = req;
    const { dealer_name, dealer_code, location, mobile, phone, dealer_email } =
      req.body;

    //formatting
    const name = trimStringValues([dealer_name]);

    // Validate input
    validateInput([name[0]]);
    validatePhoneNumber([mobile, phone]);
    validateEmail(dealer_email);

    // Check for duplicate dealer
    const isDuplicate = await Dealers.findOne({
      where: { dealer_code },
    });
    if (isDuplicate) {
      logger.warn(
        `Duplicate dealer attempt by user ${corporate_id} for code ${dealer_code}`
      );
      return responses.badRequest(res, `Dealer ${process.env.IS_DUPLICATE}`);
    }

    // Create new dealer
    const newDealer = await Dealers.create({
      dealer_name,
      dealer_code,
      location,
      mobile,
      phone,
      corporate_id,
      dealer_email,
    });

    // Log success message
    logger.info(
      `Dealer created successfully by user ${corporate_id} with code ${dealer_code}`
    );

    return responses.created(
      res,
      `Dealer created ${process.env.ST201}`,
      newDealer
    );
  } catch (error) {
    const { userId } = req;
    const requestUrl = req.originalUrl;

    //log errors to DB
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.corporate_id || null,
    });

    // Log error details
    logger.error(
      `Error creating dealer by user ${userId} at ${requestUrl}: ${error.message}`
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

//get all dealers
const getAllDealers = async (req, res) => {
  try {
    const dealers = await Dealers.findAndCountAll({
      where: { deleted: false },
    });
    const dealerIds = dealers.rows.map((dealer) => {
      return dealer.dealer_id;
    });
    const [
      leadsCount,
      oppsCount,
      tasksCount,
      testdriveCount,
      appointmentCount,
    ] = await Promise.all([
      Leads.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          converted: false,
        },
        group: ["dealer_id"],
      }),
      Leads.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          converted: true,
        },
        group: ["dealer_id"],
      }),
      Tasks.count({
        where: { dealer_id: { [Op.in]: dealerIds }, deleted: false },
        group: ["dealer_id"],
      }),
      Events.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          subject: "Test Drive",
        },
        group: ["dealer_id"],
      }),
      Tasks.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
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
        group: ["dealer_id"],
      }),
    ]);
    return responses.success(res, `Dealer data fetched ${process.env.ST201}`, {
      dealer: dealers,
      leadCounts: leadsCount,
      opportunityCounts: oppsCount,
      taskCounts: tasksCount,
      tDriveCounts: testdriveCount,
      appointmentCounts: appointmentCount,
    });
  } catch (error) {
    console.error("Error fetching Dealers:", error);
    return responses.badRequest(res, error.message);
  }
};

//view one dealer
const getOneDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const dealer = await Dealers.findOne({
      where: { dealer_id: dealerId },
      include: [
        {
          model: Targets,

          required: false,
        },
      ],
    });

    const data = await Promise.all([
      Users.count({ where: { dealer_id: dealerId, deleted: false } }),
      Leads.count({ where: { dealer_id: dealerId, deleted: false } }),
      Leads.count({
        where: { dealer_id: dealerId, deleted: false, converted: true },
      }),
      Tasks.count({ where: { dealer_id: dealerId, deleted: false } }),
      Events.count({ where: { dealer_id: dealerId, deleted: false } }),
    ]);

    return responses.success(res, `Dealer data fetched ${process.env.ST201}`, {
      dealer,
      users: data[0],
      leads: data[1],
      opportunities: data[2],
      tasks: data[3],
      events: data[4],
    });
  } catch (error) {
    console.error("Error fetching dealer:", error);
    return responses.serverError(res, error.message);
  }
};

//get all users of selected dealer
const getAllUsersOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const users = await Users.findAll({
      where: {
        user_role: sequelize.literal("user_role IN ('SM','PS')"),
        dealer_id: dealerId,
        deleted: false,
      },
      attributes: [
        "user_id",
        "user_account_id",
        "name",
        "email",
        "phone",
        "user_role",
        "dealer_code",
      ],
    });

    return responses.success(
      res,
      `Users of dealer fetched ${process.env.ST201}`,
      users
    );
  } catch (error) {
    logger.error("Error fetching users:", error);
    console.error("Error fetching users:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all leads of selected dealer
const getAllLeadsOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const leads = await Leads.findAll({
      where: {
        dealer_id: dealerId,
        deleted: false,
        converted: false,
      },
      attributes: {
        exclude: [
          "corporate_id",
          "dealer_id",
          "salesperson_id",
          "flag",
          "updated_by",
          "favourite",
          "converted",
          "deleted",
          "owner_acc_id",
          // "cxp_lead_code",
          "dealer_name",
          "url",
          "updated",
        ],
      },
    });

    return responses.success(
      res,
      `Lead of dealer fetched ${process.env.ST201}`,
      leads
    );
  } catch (error) {
    logger.error("Error fetching leads:", error);
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all opps of selected dealer
const getAllOppsOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const opps = await Leads.findAll({
      where: {
        dealer_id: dealerId,
        deleted: false,
        converted: true,
      },
      attributes: {
        exclude: ["updated_by", "flag", "corporate_id", "dealer_id"],
      },
    });

    return responses.success(
      res,
      `Opportunities of dealer fetched ${process.env.ST201}`,
      opps
    );
  } catch (error) {
    logger.error("Error fetching opportunities:", error);
    console.error("Error fetching opportunities:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all test drives of selected dealer
const getAllTestDrivesOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const events = await Events.findAll({
      where: {
        dealer_id: dealerId,
        deleted: false,
        subject: "Test Drive",
      },
      attributes: {
        exclude: [
          "updated_by",
          "flag",
          "lead_id",
          "opportunity_id",
          "corporate_id",
          "dealer_id",
        ],
      },
    });

    return responses.success(
      res,
      `Test Drives for dealer fetched ${process.env.ST201}`,
      events
    );
  } catch (error) {
    logger.error("Error fetching events:", error);
    console.error("Error fetching events:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all appointments of selected dealer
const getAllAppointmentsOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const events = await Events.findAll({
      where: {
        dealer_id: dealerId,
        deleted: false,
        subject: sequelize.literal("subject NOT IN ('Test Drive')"),
      },
      attributes: {
        exclude: [
          "updated_by",
          "flag",
          "lead_id",
          "opportunity_id",
          "corporate_id",
          "dealer_id",
        ],
      },
    });

    return responses.success(
      res,
      `Appointments for dealer fetched ${process.env.ST201}`,
      events
    );
  } catch (error) {
    logger.error("Error fetching events:", error);
    console.error("Error fetching events:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all tasks of selected dealer
const getAllTasksOfDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const tasks = await Tasks.findAll({
      where: {
        dealer_id: dealerId,
        deleted: false,
      },
      attributes: {
        exclude: [
          "updated_by",
          "flag",
          "lead_id",
          "opportunity_id",
          "corporate_id",
          "dealer_id",
        ],
      },
    });

    return responses.success(
      res,
      `All followups of lead fetched ${process.env.ST201}`,
      tasks
    );
  } catch (error) {
    logger.error("Error fetching follow-ups:", error);
    console.error("Error fetching follow-ups:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//update dealer
const updateDealer = async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const bodyObj = req.body;

    const updateDealer = await Dealers.update(
      { ...bodyObj },
      { where: { dealer_id: dealerId }, returning: true }
    );
    return responses.success(
      res,
      `Dealer updated ${process.env.ST201}`,
      updateDealer
    );
  } catch (error) {
    const { userId } = req;
    const requestUrl = req.originalUrl;

    //log errors to DB
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
      `Error updating dealer by user ${userId} at ${requestUrl}: ${error.message}`
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

//delete dealer
const deleteDealer = async (req, res) => {
  try {
    // const { userId } = req;
    const dealerId = req.params.dealerId;

    await Dealers.update(
      {
        deleted: true,
      },
      {
        where: { dealer_id: dealerId },
      }
    );
    return responses.success(res, `Dealer deleted ${process.env.ST201}`);
  } catch (error) {
    const { userId } = req;
    const requestUrl = req.originalUrl;

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
      `Error deleting dealer by user ${userId} at ${requestUrl}: ${error.message}`
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

    return responses.serverError(res, error.message);
  }
};
//end

//set targets
const setTarget = async (req, res) => {
  try {
    const { dealer_id, target_type, target_value } = req.body;

    // eslint-disable-next-line no-constant-binary-expression
    if (!dealer_id || !target_type || !target_value == null) {
      return responses.badRequest(
        res,
        "dealer_id, target_type, and target_value are required."
      );
    }

    const [target, created] = await Targets.findOrCreate({
      where: { dealer_id, target_type },
      defaults: { dealer_id, target_type, target_value },
    });

    if (!created) {
      await target.update({ target_value });
    }

    return responses.created(res, "Target set successfully", target);
  } catch (error) {
    logger.error(`Failed to set target: ${error.message}`);
    return responses.badRequest(res, error.message);
  }
};
//end

//app-admin access
const allDealersbyAppAdmin = async (req, res) => {
  try {
    const todayDate = dateController.CurrentDate();

    const dealersWithUsers = await Dealers.findAll({
      attributes: [
        "dealer_id",
        "dealer_name",
        "dealer_code",
        "location",
        [
          Sequelize.literal(`(
        SELECT COUNT(DISTINCT "u"."user_id")
        FROM "Users" AS "u"
        JOIN "UserActivity" AS "ua" ON "u"."user_id" = "ua"."userId"
        WHERE
          "u"."dealer_id" = "Dealers"."dealer_id" AND
          "u"."deleted" = false AND
          CAST("ua"."last_login" AS DATE) = '${todayDate}'
      )`),
          "total_active_users",
        ],
        [
          Sequelize.literal(`(
        SELECT COUNT("u"."user_id")
        FROM "Users" AS "u"
        WHERE
          "u"."dealer_id" = "Dealers"."dealer_id" AND
          "u"."deleted" = false AND
          NOT EXISTS (
            SELECT 1 FROM "UserActivity" AS "ua"
            WHERE "ua"."userId" = "u"."user_id" AND
            CAST("ua"."last_login" AS DATE) = '${todayDate}'
          )
      )`),
          "total_inactive_users",
        ],
      ],
      where: { deleted: false },
      include: [
        {
          model: Users,
          as: "Users",
          attributes: [
            "user_id",
            "name",
            "email",
            "dealer_id",
            "user_role",
            "role_id",
            "team_id",
            [
              Sequelize.literal(`
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM "UserActivity" AS "ua"
                WHERE
                  "ua"."userId" = "Users"."user_id" AND
                  CAST("ua"."last_login" AS DATE) = '${todayDate}'
              ) THEN 'active'
              ELSE 'inactive'
            END
          `),
              "status",
            ],
          ],
          where: { deleted: false, user_role: { [Op.ne]: "CEO" } },
          required: false,
        },
      ],
      order: [["dealer_name", "ASC"]],
    });

    return responses.success(res, `Dealer data fetched ${process.env.ST201}`, {
      dealersWithUsers,
    });
  } catch (error) {
    console.error("Error fetching Dealers:", error);
    return responses.badRequest(res, error.message);
  }
};

module.exports = {
  addDealer,
  getOneDealer,
  getAllDealers,
  getAllUsersOfDealer,
  getAllLeadsOfDealer,
  getAllOppsOfDealer,
  getAllTasksOfDealer,
  getAllTestDrivesOfDealer,
  getAllAppointmentsOfDealer,
  updateDealer,
  deleteDealer,
  setTarget,
  allDealersbyAppAdmin,
};
