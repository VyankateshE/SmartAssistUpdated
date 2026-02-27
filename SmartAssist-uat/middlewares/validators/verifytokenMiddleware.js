const jwt = require("jsonwebtoken");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");
const User = require("../../models/master/usersModel");
const Dealers = require("../../models/master/dealerModel");
const SuperAdmin = require("../../models/master/superAdminModel");

require("dotenv").config();

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return responses.badRequest(res, process.env.NO_TOKEN);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // let user = null;
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.userEmail = decoded.userEmail;
    req.fname = decoded.fname;
    req.lname = decoded.lname;
    req.dealerEmail = decoded.dealerEmail;
    req.dealerId = decoded.dealerId;
    req.corporate_id = decoded.corporate_id;
    next();
  } catch (error) {
    logger.error(`Token verification failed: ${error.message}`);
    responses.unauthorized(res, process.env.ST401);
  }
};

const refreshToken = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return responses.unauthorized(res, "No refresh token provided");

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    let user = null;
    if (decoded.role === "CEO") {
      user = await Dealers.findByPk(decoded.userId);
    } else if (decoded.role === "SuperAdmin") {
      user = await SuperAdmin.findByPk(decoded.userId);
    } else if (decoded.role === "app-admin") {
      user = await User.findByPk(decoded.userId);
    } else {
      user = await User.findByPk(decoded.userId);
    }

    if (!user || user.refresh_token !== token) {
      return responses.unauthorized(res, "Invalid refresh token");
    }

    const payload = {
      userId: user.user_id,
      role: user.user_role,
      userEmail: user.email,
      fname: user.fname,
      lname: user.lname,
      dealerId: user.dealer_id,
    };

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await user.update({ access_token: newAccessToken });
    return responses.success(res, "Access token refreshed", {
      accessToken: newAccessToken,
    });
  } catch (err) {
    logger.error("Refresh token failed:", err.message);
    return responses.unauthorized(res, "Invalid or expired refresh token");
  }
};

module.exports = { verifyToken, refreshToken };
