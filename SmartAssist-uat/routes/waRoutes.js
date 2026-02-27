const express = require("express");
const {
  verifyToken
} = require("../middlewares/validators/verifytokenMiddleware");
const { init_session, check_wa_status } = require("../controllers/transactions/waController");
const router = express.Router();

router.use(verifyToken);
router.post("/init-wa",init_session);
router.post("/check-wa-status",check_wa_status)
module.exports = router;
