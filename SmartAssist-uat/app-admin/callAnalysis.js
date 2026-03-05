const CallLogs = require("../models/transactions/callLogsModel");
const { getDateRange } = require("../utils/filterType");
const { Op } = require("sequelize");
const Leads = require("../models/transactions/leadsModel");
const responses = require("../utils/globalResponse");
const logger = require("../middlewares/fileLogs/logger");
const User = require("../models/master/usersModel");

const getCallAnalytics = async (req, res) => {
  try {
    const { type, userId } = req.query;
    const userID = userId;

    const { start, end } = getDateRange(type);
    const [user, leads, callLogs] = await Promise.all([
      User.findOne({
        where: { user_id: userID },
        attributes: ["name"],
      }),
      Leads.findAll({
        attributes: ["mobile"],
        where: {
          sp_id: userID,
          deleted: false,
        },
      }),
      CallLogs.findAll({
        attributes: [
          "name",
          "start_time",
          "call_type",
          "mobile",
          "call_date",
          "call_duration",
          "is_excluded",
        ],
        where: {
          sp_id: userID,
          is_excluded: {
            [Op.not]: true,
          },
          call_date: {
            [Op.between]: [start, end],
          },
        },
      }),
    ]);

    const leadMobile = new Set(leads.map(({ mobile }) => mobile));
    const initSummary = () => ({
      summary: {},
      hourly: {},
      dates: new Set(),
      totalConnected: 0,
      totalConversation: 0,
      missedCalls: 0,
    });

    const SummaryMap = {
      lead: initSummary(),
      nonlead: initSummary(),
    };

    const formatTypeLogs = (call_date, start_time, type) => {
      const dt = new Date(call_date);
      if (type === "DAY") {
        return Number(start_time?.slice(0, 2));
      } else if (type === "WEEK") {
        return dt.toLocaleDateString("en-US", { weekday: "short" });
      } else if (type === "MTD") {
        const day = dt.getDate();
        if (day <= 7) return "Week 1";
        else if (day <= 14) return "Week 2";
        else if (day <= 21) return "Week 3";
        else return "Week 4";
      } else if (type === "QTD") {
        return dt.toLocaleDateString("en-US", { month: "short" });
      } else if (type === "YTD") {
        const month = dt.getMonth();
        if (month <= 2) return "Q1";
        else if (month <= 5) return "Q2";
        else if (month <= 8) return "Q3";
        else return "Q4";
      }
    };
    const validTypes = ["incoming", "outgoing", "missed", "rejected"];
    for (const {
      call_type,
      start_time,
      call_duration,
      call_date,
      mobile,
    } of callLogs) {
      if (!validTypes.includes(call_type)) continue;

      const isLead = leadMobile.has(mobile);
      const key = isLead ? "lead" : "nonlead";
      const stats = SummaryMap[key];
      stats.dates.add(call_date);

      const formatType = formatTypeLogs(call_date, start_time, type);
      stats.hourly[formatType] ||= {
        AllCalls: { calls: 0, duration: 0 },
        connected: { calls: 0, duration: 0 },
        missedCalls: 0,
      };
      stats.hourly[formatType].AllCalls.calls++;
      stats.hourly[formatType].AllCalls.duration += call_duration;
      if (call_type === "missed") stats.hourly[formatType].missedCalls++;
      if (call_duration > 0) {
        stats.hourly[formatType].connected.calls++;
        stats.hourly[formatType].connected.duration += call_duration;
      }

      const addSummary = (type) => {
        stats.summary[type] ||= {
          calls: 0,
          duration: 0,
          uniqueClients: new Set(),
        };
        stats.summary[type].calls++;
        stats.summary[type].duration += call_duration;
        stats.summary[type].uniqueClients.add(mobile);
      };

      addSummary("All Calls");
      if (call_type === "missed") addSummary("Missed");
      if (call_type === "rejected") addSummary("Rejected");
      if (call_duration > 0) {
        addSummary("Connected");
        stats.totalConnected++;
        stats.totalConversation += call_duration;
      }
      if (["missed", "rejected"].includes(call_type)) {
        stats.missedCalls++;
      }
    }

    const formatDuration = (duration) => {
      const h = Math.floor(duration / 3600);
      const m = Math.floor((duration % 3600) / 60);
      const s = duration % 60;
      return `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${s ? `${s}s` : ""}`;
    };

    const processLogs = (data) => ({
      totalConnected: data.totalConnected,
      conversationTime: formatDuration(data.totalConversation),
      notConnected: data.missedCalls,
      summary: Object.fromEntries(
        Object.entries(data.summary).map(([k, v]) => [
          k,
          {
            calls: v.calls,
            duration: formatDuration(v.duration),
            uniqueClients: v.uniqueClients.size,
          },
        ])
      ),
      hourlyAnalysis: Object.fromEntries(
        Object.entries(data.hourly).map(([h, s]) => [
          h,
          {
            AllCalls: {
              calls: s.AllCalls.calls,
              duration: formatDuration(s.AllCalls.duration),
            },
            Connected: {
              calls: s.connected.calls,
              duration: formatDuration(s.connected.duration),
            },
            missedCalls: s.missedCalls,
          },
        ])
      ),
    });
    return responses.success(res, "Call analytics data fetched Successfully", {
      name: user.name,
      summaryEnquiry: processLogs(SummaryMap.lead),
      summaryColdCalls: processLogs(SummaryMap.nonlead),
    });
  } catch (err) {
    logger.error("Failed to fetch call analytics:", err);
    console.error("Error fetching call analytics:", err);
    return responses.serverError(res, err.message);
  }
};

