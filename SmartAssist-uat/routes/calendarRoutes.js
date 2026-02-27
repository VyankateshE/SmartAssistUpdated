const express = require("express");
const router = express.Router();
const calendarController = require("../controllers/masters/calendarController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");

router.use(verifyToken);

//calendar routes
router.get("/data-count/asondate", calendarController.viewDataCountForDate);
router.get("/tasks/all/asondate", calendarController.viewTasksOfDate);
router.get("/events/all/asondate", calendarController.viewEventsOfDate);
router.get("/activities/all/asondate", calendarController.activitiesOfDate);

module.exports = router;
