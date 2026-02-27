const express = require("express");
const router = express.Router();
const bulkInsert = require("../controllers/masters/dataIntegration");
const vehicleController = require("../controllers/masters/vehicleController");
const basicAuth = require("../middlewares/validators/basicAuth");

router.post("/digital-leads/create-bulk", bulkInsert.insertDigitalLeads);
router.put("/opp-status/update-bulk", bulkInsert.bulkUpdateOpportunityStatus);
router.use(basicAuth);

router.post("/dealers/create-bulk", bulkInsert.insertDealers);
router.post("/users/SM/create-bulk", bulkInsert.insertSM);
router.post("/users/TL/create-bulk", bulkInsert.insertTL);
router.post("/users/DP/create-bulk", bulkInsert.insertDP);
router.post("/users/PS/create-bulk", bulkInsert.insertPS);
router.post("/leads/create-bulk", bulkInsert.insertLeads);
router.post("/tasks/create-bulk", bulkInsert.insertTasks);
router.post("/events/create-bulk", bulkInsert.insertEvents);
router.post("/analytics-records", bulkInsert.analyticalRecords);
router.post("/campaigns/all", bulkInsert.bulkInsertCampaign);
router.post("/colors", bulkInsert.bulkInsertColors);
router.post("/vehicles", vehicleController.bulkCreateVehicles);
router.put("/opps/add", bulkInsert.oppsAdd);
module.exports = router;
