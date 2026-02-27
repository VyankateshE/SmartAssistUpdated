const nodemailer = require("nodemailer");
require("dotenv").config();
const node_env = process.env.NODE_ENV;

const sendEmailWithLogs = async (logFilePath, subject) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.LOGEMAIL,
        pass: process.env.LOGPWD,
      },
    });

    const msg = {
      to: [
        "mustafa.sayyed@ariantechsolutions.com",
        "anand.yadav@ariantechsolutions.com",
        "sonam.chaudhary@ariantechsolutions.com",
      ],

      from: process.env.LOGEMAIL,
      subject: subject,
      html: `<p>Please find the attached error log for more details.</p>`,
      attachments: [
        {
          path: logFilePath,
          filename: "error_log.log",
          type: "text/plain",
          disposition: "attachment",
        },
      ],
    };

    await transporter.sendMail(msg);
  } catch (error) {
    console.error("Error sending log email:", error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
};

const handleErrorAndSendLog = async (logFilePath) => {
  const msg =
    node_env === "development"
      ? "Smart Assist Error Log-Development"
      : "Smart Assist Error Log-Production";
  await sendEmailWithLogs(logFilePath, msg);
};

const sendMailForSf = async (logFilePath) => {
  const msg =
    node_env === "  "
      ? "Bulk operations Error Log-Development"
      : "Bulk operations Error Log-Production";
  await sendEmailWithLogs(logFilePath, msg);
};

module.exports = { handleErrorAndSendLog, sendMailForSf };
