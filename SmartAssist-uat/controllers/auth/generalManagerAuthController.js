const logger = require("../../middlewares/fileLogs/logger");
const Dealers = require("../../models/master/dealerModel");
const responses = require("../../utils/globalResponse");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  generateAndSendOtpForGM,
} = require("../../middlewares/emails/triggerEmailOTP");
const {
  validatePwd,
} = require("../../middlewares/validators/validatorMiddleware");
const GeneralManager = require("../../models/master/generalManagerModel");
const DealerLogins = require("../../models/master/dealerLoginModel");
const dateController = require("../../utils/dateFilter");
const dpLogins = require("../../models/master/dpLoginModel");

// verify email for GM
const verifyEmailOfGeneralManager = async (req, res) => {
  const { email } = req.body;
  try {
    let record = null;
    let model = null;
    let emailField = null;

    record = await GeneralManager.findOne({ where: { email } });
    if (record) {
      model = GeneralManager;
      emailField = "email";
    }

    if (!record) {
      record = await Dealers.findOne({ where: { dealer_email: email } });
      if (record) {
        model = Dealers;
        emailField = "dealer_email";
      }
    }

    if (!record) {
      record = await dpLogins.findOne({ where: { email } });
      if (record) {
        model = dpLogins;
        emailField = "email";
      }
    }

    if (!record) {
      record = await DealerLogins.findOne({ where: { dealer_email: email } });
      if (record) {
        model = DealerLogins;
        emailField = "dealer_email";
      }
    }

    if (!record) {
      logger.error(`Email ${email} does not exist`);
      return responses.badRequest(res, process.env.NO_EMAIL);
    }

    // 5️⃣ Handle OTP logic
    if (record.otp_validated === false) {
      await generateAndSendOtpForGM(email);
      logger.info(`OTP sent for ${email}`);
      return responses.success(res, process.env.OTP_SENT);
    }

    if (record.otp_validated === true) {
      await model.update(
        { otp_validated: false },
        { where: { [emailField]: email } }
      );

      await generateAndSendOtpForGM(email);
      logger.info(`OTP re-sent for ${email} (reset password request)`);
    }

    logger.info(`OTP verification flow complete for ${email}`);
    return responses.success(res, "Proceed to enter password");
  } catch (error) {
    console.error("Failed to send OTP:", error);
    logger.error("Failed to send OTP:", error);
    return res.status(500).json({ error: process.env.ST500 });
  }
};

const verifyOptOfGeneralManager = async (req, res) => {
  try {
    const { otp, email } = req.body;

    let generalManager = await GeneralManager.findOne({ where: { email } });
    let modelUsed = "GeneralManager";

    if (!generalManager) {
      generalManager = await Dealers.findOne({
        where: { dealer_email: email },
      });
      modelUsed = "Dealers";
    }
    if (!generalManager) {
      generalManager = await DealerLogins.findOne({
        where: { dealer_email: email },
      });
      modelUsed = "DealerLogins";
    }

    if (!generalManager) {
      generalManager = await dpLogins.findOne({ where: { email } });
      modelUsed = "dpLogins";
    }
    if (!generalManager) {
      logger.error(`GeneralManager with Email ${email} does not exist`);
      return responses.badRequest(res, process.env.NO_EMAIL);
    }

    const currentTime = dateController.CurrentDate();
    if (
      generalManager.otp !== otp ||
      currentTime > generalManager.otp_expiration
    ) {
      logger.error(`Invalid OTP entered for generalManager ${email}`);
      return responses.badRequest(res, process.env.INV_OTP);
    }

    logger.info(
      `OTP verified for generalManager ${
        generalManager.generalManager_id ||
        generalManager.dealer_id ||
        generalManager.dp_id
      }`
    );

    // Only update the correct model
    if (modelUsed === "GeneralManager") {
      await GeneralManager.update(
        { otp_validated: true },
        { where: { email } }
      );
    } else if (modelUsed === "Dealers") {
      await Dealers.update(
        { otp_validated: true },
        { where: { dealer_email: email } }
      );
    } else if (modelUsed === "dpLogins") {
      await dpLogins.update({ otp_validated: true }, { where: { email } });
    } else if (modelUsed === "DealerLogins") {
      await DealerLogins.update(
        { otp_validated: true },
        { where: { dealer_email: email } }
      );
    }

    return responses.success(res, process.env.VERIFIED);
  } catch (error) {
    logger.error(
      `OTP verification failed for email ${req.body.email}: ${error.message}`
    );
    return responses.serverError(res, process.env.ST500);
  }
};

