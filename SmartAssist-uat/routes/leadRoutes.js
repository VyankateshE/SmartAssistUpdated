const express = require("express");
const campaignController = require("../controllers/masters/campaignController");
const leadsController = require("../controllers/transactions/leadsController");
const taskController = require("../controllers/transactions/taskController");
const callLogsController = require("../controllers/transactions/callLogsController");
const eventController = require("../controllers/transactions/eventController");
const { allowRoles } = require("../middlewares/validators/checkRole");
const router = express.Router();
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
// const {
//   // checkIfAuthorisedUserOfLead,
// } = require("../middlewares/validators/checkRole");

router.use(verifyToken);
router.get("/getLeadData/:leadId",leadsController.downloadGuideWithProductSpecialist);
router.post("/create/new", leadsController.createLead);
router.get("/fetch/all", leadsController.getAllLeadsByUser);
router.get("/my-teams/all", leadsController.getAllLeadsByTeamOwner);

router.get(
  "/by-id/:recordId",
  // checkIfAuthorisedUserOfLead,
  leadsController.getLeadById
);
router.get("/existing-check", leadsController.existingLeads);

router.put(
  "/update/:recordId",
  // checkIfAuthorisedUserOfLead,
  leadsController.updateLead
);
router.put(
  "/change-assignee",
  allowRoles(["SM", "TCL", "TL"]),
  leadsController.reassignLead
);

//mark lost
router.put(
  "/mark-lost/:recordId",
  // checkIfAuthorisedUserOfLead,
  leadsController.markLost
);
router.post(
  "/convert-to-opp/:recordId",
  // checkIfAuthorisedUserOfLead,
  leadsController.createOpportunity
);

//create task
router.post(
  "/create-task/:recordId",
  // checkIfAuthorisedUserOfLead,
  taskController.createFollowup
);

//create events
router.post(
  "/events/create-test-drive/:recordId",
  // checkIfAuthorisedUserOfLead,
  eventController.createTestDrive
);
router.post(
  "/tasks/create-appointment/:recordId",
  // checkIfAuthorisedUserOfLead,
  taskController.createAppointment
);

//task & events
router.get("/events-&-tasks/:leadId", leadsController.leadsEventNTasks);

//campaigns
router.get("/campaigns/all", campaignController.getAllCampaigns);

//call-logs
router.post("/create-call-logs", callLogsController.createCallLogs);
router.get("/call-logs/all", callLogsController.getCallLogsOfLead);
router.get("/all-CallLogs", callLogsController.getAllCallLogsofLead);
router.put("/excluded-calls", callLogsController.excludedCallLogs);
router.put("/included-calls", callLogsController.includeCallLogs);
module.exports = router;
