const express = require("express");
const router = express.Router();
const searchController = require("../controllers/masters/searchController");
const {
  verifyToken,
} = require("../middlewares/validators/verifytokenMiddleware");

router.use(verifyToken);

//get routes
router.get("/global", searchController.globalSearch);
router.get("/vehicles", searchController.vehicleSearch);
router.get("/users", searchController.userSearch);
router.get("/vehicle-color", searchController.colorSearch);

module.exports = router;
