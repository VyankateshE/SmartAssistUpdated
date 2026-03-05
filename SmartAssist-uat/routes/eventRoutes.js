const express = require("express");
const router = express.Router();
const multer = require("multer");
const eventController = require("../controllers/transactions/eventController");
const {
  testDriveController,
} = require("../controllers/transactions/testDriveCycle");
const sendOtpToStartDrive = require("../utils/sendSMS");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const {
  uploadLicense,
  uploadMap,
  uploadColors,
} = require("../utils/mediaUploadsAWS");
const requestLogger = require("../middlewares/fileLogs/requestLogger");
// const sendFeedbackForm = require("../utils/sendSMS");

const storage = multer.memoryStorage();
const upload = multer({ storage });
router.use(verifyToken, requestLogger);

//get routes
router.get("/all-events", eventController.getAllEvents);
router.get("/all-events/:leadId", eventController.getAllEventsOfLead);
router.get("/:eventId", eventController.getEventById);
router.get("/slots/:eventId", eventController.getSlotsByEventId);

//update routes
router.put("/update/:eventId", eventController.updateEvent);
router.put("/submit-feedback/:eventId", eventController.driveFeedback);

//delete routes
router.put("/:eventId/delete", eventController.deleteEvent);

//start & end test drive

router.post("/:eventId/send-consent", testDriveController.triggerConsentOtp);
router.post("/:eventId/verify-otp", testDriveController.verifyOTP);
router.post("/:eventId/start-drive", testDriveController.startTestDrive);
router.post("/:eventId/end-drive", testDriveController.endTestDrive);
router.post("/:eventId/send-otp", sendOtpToStartDrive.sendOtpToStartDrive);

//send feedback form after end of testdrives
// router.post("/:eventId/send-feedbackForm", sendFeedbackForm.sendFeedback);

//capture license pic
router.post("/:eventId/upload-license", upload.single("file"), uploadLicense);
router.post("/:eventId/upload-map", upload.single("file"), uploadMap);
router.post("/colors/upload", upload.single("file"), uploadColors);
module.exports = router;
