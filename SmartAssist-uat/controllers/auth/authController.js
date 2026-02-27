const jwt = require("jsonwebtoken");
require("dotenv").config();
const User = require("../../models/master/usersModel");
const logger = require("../../middlewares/fileLogs/logger");
const logErrorToDB = require("../../middlewares/dbLogs/authDbLogs");
const moment = require("moment-timezone");
const bcrypt = require("bcrypt");
const {
  generateAndSendOtpForEmail,
} = require("../../middlewares/emails/triggerEmailOTP");
const responses = require("../../utils/globalResponse");
const {
  validatePwd,
} = require("../../middlewares/validators/validatorMiddleware");

const verifyEmail = async (req, res) => {
  try {
    const { email, excellence } = req.body;

    const whereConditions = [];

    // Only add conditions for non-null, non-empty values
    if (email != null && email !== "") {
      whereConditions.push({ email });
    }

    if (excellence != null && excellence !== "") {
      whereConditions.push({ excellence });
    }

    const user = await User.findOne({ where: whereConditions });
    if (!user) {
      logger.error(`User with Email ${email || excellence} does not exist`);
      return responses.badRequest(res, process.env.NO_EMAIL);
    } else if (user.isActive === false) {
      logger.error(`User ${user.user_id} is deactivated`);
      return responses.badRequest(
        res,
        "Your account has been deactivated. Please contact your admin."
      );
    } else if (user.otp_validated === false) {
      //generate otp
      generateAndSendOtpForEmail(user.email, user.name);
      logger.info(`OTP verification requested for user ${user.user_id}`);
      return responses.success(res, process.env.OTP_SENT);
    } else if (user.otp_validated === true) {
      logger.info(
        `User ${user.user_id} has requested to send OTP for changing password`
      );
      await user.update({ otp_validated: false });
      generateAndSendOtpForEmail(user.email, user.name);
    } else {
      logger.info(`OTP verification for user ${user.user_id} complete`);
      return responses.success(res, "Proceed to enter password");
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

    console.error("Failed to send email:", error);
    logger.error("Failed to send email:", error);
    res.status(500).json({ error: process.env.ST500 });
  }
};

//end

//verify otp
const verifyOtp = async (req, res) => {
  const { otp, email } = req.body;
  const user = await User.findOne({ where: { email } });
  try {
    if (user.isActive === false) {
      logger.error(`User ${user.user_id} is deactivated`);
      return responses.badRequest(
        res,
        "Your account has been deactivated. Please contact your admin."
      );
    }
    // Check expiration
    const currentTime = moment()
      .tz("Asia/Kolkata")
      .format("YYYY-MM-DD HH:mm:ss.SSSZ");
    if (user.otp !== otp || currentTime > user.otp_expiration) {
      logger.error(`Invalid OTP entered for user ${email}`);
      return responses.badRequest(res, process.env.INV_OTP);
    }

    // Update users table for OTP validation status
    logger.info(`OTP verified for user ${user.user_id}`);
    await User.update({ otp_validated: true }, { where: { email } });

    return responses.success(res, process.env.VERIFIED);
  } catch (error) {
    logger.error(`OTP verification failed for user ${user.user_id}`);
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    console.error("Authorization error:", error);
    return responses.serverError(res, process.env.ST500);
  }
};
//end

//create new password
const createNewPassword = async (req, res) => {
  const { email, newPwd, confirmPwd, device_token } = req.body;
  const user = await User.findOne({ where: { email } });
  try {
    validatePwd(newPwd);

    if (newPwd !== confirmPwd) {
      logger.error(`Password mismatch for user ${email}`);
      return responses.badRequest(res, process.env.PWD_MISMATCH);
    }
    const hashPwd = await bcrypt.hash(confirmPwd, 10);

    const updateUserPwd = await User.update(
      {
        password: hashPwd,
        device_token,
        last_pwd_change: moment().tz("Asia/Kolkata").format("YYYY-MM-DD"),
      },
      { where: { email }, returning: true }
    );

    // Generate token
    const token = jwt.sign(
      {
        userId: user.user_id,
        role: user.user_role,
        userEmail: user.email,
        fname: user.fname,
        lname: user.lname,
        dealerId: user.dealer_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    logger.info(`Password created successfully for user ${user.user_id}`);
    return responses.created(
      res,
      "Password created Successfully, proceed to login",
      {
        token,
        user: updateUserPwd,
      }
    );
  } catch (error) {
    const failedRecord = req.body;

    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    logger.error(`Password creation failed for`);
    return responses.badRequest(res, error.message);
  }
};
//end

const login = async (req, res) => {
  try {
    const { email, excellence, password, device_token } = req.body;

    const whereConditions = [];

    // Only add conditions for non-null, non-empty values
    if (email != null && email !== "") {
      whereConditions.push({ email });
    }

    if (excellence != null && excellence !== "") {
      whereConditions.push({ excellence });
    }

    // Find the user by email
    const user = await User.findOne({
      where: whereConditions,
    });
    if (!user) {
      logger.error(`User with Email ${email || excellence} does not exist`);
      return responses.unauthorized(res, process.env.NO_EMAIL);
    } else if (user.isActive === false) {
      logger.error(`User ${user.user_id} is deactivated`);
      return responses.badRequest(
        res,
        "Your account has been deactivated. Please contact your admin."
      );
    }
    if (user.otp_validated === false) {
      logger.error(`User ${user.user_id} has not validated OTP yet`);
      return responses.unauthorized(
        res,
        "Please validate OTP before signing in"
      );
    }
    if (user.otp_validated === true && user.password === null) {
      logger.error(`User ${user.user_id} has not set a password yet`);
      return responses.unauthorized(
        res,
        "Please continue setting your password before signing in"
      );
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn(`Incorrect password for user ${user.user_id}`);
      return responses.unauthorized(res, process.env.WRONG_PWD);
    }
    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.user_id,
        role: user.user_role,
        userEmail: user.email,
        fname: user.fname,
        lname: user.lname,
        dealerId: user.dealer_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    await user.update({
      access_token: token,
      device_token,
      last_login: moment().tz("Asia/Kolkata").format("YYYY-MM-DD"),
    });

    logger.info(`Log in attempt successful for user ${user.user_id}`);
    return responses.success(res, "Login successful", { token, user });
  } catch (error) {
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    logger.error("Failed to process request:", error);
    console.error("Failed to process request:", error);
    return responses.serverError(res, error.message);
  }
};

//end

module.exports = {
  login,
  verifyEmail,
  verifyOtp,
  createNewPassword,
};
