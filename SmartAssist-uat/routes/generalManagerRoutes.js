const express = require("express");
const router = express.Router();

const dealerController = require("../controllers/masters/dealerController");
const { dashboardRateLimit } = require("../queues/dashboardQueue");

const GeneralManagerController = require("../controllers/masters/generalManangerController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
// const { ifGeneralManager } = require("../middlewares/validators/checkRole");
const requestLogger = require("../middlewares/fileLogs/requestLogger");

//create SuperAdmin

router.use(verifyToken, requestLogger);

router.post("/dealers/create", dealerController.addDealer);

router.get(
  "/dashboard/report",
  dashboardRateLimit("dealer-dashboardReport"),
  GeneralManagerController.GMDashboardReport
);

router.get(
  "/dashboard/trend-chart",
  dashboardRateLimit("dealer-trendChart"),
  GeneralManagerController.getTrendChart
);

module.exports = router;
