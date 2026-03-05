const express = require("express");
const router = express.Router();
const usersController = require("../controllers/masters/usersController");
const teamsController = require("../controllers/masters/teamsController");
const leadsController = require("../controllers/transactions/leadsController");
const taskController = require("../controllers/transactions/taskController");
const eventController = require("../controllers/transactions/eventController");
const vehicleController = require("../controllers/masters/vehicleController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
// const { ifAdmin } = require("../middlewares/validators/checkRoleMiddleware");
const requestLogger = require("../middlewares/fileLogs/requestLogger");

// Apply middleware only to admin actions
router.use(verifyToken, requestLogger);

// Admin actions-----------------------------------------------------------------------

//for Users
router.post("/users/create", usersController.createUser);
router.get("/users/all", usersController.fetchAllUsers);
router.get("/users/:user_Id", usersController.fetchUserById);
router.put("/users/:user_Id/update", usersController.updateUser);
router.put("/users/:user_Id/delete", usersController.deleteUser);

//for leads
router.post("/leads/create", leadsController.createLead);
router.get("/leads/all", leadsController.getAllLeadsByTeamOwner);
router.get("/leads/:recordId", leadsController.getLeadById);
router.post("/leads/:recordId/create-task", taskController.createFollowup);
router.post(
  "/records/:recordId/events/create-test-drive",
  eventController.createTestDrive
);
router.post(
  "/records/:recordId/tasks/create-appointment",
  taskController.createAppointment
);
router.post("/leads/:leadId/convert-to-opp", leadsController.createOpportunity);
router.put("/leads/:leadId/changeassignee", leadsController.updateLead);

//for events
router.get("/leads/events/all/:leadId", eventController.getAllEvents);
router.get("/events/:eventId", eventController.getEventById);
router.put("/events/:eventId/update", eventController.updateEvent);
router.put("/events/:eventId/delete", eventController.deleteEvent);

//for tasks
router.get("/leads/tasks/all/:leadId", taskController.viewAllTasks);
router.get("/tasks/:taskId", taskController.viewTaskById);
router.put("/tasks/:taskId/update", taskController.updateTask);
router.put("/tasks/:taskId/delete", taskController.deleteTask);

//for vehicles
router.post("/vehicles/create", vehicleController.createVehicle);
router.get("/vehicles/all", vehicleController.getAllVehicles);
router.get("/vehicles/:vehicleId", vehicleController.getVehicleById);
router.put("/vehicles/:vehicleId/update", vehicleController.updateVehicle);
router.put("/vehicles/:vehicleId/delete", vehicleController.deleteVehicle);

//for teams
router.get("/my-team/members/all", teamsController.getTeamMembers);

module.exports = router;
