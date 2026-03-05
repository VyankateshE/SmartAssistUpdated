const express = require("express");
const router = express.Router();
const multer = require("multer");
const userController = require("../controllers/masters/usersController");
const colorController = require("../controllers/masters/colorMasterController");
const dashBoardController = require("../controllers/masters/dashboardController");
const notiController = require("../controllers/masters/notificationController");
const vehicleController = require("../controllers/masters/vehicleController");
const teamsController = require("../controllers/masters/teamsController");
const salesManagerController = require("../controllers/masters/salesManagerController");
const salesPersonController = require("../controllers/masters/callAnalysisController");
const analyticsController = require("../controllers/masters/analyticsController");
const teamsDashboardController = require("../controllers/masters/myTeamDashboard");
const { uploadProfilePic } = require("../utils/mediaUploadsAWS");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const { allowRoles } = require("../middlewares/validators/checkRole");
const { appDashboardRateLimit } = require("../queues/dashboardQueue");

router.use(verifyToken);

// profile info routes
router.get("/show-profile", userController.showProfile);
router.post("/profile/set", upload.single("file"), uploadProfilePic);
router.put("/profile/remove-pic", userController.removePic);

// dashboard routes
router.get(
  "/dashboard",
  appDashboardRateLimit("user-dashboard"),
  dashBoardController.dashboardData
);
// router.get("/dashboard/analytics", dashBoardController.analyticsReports);
// analyrics dashboard
router.get(
  "/analytics",
  appDashboardRateLimit("user-analytics"),
  analyticsController.analyticsReports
);

router.get(
  "/ps/dashboard/call-analytics",
  salesPersonController.getCallAnalytics
);

router.get(
  "/sm/dashboard/team-dashboard",
  allowRoles("SM"),
  salesManagerController.getTeamsDetails
);

router.get(
  "/sm/analytics/team-dashboard",
  allowRoles(["SM", "TL"]),
  appDashboardRateLimit("team-dashboard"),
  teamsDashboardController.myTeamsDetails
);

router.get(
  "/sm/dashboard/call-analytics",
  allowRoles(["SM", "TL"]),
  salesManagerController.getCallAnalytics
);

router.post("/teams/new", allowRoles("SM"), teamsController.createTeam);
router.post("/create", allowRoles("SM"), userController.createUser);

//gm dashboard routes
// router.get(
//   "/gm/dashboard",
//   allowRoles("GM"),
//   generalManagerController.generalManagerDashboard
// );

//notifications
router.get("/notifications/all", notiController.allNotifications);
router.put("/notifications/:notiId", notiController.markRead);
router.put("/notifications/read/all", notiController.markAllRead);

//for vehicles
router.get("/vehicles/all", vehicleController.getAllVehicles);
router.get("/vehicles/:vehicleId", vehicleController.getVehicleById);

//colors
router.get("/vehicle-colors", colorController.getAllColors);
module.exports = router;
