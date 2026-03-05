const express = require("express");
const router = express.Router();
const RPAController = require("../controllers/masters/triggerRPA");
const dealerController = require("../controllers/masters/dealerController");
// const taskController = require("../controllers/transactions/taskController");
// const eventController = require("../controllers/transactions/eventController");
// const callController = require("../controllers/transactions/callLogsController");
const rpaAutoTrigger = require("../controllers/masters/rpaAutoTrigger");

//get routes
router.get("/dealers-data/new", dealerController.getAllDealers);

//auto trigger routes
router.get("/leads/new/trigger", rpaAutoTrigger.triggerLeadsNew);
router.get("/leads/updated/trigger", rpaAutoTrigger.triggerUpdatedLeads);
router.get("/tasks/new/trigger", rpaAutoTrigger.triggerTasksNew);
router.get("/tasks/updated/trigger", rpaAutoTrigger.triggerUpdatedTasks);
router.get("/events/new/trigger", rpaAutoTrigger.triggerEventsNew);
router.get("/events/updated/trigger", rpaAutoTrigger.triggerUpdatedEvents);
router.get("/opps/new/trigger", rpaAutoTrigger.triggerOppsNew);
router.get("/reassign/trigger", rpaAutoTrigger.reassigned);

//update flags
//new
router.put("/leads/new/flag-inactive", RPAController.flagLead);
router.put("/reassign/flag-inactive", RPAController.reassigned);
router.put("/tasks/new/flag-inactive", RPAController.flagTask);
router.put("/events/new/flag-inactive", RPAController.flagEvent);
router.put("/opps/new/flag-inactive", RPAController.flagOpps);
//updated
router.put("/leads/updated/flag-inactive", RPAController.updateLeadAsFalse);
router.put("/tasks/updated/flag-inactive", RPAController.updateTaskAsFalse);
router.put("/events/updated/flag-inactive", RPAController.updateEventAsFalse);
router.put("/opps/updated/flag-inactive", RPAController.updateOppsAsFalse);

//error flags
router.put("/leads/error/flag-active", RPAController.errorLead);
router.put("/tasks/error/flag-active", RPAController.errorTask);
router.put("/events/error/flag-active", RPAController.errorEvent);

//debugging routes
// router.get("/leads", RPAController.getLeadsData);
// router.get("/tasks", RPAController.getTasksData);
// router.get("/events", RPAController.getEventsData);
// router.get("/opps", RPAController.getOppsData);
// router.get("/call-logs", callController.testAllLogs);

module.exports = router;
