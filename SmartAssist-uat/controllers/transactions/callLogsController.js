const CallLogs = require("../../models/transactions/callLogsModel");
const Leads = require("../../models/transactions/leadsModel");
const responses = require("../../utils/globalResponse");
const { getDateRange } = require("../../utils/getDateRange");
const moment_timezone = require("moment-timezone");
const { Op } = require("sequelize");

const createCallLogs = async (req, res) => {
  try {
    const callLogs = req.body;

    // 1. Get existing unique keys
    const existingKeys = new Set(
      (
        await CallLogs.findAll({
          where: {
            unique_key: { [Op.in]: callLogs.map((log) => log.unique_key) },
            sp_id: req.userId,
          },
          attributes: ["unique_key"],
        })
      ).map((e) => e.unique_key)
    );

    const newLogs = callLogs.filter((log) => !existingKeys.has(log.unique_key));

    // 2. Pre-fetch all leads matching mobiles
    const mobiles = [...new Set(newLogs.map((log) => log.mobile))];
    const leads = await Leads.findAll({
      where: { mobile: { [Op.in]: mobiles } },
      attributes: ["mobile", "lead_id"],
    });

    const leadMap = new Map(leads.map((l) => [l.mobile, l.lead_id]));

    // 3. Transform data in memory
    const bulkData = newLogs.map((logs) => {
      const timestamp = parseInt(logs.start_time);
      const time = moment_timezone
        .utc(timestamp)
        .tz("Asia/Kolkata")
        .format("HH:mm:ss"); // use 24h format
      const date = moment_timezone(timestamp).format("YYYY-MM-DD");

      return {
        ...logs,
        start_time: time,
        call_date: date,
        lead_id: leadMap.get(logs.mobile) || null,
        sp_id: req.userId,
      };
    });

    // 4. Insert in bulk
    if (bulkData.length > 0) {
      await CallLogs.bulkCreate(bulkData);
    }

    return responses.created(
      res,
      "Call logs created successfully",
      bulkData.length
    );
  } catch (error) {
    console.error("Error fetching call logs:", error);
    return responses.serverError(res, error.message);
  }
};

const excludedCallLogs = async (req, res) => {
  try {
    const callLogs = req.body;
    const uniqueKeys = callLogs.map((log) => log.unique_key);
    const existingLogs = await CallLogs.findAll({
      where: {
        unique_key: { [Op.in]: uniqueKeys },
      },
      attributes: ["unique_key", "is_excluded"],
    });

    const update = existingLogs
      .map((log) =>
        CallLogs.update(
          { is_excluded: !log.is_excluded },
          { where: { unique_key: log.unique_key } }
        )
      )
      .sort((a, b) => (b.is_excluded === true) - (a.is_excluded === true));
    await Promise.all(update);
    return responses.success(res, "Contacts' status updated", update);
  } catch (error) {
    console.error("Error excluding call logs:", error);
    return responses.serverError(res, "Failed to exclude call logs.");
  }
};
const includeCallLogs = async (req, res) => {
  try {
    const callLogs = req.body;
    const uniqueKeys = callLogs.map((log) => log.unique_key);
    const existingLogs = await CallLogs.findAll({
      where: {
        unique_key: { [Op.in]: uniqueKeys },
      },
      attributes: ["unique_key", "is_excluded"],
    });

    const update = existingLogs
      .map((log) =>
        CallLogs.update(
          { is_excluded: !log.is_excluded },
          { where: { unique_key: log.unique_key } }
        )
      )
      .sort((a, b) => (b.is_excluded === true) - (a.is_excluded === true));
    await Promise.all(update);
    return responses.success(res, "Call logs included ", update);
  } catch (error) {
    console.error("Error include call logs:", error);
    return responses.serverError(res, "Failed to include call logs.");
  }
};

const getAllCallLogsofLead = async (req, res) => {
  try {
    const logs = await CallLogs.findAll({
      attributes: [
        "name",
        "mobile",
        "start_time",
        "call_type",
        "call_duration",
        "call_date",
        "unique_key",
        "is_excluded",
      ],
      where: {
        sp_id: req.userId,
      },
      order: [["call_date", "DESC"]],
    });

    const mobiles = new Set();
    const uniqueLogs = [];
    for (let log of logs) {
      if (!mobiles.has(log.mobile)) {
        mobiles.add(log.mobile);
        uniqueLogs.push(log);
      }
    }
    return res.status(200).json(uniqueLogs);
  } catch (error) {
    console.error("Error fetching all logs:", error);
  }
};
//get logs for selected lead
const getCallLogsOfLead = async (req, res) => {
  try {
    const { category, range, mobile } = req.query;
    const whereCondition = {
      mobile: {
        [Op.iLike]: `%${mobile}%`,
      },
    };

    if (category) {
      whereCondition.call_type = category;
    }
    if (range) {
      const { start, end } = getDateRange(range.toUpperCase());

      if (start && end) {
        whereCondition.call_date = {
          [Op.between]: [start, end],
        };
      }
    }
    const logs = await CallLogs.findAndCountAll({
      where: whereCondition,
      order: [["call_date", "DESC"]],
    });
    const duration = logs.rows.reduce((acc, curr) => {
      return acc + parseInt(curr.call_duration || "0");
    }, 0);
    const mins = Math.floor((duration % 3600) / 60);

    //count of call category
    const allLogs = await CallLogs.findAll({
      where: whereCondition,
    });

    // Count types
    const count = { all: allLogs.length };
    for (const log of allLogs) {
      const type = log.call_type;
      count[type] = (count[type] || 0) + 1;
    }

    return responses.success(res, "Call logs fetched successfully", {
      logs,
      totalDurationInMins: mins,
      category_counts: count,
    });
  } catch (error) {
    console.error("Error fetching call logs:", error);
    return responses.serverError(res, error.message);
  }
};

//test all logs
const testAllLogs = async (req, res) => {
  try {
    const logs = await CallLogs.findAll({ order: [["call_date", "DESC"]] });
    return res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching all logs:", error);
  }
};

module.exports = {
  createCallLogs,
  excludedCallLogs,
  includeCallLogs,
  getCallLogsOfLead,
  getAllCallLogsofLead,
  testAllLogs,
};
