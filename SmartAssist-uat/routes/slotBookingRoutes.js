const express = require("express");
const router = express.Router();
const slotController = require("../controllers/transactions/slotController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");

router.use(verifyToken);

//get routes
router.get("/:vehicleId/slots/all", slotController.getSlotsForVehicle);

//book slots
router.post("/:vehicleId/slots/book", slotController.bookSlot);
//update routes
// router.put("/:eventId/update", slotController.updateEvent);

//delete routes
// router.put("/:eventId/delete", slotController.deleteEvent);

module.exports = router;
