const express = require("express");
const router = express.Router();
const vehicleController = require("../controllers/masters/vehicleController");
const dealerAdminController = require("../controllers/masters/dealerAdminController");
const userController = require("../controllers/masters/usersController");

const eventController = require("../controllers/transactions/eventController");

const roleController = require("../controllers/masters/roleController");
const teamsController = require("../controllers/masters/teamsController");
const { ifDealer } = require("../middlewares/validators/checkRole");
const dealerDashboardController = require("../controllers/masters/dealerDashboardController");
const dealerAnalysisDashboardController = require("../controllers/masters/dealerNewAnalysisController");
const dealerHomeController = require("../controllers/masters/dealerHomeController");
// const GeneralManagerController = require("../controllers/masters/generalManagerController");

const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const requestLogger = require("../middlewares/fileLogs/requestLogger");

router.use(verifyToken, ifDealer, requestLogger);

//for dealer dashboard
router.get("/dealer/home/dashboard", dealerHomeController.dealerHome);
router.get(
  "/dealer/analysis/dashboard",
  dealerDashboardController.analysisDashboard
);

router.get("/dealer/home-dashboard/new", dealerHomeController.dealerHome);
//updated dealer analysis dashboard
router.get(
  "/dealer/updatedAnalysis/dashboard",
  dealerAnalysisDashboardController.dealerAnalysisDashboard
);
// router.get("/dashboard/report", GeneralManagerController.GMDashboardReport);

// for dealer
router.get("/show-profile", dealerAdminController.showProfile);
router.get("/existing-user-check", dealerAdminController.existingExcellence);
router.post("/users/create", dealerAdminController.createUser);
router.put("/users/:userId/update", dealerAdminController.updateUser);
router.get("/users/all", dealerAdminController.getAllUsersByDealer);
router.get("/users/:userId", userController.fetchUserById);
router.get("/users/:userId/data/all", dealerAdminController.dataAgainstUser);
router.put("/users/:userId/delete", dealerAdminController.deleteUser);

// variant
router.get("/vehicles/unique-all", dealerAdminController.getAllVehicles);
// router.post("/vehicles/:vehicleId/variant", dealerAdminController.addVariant);
router.post("/vehicles/variant/add", dealerAdminController.addVariant);
router.put("/variant/update/:vehicleId", dealerAdminController.updateVariant);
// router.put("/vehicles/:vehicleId/delete", dealerAdminController.deleteVehicle);
// for lead
router.get("/leads/all", dealerAdminController.getAllLeads);
router.put("/leads/reassign", dealerAdminController.reassignLead);
router.put("/leads/:leadId/update", dealerAdminController.updateLeadByDealer);
router.get("/leads/:leadId", dealerAdminController.getLeadById);

// for test drives
router.get("/testDrives/all", dealerAdminController.getAllTD);
router.put("/testDrives/reassign", dealerAdminController.reassignTestDrive);

router.get("/user-profile", userController.showProfile);
//for opportunities
router.get("/opportunities/all", dealerAdminController.getAllOpportunities);
router.get("/opportunities/:oppId", dealerAdminController.getOppById);

//for events
router.get("/leads/:leadId/events/all", dealerAdminController.getAllEvents);
router.get("/events/:eventId", eventController.getEventById);

//for tasks
router.get("/leads/:leadId/tasks/all", dealerAdminController.viewAllTasks);
router.get("/tasks/:taskId", dealerAdminController.viewTaskById);

//for roles
router.post("/roles/new", roleController.createRole);
router.get("/role/all", roleController.getAllRoles);

//for vehicles
router.post("/vehicles/create", vehicleController.createVehicle);
router.get("/vehicles/all", vehicleController.getAllVehicles);
router.get("/vehicles/:vehicleId", vehicleController.getVehicleById);
router.put("/vehicles/:vehicleId/update", vehicleController.updateVehicle);
router.put("/vehicles/:vehicleId/delete", vehicleController.deleteVehicle);

//for teams
router.post("/createTeam", teamsController.createTeam);
router.get("/teams/all", dealerAdminController.getAllTeams);
router.get("/teams/:teamId", teamsController.getOneTeamDetails);
router.put("/teams/:teamId/update", teamsController.updateTeam);
router.put("/teams/:teamId/delete", teamsController.deleteTeam);

//for Targets
router.put("/targets/new", dealerAdminController.createTarget);
router.get("/targets/all", dealerAdminController.getAllTargets);

//get all users
router.get("/users/data/all", dealerAdminController.getAllUsers);

module.exports = router;
