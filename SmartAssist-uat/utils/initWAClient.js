const { Client, LocalAuth } = require("whatsapp-web.js");
const logger = require("../middlewares/fileLogs/waLogger");
const sendQRCodeEmail = require("../middlewares/emails/sendQRForWA");
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const { sessionSockets } = require("../server");
const path = require("path");

const waClients = {};

const initWAClient = async ({
  email,
  sessionId,
  socket = null,
  forceNewQR = false,
}) => {
  logger.info(
    `[${sessionId}] Init WA Client called (forceNewQR=${forceNewQR})`
  );

  const sessionPath = path.join("./wa_auth_sessions", `session-${sessionId}`);
  if (forceNewQR) {
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      logger.info(`[${sessionId}] Deleted session folder (forceNewQR)`);
    } catch {
      logger.error(
        `[${sessionId}] Failed to delete session folder (forceNewQR)`
      );
    }
    if (waClients[sessionId]) {
      try {
        await waClients[sessionId].client.destroy();
      } catch {
        logger.error(`[${sessionId}] Failed to destroy existing client`);
      }
      delete waClients[sessionId];
      sessionSockets?.delete?.(sessionId);
    }
  }

  // ---- If already connected ----
  if (waClients[sessionId]?.isReady && !forceNewQR) {
    logger.info(`[${sessionId}] Already connected`);
    waClients[sessionId].socket = socket;
    socket?.emit("wa_login_success", {
      sessionId,
      message: "Already connected",
      chats: waClients[sessionId].chatList || [],
    });
    return;
  }

  // ---- Enhanced Puppeteer Configuration ----
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: "./wa_auth_sessions",
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH || puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--window-size=1920,1080",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images", // This can help with loading issues
      ],
      // Add timeout settings
      timeout: 60000, // 60 seconds timeout
    },
    // Add session restore settings
    session: sessionId,
    restartOnAuthFail: true,
    // Increase timeout for WhatsApp Web loading
    takeoverOnConflict: true,
    takeoverTimeoutMs: 15000,
  });

  waClients[sessionId] = {
    client,
    isReady: false,
    socket,
    email,
    qrSend: false,
    qrCode: null,
    chatList: [],
    isDisconnect: false,
    isLoading: true,
    allowQR: true,
    readyTimeout: null, // Add ready timeout
  };

  // ---- Enhanced Event Handlers ----
  client.on("qr", async (qr) => {
    const c = waClients[sessionId];
    if (!c) return;
    if (!c.allowQR || c.qrSend || c.isDisconnect || c.isReady) return;

    logger.info(`[${sessionId}] QR Code generated`);
    c.qrSend = true;
    c.qrCode = qr;

    try {
      await sendQRCodeEmail(qr, email, sessionId);
      c.socket?.emit("wa_qr_sent", {
        sessionId,
        message: `QR code sent`,
      });
    } catch (err) {
      logger.error(`[${sessionId}] Failed to send QR: ${err.message}`);
      c.socket?.emit("wa_error", {
        sessionId,
        error: "QR send failed",
      });
    }

    if (c.qrTimeout) clearTimeout(c.qrTimeout);
    c.qrTimeout = setTimeout(() => {
      const c = waClients[sessionId];
      if (c && !c.isReady && !c.isDisconnect) {
        logger.info(`[${sessionId}] QR expired`);
        c.qrCode = null;
        c.qrSend = false;
        c.allowQR = false;
        c.socket?.emit("wa_qr_expired", {
          sessionId,
          message: "QR code expired",
        });
      }
    }, 60000);
  });

  client.on("authenticated", () => {
    logger.info(`[${sessionId}] AUTHENTICATED - Starting ready timeout`);
    const c = waClients[sessionId];
    if (!c) return;

    if (c.qrTimeout) {
      clearTimeout(c.qrTimeout);
      c.qrTimeout = null;
    }
    c.qrSend = false;
    c.qrCode = null;
    c.allowQR = false;

    c.socket?.emit("wa_loading", {
      sessionId,
      message: "Authenticated, preparing session...",
    });

    c.readyTimeout = setTimeout(() => {
      logger.warn(
        `[${sessionId}] Ready event didn't fire within 30 seconds after authentication`
      );
      const c = waClients[sessionId];
      if (c && !c.isReady) {
        logger.info(`[${sessionId}] Force checking client state...`);
        checkClientReadiness(sessionId);
      }
    }, 30000); // 30 seconds timeout
  });

  client.on("loading_screen", (percent, message) => {
    logger.info(`[${sessionId}] Loading: ${percent}% - ${message}`);
    const c = waClients[sessionId];
    if (!c) return;

    c.socket?.emit("wa_loading", {
      sessionId,
      message: `Loading: ${percent}%`,
    });
  });

  client.on("ready", async () => {
    logger.info(`[${sessionId}] >>> READY EVENT FIRED <<<`);

    const c = waClients[sessionId];
    if (!c) return;

    c.isReady = true;
    c.isLoading = false;
    c.isDisconnect = false;

    try {
      const state = await client.getState();
      logger.info(`[${sessionId}] Client state: ${state}`);

      // preload chats
      try {
        const chats = await Promise.race([
          client.getChats(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("getChats timeout")), 8000)
          ),
        ]);

        c.chatList = chats;
        logger.info(`[${sessionId}] Preloaded ${chats.length} chats`);
      } catch (err) {
        logger.warn(`[${sessionId}] Preload chats failed: ${err.message}`);
      }

      c.socket?.emit("wa_login_success", {
        sessionId,
        message: "Login successful",
        state,
        chats: c.chatList || [],
      });
    } catch (err) {
      logger.error(`[${sessionId}] Error in ready event: ${err.message}`);
    }
  });

  client.on("auth_failure", async (msg) => {
    logger.error(`[${sessionId}] AUTH FAILURE: ${msg}`);
    const c = waClients[sessionId];
    if (c) {
      // Clear all timeouts
      if (c.qrTimeout) {
        clearTimeout(c.qrTimeout);
        c.qrTimeout = null;
      }
      if (c.readyTimeout) {
        clearTimeout(c.readyTimeout);
        c.readyTimeout = null;
      }

      c.isReady = false;
      c.isLoading = false;
      c.socket?.emit("wa_auth_failure", { sessionId, error: msg });
    }

    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      logger.info(`[${sessionId}] Cleaned up session after auth failure`);
    } catch (err) {
      logger.error(`[${sessionId}] Failed to cleanup session: ${err.message}`);
    }
  });

  client.on("disconnected", async (reason) => {
    logger.warn(`[${sessionId}] DISCONNECTED: ${reason}`);

    const c = waClients[sessionId];
    if (c) {
      // Clear all timeouts
      if (c.qrTimeout) {
        clearTimeout(c.qrTimeout);
        c.qrTimeout = null;
      }
      if (c.readyTimeout) {
        clearTimeout(c.readyTimeout);
        c.readyTimeout = null;
      }

      c.isDisconnect = true;
      c.isReady = false;
      c.isLoading = false;
    }

    if (reason === "LOGOUT") {
      logger.info(`[${sessionId}] Handling logout disconnect`);

      try {
        await c?.client?.destroy().catch(() => {});
      } catch {
        logger.error(`[${sessionId}] Failed to destroy client on logout`);
      }

      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        logger.info(`[${sessionId}] Cleared session data after logout`);
      } catch (err) {
        logger.error(
          `[${sessionId}] Failed to clear session data: ${err.message}`
        );
      }

      delete waClients[sessionId];
      sessionSockets?.delete?.(sessionId);

      const sock = c?.socket;
      if (sock && typeof sock.emit === "function") {
        try {
          sock.emit("wa_logout", {
            sessionId,
            message: "Logged out successfully",
          });
        } catch (emitErr) {
          logger.warn(
            `[${sessionId}] Failed to emit wa_logout: ${emitErr.message}`
          );
        }
      } else {
        logger.warn(`[${sessionId}] Socket not available to emit wa_logout`);
      }
    } else {
      c?.socket?.emit("wa_disconnected", {
        sessionId,
        message: reason,
      });
    }
  });

  client.on("message", async (msg) => {
    if (msg.type === "video") return;

    const c = waClients[sessionId];
    if (!c || !c.isReady) return;

    const data = {
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      type: msg.type,
    };

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media && !media.mimetype.startsWith("video/")) {
          data.media = {
            mimetype: media.mimetype,
            filename: media.filename || "file",
            base64: media.data,
          };
        }
      } catch (err) {
        logger.warn(`[${sessionId}] Media download failed: ${err.message}`);
      }
    }

    c.socket?.emit("new_message", {
      sessionId,
      chatId: msg.from,
      message: data,
    });
  });

  // Helper function to check client readiness
  const checkClientReadiness = async (sessionId) => {
    const c = waClients[sessionId];
    if (!c || c.isReady) return;

    try {
      const state = await c.client.getState();
      logger.info(`[${sessionId}] Manual state check: ${state}`);

      if (state === "CONNECTED") {
        logger.info(
          `[${sessionId}] Client is connected, manually setting ready`
        );
        c.isReady = true;
        c.isLoading = false;
        c.isDisconnect = false;

        c.socket?.emit("wa_login_success", {
          sessionId,
          message: "Login successful (manual check)",
          state: state,
        });
      }
    } catch (err) {
      logger.error(
        `[${sessionId}] Failed to check client state: ${err.message}`
      );
    }
  };

  // ---- Initialize ----
  try {
    const c = waClients[sessionId];
    if (!c) {
      logger.error(
        `[${sessionId}] Client object not found during initialization`
      );
      return;
    }

    c.socket?.emit("wa_loading_started", {
      sessionId,
      message: forceNewQR ? "Restoring session..." : "Starting new session...",
    });

    logger.info(`[${sessionId}] Starting client initialization...`);

    // Add initialization timeout
    const initTimeout = setTimeout(() => {
      logger.warn(
        `[${sessionId}] Initialization taking too long, might be stuck`
      );
      const c = waClients[sessionId];
      if (c && c.isLoading) {
        c.socket?.emit("wa_loading", {
          sessionId,
          message: "Initialization taking longer than expected...",
        });
      }
    }, 45000); // 45 seconds

    await client.initialize();
    clearTimeout(initTimeout);

    logger.info(`[${sessionId}] Client initialization completed`);
  } catch (err) {
    logger.error(`[${sessionId}] Init failed: ${err.message}`);

    const c = waClients[sessionId];
    if (c) {
      c.isLoading = false;
      // Clear all timeouts
      if (c.readyTimeout) {
        clearTimeout(c.readyTimeout);
        c.readyTimeout = null;
      }
      c.socket?.emit("wa_error", {
        sessionId,
        error: "Failed to initialize",
        details: err.message,
      });
    }
  }
};

module.exports = {
  initWAClient,
  waClients,
};
