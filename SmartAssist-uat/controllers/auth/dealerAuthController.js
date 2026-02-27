const logger = require("../../middlewares/fileLogs/logger");
const Dealers = require("../../models/master/dealerModel");
const responses = require("../../utils/globalResponse");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  generateAndSendOtpForDealer,
} = require("../../middlewares/emails/triggerEmailOTP");
const DealerLogins = require("../../models/master/dealerLoginModel");

// verify email for dealer
const verifyEmailOfDealer = async (req, res) => {
  try {
    const { dealer_email } = req.body;

    // Try Dealers table first
    let dealer = await Dealers.findOne({ where: { dealer_email } });
    let isExtra = false;

    // If not found, check DealerLogins table
    if (!dealer) {
      const extraLogin = await DealerLogins.findOne({
        where: { dealer_email },
      });
      if (!extraLogin) {
        return responses.badRequest(res, process.env.NO_EMAIL);
      }
      isExtra = true;

      // Load parent dealer
      dealer = await Dealers.findOne({
        where: { dealer_id: extraLogin.dealer_id },
      });
      if (!dealer) return responses.badRequest(res, process.env.NO_EMAIL);

      // Override email for OTP
      dealer.dealer_email = extraLogin.dealer_email;
    }

    // Reset OTP if already validated
    if (dealer.otp_validated === true) {
      await dealer.update({ otp_validated: false });
    }

    // Send OTP
    await generateAndSendOtpForDealer(
      dealer.dealer_email,
      dealer.dealer_name,
      isExtra
    );

    return responses.success(res, process.env.OTP_SENT);
  } catch (error) {
    logger.error("Dealer Verify Email Error", error);
    return responses.serverError(res, process.env.ST500);
  }
};

const verifyOtpOfDealer = async (req, res) => {
  try {
    const { otp, dealer_email } = req.body;

    // Check Dealers table first
    let dealer = await Dealers.findOne({ where: { dealer_email } });
    // let tableName = "Dealers";

    // If not found, check DealerLogins table
    if (!dealer) {
      dealer = await DealerLogins.findOne({ where: { dealer_email } });
      // tableName = "DealerLogins";
      if (!dealer) return responses.badRequest(res, process.env.NO_EMAIL);
    }

    const now = new Date();
    if (dealer.otp !== parseInt(otp) || now > new Date(dealer.otp_expiration)) {
      return responses.badRequest(res, process.env.INV_OTP);
    }

    await dealer.update({ otp_validated: true });

    return responses.success(res, process.env.VERIFIED);
  } catch (error) {
    logger.error("Dealer Verify OTP Error", error);
    return responses.serverError(res, process.env.ST500);
  }
};
const createNewPwdForDealer = async (req, res) => {
  const { dealer_email, newPwd, confirmPwd } = req.body;

  try {
    // Try Dealers table first
    let dealer = await Dealers.findOne({ where: { dealer_email } });
    let isExtra = false;

    // If not found, check DealerLogins table
    if (!dealer) {
      const extraLogin = await DealerLogins.findOne({
        where: { dealer_email },
      });
      if (!extraLogin) return responses.badRequest(res, process.env.NO_EMAIL);
      isExtra = true;

      // Load parent dealer
      dealer = await Dealers.findOne({
        where: { dealer_id: extraLogin.dealer_id },
      });
      if (!dealer) return responses.badRequest(res, process.env.NO_EMAIL);

      dealer.dealer_email = extraLogin.dealer_email;
    }

    if (newPwd !== confirmPwd) {
      return responses.badRequest(res, process.env.PWD_MISMATCH);
    }

    const hashPwd = await bcrypt.hash(newPwd, 10);

    // Update password in main dealer table
    await Dealers.update(
      { password: hashPwd },
      { where: { dealer_id: dealer.dealer_id } }
    );

    // If extra login, update there as well
    if (isExtra) {
      await DealerLogins.update(
        { password: hashPwd },
        { where: { dealer_email } }
      );
    }

    // Generate token
    const token = jwt.sign(
      {
        dealerId: dealer.dealer_id,
        role: dealer.role,
        dealerEmail: dealer.dealer_email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return responses.success(res, "Password updated successfully", { token });
  } catch (error) {
    logger.error("Dealer Password Reset Error", error);
    return responses.serverError(res, process.env.ST500);
  }
};

const loginAsDealer = async (req, res) => {
  try {
    const { dealer_email, password } = req.body;

    // Try Dealers table first
    let dealer = await Dealers.findOne({ where: { dealer_email } });

    // If not found, check DealerLogins table
    if (!dealer) {
      const extraLogin = await DealerLogins.findOne({
        where: { dealer_email },
      });
      if (extraLogin) {
        // Load parent dealer via dealer_id
        dealer = await Dealers.findOne({
          where: { dealer_id: extraLogin.dealer_id },
        });

        if (!dealer) {
          return responses.unauthorized(res, process.env.INVALID_EMAIL);
        }

        // Override email & password for authentication
        dealer.dealer_email = extraLogin.dealer_email;
        dealer.password = extraLogin.password;
      }
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, dealer.password);
    if (!isMatch) {
      return responses.unauthorized(res, process.env.WRONG_PWD);
    }

    // Create token
    const token = jwt.sign(
      {
        dealerId: dealer.dealer_id,
        role: dealer.role,
        dealerEmail: dealer.dealer_email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await dealer.update({ access_token: token });

    return responses.success(res, "Login successful", { token, dealer });
  } catch (error) {
    logger.error("Dealer Login Error", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  verifyEmailOfDealer,
  verifyOtpOfDealer,
  createNewPwdForDealer,
  loginAsDealer,
};
