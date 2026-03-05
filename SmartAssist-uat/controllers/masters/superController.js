require("dotenv").config();
const TeamMaster = require("../../models/master/teamMasterModel");
const superAdmin = require("../../models/master/superAdminModel");
const Dealers = require("../../models/master/dealerModel");
const Roles = require("../../models/master/roleModel");
const Users = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const logErrorToDB = require("../../middlewares/dbLogs/masterDbLogs");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const logger = require("../../middlewares/fileLogs/logger");
const fs = require("fs");
const path = require("path");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const { trimStringValues } = require("../../utils/formatter");
const {
  validateEmail,
  validateInput,
  validatePhoneNumber,
} = require("../../middlewares/validators/validatorMiddleware");
const responses = require("../../utils/globalResponse");

// Create a new super admin user
const createSuperAdmin = async (req, res) => {
  try {
    const { email, name, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    //formartting
    const formattedName = trimStringValues([name]);
    //validate user
    validateEmail(email);
    validateInput([formattedName[0]]);

    const isDuplicate = await superAdmin.findOne({
      where: { email: email },
    });
    if (isDuplicate) {
      logger.warn(
        `Duplicate record attempt for superadmin with email ${email} by user ${req.userId}`
      );
      return responses.badRequest(
        res,
        `Super Admin ${process.env.IS_DUPLICATE}`
      );
    }

    const newSuperAdmin = await superAdmin.create({
      email,
      name: formattedName[0],
      password: hashed,
    });
    return responses.created(
      res,
      `Super Admin created ${process.env.ST201}`,
      newSuperAdmin
    );
  } catch (error) {
    console.error("Error creating superAdmin:", error);
    return responses.badRequest(res, error.message);
  }
};
//end//

//create user as superadmin
const createUser = async (req, res) => {
  try {
    const { userId } = req;
    const bodyObj = req.body;

    //formatting
    const formattedName = trimStringValues([bodyObj.fname, bodyObj.lname]);

    //validate user data
    validateEmail(bodyObj.email);
    validateInput([formattedName[0], formattedName[1]]);
    validatePhoneNumber([bodyObj.phone]);

    const dealer = await Dealers.findByPk(bodyObj.dealer_id);
    const role = await Roles.findOne({
      where: { role_name: bodyObj.user_role },
    });
    const team = await TeamMaster.findByPk(bodyObj.team_id);

    // Check if email or acc id already exists in the database
    const isDuplicate = await Users.findOne({
      where: { email: bodyObj.email },
    });
    if (isDuplicate) {
      logger.warn(
        `Duplicate record attempt for user with email ${bodyObj.email} by user ${userId}`
      );
      return responses.badRequest(res, `User ${process.env.IS_DUPLICATE}`);
    }
    if (!role) {
      logger.error(`Role ${bodyObj.user_role} not found`);
      return responses.notFound(res, `Role ${process.env.ST404}`);
    }
    const user = await Users.create({
      ...bodyObj,
      fname: formattedName[0],
      lname: formattedName[1],
      name: formattedName[0] + " " + formattedName[1],
      dealer_name: dealer.dealer_name,
      dealer_code: dealer.dealer_code,
      dealer_location: dealer.location,
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
      logger.error(`Error updating teams data`);
    }

    logger.info(
      `User created sucessfully by user ${userId} with account Id ${bodyObj.user_account_id}`
    );

    return responses.created(res, `User created ${process.env.ST201}`, user);
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
      `Error creating User by user ${req.userId} at ${req.originalUrl}: ${error.message}`
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

//update user as a super admin
const updateUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const bodyObj = req.body;

    //formatting
    const formattedName = trimStringValues([bodyObj.fname, bodyObj.lname]);
    //validate user input
    validateInput([formattedName[0], formattedName[1]]);
    validateEmail(bodyObj.email);
    validatePhoneNumber([bodyObj.phone]);

    const user = await Users.update(
      {
        ...bodyObj,
        name: formattedName[0] + formattedName[1],
        fname: formattedName[0],
        lname: formattedName[1],
      },
      { where: { user_id: userId }, returning: true }
    );
    return responses.success(res, `User updated ${process.env.ST201}`, user);
  } catch (error) {
    const userId = req.params.userId;
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
      `Error updating user with ID ${userId} by user ${req.userId} at ${requestUrl}: ${error.message}`
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

    console.error("Error updating user : ", error);
    return responses.badRequest(res, error.message);
  }
};
//end//

//get all users as an super admin
const getAllUsersBySuperAdmin = async (req, res) => {
  try {
    // Find users with pagination
    const users = await Users.findAndCountAll({
      where: { deleted: false },
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
//end//

//show profile
const showProfile = async (req, res) => {
  try {
    const { corporate_id } = req;
    const user = await superAdmin.findOne({
      where: { corporate_id: corporate_id },
    });

    if (!user) {
      return responses.notFound(res, "Super Admin profile not found.");
    }

    return responses.success(res, `Profile fetched ${process.env.ST201}`, user);
  } catch (error) {
    console.error("Error fetching Super Admin profile:", error);
    return responses.serverError(res, error.message);
  }
};

//end

//show all leads
const getAllLeads = async (req, res) => {
  try {
    const leads = await Leads.findAndCountAll({
      where: { deleted: false },
      order: [["updated_at", "DESC"]],
    });

    logger.info(`Fetch leads attempt by user ${req.userId}`);
    return responses.success(res, `Leads fetched ${process.env.ST201}`, leads);
  } catch (error) {
    logger.error(
      `Failed to fetch leads by user ${req.userId} : ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//info of a single lead selected
const getLeadById = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const lead = await Leads.findOne({
      where: { lead_id: leadId },
    });
    return responses.success(res, `Lead fetched ${process.env.ST201}`, lead);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//data against user
const dataAgainstUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await Users.findByPk(userId);
    const data = await Promise.all([
      Leads.findAndCountAll({
        where: {
          sp_id: user.user_id,
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
          sp_id: user.user_id,
          deleted: false,
          subject: "Test Drive",
        },
        order: [["updated_at", "DESC"]],
      }),
      Tasks.findAndCountAll({
        where: {
          sp_id: user.user_id,
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
      `Request made by user ${req.userId} for viewing Leads against user with ID ${userId}`
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
      `Failed request attempt made by user ${req.userId} for leads against user at ${requestUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get All opportunities
const getAllOpportunities = async (req, res) => {
  try {
    //find opportunities with limit
    const newOpp = await Leads.findAndCountAll({
      where: { deleted: false, converted: true },
      order: [["updated_at", "DESC"]],
    });

    logger.info(`Fetch opportunities attempt by user ${req.userId}`);
    return responses.success(
      res,
      `Opportunities fetched ${process.env.ST201}`,
      newOpp
    );
  } catch (error) {
    logger.error(
      `Failed to fetch opportunities by user ${req.userId} : ${error.message}`
    );
    console.error("Error fetching opportunities:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

module.exports = {
  createUser,
  createSuperAdmin,
  getAllUsersBySuperAdmin,
  dataAgainstUser,
  showProfile,
  getAllLeads,
  getLeadById,
  getAllOpportunities,
  updateUser,
};
