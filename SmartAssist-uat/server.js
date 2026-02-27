require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const blocked = require("blocked-at");
require("./queues/reminderWorker");
const serverLogger = require("./middlewares/fileLogs/server-logger");


blocked((time, stack) => {
  serverLogger.info(`Event loop blocked for ${time}ms`);
  serverLogger.info(stack);
});

const { waClients, initWAClient } = require("./utils/initWAClient");

const { initRedis } = require("./utils/redisClient");
const sequelize = require("./dbConfig/dbConfig");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8,
});

const sessionSockets = new Map();
exports.sessionSockets = sessionSockets;

// Controllers and Routes
const { sendNotificationDaily, calcLeadAge } = require("./utils/scheduler");
const chatHandler = require("./utils/chatHistoryWA");
const adminRouter = require("./routes/adminRoutes");
const leadRouter = require("./routes/leadRoutes");
const eventRouter = require("./routes/eventRoutes");
const taskRouter = require("./routes/taskRoutes");
const authRouter = require("./routes/authRouter");
const superRouter = require("./routes/superAdminRoutes");
const userRouter = require("./routes/userRoutes");
const rpaRouter = require("./routes/rpaRoutes");
const globalRouter = require("./routes/globalRoutes");
const favRouter = require("./routes/favouriteRoutes");
const searchRouter = require("./routes/searchRoutes");
const calendarRouter = require("./routes/calendarRoutes");
const utilityRouter = require("./routes/utilityRoutes");
const slotRouter = require("./routes/slotBookingRoutes");
const dealerRouter = require("./routes/dealerRoutes");
const bulkInsert = require("./routes/bulkInsertRoutes");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger-output.json");
const waRoute = require("./routes/waRoutes");
const logger = require("./middlewares/fileLogs/logger");
const ticketRouter = require("./routes/bugReportRoutes");
const appAdminRouter = require("./routes/app-adminRoutes");
const generalManager = require("./routes/generalManagerRoutes");
// const DefenderGuide = require("../SmartAssist-uat/models/master/defenderGuideModel");


// // with your existing sequelize sync or db connection:
// DefenderGuide.sync({ alter: true })
//   .then(() => console.log("✅ defender_guides table ready"))
//   .catch((err) => console.error("❌ sync failed:", err.message));
// sequelize.sync();

// Schedulers
sendNotificationDaily();
calcLeadAge();

// Middleware
app.set("socketio", io);
app.use(express.json({ limit: "1000mb" }));
app.use(express.urlencoded({ limit: "1000mb", extended: true }));
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);
app.use(cors({ origin: "*" }));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use("/api", authRouter);
app.use("/api/superAdmin", superRouter);
app.use("/api/admin", adminRouter);
app.use("/api/dealer", dealerRouter);
app.use("/api/users", userRouter);
app.use("/api/search", searchRouter);
app.use("/api/slots", slotRouter);
app.use("/api/leads", leadRouter);
app.use("/api/events", eventRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/favourites", favRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/utils", utilityRouter);
app.use("/api/RPA", rpaRouter);
app.use("/api/bulk-insert", bulkInsert);
app.use("/api/global", globalRouter);
app.use("/api", waRoute);
app.use("/api/issues", ticketRouter);
app.use("/api/app-admin", appAdminRouter);
app.use("/api/generalManager", generalManager);



// Socket Handling
io.on("connection", (socket) => {
  logger.info("New client connected");
  socket.on("register_session", async ({ sessionId, email }) => {
    if (!email || !sessionId) {
      logger.warn(
        `Invalid register_session: sessionId=${sessionId}, email=${email}`
      );
      socket.emit("wa_error", {
        sessionId,
        error: "Email and sessionId are required for session registration",
      });
      return;
    }
    logger.info(`Registering socketId=${socket.id} for sessionId=${sessionId}`);
    sessionSockets.set(sessionId, socket);
    if (waClients[sessionId]) {
      logger.info(`Updating socket for sessionId=${sessionId}`);
      waClients[sessionId].socket = socket;
      waClients[sessionId].email = email;
      // Restore sessions for this email
      if (waClients[sessionId]?.isReady) {
        logger.info(`Session ${sessionId} is ready, emitting wa_login_success`);
        socket.emit("wa_login_success", {
          sessionId,
          message: "Login successfully",
        });
      }
    }
  });

  // Handle manual QR resend
  socket.on("resend_qr", async ({ sessionId, email }) => {
    if (!sessionId || !email) {
      logger.warn(`Invalid resend_qr: sessionId=${sessionId}, email=${email}`);
      socket.emit("wa_error", {
        sessionId,
        error: "Email and sessionId are required for QR resend",
      });
      return;
    }
    logger.info(`Resending QR for sessionId=${sessionId}, email=${email}`);
    try {
      const c = waClients[sessionId];
      c.qrSend = false;
      c.allowQR = true;
      sessionSockets.set(sessionId, socket);
      await initWAClient({ email, sessionId, socket, forceNewQR: true });
      logger.info(`Initiated new QR generation for sessionId=${sessionId}`);
    } catch (err) {
      logger.error(
        `Failed to resend QR for sessionId=${sessionId}: ${err.message}`
      );
      socket.emit("wa_error", {
        sessionId,
        error: "Failed to reinitialize client for QR",
      });
    }
  });
  chatHandler(io, socket);
  socket.on("disconnect", () => logger.info("Client disconnected"));
});
// (async () => {
//   try {
//     await initRedis();
//     console.log("Redis ready to use ✅");
//   } catch (err) {
//     console.error("Redis init failed ❌", err);
//   }
// })();
sequelize
  .authenticate()
  .then(async () => {
    console.log("Database connected ✅");

    if (process.env.NODE_ENV === "dev") {
      await sequelize.sync({ alter: true });
      console.log("Models synced with DB (alter:true) ✅");
    } else {
      console.log("Running in production mode – skipping auto-sync 🚀");
    }

    server.listen(process.env.PORT, () => {
      console.log(`App is running on http://localhost:${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });
