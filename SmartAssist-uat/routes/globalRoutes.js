const express = require("express");
const router = express.Router();
const eventController = require("../controllers/transactions/eventController");
const superController = require("../controllers/masters/newSuperAdminDashboard");
const requestLogger = require("../middlewares/fileLogs/requestLogger");
const userController = require("../controllers/masters/usersController");
const ticketController = require("../controllers/masters/ticketsController");
const versionController = require("../controllers/masters/versionController");
// const basicAuth = require("../middlewares/validators/basicAuth");
// const {
//   verifyToken,
// } = require("../middlewares/validators/verifytokenMiddleware");
router.use(requestLogger);
// router.use(verifyToken)
//update routes
router.put("/events/submit-feedback/:eventId", eventController.driveFeedback);
router.put("/user-feedback/:userId", userController.userFeedback);
router.get(
  "/superadmin/analytics",
  // basicAuth,
  superController.newSuperAdminDashboard
);
router.get("/issues/all", ticketController.getAllIssues);
router.get("/app/version", versionController.getVersion);
router.get("/users/all", ticketController.getAllUsers);
router.post("/create-new/issue", ticketController.newIssueExternal);
router.put("/update-issue/:ticket_id", ticketController.updateIssue);
module.exports = router;
