const { initWAClient, waClients } = require("../../utils/initWAClient");

const { sessionSockets } = require("../../server");

const init_session = async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    // const email = "anand.yadav@ariantechsolutions.com";
    const email = req.userEmail;
    const socket = sessionSockets.get(sessionId);

    // Check if client is already ready
    if (waClients[sessionId]?.isReady) {
      return res.status(200).json({
        sessionId,
        isReady: true,

        message: "WhatsApp is already connected",
      });
    }
    await initWAClient({ email, sessionId, socket });

    return res.status(200).json({
      message: "WhatsApp session started. Check your email for QR code.",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: `Initialization failed: ${err.message}` });
  }
};

const check_wa_status = async (req, res) => {
  const { sessionId } = req.body;

  // Validate request body
  if (!sessionId) {
    return res.status(400).json({
      success: false,

      message: "sessionId is required",
    });
  }

  try {
    // Check if WhatsApp client exists and is ready
    const isReady = waClients[sessionId]?.isReady || false;
    return res.status(200).json({
      success: true,
      sessionId,
      isReady,

      message: isReady ? "WhatsApp is ready" : "WhatsApp is not connected",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to check WhatsApp status",

      error: error.message,
    });
  }
};

module.exports = {
  init_session,
  check_wa_status,
};
