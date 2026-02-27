const express = require("express");
const router = express.Router();
const dealerController = require("../controllers/masters/dealerController");
const dashboard = require("../app-admin/userDashboard");
const smView = require("../app-admin/smDashboard");
const callAnalysis = require("../app-admin/callAnalysis");
const notifications = require("../app-admin/notifications");
const transactions = require("../app-admin/transactionsData");
const {
  verifyToken,
  // refreshToken,
} = require("../middlewares/validators/verifytokenMiddleware");
const { ifAppAdmin } = require("../middlewares/validators/checkRole");
router.use(verifyToken, ifAppAdmin);

//all dealerships
router.get("/all-dealerships", dealerController.allDealersbyAppAdmin);

//dashboard data
router.get("/dashboard", dashboard.dashboardData);
router.get("/dashboard/analytics", dashboard.analyticsReports);
router.get("/SM/dashboard", smView.myTeamsDetails);
router.get("/call/analytics", callAnalysis.getCallAnalytics);
router.get("/SM/team-calls", callAnalysis.getTeamCallAnalytics);

//notifications
router.get("/notifications/all", notifications.allNotifications);

//transactions
router.get("/leads-data/all", transactions.allLeads);
router.get("/team-enquiries/all", transactions.teamEnquiries);
router.get("/lead-byId/:leadId", transactions.getLeadById);
router.get("/lead/history/:leadId", transactions.leadHistory);
router.get("/followups/all", transactions.viewAllTasks);
router.get("/appointments/all", transactions.viewAllAppointments);
router.get("/team/members/all", transactions.getTeamMembers);
router.get("/events/all", transactions.getAllEvents);
router.get("/calls/all", transactions.getCallLogsOfLead);
router.get("/calendar/activities", transactions.activitiesOfDate);
router.get("/fav-leads/all", transactions.getAllFavLeads);
router.get("/fav-followups/all", transactions.getAllFavAppointments);
router.get("/fav-appointments/all", transactions.getAllFavTestDrives);
router.get("/fav-events/all", transactions.getAllFavFollowUps);

module.exports = router;
