const qrcode = require("qrcode");
const nodemailer = require("nodemailer");
require("dotenv").config();
const node_env = process.env.NODE_ENV;

const sendQRCodeEmail = async (qrData, toEmail, sessionId) => {
  const emailTo =
    node_env === "production"
      ? toEmail
      : [
          "mustafa.sayyed@ariantechsolutions.com",
          "saad.ansari@ariantechsolutions.com",
          "anand.yadav@ariantechsolutions.com",
        ];
  try {
    const qrImage = await qrcode.toDataURL(qrData);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: emailTo,
      subject: `Allow WhatsApp access for Smart Assist`,
      html: `
        <h3> Open your WhatsApp and scan this QR code from linked devices.</h3>
        <img src="cid:qrimage" style="width:250px; height:250px;" />
      `,
      attachments: [
        {
          filename: "qr.png",
          content: qrImage.split("base64,")[1],
          encoding: "base64",
          cid: "qrimage",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending QR code email:", err.message);
  }
};

module.exports = sendQRCodeEmail;
