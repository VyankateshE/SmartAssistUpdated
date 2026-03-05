require("dotenv").config();
const Teams = require("../../models/master/teamMasterModel");
const Users = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const { Op } = require("sequelize");
const logger = require("../../middlewares/fileLogs/logger");
const logErrorToDB = require("../../middlewares/dbLogs/masterDbLogs");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const {
  validateInput,
} = require("../../middlewares/validators/validatorMiddleware");
const responses = require("../../utils/globalResponse");

//create new team
const createTeam = async (req, res) => {
  try {
    const { userId, userRole, dealerId } = req;
    const bodyObj = req.body;

    validateInput([bodyObj.team_name]);

    const existingTeam = await Teams.findOne({
      where: { team_name: bodyObj.team_name },
    });
    if (existingTeam) {
      return responses.badRequest(
        res,
        `Team name '${bodyObj.team_name}' already exists.`
      );
    }
    const user = await Users.findByPk(userId);

    // Common team object
    const teamPayload = {
      ...bodyObj,
      created_by: userId,
      updated_by: userId,
      corporate_id: user?.corporate_id || null,
      dealer_id: dealerId || user?.dealer_id || null,
    };

    // Assign team lead for specific roles
    if (["SM", "GM"].includes(userRole)) {
      teamPayload.team_lead_id = userId;
      teamPayload.team_lead_email = user.email;
    }

    const newTeam = await Teams.create(teamPayload);

    logger.info(`New team created: ${newTeam.team_name}`);
    return responses.created(res, `Team created`, newTeam);
  } catch (error) {
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    logger.error(
      `Error creating Team by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.badRequest(res, error.message);
  }
};

//end

//update team's details
const updateTeam = async (req, res) => {
  try {
    const { userId } = req;
    const teamId = req.params.teamId;
    const bodyObj = req.body;

    //validate input
    validateInput([bodyObj.team_name]);
    const updatedData = await Teams.update(
      {
        ...bodyObj,
        updated_by: userId,
      },
      {
        where: {
          team_id: teamId,
        },
        returning: true,
      }
    );
    return responses.success(
      res,
      `Team updated ${process.env.ST201}`,
      updatedData
    );
  } catch (error) {
    //log error to db
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    //log error to file
    logger.error(
      `Error updating team data by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.badRequest(res, error.message);
  }
};
//end

//delete team
const deleteTeam = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    await Teams.update(
      {
        deleted: true,
      },
      { where: { team_id: teamId } }
    );
    logger.info(`Team deleted successfully for team ID ${teamId}`);
    return responses.success(res, `Team deleted ${process.env.ST201}`);
  } catch (error) {
    //log error to db
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    //log error to file
    logger.error(
      `Error deleting team by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};
//end

//get all teams
const getAllTeams = async (req, res) => {
  try {
    const whereCondition = {
      deleted: false,
    };
    const teams = await Teams.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
    });
    return responses.success(res, `Teams Fetched ${process.env.ST201}`, teams);
  } catch (error) {
    logger.error(
      `Failed to fetch teams by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};
//end

//get single team's details
const getOneTeamDetails = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    const teamsData = await Promise.all([
      Teams.findOne({ where: { team_id: teamId } }),
      Users.findAndCountAll({ where: { team_id: teamId, deleted: false } }),
    ]);
    const userIds = teamsData[1].rows.map((users) => {
      return users.user_id;
    });
    const usersTransactSummary = await Promise.all([
      Leads.findAndCountAll({
        where: { sp_id: userIds, deleted: false, converted: false },
      }),
      Leads.findAndCountAll({
        where: { sp_id: userIds, deleted: false, converted: true },
      }),
    ]);
    return responses.success(res, `Team details fetched ${process.env.ST201}`, {
      TeamDetails: teamsData[0],
      TeamMembers: teamsData[1],
      leadsData: usersTransactSummary[0],
      oppsData: usersTransactSummary[1],
    });
  } catch (error) {
    logger.error(
      `Failed to fetch team details by user ${req.userId} at ${req.originalUrl}`
    );
    return responses.serverError(res, error.message);
  }
};
//end

//get all members of the team with its tasks and events

const getTeamMembers = async (req, res) => {
  try {
    const manager = await Users.findByPk(req.userId, {
      attributes: ["user_id", "team_id"],
    });
    const teamMembers = await Users.findAll({
      where: {
        user_id: { [Op.ne]: req.userId },
        team_id: manager.team_id,
        deleted: false,
      },
    });

    if (!teamMembers.length) {
      return responses.success(res, "No team members found.", []);
    }

    // Fetching tasks and events using created_by and sp_id
    const teamMemberData = await Promise.all(
      teamMembers.map(async (member) => {
        const [tasks, events] = await Promise.all([
          Tasks.findAll({ where: { sp_id: member.user_id } }),
          Events.findAll({ where: { sp_id: member.user_id } }),
        ]);

        return {
          ...member.toJSON(),
          tasks,
          events,
        };
      })
    );

    return responses.success(
      res,
      `Team members with tasks and events fetched ${process.env.ST201}`,
      teamMemberData
    );
  } catch (error) {
    logger.error(
      `Failed to fetch team members by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

//end

module.exports = {
  createTeam,
  updateTeam,
  deleteTeam,
  getAllTeams,
  getOneTeamDetails,
  getTeamMembers,
};
