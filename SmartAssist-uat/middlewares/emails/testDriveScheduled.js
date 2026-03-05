const nodemailer = require("nodemailer");
// const Events = require("../../models/transactions/eventModel");
const Dealer = require("../../models/master/dealerModel");
const logger = require("../../middlewares/fileLogs/logger");
// const { sendOtpToStartDrive } = require("../../utils/sendSMS");
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
};

const getBrandLogo = (houseOfBrand) => {
  return BRAND_LOGOS[houseOfBrand] || BRAND_LOGOS.DISCOVERY;
};

const sendConfirmation = async (event, user) => {
  const toEmail =
    node_env === "production"
      ? event.lead_email
      : [
          "mustafa.sayyed@ariantechsolutions.com",
          "saad.ansari@ariantechsolutions.com",
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
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
  <div style="text-align: right; margin-bottom: 20px;">
    <img src="${brandLogo}" alt="Brand Logo" style="width: 120px; max-width: 100%;" />
  </div>

  <p>Hello <strong>${event.name}</strong>,</p>
  <p>Thank you for requesting a test drive of <b>${event.PMI}</b> with <b>${
    dealer.dealer_name
  }</b>. It has been scheduled for <b>${event.start_date}</b> at <b>${
    event.start_time
  }</b>. For any assistance, call <b>${user.name}</b> on <b>+91-${
    user.phone || "000000 0000"
  }</b></p>`;

  const msg = {
    from: `"${dealer?.dealer_name}" <${process.env.EMAIL}>`,
    to: toEmail,
    subject: "Test drive confirmation",
    html,
  };

  try {
    await transporter.sendMail(msg);
    logger.info("✅ confirmation sent successfully to", event.email);
  } catch (error) {
    console.error("❌ Error sending confirmation:", error.message || error);
    logger.error("❌ Error sending confirmation:", error.message || error);
    if (error.response?.body) {
      console.error("SMTP response:", error.response.body);
      logger.error("SMTP response:", error.response.body);
    }
  }
};

module.exports = { sendConfirmation };
