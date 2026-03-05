const jwt = require("jsonwebtoken");
const SuperAdmin = require("../../models/master/superAdminModel");
const logger = require("../../middlewares/fileLogs/logger");
const bcrypt = require("bcrypt");
const {
  generateAndSendOtpForSuper,
} = require("../../middlewares/emails/triggerEmailOTP");
require("dotenv").config();
const responses = require("../../utils/globalResponse");
const SuperAdminLogins = require("../../models/master/superAdminLoginModel");
const {
  validatePwd,
} = require("../../middlewares/validators/validatorMiddleware");
const loginAsSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
     console.log()
    let superAdmin = await SuperAdmin.findOne({ where: { email } });

    if (!superAdmin) {
      const extraLogin = await SuperAdminLogins.findOne({ where: { email } });

      if (!extraLogin) {
        // email not found in either table
        return responses.unauthorized(res, process.env.INVALID_EMAIL);
      }

      // Load full SuperAdmin record for that corporate_id
      superAdmin = await SuperAdmin.findOne({
        where: { corporate_id: extraLogin.corporate_id },
      });

      if (!superAdmin) {
        // corporate_id in extraLogin is invalid
        return responses.unauthorized(res, process.env.INVALID_EMAIL);
      }

      // Override email and password for token creation and password check
      superAdmin = {
        ...(superAdmin.toJSON?.() ?? superAdmin),
        email: extraLogin.email,
        password: extraLogin.password,
      };
    }

    // At this point superAdmin is guaranteed to exist and have a password
    const isMatch = await bcrypt.compare(password, superAdmin.password);
    if (!isMatch) {
      logger.warn(
        `Invalid password attempt for SuperAdmin ${superAdmin.corporate_id}`
      );
      return responses.unauthorized(res, process.env.WRONG_PWD);
    }

    const token = jwt.sign(
      {
        corporate_id: superAdmin.corporate_id,
        role: superAdmin.role,
        userEmail: superAdmin.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await SuperAdmin.update(
      { access_token: token },
      { where: { corporate_id: superAdmin.corporate_id } }
    );

    logger.info(`Login successful for SuperAdmin ${superAdmin.corporate_id}`);
    return responses.success(res, "Login successful", { token, superAdmin });
  } catch (error) {
    logger.error("SuperAdmin Login Error", error);
    return responses.serverError(res, error.message);
  }
};

const verifyEmailOfSuperAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    // Try main SuperAdmin table first
    let user = await SuperAdmin.findOne({ where: { email } });
    let isExtra = false;

    // If not found, check extra emails table
    if (!user) {
      const extraLogin = await SuperAdminLogins.findOne({ where: { email } });
      if (!extraLogin) {
        logger.error(`User with Email ${email} does not exist`);
        return responses.badRequest(res, process.env.NO_EMAIL);
      }
      isExtra = true;

      // Load main SuperAdmin via corporate_id
      user = await SuperAdmin.findOne({
        where: { corporate_id: extraLogin.corporate_id },
      });
      if (!user) {
        logger.error(
          `User with corporate_id ${extraLogin.corporate_id} does not exist`
        );
        return responses.badRequest(res, process.env.NO_EMAIL);
      }

      // Override email so OTP is sent to extra email
      user.email = extraLogin.email;
    }

    // Reset OTP if already validated or generate new
    if (user.otp_validated === true) {
      logger.info(
        `User ${user.corporate_id} requested OTP again for changing password`
      );
      await user.update({ otp_validated: false });
    }

    // Generate and send OTP
    await generateAndSendOtpForSuper(user.email, user.name, isExtra);

    logger.info(`OTP verification requested for user ${user.corporate_id}`);
    return responses.success(res, process.env.OTP_SENT);
  } catch (error) {
    console.error("Failed to send email:", error);
    logger.error("Failed to send email:", error);
    return responses.serverError(res, process.env.ST500);
  }
};

const verifyOtpOfSuperAdmin = async (req, res) => {
  try {
    const { otp, email } = req.body;

    let user = await SuperAdmin.findOne({ where: { email } });
    let model = SuperAdmin; // store actual model

    if (!user) {
      user = await SuperAdminLogins.findOne({ where: { email } });
      model = SuperAdminLogins;
      if (!user) {
        return responses.badRequest(res, process.env.NO_EMAIL);
      }
    }

    const currentTime = new Date();

    if (
      user.otp !== parseInt(otp) ||
      currentTime > new Date(user.otp_expiration)
    ) {
      return responses.badRequest(res, process.env.INV_OTP);
    }
    // Update otp_validated in the correct table
    await user.update({ otp_validated: true });


    return responses.success(res, process.env.VERIFIED);
  } catch (error) {
    console.error(error);
    return responses.serverError(res, process.env.ST500);
  }
};

const createNewPwdForSuperAdmin = async (req, res) => {
  const { email, newPwd, confirmPwd } = req.body;

  try {
    // Try main SuperAdmin table first
    let user = await SuperAdmin.findOne({ where: { email } });
    let isExtra = false;

    // If not found, check extra emails table
    if (!user) {
      const extraLogin = await SuperAdminLogins.findOne({ where: { email } });
      if (!extraLogin) {
        return responses.badRequest(res, process.env.NO_EMAIL);
      }
      isExtra = true;

      // Load main SuperAdmin
      user = await SuperAdmin.findOne({
        where: { corporate_id: extraLogin.corporate_id },
      });
      if (!user) return responses.badRequest(res, process.env.NO_EMAIL);

      // Override email so password update works for the extra email
      user.email = extraLogin.email;
    }

    validatePwd(newPwd);
    // Check password match
    if (newPwd !== confirmPwd) {
      logger.error(`Password mismatch for user ${email}`);
      return responses.badRequest(res, process.env.PWD_MISMATCH);
    }

    // Hash the new password
    const hashPwd = await bcrypt.hash(confirmPwd, 10);

    // Update password in main SuperAdmin table
    await SuperAdmin.update(
      { password: hashPwd },
      { where: { corporate_id: user.corporate_id } }
    );

    // Optional: also update password in extra email table if this is an extra email
    if (isExtra) {
      await SuperAdminLogins.update(
        { password: hashPwd },
        { where: { email } }
      );
    }

    // Generate token
    const token = jwt.sign(
      {
        corporate_id: user.corporate_id,
        role: user.role,
        userEmail: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    logger.info(`Password updated successfully for user ${user.corporate_id}`);
    return responses.success(res, "Password updated successfully", { token });
  } catch (error) {
    logger.error(`Password update failed for user ${email}`, error);
    return responses.badRequest(res, error.message);
  }
};

module.exports = {
  loginAsSuperAdmin,
  verifyEmailOfSuperAdmin,
  verifyOtpOfSuperAdmin,
  createNewPwdForSuperAdmin,
};
