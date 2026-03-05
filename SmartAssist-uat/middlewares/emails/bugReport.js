const nodemailer = require("nodemailer");
require("dotenv").config();

// Transporter setup (using Gmail as an example)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// Send bug report function
const sendBugReport = async (issue) => {
  const msg = {
    from: process.env.EMAIL,
    to: [
      "mustafa.sayyed@ariantechsolutions.com",
      "sumit.gupta@ariantechsolutions.com",
      "shubhangi.zade@ariantechsolutions.com",
      "support.smartassist@ariantechsolutions.com",
      "sonam.chaudhary@ariantechsolutions.com",
      "anand.yadav@ariantechsolutions.com",
    ],
    subject: `New Issue raised: ${issue.issue_no}`,
    html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
    <div style="text-align: right; margin-bottom: 20px;">
      <img src="cid:logo" alt="Company Logo" class="logo" width="60" />
    </div>
    <p>A new issue <strong>${issue.issue_no}</strong> is raised by <strong>${
      issue.reported_by
    }</strong>.</p>
    <p>Category : <strong>${issue.category}</strong>
    <p>Subject : <strong>${issue.subject}</strong>
    <p>Description : <strong>${issue.description}</strong>
   <p>Media :</p>
${
  issue.media
    ? "<ul>" +
      issue.media
        .split(",")
        .map(
          (url, index) =>
            `<li><a href="${url.trim()}" target="_blank">Attachment ${
              index + 1
            }</a></li>`
        )
        .join("") +
      "</ul>"
    : "<p>No media files attached</p>"
}
  </div>`,
  };
  try {
    await transporter.sendMail(msg);
  } catch (error) {
    console.error("Error sending bug report:", error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
};
module.exports = {
  sendBugReport,
};
