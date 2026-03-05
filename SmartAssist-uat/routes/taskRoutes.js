const express = require("express");
const router = express.Router();
const taskController = require("../controllers/transactions/taskController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");

router.use(verifyToken);
//get routes
router.get("/all-tasks", taskController.viewAllTasks);
router.get("/all-appointments", taskController.viewAllAppointments);
router.get("/all-tasks/:leadId", taskController.viewAllTasksOfLead);
router.get("/:taskId", taskController.viewTaskById);

//update routes
router.put("/:taskId/update", taskController.updateTask);

//delete routes
router.put("/:taskId/delete", taskController.deleteTask);

module.exports = router;
