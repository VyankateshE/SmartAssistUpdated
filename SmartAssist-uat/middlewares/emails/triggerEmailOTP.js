const logger = require("../../middlewares/fileLogs/logger");
const nodemailer = require("nodemailer");
const Users = require("../../models/master/usersModel");
const SuperAdmin = require("../../models/master/superAdminModel");
const SuperAdminLogins = require("../../models/master/superAdminLoginModel");
const GeneralManager = require("../../models/master/generalManagerModel");
const DealerLogins = require("../../models/master/dealerLoginModel");
const Dealers = require("../../models/master/dealerModel");
require("dotenv").config();
const node_env = process.env.NODE_ENV;

const Dealer = require("../../models/master/dealerModel");
const dpLogins = require("../../models/master/dpLoginModel");
// Transporter setup (using Gmail as an example)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// Send OTP function
const sendOtpEmail = async (email, otp, name) => {
  const toEmail =
    node_env === "production"
      ? email
      : [
          "mustafa.sayyed@ariantechsolutions.com",
          "sonam.chaudhary@ariantechsolutions.com",
          "saad.ansari@ariantechsolutions.com",
          "anand.yadav@ariantechsolutions.com",
        ];
  const otpBoxes = otp
    .toString()
    .split("")
    .map((digit, i) => {
      const margin = i !== otp.length - 1 ? "margin-right:6px;" : "";
      return `<span style="
      display:inline-block; 
      background-color:#f2f2f2; 
      padding:10px 12px; 
      border-radius:10px; 
      font-size:20px; 
      font-weight:bold; 
      text-align:center; 
      width: 40px;
      line-height: 40px;
      vertical-align: middle;
      box-sizing: border-box;
      ${margin}
    ">${digit}</span>`;
    })
    .join("");
  const msg = {
    from: process.env.EMAIL,
    to: toEmail,
    subject: "Set your password",
    html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
    <div style="text-align: right; margin-bottom: 20px;">
      <img src="https://smartassist-media.s3.ap-south-1.amazonaws.com/declaration-consents/JLR-logo.png" alt="Company Logo" class="logo" width="60" />
    </div>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Please use the following OTP to set your password:</p>

    <div style="white-space: nowrap; overflow-x: auto;">
      ${otpBoxes}
    </div>

    <p>This OTP is valid for <strong>2</strong> minutes. Please note, this OTP is valid only for this transaction and cannot be used for any other transaction.</p>
  </div>`,
  };
  try {
    await transporter.sendMail(msg);
    console.log("OTP sent successfully");
  } catch (error) {
    console.error("Error sending OTP:", error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
};

const generateAndSendOtpForDealer = async (dealer_email) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiration = new Date(Date.now() + 2 * 60000); // 2 minutes

    // Check if email exists in main Dealer table
    let dealer = await Dealer.findOne({ where: { dealer_email } });
    if (dealer) {
      await Dealer.update(
        { otp, otp_expiration: otpExpiration, otp_validated: false },
        { where: { dealer_email } }
      );
    } else {
      // Check in DealerLogins table
      const dealerLogin = await DealerLogins.findOne({
        where: { dealer_email },
      });
      if (!dealerLogin) throw new Error("Dealer email not found");

      await DealerLogins.update(
        { otp, otp_expiration: otpExpiration, otp_validated: false },
        { where: { dealer_email } }
      );
    }

    // Send OTP email
    await sendOtpEmail(dealer_email, otp, "Dealer");

    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    console.error("Error generating OTP for Dealer:", error);
    return { success: false, message: error.message };
  }
};

const generateAndSendOtpForEmail = async (email, name) => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const otpExpiration = new Date(Date.now() + 2 * 60000);
  await Users.update(
    { otp, otp_expiration: otpExpiration },
    { where: { email: email } }
  );
  await sendOtpEmail(email, otp, name);
};

const generateAndSendOtpForGM = async (email) => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const otpExpiration = new Date(Date.now() + 2 * 60000);

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

  // 4️⃣ If still not found, throw error
  if (!user) {
    logger.error(`Email ${email} does not exist.`);
    throw new Error("Email not found");
  }

  // 5️⃣ Update OTP fields in the correct model
  await model.update(
    {
      otp,
      otp_expiration: otpExpiration,
      otp_validated: false,
    },
    { where: whereCondition }
  );

  // 6️⃣ Send OTP via email
  const name = user.name || user.dealer_name || "Admin";
  await sendOtpEmail(email, otp, name);

  logger.info(`OTP generated and sent to ${email}`);
};

const generateAndSendOtpForSuper = async (email) => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const otpExpiration = new Date(Date.now() + 2 * 60000);

  // Check if email exists in main table
  let user = await SuperAdmin.findOne({ where: { email } });
  if (user) {
    await SuperAdmin.update(
      { otp, otp_expiration: otpExpiration, otp_validated: false },
      { where: { email } }
    );
  } else {
    // Check extra emails table
    const extraLogin = await SuperAdminLogins.findOne({ where: { email } });
    if (!extraLogin) throw new Error("Email not found");

    await SuperAdminLogins.update(
      { otp, otp_expiration: otpExpiration, otp_validated: false },
      { where: { email } }
    );
  }

  await sendOtpEmail(email, otp, "Super Admin");
};

module.exports = {
  generateAndSendOtpForEmail,
  generateAndSendOtpForSuper,
  generateAndSendOtpForDealer,
  generateAndSendOtpForGM,
};
