require("dotenv").config();
const Users = require("../../models/master/usersModel");
const Roles = require("../../models/master/roleModel");
const sequelize = require("../../dbConfig/dbConfig");
const logger = require("../../middlewares/fileLogs/logger");
const logErrorToDB = require("../../middlewares/dbLogs/masterDbLogs");
const Teams = require("../../models/master/teamMasterModel");
const fs = require("fs");
const path = require("path");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const {
  validateInput,
  validateEmail,
  validateInt,
  validatePhoneNumber,
} = require("../../middlewares/validators/validatorMiddleware");
const { trimStringValues } = require("../../utils/formatter");
const responses = require("../../utils/globalResponse");
const { createUserInMax } = require("../../exernal_apis/users_Maximizer");

//adding user as an admin
const createUser = async (req, res) => {
  try {
    const bodyObj = req.body;
    const { userId } = req;
    const adminUser = await Users.findByPk(userId);
    const role = await Roles.findOne({
      where: { role_name: bodyObj.user_role },
    });

    //format name
    const formattedName = trimStringValues([bodyObj.fname, bodyObj.lname]);
    const email = trimStringValues(bodyObj.email);
    //validate user
    // validateEmail(bodyObj.email);
    validateInput([formattedName[0], formattedName[1]]);
    validatePhoneNumber([bodyObj.phone]);

    // Check if email or acc id already exists in the database
    const isDuplicate = await Users.findOne({
      where: { email: bodyObj.email, dealer_id: req.dealerId },
    });
    if (isDuplicate) {
      logger.warn(`Duplicate user creation attempt by user ${userId}`);
      return responses.badRequest(res, `User ${process.env.IS_DUPLICATE}`);
    }
    if (!role) {
      logger.error(`Role ${role} not found`);
      return responses.badRequest(res, `Role ${process.env.ST404}`);
    }

    if (adminUser) {
      // default to admin team details
      let teamIdToAssign = adminUser.team_id;
      let teamNameToAssign = adminUser.team_name;

      // if team_id is passed in the body, validate and use it
      const adminUSerRole = await Roles.findByPk(adminUser.role_id);
      const ifRole = adminUSerRole?.role_name === "SM" || "GM";
      if (ifRole && bodyObj.team_id) {
        const selectedTeam = await Teams.findOne({
          where: { team_id: bodyObj.team_id },
        });

        if (!selectedTeam) {
          logger.error(`Invalid team_id :${bodyObj.team_id} by user ${userId}`);
          return responses.badRequest(res, "Teams not found");
        }

        (teamIdToAssign = selectedTeam.team_id),
          (teamNameToAssign = selectedTeam.team_name);
      }
      const newUser = await Users.create({
        ...bodyObj,
        fname: formattedName[0],
        lname: formattedName[1],
        email: email.toLowerCase(),
        name: formattedName[0] + " " + formattedName[1],
        dealer_id: adminUser.dealer_id,
        dealer_code: adminUser.dealer_code,
        dealer_name: adminUser.dealer_name,
        dealer_location: adminUser.dealer_location,
        corporate_id: adminUser.corporate_id,
        team_id: teamIdToAssign,
        team_name: teamNameToAssign,
        role_id: role.role_id,
      });

      logger.info(
        `User created successfully by user ${userId} with account-id ${bodyObj.user_account_id}`
      );

      responses.created(res, `User created ${process.env.ST201}`, newUser);
      const maximizerResult = await createUserInMax(newUser);

      if (maximizerResult?.error) {
        console.error(`Maximizer user creation failed for ${newUser.email}`);
      } else {
        console.log(`Maximizer response: ${JSON.stringify(maximizerResult)}`);
      }
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

    return responses.serverError(res, error.message);
  }
};
//end//

//update user as an admin
const updateUser = async (req, res) => {
  try {
    const { userId } = req;
    const {
      email,
      name,
      phone,
      user_role,
      location,
      evaluation,
      rating,
      dealer_location,
    } = req.body;

    //validate user input
    validateInput([name]);
    validateEmail(email);
    validateInt([phone]);

    const user_Id = req.params.user_Id;

    const user = await Users.findByPk(user_Id);
    const role = await Roles.findOne({ where: { role_name: user_role } });
    if (!user) {
      logger.warn(`Accessing non existing user attempt by ${userId}`);
      return responses.badRequest(res, `User ${process.env.ST404}`);
    }
    if (!role) {
      logger.warn(`Invalid role ${user_role}`);
      return responses.badRequest(res, `Role ${process.env.ST404}`);
    }

    await user.update({
      email,
      name,
      phone,
      user_role,
      location,
      evaluation,
      rating,
      dealer_location,
    });
    if (user > 0) {
      logger.info(
        `User updated successfully by user ${userId} for user ID ${user_Id}`
      );
      return responses.success(res, `User updated ${process.env.ST201}`);
    }
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
      `Error updating user by user ${userId} at ${requestUrl}: ${error.message}`
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
//end//

//get all users as an admin
const fetchAllUsers = async (req, res) => {
  try {
    const { userId } = req;

    const manager = await Users.findByPk(userId, {
      attributes: ["dealer_id", "team_id", "user_id"],
    });
    const dealer = manager.dealer_id;

    // Find users
    const users = await Users.findAndCountAll({
      where: {
        role: sequelize.literal("user_role IN ('PS')"),
        dealer_id: dealer,
        team_id: manager.team_id,
        deleted: false,
      },
      order: ["name"],
    });

    return responses.success(res, `Users fetched ${process.env.ST201}`, users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//get one user by id as an admin or super admin
const fetchUserById = async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await Users.findOne({
      where: { user_id: userId },
    });
    return responses.success(
      res,
      `User info fetched ${process.env.ST201}`,
      user
    );
  } catch (error) {
    console.error("Error fetching user:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//show user profile
const showProfile = async (req, res) => {
  try {
    const { userId } = req;
    const user = await Users.findByPk(userId);
    return responses.success(res, `Profile fetched ${process.env.ST201}`, user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//delete user by id as an admin
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const deleteData = await Users.update(
      {
        deleted: true,
      },
      { where: { user_id: userId } }
    );
    if (deleteData > 0) {
      logger.info(
        `User deleted successfully by user ${userId} for user ID ${userId}`
      );
      return responses.success(res, `User deleted ${process.env.ST201}`);
    }
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
      `Error deleting user by user ${userId} at ${requestUrl}: ${error.message}`
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
//remove profile pic
const removePic = async (req, res) => {
  try {
    const userId = req.userId;
    const removePic = await Users.update(
      {
        profile_pic: null,
      },
      { where: { user_id: userId } }
    );
    if (removePic > 0) {
      logger.info(`Profile pic removed for user ${userId}`);
      return responses.success(res, `Profile removed ${process.env.ST201}`);
    }
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
      `Error removing profile for user ${userId} at ${requestUrl}: ${error.message}`
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
//end//

const userFeedback = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await Users.findByPk(userId);

    if (!user) {
      return responses.notFound(res, "User not found");
    }

    // Destructure new feedback from the request body
    const { user_feedback } = req.body;
    const {
      knowledge: new_knowledge = 0,
      responsiveness: new_responsiveness = 0,
      dependability: new_dependability = 0,
      extra_efforts: new_extra_efforts = 0,
      easy_business: new_easy_business = 0,
    } = user_feedback;

    // Get existing feedback data, or initialize if it's the first review
    const existing_evaluation = user.evaluation || {
      knowledge: 0,
      responsiveness: 0,
      dependability: 0,
      extra_efforts: 0,
      easy_business: 0,
    };
    const existing_feedback_count = user.feedback_count || 0;
    // const existing_comments = user.feedback_comments || [];

    // Add new scores to the existing cumulative scores
    const cumulative_evaluation = {
      knowledge: existing_evaluation.knowledge + new_knowledge,
      responsiveness: existing_evaluation.responsiveness + new_responsiveness,
      dependability: existing_evaluation.dependability + new_dependability,
      extra_efforts: existing_evaluation.extra_efforts + new_extra_efforts,
      easy_business: existing_evaluation.easy_business + new_easy_business,
    };

    // Increment the total number of feedbacks received
    const new_feedback_count = existing_feedback_count + 1;

    // Extract all cumulative scores as an array
    const cumulative_scores = Object.values(cumulative_evaluation);

    // Find the max score among all cumulative categories to normalize
    const maxScore = Math.max(...cumulative_scores);

    // Avoid division by zero if maxScore is 0
    const divisor = maxScore === 0 ? 1 : maxScore;

    // Normalize each cumulative score to a 0-1 range
    const normalized_scores = cumulative_scores.map((score) => score / divisor);

    // Calculate the average normalized score (between 0 and 1)
    const avg_normalized =
      normalized_scores.reduce((a, b) => a + b, 0) / normalized_scores.length;

    // Scale the average normalized score to be out of 5
    const avg_rating = (avg_normalized * 5).toFixed(1);

    // Append the new comment to the array of existing comments
    // const updated_comments = [...existing_comments, new_comment].filter(
    //   Boolean
    // );

    // Update the user's record with the new cumulative data and normalized rating
    const [[updatedUser]] = await Users.update(
      {
        evaluation: cumulative_evaluation,
        // feedback_comments: updated_comments,
        rating: avg_rating,
        feedback_count: new_feedback_count,
        feedback_submitted: true,
      },
      {
        where: { user_id: userId },
        returning: true,
      }
    );

    if (updatedUser) {
      logger.info(`Feedback submitted successfully for user ${userId}`);
      return responses.success(res, "Feedback saved successfully", updatedUser);
    } else {
      logger.warn(`No records updated for user ${userId}`);
      return responses.badRequest(res, "Failed to update user feedback");
    }
  } catch (error) {
    logger.error("Failed to create feedback for user", {
      error: error.message,
    });
    return responses.badRequest(res, error.message);
  }
};

module.exports = {
  createUser,
  updateUser,
  fetchAllUsers,
  showProfile,
  deleteUser,
  fetchUserById,
  removePic,
  userFeedback,
};
