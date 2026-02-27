const express = require("express");
const router = express.Router();
const userController = require("../controllers/masters/usersController");
const superController = require("../controllers/masters/superController");
const dashboardController = require("../controllers/masters/superAdminDashboard");
const taskController = require("../controllers/transactions/taskController");
const eventController = require("../controllers/transactions/eventController");
const dealerController = require("../controllers/masters/dealerController");
const vehicleController = require("../controllers/masters/vehicleController");
const roleController = require("../controllers/masters/roleController");
const teamsController = require("../controllers/masters/teamsController");
const superDashboardController = require("../controllers/masters/superAdminDashboard");
const superEmailController = require("../controllers/masters/superEmailController");
const superDash = require("../controllers/masters/superAdminNew");
const superAdminDashboardController = require("../controllers/masters/newSuperAdminDashboard");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const { ifSuperAdmin } = require("../middlewares/validators/checkRole");
const requestLogger = require("../middlewares/fileLogs/requestLogger");
const { dashboardRateLimit } = require("../queues/dashboardQueue");
const issueController = require("../controllers/masters/issuesController");

//create SuperAdmin
router.post("/create", superController.createSuperAdmin);

router.use(verifyToken, ifSuperAdmin, requestLogger);
router.get(
  "/superAdmin-dashboard",
  superDashboardController.superAdminDashboard
);

// router.get("/dashboard/logs-info", superDashboardController.superAdminLogsInfo);
//router.get("/dashboard/view-activities",superAdminDashboardController.newSuperAdminDashboard)
router.get(
  "/dashboard/NoSM",
  dashboardRateLimit("superadmin-dasboard"),
  superAdminDashboardController.dashboardReport
);
//for dealers
//router.post("/dealers/create", dealerController.addDealer);
router.get("/dealers/all", dealerController.getAllDealers);
router.get("/dealers/:dealerId", dealerController.getOneDealer);
router.get(
  "/dealers/:dealerId/users/all",
  dealerController.getAllUsersOfDealer
);
router.get(
  "/dealers/:dealerId/leads/all",
  dealerController.getAllLeadsOfDealer
);
router.get(
  "/dealers/:dealerId/opportunities/all",
  dealerController.getAllOppsOfDealer
);
router.get(
  "/dealers/:dealerId/tasks/all",
  dealerController.getAllTasksOfDealer
);
router.get(
  "/dealers/:dealerId/events/t-drives/all",
  dealerController.getAllTestDrivesOfDealer
);
router.get(
  "/dealers/:dealerId/events/appointments/all",
  dealerController.getAllAppointmentsOfDealer
);

//router.put("/dealers/:dealerId/update", dealerController.updateDealer);
//router.put("/dealers/:dealerId/delete", dealerController.deleteDealer);
// router.put("/dealers/set-target/:dealerId", dealerController.setTarget);

//for users
router.get("/show-profile", superController.showProfile);
router.post("/users/create", superController.createUser);
//router.put("/users/:userId/update", superController.updateUser);
router.get("/users/all", superController.getAllUsersBySuperAdmin);
router.get("/users/:userId", userController.fetchUserById);
router.get("/users/:userId/data/all", superController.dataAgainstUser);
//router.put("/users/:userId/delete", userController.deleteUser);

//for vehicles
//router.post("/vehicles/create", vehicleController.createVehicle);
router.get("/vehicles/all", vehicleController.getAllVehicles);
router.get("/vehicles/:vehicleId", vehicleController.getVehicleById);
//router.put("/vehicles/:vehicleId/update", vehicleController.updateVehicle);
//router.put("/vehicles/:vehicleId/delete", vehicleController.deleteVehicle);

//for leads
router.get("/leads/all", superController.getAllLeads);
router.get("/leads/:leadId", superController.getLeadById);

//for events
router.get("/leads/:leadId/events/all", eventController.getAllEvents);
router.get("/events/:eventId", eventController.getEventById);

//for tasks
router.get("/leads/:leadId/tasks/all", taskController.viewAllTasks);
router.get("/tasks/:taskId", taskController.viewTaskById);

//for roles
router.post("/roles/new", roleController.createRole);
router.get("/role/all", roleController.getAllRoles);

//for teams
//router.post("/teams/new", teamsController.createTeam);
router.get("/teams/all", teamsController.getAllTeams);
router.get("/teams/:teamId", teamsController.getOneTeamDetails);
//router.put("/teams/:teamId/update", teamsController.updateTeam);
//router.put("/teams/:teamId/delete", teamsController.deleteTeam);

//dashboard
router.get("/dashboard", dashboardController.superAdminDashboard);
router.get("/dashbaordNew", superDash.superAdminHome); // (values from analytics reports & db)
router.get(
  "/dashboard/summary",
  superAdminDashboardController.summaryDashboard
);
router.get(
  "/dashboard/trend-chart",
  dashboardRateLimit("superadmin-trendChart"),
  superAdminDashboardController.getTrendChart
);

router.get("/dashboard/issues-report", issueController.getIssueTrackerData);

//colors
//router.post("/colors/create", colorController.createColor);
//router.post("/colors/create-bulk", colorController.bulkInsertColors);

router.post("/addAnotherEmail", superEmailController.addSuperAdminEmail);

module.exports = router;
