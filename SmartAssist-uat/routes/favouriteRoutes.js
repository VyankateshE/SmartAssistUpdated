const express = require("express");
const router = express.Router();
const favController = require("../controllers/transactions/favouritesController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");

router.use(verifyToken);

//get routes
router.get("/leads/all", favController.getAllFavLeads);
router.get("/events/appointments/all", favController.getAllFavAppointments);
router.get("/events/test-drives/all", favController.getAllFavTestDrives);
router.get("/follow-ups/all", favController.getAllFavFollowUps);

//put routes
router.put("/mark-fav/lead/:leadId", favController.toggleFavLead);
router.put("/mark-fav/event/:eventId", favController.toggleFavEvents);
router.put("/mark-fav/task/:taskId", favController.toggleFavTasks);

module.exports = router;
