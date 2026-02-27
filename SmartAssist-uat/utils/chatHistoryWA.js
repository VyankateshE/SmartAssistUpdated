const logger = require("../middlewares/fileLogs/waLogger");
const { initWAClient, waClients } = require("./initWAClient");
const { MessageMedia, WAState } = require("whatsapp-web.js");

async function safeGetState(client) {
  try {
    if (!client || !client.pupPage) {
      console.warn("safeGetState: Puppeteer page not found for client");
      return null;
    }

    const state = await client.getState();
    return state || null;
  } catch (err) {
    if (err.message && err.message.includes("evaluate")) {
      console.warn(
        "safeGetState: Puppeteer page became null. Cannot get state."
      );
    } else {
      console.warn("safeGetState: Error getting state:", err.message);
    }
    return null;
  }
}

async function waitForWhatsAppReady(
  client,
  timeoutMs = 10000,
  intervalMs = 500
) {
  if (!client) return false;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const state = await safeGetState(client);
      if (state === WAState.CONNECTED) {
        return true;
      }
    } catch (err) {
      logger.error("Error checking WhatsApp client state:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

module.exports = (io, socket) => {
  logger.info("socket connected...");

  socket.on("init_wa", async (data) => {
    const { email, sessionId } = data;
    logger.info("email :==>", email, "sessionId ===>", sessionId);
    await initWAClient({ email, sessionId, socket });
  });

  socket.on("get_chats", async ({ sessionId }) => {
    try {
      const instance = waClients[sessionId];

      if (!instance) {
        return socket.emit("wa_error", {
          sessionId,
          error: "Session not found",
        });
      }

      if (!instance.isReady) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp not ready",
        });
      }

      if (!instance.client) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client not initialized",
        });
      }

      const isReady = await waitForWhatsAppReady(instance.client);
      if (!isReady) {
        return socket.emit("wa_error", {
          sessionId,
          error:
            "WhatsApp Web interface not fully loaded. Please wait and try again.",
        });
      }

      logger.info("<-----get_chats -->");

      let chats = instance.chatList;
      if (!chats || chats.length === 0) {
        logger.info("Fetching chats from WhatsApp client...");

        let retries = 0;
        while (retries < 3) {
          try {
            chats = await instance.client.getChats();
            instance.chatList = chats;
            break;
          } catch (error) {
            retries++;
            logger.info(`Get chats retry ${retries}/3:`, error.message);
            if (retries < 3) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
              throw error;
            }
          }
        }
      }

      socket.emit("chat_list", { sessionId, chats });
    } catch (err) {
      console.error("Error in get_chats:", err);
      socket.emit("wa_error", {
        sessionId,
        error: "Failed to get chats",
        details: err.message,
        suggestion:
          "WhatsApp Web may not be fully loaded. Try refreshing the session.",
      });
    }
  });

  socket.on("get_messages", async ({ sessionId, chatId }) => {
    try {
      const instance = waClients[sessionId];

      if (!instance) {
        return socket.emit("wa_error", {
          sessionId,
          error: "Session not found",
        });
      }

      if (!instance.isReady) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp not ready",
        });
      }

      if (!instance.client) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client not initialized",
        });
      }

      if (
        typeof instance.client.getChatById !== "function" ||
        typeof instance.client.getChats !== "function"
      ) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client methods not available",
        });
      }

      if (!chatId || typeof chatId !== "string") {
        return socket.emit("wa_error", {
          sessionId,
          error: "Invalid chat ID provided",
        });
      }

      const state = await safeGetState(instance.client);
      if (state !== WAState.CONNECTED) {
        return socket.emit("wa_error", {
          sessionId,
          error: `WhatsApp client not connected. State: ${state}`,
        });
      }

      let chat = null;

      try {
        logger.info(`Attempting to get chat by ID: ${chatId}`);
        chat = await instance.client.getChatById(chatId);
        logger.info("Successfully got chat by ID");
      } catch (getChatError) {
        logger.info(
          "getChatById failed, searching in all chats:",
          getChatError.message
        );
        try {
          const allChats = await instance.client.getChats();
          logger.info(`Retrieved ${allChats.length} chats for search`);

          chat = allChats.find((c) => {
            return (
              c.id._serialized === chatId ||
              c.id.user === chatId ||
              c.name === chatId ||
              c.id._serialized.includes(chatId)
            );
          });

          if (chat) {
            logger.info(
              `Found chat through search: ${chat.name || chat.id._serialized}`
            );
          }
        } catch (getAllChatsError) {
          console.error("Failed to get all chats:", getAllChatsError.message);
          return socket.emit("wa_error", {
            sessionId,
            error: "Failed to access chats",
            details: getAllChatsError.message,
          });
        }
      }

      if (!chat) {
        return socket.emit("wa_error", {
          sessionId,
          error: `Chat not found with ID: ${chatId}`,
        });
      }

      let messages = [];
      try {
        logger.info(
          `Fetching messages for chat: ${chat.name || chat.id._serialized}`
        );
        messages = await chat.fetchMessages({ limit: 30 });
        logger.info(`Retrieved ${messages.length} messages`);
      } catch (fetchError) {
        console.error("Failed to fetch messages:", fetchError.message);
        return socket.emit("wa_error", {
          sessionId,
          error: "Failed to fetch messages from chat",
          details: fetchError.message,
        });
      }

      if (!messages || !Array.isArray(messages)) {
        return socket.emit("wa_error", {
          sessionId,
          error: "No messages found or invalid response",
        });
      }

      const formatted = [];
      for (const msg of messages) {
        if (!msg || msg.type === "video") continue;

        try {
          const msgData = {
            id: msg.id._serialized,
            body: msg.body || "",
            fromMe: msg.fromMe,
            timestamp: msg.timestamp,
            type: msg.type,
            from: msg.from,
            to: msg.to,
          };

          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (
                media &&
                media.data &&
                !media.mimetype.toLowerCase().startsWith("video/")
              ) {
                msgData.media = {
                  mimetype: media.mimetype,
                  filename: media.filename || "file",
                  base64: `data:${media.mimetype};base64,${media.data}`,
                };
              }
            } catch (mediaError) {
              console.warn(
                `Failed to download media for message ${msg.id._serialized}:`,
                mediaError.message
              );
            }
          }

          formatted.push(msgData);
        } catch (msgError) {
          console.warn(
            `Failed to process message ${msg.id?._serialized || "unknown"}:`,
            msgError.message
          );
        }
      }

      formatted.sort((a, b) => a.timestamp - b.timestamp);

      socket.emit("chat_messages", {
        sessionId,
        chatId,
        messages: formatted,
      });
    } catch (err) {
      console.error("Unexpected error in get_messages:", err);
      socket.emit("wa_error", {
        sessionId,
        error: "Unexpected error occurred while fetching messages",
        details: err.message,
      });
    }
  });

  socket.on("send_message", async ({ sessionId, chatId, message, media }) => {
    try {
      const instance = waClients[sessionId];

      if (!instance) {
        return socket.emit("wa_error", {
          sessionId,
          error: "Session not found",
        });
      }

      if (!instance.isReady) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp not ready",
        });
      }

      if (!instance.client) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client not initialized",
        });
      }

      if (typeof instance.client.sendMessage !== "function") {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client send method not available",
        });
      }

      const state = await safeGetState(instance.client);
      if (state !== WAState.CONNECTED) {
        return socket.emit("wa_error", {
          sessionId,
          error: "WhatsApp client not connected",
          details: `State: ${state}`,
        });
      }

      let result;
      if (media) {
        const { mimetype, base64, filename } = media;
        const cleanBase64 = base64.includes("base64,")
          ? base64.split("base64,")[1]
          : base64;

        const fileSizeMB =
          Buffer.from(cleanBase64, "base64").length / (1024 * 1024);
        if (fileSizeMB > 64) {
          return socket.emit("wa_error", {
            sessionId,
            error: "Media too large. Max size is 64MB",
          });
        }

        const mediaObj = new MessageMedia(mimetype, cleanBase64, filename);
        result = await instance.client.sendMessage(chatId, mediaObj, {
          caption: message || "",
        });
      } else {
        result = await instance.client.sendMessage(chatId, message);
      }

      socket.emit("wa_message_sent", {
        sessionId,
        chatId,
        messageId: result.id._serialized,
        body: result.body,
        timestamp: result.timestamp,
      });

      logger.info(`Message sent to ${chatId} from session ${sessionId}`);
    } catch (err) {
      console.error("Failed to send message:", err);
      socket.emit("wa_error", {
        sessionId,
        error: "Failed to send message",
        details: err.message,
      });
    }
  });

  socket.on("check_wa_status", async ({ sessionId }) => {
    try {
      const instance = waClients[sessionId];

      if (!instance) {
        return socket.emit("wa_status", {
          sessionId,
          status: "not_found",
          message: "Session not found",
        });
      }

      if (!instance.client) {
        return socket.emit("wa_status", {
          sessionId,
          status: "not_initialized",
          message: "Client not initialized",
        });
      }

      const state = await safeGetState(instance.client);

      socket.emit("wa_status", {
        sessionId,
        status: "ok",
        state: state,
        isReady: instance.isReady,
        message: `Client state: ${state}, Ready: ${instance.isReady}`,
      });
    } catch (err) {
      socket.emit("wa_status", {
        sessionId,
        status: "error",
        message: err.message,
      });
    }
  });
};
