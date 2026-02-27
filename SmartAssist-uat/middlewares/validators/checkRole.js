const Leads = require("../../models/transactions/leadsModel");
const Users = require("../../models/master/usersModel");
const logger = require("../fileLogs/logger");
const responses = require("../../utils/globalResponse");
require("dotenv").config();

//check if admin
const ifAdmin = async (req, res, next) => {
  try {
    if (req.userRole === "Admin") {
      return next(); // Allow admins
    }
    logger.error(`Unauthorised access by user ${req.userId}`);
    return responses.unauthorized(res, process.env.NOT_ADMIN_ERROR);
  } catch (error) {
    logger.error(`Authorization: ${error.message}`);
    console.error("Authorization error:", error);
    return responses.serverError(res, error.message);
  }
};

const ifAppAdmin = async (req, res, next) => {
  try {
    if (req.userRole === "app-admin") {
      return next(); // Allow admins
    }
    logger.error(`Unauthorised access by user ${req.userId}`);
    return responses.unauthorized(res, process.env.NOT_ADMIN_ERROR);
  } catch (error) {
    logger.error(`Authorization: ${error.message}`);
    console.error("Authorization error:", error);
    return responses.serverError(res, error.message);
  }
};

// check if Dealer
const ifDealer = async (req, res, next) => {
  try {
    if (req.userRole === "CEO") {
      return next(); // Allow dealers
    }
    return responses.unauthorized(res, process.env.NOT_DEALER_ERROR);
  } catch (error) {
    console.error("Authorization error:", error);
    return responses.serverError(res, error.message);
  }
};

//check if superadmin
const ifSuperAdmin = async (req, res, next) => {
  try {
    if (req.userRole === "SuperAdmin") {
      return next(); // Allow superadmins
    }
    return responses.unauthorized(res, process.env.NOT_SUPERADMIN_ERROR);
  } catch (error) {
    console.error("Authorization error:", error);
    return responses.serverError(res, error.message);
  }
};

const allowRoles = (roles) => {
  return (req, res, next) => {
    try {
      const { userRole } = req;
      if (roles.includes(userRole)) {
        return next();
      }
      // console.log(userRole);

      const roleErrorMessage = {
        SM: process.env.NOT_SALESMANAGER_ERROR,
        GM: process.env.NOT_GENERALMANAGER_ERROR,
        PS: process.env.NOT_SALESPERSON_ERROR,
        Admin: process.env.NOT_ADMIN_ERROR,
        SuperAdmin: process.env.NOT_SUPERADMIN_ERROR,
      };
      const message =
        roleErrorMessage[roles] ||
        `Access denied. Role ${userRole} is not authorized`;

      return responses.unauthorized(res, message);
    } catch (error) {
      console.error("Authorization error:", error);
      return responses.serverError(res, error.message);
    }
  };
};

//check if authorised user
const checkIfAuthorisedUserOfLead = async (req, res, next) => {
  try {
    const { userId } = req;
    const recordId = req.params.recordId;
    const user = await Users.findByPk(userId);
    const lead = await Leads.findByPk(recordId);

    if (!lead) {
      return responses.notFound(res, process.env.NO_LEAD);
    }

    if (lead.lead_owner === user.name) {
      return next(); // Allow assigned user
    }
    logger.error(`Unauthorised access by user ${req.userId}`);
    return responses.unauthorized(res, process.env.UNAUTHORISED);
  } catch (error) {
    logger.error(`Authorization: ${error.message}`);
    console.error("Authorization error:", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  ifAdmin,
  ifSuperAdmin,
  allowRoles,
  ifDealer,
  checkIfAuthorisedUserOfLead,
  ifAppAdmin,
};
