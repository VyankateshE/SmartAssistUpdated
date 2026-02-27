const express = require("express");
const router = express.Router();
const {
  verifyEmail,
  verifyOtp,
  createNewPassword,
  login,
} = require("../controllers/auth/authController");
const {
  verifyEmailOfGeneralManager,
  verifyOptOfGeneralManager,
  createNewPwdForGeneralManager,
  loginAsGeneralManager,
} = require("../controllers/auth/generalManagerAuthController");
const {
  loginAsSuperAdmin,
  verifyEmailOfSuperAdmin,
  createNewPwdForSuperAdmin,
  verifyOtpOfSuperAdmin,
} = require("../controllers/auth/superAuthController");
const {
  verifyEmailOfDealer,
  verifyOtpOfDealer,
  loginAsDealer,
  createNewPwdForDealer,
} = require("../controllers/auth/dealerAuthController");
const {
  refreshToken,
} = require("../middlewares/validators/verifytokenMiddleware");

//for email verification and create new pwd
router.post("/login/verify-email", verifyEmail);
router.post("/login/verify-otp", verifyOtp);
router.put("/login/create-pwd", createNewPassword);
router.post("/login", login);
router.post("/refresh-token", refreshToken);

//forgot pwd for users and admins
router.post("/login/forgot-pwd/verify-email", verifyEmail);
router.post("/login/forgot-pwd/verify-otp", verifyOtp);
router.put("/login/forgot-pwd/new-pwd", createNewPassword);

router.post("/login/super-admin", loginAsSuperAdmin);
router.post("/login/GM", loginAsGeneralManager);
router.post("/login/GM/forgot-pwd/verify-email", verifyEmailOfGeneralManager);
router.post("/login/GM/forgot-pwd/verify-otp", verifyOptOfGeneralManager);
router.put("/login/GM/forgot-pwd/new-pwd", createNewPwdForGeneralManager);

//forgot pwd for super admin
router.post("/login/s-admin/forgot-pwd/verify-email", verifyEmailOfSuperAdmin);
router.post("/login/s-admin/forgot-pwd/verify-otp", verifyOtpOfSuperAdmin);
router.put("/login/s-admin/forgot-pwd/new-pwd", createNewPwdForSuperAdmin);

router.post("/login/dealer", loginAsDealer);
router.post("/login/dealer/forgot-pwd/verify-email", verifyEmailOfDealer);
router.post("/login/dealer/forgot-pwd/verify-otp", verifyOtpOfDealer);
router.put("/login/dealer/forgot-pwd/new-pwd", createNewPwdForDealer);

module.exports = router;
