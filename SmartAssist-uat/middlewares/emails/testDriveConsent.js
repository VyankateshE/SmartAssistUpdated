const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
const Events = require("../../models/transactions/eventModel");
const Dealer = require("../../models/master/dealerModel");
const logger = require("../../middlewares/fileLogs/logger");
const { sendOtpToStartDrive } = require("../../utils/sendSMS");
require("dotenv").config();
const node_env = process.env.NODE_ENV;

// Transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// Send OTP function
const BRAND_LOGOS = {
  DEFENDER: process.env.DEFENDER,
  RANGE_ROVER: process.env.RANGE_ROVER,
  DISCOVERY: process.env.DISCOVERY,
  JAGUAR: process.env.JAGUAR,
};

const getBrandLogo = (houseOfBrand) => {
  return BRAND_LOGOS[houseOfBrand] || BRAND_LOGOS.RANGE_ROVER;
};

const sendConsentForDrive = async (email, otp, event) => {
  const toEmail =
    node_env === "production"
      ? email
      : [
          "mustafa.sayyed@ariantechsolutions.com",
          "sonam.chaudhary@ariantechsolutions.com",
          "anand.yadav@ariantechsolutions.com",
          "vishal.mishra@ariantechsolutions.com",
          "durgesh.sharma@ariantechsolutions.com",
          "saad.ansari@ariantechsolutions.com",
          "shubhangi.zade@ariantechsolutions.com",
        ];
  const brandLogo = getBrandLogo(event.houseOfBrand);

  let dealer;
  try {
    dealer = await Dealer.findByPk(event.dealer_id, {
      attributes: ["dealer_name", "dealer_code"],
    });
  } catch (err) {
    console.error("Failed to fetch dealer details:", err.message || err);
    return;
  }

  const otpBoxHtml = otp
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

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
  <div style="text-align: right; margin-bottom: 20px;">
    <img src="${brandLogo}" alt="Brand Logo" style="width: 120px; max-width: 100%;" />
  </div>

  <p>Hello <strong>${event.name}</strong>,</p>
  <p>Thank you for choosing <b>${dealer.dealer_name}</b> for your Test Drive experience.</p>
  <p>Please share the OTP with <b>${event.assigned_to}</b> to start the Test Drive for <b>${event.PMI}</b>:</p>

  <div style="white-space: nowrap; overflow-x: auto;">
    ${otpBoxHtml}
  </div>

  <p>This OTP is valid for <strong>2</strong> minutes. Please note, this OTP is valid only for this transaction and cannot be used for any other transaction.</p>

  <p>
    By sharing this One Time Password, you agree to the
    <a href="https://smartassistapp.in/td-dec/" style="color: #3b5998; text-decoration: underline;">Terms & Conditions</a>.
  </p>
</div>
  `;

  const msg = {
    from: `"${dealer?.dealer_name}" <${process.env.EMAIL}>`,
    to: toEmail,
    subject: "OTP for Test Drive declaration",
    html,
  };

  try {
    await transporter.sendMail(msg);
    logger.info("✅ OTP sent successfully to", email);
  } catch (error) {
    console.error("❌ Error sending OTP:", error.message || error);
    logger.error("❌ Error sending OTP:", error.message || error);
    if (error.response?.body) {
      console.error("SMTP response:", error.response.body);
      logger.error("SMTP response:", error.response.body);
    }
  }
};

const triggerOtp = async (eventId) => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const otpExpiration = moment.tz("Asia/Kolkata").add(2, "minutes");
  const event = await Events.findByPk(eventId, { raw: true });

  await Events.update(
    { consent_otp: otp, consent_otp_expiration: otpExpiration },
    { where: { event_id: eventId } }
  );
  // const recipient = isDev ? process.env.EMAIL_FOR_OTP : event.email;
  await Promise.all([
    sendConsentForDrive(event.lead_email, otp, event),
    sendOtpToStartDrive(event.mobile, otp, event),
  ]);
};

module.exports = { triggerOtp };
