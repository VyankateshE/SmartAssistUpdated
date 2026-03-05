// require("dotenv").config();
// const { Infobip } = require("@infobip-api/sdk");
// const responses = require("./globalResponse");

// //initialize infobip client
// const infobipClient = new Infobip({
//   apiKey: process.env.INFOBIP_API_KEY,
//   baseUrl: process.env.INFOBIP_BASE_URL,
//   authType: "App",
// });

// //send OTP and consent form before start of test drive
// const chatWhatsApp = async (req, res) => {
//   const { number, message } = req.body;
//   try {
//     const response = await infobipClient.channels.whatsapp.send({
//       type: "text",
//       from: "447860099299",
//       to: number,
//       content: {
//         text: message,
//       },
//     });

//     return responses.success(
//       res,
//       "whatsapp message sent successfully.",
//       response.data
//     );
//   } catch (error) {
//     console.error(
//       "Error sending message:",
//       error.response?.data || error.message
//     );
//     return responses.serverError(res, error.message);
//   }
// };
// //end

// //follow-up on whatsapp
// const redirectToWhatsApp = async (req, res) => {
//   try {
//     const { number, message } = req.query;

//     const whatsappURL = `https://wa.me/${number}?text=${message}`;

//     return responses.success(res, `URL generated successfully`, whatsappURL);
//   } catch (error) {
//     console.error("Error redirecting to WhatsApp:", error);
//     return responses.serverError(res, error.message);
//   }
// };
// //end
// module.exports = { chatWhatsApp, redirectToWhatsApp };
