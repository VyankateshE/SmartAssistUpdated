const express = require("express");
const router = express.Router();
const multer = require("multer");
const ticketController = require("../controllers/masters/ticketsController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const { bugMedia } = require("../utils/mediaUploadsAWS");
const requestLogger = require("../middlewares/fileLogs/requestLogger");

const storage = multer.memoryStorage();
const upload = multer({ storage });
router.use(verifyToken, requestLogger);

//get routes
router.post("/raise-new", ticketController.createIssue);

router.post("/media/upload", upload.array("file", 10), bugMedia);
module.exports = router;