const getTeamCallAnalytics = async (req, res) => {
  try {
    const { type, userId } = req.query;
    const { start, end } = getDateRange(type);
    const user = await User.findByPk(userId, {
      attributes: ["user_id", "team_id"],
    });

    const members = await User.findAll({
      where: {
        user_id: { [Op.ne]: req.userId },
        team_id: user.team_id,
      },
      attributes: ["user_id", "name", "dealer_id"],
    });

    const member_id = members.map((m) => m.user_id);

    const leads = await Leads.findAll({
      attributes: ["sp_id", "mobile"],
      where: {
        sp_id: { [Op.in]: member_id },
      },
    });

    const leadMobile = new Set(leads.map(({ mobile }) => mobile));
    const callLogs = await CallLogs.findAll({
      attributes: [
        "sp_id",
        "call_type",
        "call_date",
        "mobile",
        "call_duration",
      ],
      where: {
        sp_id: { [Op.in]: member_id },
        call_date: { [Op.between]: [start, end] },
      },
    });

    let callStats = {};
    let TotalConnected = 0;
    let TotalDuration = 0;
    let Declined = 0;

    for (const m of members) {
      callStats[m.user_id] = {
        user_id: m.user_id,
        name: m.name,
        outgoing: 0,
        incoming: 0,
        connected: 0,
        duration: 0,
        declined: 0,
      };
    }

    const formatDuration = (duration) => {
      const h = Math.floor(duration / 3600);
      const m = Math.floor((duration % 3600) / 60);
      const s = duration % 60;
      return `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${s ? `${s}s` : ""}`;
    };

    for (const { sp_id, call_type, call_duration, mobile } of callLogs) {
      if (!leadMobile.has(mobile)) continue;
      const stats = callStats[sp_id];

      if (call_type === "outgoing" || call_type === "incoming") {
        stats[call_type]++;
      } else if (call_type === "rejected") {
        stats.declined++;
        Declined++;
      }
      if (call_duration > 0) {
        stats.connected++;
        stats.duration += call_duration;
        TotalDuration += call_duration;
        TotalConnected++;
      }
    }
    const memberStats = Object.values(callStats).map((calls) => ({
      ...calls,
      duration: formatDuration(calls.duration),
    }));

    return responses.success(res, "Call Analytics data fetched", {
      teamSize: members.length,
      TotalConnected,
      TotalDuration: formatDuration(TotalDuration),
      Declined,
      members: memberStats,
    });
  } catch (err) {
    logger.error(
      `Failed to fetch Call Analytics data by user ${req.userId} at ${req.originalUrl}: ${err.message}`
    );
    return responses.serverError(res, err.message);
  }
};

module.exports = { getCallAnalytics, getTeamCallAnalytics };
