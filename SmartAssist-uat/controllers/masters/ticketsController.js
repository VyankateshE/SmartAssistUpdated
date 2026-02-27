require("dotenv").config();
const Issues = require("../../models/master/ticketModel");
const Users = require("../../models/master/usersModel");
const logger = require("../../middlewares/fileLogs/logger");
const { sendBugReport } = require("../../middlewares/emails/bugReport");
const responses = require("../../utils/globalResponse");
const moment = require("moment-timezone");
const { Op } = require("sequelize");
const { fn, col, where } = require("sequelize");

const createIssue = async (req, res) => {
  try {
    const bodyObj = req.body;
    const user = await Users.findByPk(req.userId, {
      attributes: [
        "user_id",
        "fname",
        "lname",
        "email",
        "dealer_name",
        "dealer_code",
      ],
    });

    const issue = await Issues.create({
      ...bodyObj,
      dealer_name: user.dealer_name,
      dealer_code: user.dealer_code,
      date_reported: moment().tz("Asia/Kolkata").format("YYYY-MM-DD"),
      time_reported: moment().tz("Asia/Kolkata").format("HH:mm:ss"),
      reported_by: req.userEmail,
    });
    responses.success(
      res,
      `Thanks for submitting your feedback, we will get back to you soon `,
      issue
    );
    sendBugReport(issue);
  } catch (error) {
    logger.error(`Error creating issue: ${error.message}`);
    console.error("Error creating issue:", error);
    return responses.serverError(res, `Something went wrong`);
  }
};

//create new issue externally

const newIssueExternal = async (req, res) => {
  try {
    const bodyObj = req.body;
    const issue = await Issues.create({
      ...bodyObj,
      status: "open",
    });
    responses.success(
      res,
      `Thanks for submitting your feedback, we will get back to you soon `,
      issue
    );
    // sendBugReport(issue);
  } catch (error) {
    logger.error(`Error creating issue: ${error.message}`);
    console.error("Error creating issue:", error);
    return responses.serverError(res, `Something went wrong`);
  }
};

//get all issues
const getAllIssues = async (req, res) => {
  try {
    const issues = await Issues.findAll({ order: [["created_at", "DESC"]] });
    if (issues.length === 0) {
      return responses.notFound(res, `No issues found`);
    }
    responses.success(res, `Issues fetched successfully`, issues);
  } catch (error) {
    // logger.error(`Error fetching issues: ${error.message}`);
    console.error("Error fetching issues:", error);
    return responses.serverError(res, `Something went wrong`);
  }
};

//update issue
const updateIssue = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const bodyObj = req.body;
    const issue = await Issues.findByPk(ticket_id);
    if (!issue) {
      return responses.notFound(res, `Issue not found`);
    }
    await issue.update(bodyObj);
    responses.success(res, `Issue updated successfully`, issue);
  } catch (error) {
    // logger.error(`Error updating issue: ${error.message}`);
    console.error("Error updating issue:", error);
    return responses.serverError(res, `Something went wrong`);
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await Users.findAll({
      where: {
        [Op.and]: [
          where(fn("char_length", col("email")), { [Op.gt]: 2 }),
          { user_role: { [Op.ne]: "app-admin" } },
        ],
      },
      attributes: [
        "user_id",
        "email",
        "fname",
        "lname",
        "name",
        "dealer_name",
        "dealer_code",
      ],
      order: [["email", "ASC"]],
    });

    return responses.success(res, "Users fetched successfully", users);
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    console.error("Error fetching users:", error);
    return responses.serverError(res, "Something went wrong");
  }
};
module.exports = {
  createIssue,
  getAllIssues,
  updateIssue,
  getAllUsers,
  newIssueExternal,
};
