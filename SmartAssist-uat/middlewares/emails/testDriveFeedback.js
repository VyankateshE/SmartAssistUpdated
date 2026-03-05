require("dotenv").config();
const nodemailer = require("nodemailer");
const Dealer = require("../../models/master/dealerModel");
const Events = require("../../models/transactions/eventModel");
const logger = require("../../middlewares/fileLogs/logger");
const node_env = process.env.NODE_ENV;

// Transporter setup (using Gmail as an example)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

const BRAND_LOGOS = {
  DEFENDER: process.env.DEFENDER,
  RANGE_ROVER: process.env.RANGE_ROVER,
  DISCOVERY: process.env.DISCOVERY,
  JAGUAR: process.env.JAGUAR,
};

const getBrandLogo = (houseOfBrand) => {
  return BRAND_LOGOS[houseOfBrand] || BRAND_LOGOS.DISCOVERY;
};

// Send feedback function
const sendFeedback = async (eventId) => {
  const event = await Events.findByPk(eventId, {
    attributes: ["lead_email", "dealer_id", "event_id", "name", "assigned_to"],
  });
  const toEmail =
    node_env === "production"
      ? event.lead_email
      : [
          "mustafa.sayyed@ariantechsolutions.com",
          "saad.ansari@ariantechsolutions.com",
          "shubhangi.zade@ariantechsolutions.com",
        ];

  const brandLogo = getBrandLogo(event.houseOfBrand);

  const dealer = await Dealer.findByPk(event.dealer_id, {
    attributes: ["dealer_name", "dealer_code"],
  });

  const msg = {
    from: `"${dealer.dealer_name}" <${process.env.EMAIL}>`,
    to: toEmail,
    subject: "Test Drive Feedback",
    html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
    <div style="text-align: right; margin-bottom: 20px;">
      <img src= "${brandLogo}" alt="Company Logo" class="logo" width="60" />
    </div>
    <p>Hello <strong>${event.name}</strong>,</p>
    <p>thank you for taking a test drive with ${dealer.dealer_name} We’d love to hear your
    <a href="feedbacks.smartassistapp.in/feedback/${eventId}" style="color: #3b5998; text-decoration: underline;">feedback</a>.
    </p>
  </div>`,
  };
  try {
    await transporter.sendMail(msg);
    logger.info("Feedback sent successfully");
  } catch (error) {
    console.error("Error sending feedback:", error);
    logger.error("Error sending feedback:", error);
    if (error.response) {
      console.error(error.response.body);
      logger.error(error.response.body);
    }
  }
};

module.exports = {
  sendFeedback,
};
