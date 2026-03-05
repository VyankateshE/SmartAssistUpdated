require("dotenv").config();
const twilio = require("twilio");
const logger = require("../middlewares/fileLogs/logger");
const Events = require("../models/transactions/eventModel");
const Dealer = require("../models/master/dealerModel");
const axios = require("axios");
// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Send OTP and consent form before start of test drive
const sendOtpToStartDrive = async (mobile, otp, event) => {
  try {
    let formatNumber;
    if (mobile.length === 13) {
      formatNumber = mobile.slice(3);
    } else if (mobile.length === 12) {
      formatNumber = mobile.slice(2);
    } else {
      formatNumber = mobile;
    }

    const messageBody = `Hello ${event.name}, Thank you for choosing JLR! Your OTP is ${otp} Please share this code with PS to begin your Test Drive. Note: OTP is valid for 2 minutes only. By sharing this OTP, you agree to the Terms & Conditions: https://smartassistapp.in/td-dec`;

    // Skip OTP sending if not production
    if (process.env.NODE_ENV !== "production") {
      logger.info("SMS sending skipped in non-production environment.", {
        mobile: formatNumber,
        otp,
        eventName: event.name,
        messageBody,
      });
      return;
    }

    const exotelUrl = `https://${process.env.EXOTEL_REGION}/v1/Accounts/${process.env.EXOTEL_SID}/Sms/send.json`;

    const form = new URLSearchParams({
      From: process.env.EXOTEL_SENDER,
      To: formatNumber,
      Body: messageBody,
      DltEntityId: process.env.EXOTEL_DLT_ENTITY_ID,
      DltTemplateId: process.env.EXOTEL_DLT_TEMPLATE_ID,
    });

    const response = await axios.post(exotelUrl, form.toString(), {
      auth: {
        username: process.env.EXOTEL_API_KEY,
        password: process.env.EXOTEL_API_TOKEN,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    logger.info("SMS sent successfully.", {
      otp,
      exotelResponse: response.data,
    });
  } catch (error) {
    console.error("Error sending SMS:", error?.response?.data || error.message);
    logger.error("Error sending SMS:", error?.response?.data || error.message);
  }
};

// Send feedback form after test drive completion
const sendFeedbackSMS = async (eventId) => {
  const event = await Events.findByPk(eventId, {
    attributes: ["name", "mobile", "dealer_id", "event_id"],
  });
  const number = event.mobile;
  const dealer = await Dealer.findByPk(event.dealer_id, {
    attributes: ["dealer_name", "dealer_code"],
  });

  try {
    const feedbackLink = `https://feedbacks.smartassistapp.in/feedback/${eventId}`;
    const message = `Hi ${event.name}, thank you for taking a test drive with ${dealer.dealer_name} We’d love to hear your feedback: ${feedbackLink}`;

    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      // to: `+918788761660`,
      to: number.startsWith("+") ? number : `+91${number}`, // Default to Indian numbers
    });

    logger.info(`Feedback SMS sent successfully`, {
      eventId,
      sid: response.sid,
    });
  } catch (error) {
    console.error("Error sending feedback SMS:", error);
    logger.error("Error sending feedback SMS:", error);
  }
};

module.exports = { sendOtpToStartDrive, sendFeedbackSMS };