const createNewPwdForGeneralManager = async (req, res) => {
  const { email, newPwd, confirmPwd } = req.body;

  try {
    let user = null;
    let model = null;
    let whereCondition = {};

    // 1️⃣ Check in GeneralManager
    user = await GeneralManager.findOne({ where: { email } });
    if (user) {
      model = GeneralManager;
      whereCondition = { email };
    }

    // 2️⃣ Check in Dealers
    if (!user) {
      user = await Dealers.findOne({ where: { dealer_email: email } });
      if (user) {
        model = Dealers;
        whereCondition = { dealer_email: email };
      }
    }

    if (!user) {
      user = await dpLogins.findOne({ where: { email } });
      if (user) {
        model = dpLogins;
        whereCondition = { email };
      }
    }

    // 3️⃣ Check in DealerLogins
    if (!user) {
      user = await DealerLogins.findOne({ where: { dealer_email: email } });
      if (user) {
        model = DealerLogins;
        whereCondition = { dealer_email: email };
      }
    }

    // 4️⃣ If still not found
    if (!user) {
      logger.error(`Email ${email} not found in any table`);
      return responses.badRequest(res, process.env.NO_EMAIL);
    }

    // 5️⃣ Validate password format
    validatePwd(newPwd);

    // 6️⃣ Check for mismatch
    if (newPwd !== confirmPwd) {
      logger.error(`Password mismatch for ${email}`);
      return responses.badRequest(res, process.env.PWD_MISMATCH);
    }

    // 7️⃣ Hash password
    const hashPwd = await bcrypt.hash(newPwd, 10);

    // 8️⃣ Update password in the correct model
    const updatedUser = await model.update(
      { password: hashPwd },
      { where: whereCondition, returning: true }
    );

    // 9️⃣ Generate JWT token
    const token = jwt.sign(
      {
        userId:
          user.generalManager_id ||
          user.dealer_id ||
          user.login_id ||
          user.dp_id,
        userRole: user.role,
        userEmail: email,
        dealerId: user.dealer_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    logger.info(`Password updated successfully for ${email}`);
    return responses.created(res, "Password updated successfully", {
      updatedUser,
      token,
    });
  } catch (error) {
    logger.error(`Password creation failed for ${email}: ${error.message}`);
    return responses.serverError(res, process.env.ST500);
  }
};

const loginAsGeneralManager = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = null;
    let model = null;
    let whereCondition = {};

    // 1️⃣ Check in GeneralManager
    user = await GeneralManager.findOne({ where: { email } });
    if (user) {
      model = GeneralManager;
      whereCondition = { email };
    }
    if (!user) {
      user = await dpLogins.findOne({ where: { email } });
      if (user) {
        model = dpLogins;
        whereCondition = { email };
      }
    }

    // 2️⃣ Check in Dealers
    if (!user) {
      user = await Dealers.findOne({ where: { dealer_email: email } });
      if (user) {
        model = Dealers;
        whereCondition = { dealer_email: email };
      }
    }

    // 3️⃣ Check in DealerLogins
    if (!user) {
      user = await DealerLogins.findOne({ where: { dealer_email: email } });
      if (user) {
        model = DealerLogins;
        whereCondition = { dealer_email: email };
      }
    }

    // 4️⃣ If no user found
    if (!user) {
      logger.error(`Login failed - Email ${email} not found in any table`);
      return responses.unauthorized(res, process.env.INVALID_EMAIL);
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

    // 5️⃣ Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn(`Invalid password attempt for ${email}`);
      return responses.unauthorized(res, process.env.WRONG_PWD);
    }

    // 6️⃣ Create JWT token
    const token = jwt.sign(
      {
        userId:
          user.generalManager_id ||
          user.dealer_id ||
          user.login_id ||
          user.dp_id,
        role: user.role,
        userEmail: email,
        dealerId: user.dealer_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 7️⃣ Store token in the correct model
    await model.update({ access_token: token }, { where: whereCondition });

    logger.info(`Login successful for ${email}`);

    return responses.success(res, "Login successful", {
      token,
      user,
    });
  } catch (error) {
    logger.error(`Login error for ${req.body.email}: ${error.message}`);
    console.error("Login error:", error);
    return responses.badRequest(res, error.message);
  }
};

module.exports = {
  verifyEmailOfGeneralManager,
  verifyOptOfGeneralManager,
  createNewPwdForGeneralManager,
  loginAsGeneralManager,
};
