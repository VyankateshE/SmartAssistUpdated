const User = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");
const { getDateRange } = require("../../utils/filterType");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");
const { Op } = require("sequelize");
const Tasks = require("../../models/transactions/taskModel");
const dateController = require("../../utils/dateFilter");
const CallLogs = require("../../models/transactions/callLogsModel");

const getTeamsDetails = async (req, res) => {
  try {
    const { userId } = req;
    const {
      user_id,
      userIds,
      logs_userIds,
      type,
      summary = "enquiries",
      start_date,
      end_date,
      target,
    } = req.query;

    const selectedUserIds = userIds ? userIds.split(",") : [];
    const logsUserIds = logs_userIds ? logs_userIds.split(",") : [];

    const { start, end } = getDateRange(type);

    const dateRange =
      start_date && end_date
        ? { start: start_date, end: end_date }
        : { start, end };

    const user = await User.findOne({
      where: { user_id: userId },
      attributes: ["team_id"],
    });

    const members = await User.findAll({
      where: {
        user_id: { [Op.ne]: req.userId },
        team_id: user.team_id,
        deleted: false,
      },
      attributes: [
        "user_id",
        "fname",
        "lname",
        "name",
        "initials",
        "profile_pic",
        "dealer_id",
        "target_enquiries",
        "target_testdrives",
        "target_orders",
      ],
    });

    let callStats = {};
    let logs_status;
    if (logsUserIds) {
      for (const u of members) {
        if (logsUserIds.includes(u.user_id)) {
          callStats[u.user_id] = {
            name: u.name,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            declined: 0,
            duration: 0,
          };
        }
      }
      const callLogs = await CallLogs.findAll({
        attributes: [
          "name",
          "start_time",
          "call_type",
          "call_duration",
          "sp_id",
        ],
        where: {
          sp_id: { [Op.in]: logsUserIds },
          call_date: {
            [Op.between]: [start, end],
          },
        },
      });

      for (const { sp_id, call_type, call_duration } of callLogs) {
        const stats = callStats[sp_id];
        if (call_type === "outgoing" || call_type === "incoming") {
          stats[call_type]++;
        }
        if (call_duration > 0) {
          stats.connected++;
          stats.duration += call_duration;
        } else if (call_type === "rejected") {
          stats.declined++;
        }
      }

      const formatDuration = (duration) => {
        const h = Math.floor(duration / 3600);
        const m = Math.floor((duration % 3600) / 60);
        const s = duration % 60;
        return `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${s ? `${s}s` : ""}`;
      };

      logs_status = Object.values(callStats).map((calls) => ({
        ...calls,
        duration: formatDuration(calls.duration),
      }));
    }

    const getAllPerformance = async (user) => {
      const whereCondition = {
        sp_id: user.user_id,
        deleted: false,
        ...(dateRange.start &&
          dateRange.end && {
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
          }),
      };
      const [enquiries, testDrives, orders, cancellation, retail] =
        await Promise.all([
          Leads.count({
            where: {
              ...whereCondition,
            },
          }),
          Events.count({
            where: {
              ...whereCondition,
              subject: "Test Drive",
            },
            distinct: true,
            col: "lead_id",
          }),
          Leads.count({
            where: {
              ...whereCondition,
              converted: true,
              opp_status: "Take Order",
              converted_at: { [Op.ne]: null },
            },
          }),
          Leads.count({
            where: {
              ...whereCondition,
              dealer_id: user.dealer_id,
              status: "Lost",
            },
          }),
          Leads.count({
            where: {
              ...whereCondition,
              converted: true,
              opp_status: "Take Order",
              converted_at: { [Op.ne]: null },
              converted_to_retail: true,
            },
          }),
        ]);
      return { enquiries, testDrives, orders, cancellation, retail };
    };

    const getPerformace = await Promise.all(
      members.map(async (member) => {
        const performance = await getAllPerformance(member);
        return {
          user_id: member.user_id,
          fname: member.fname,
          lname: member.lname,
          [summary]: member[summary],
          [target]: member[target],
          isSelected: selectedUserIds.includes(member.user_id.toString()),
          ...performance,
        };
      })
    );
    const selectedPerformace = selectedUserIds.length
      ? getPerformace.filter((p) => p.isSelected)
      : getPerformace;

    const totalPerformance = selectedPerformace.reduce(
      (acc, curr) => {
        acc.enquiries += curr.enquiries;
        acc.testDrives += curr.testDrives;
        acc.orders += curr.orders;
        acc.cancellation += curr.cancellation;
        acc.retail += curr.retail;
        return acc;
      },
      { enquiries: 0, testDrives: 0, orders: 0, cancellation: 0, retail: 0 }
    );

    const teamComparsion = (
      selectedUserIds.length > 1 ? selectedPerformace : getPerformace
    ).map((member) => ({
      user_id: member.user_id,
      fname: member.fname,
      lname: member.lname,
      [target]: member[target],
      isSelected: member.isSelected,
      enquiries: member.enquiries ?? 0,
      testDrives: member.testDrives ?? 0,
      orders: member.orders ?? 0,
      cancellation: member.cancellation ?? 0,
      retail: member.retail ?? 0,
    }));
    //  individual user performance
    let selectedUserPerformance = null;
    if (user_id) {
      const selectedUser = members.find((m) => m.user_id == user_id);
      const whereCondition = {
        sp_id: user_id,
        deleted: false,
        ...(dateRange.start &&
          dateRange.end && {
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
          }),
      };
      const [
        enquiries,
        testDrives,
        orders,
        cancellation,
        retail,
        upComingFollowups,
        upComingAppointment,
        upComingTestDrive,
        overdueFollowups,
        overdueAppointments,
        overdueTestDrives,
      ] = await Promise.all([
        Leads.count({
          where: {
            ...whereCondition,
          },
        }),
        Events.count({
          where: {
            ...whereCondition,
            subject: "Test Drive",
          },
          distinct: true,
          col: "lead_id",
        }),
        Leads.count({
          where: {
            ...whereCondition,
            converted: true,

            opp_status: "Take Order",
            converted_at: { [Op.ne]: null },
          },
        }),
        Leads.count({
          where: {
            ...whereCondition,
            dealer_id: selectedUser.dealer_id,
            status: "Lost",
          },
        }),
        Leads.count({
          where: {
            ...whereCondition,
            converted: true,
            opp_status: "Take Order",
            converted_at: { [Op.ne]: null },
            converted_to_retail: true,
          },
        }),
        // Upcoming  Follow-ups
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            status: { [Op.ne]: "Completed" },
            due_date: {
              [Op.between]: [
                dateController.todayDate,
                dateController.oneWeekLaterDate,
              ],
            },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          attributes: [
            "task_id",
            "lead_id",
            "name",
            "PMI",
            "lead_email",
            "due_date",
            "status",
            "subject",
          ],
          order: [["due_date", "ASC"]],
        }),
        // Upcoming appointments
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: { [Op.ne]: "Test Drive" },
            start_date: {
              [Op.between]: [
                dateController.todayDate,
                dateController.oneWeekLaterDate,
              ],
            },
            status: { [Op.ne]: "Finished" },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          attributes: [
            "event_id",
            "PMI",
            "name",
            "lead_id",
            "start_date",
            "start_time",
            "end_date",
            "end_time",
            "subject",
            "status",
          ],
          order: [["start_date", "ASC"]],
        }),
        // Upcoming Test Drives
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: "Test Drive",
            start_date: {
              [Op.between]: [
                dateController.todayDate,
                dateController.oneWeekLaterDate,
              ],
            },
            status: { [Op.ne]: "Finished" },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          attributes: [
            "event_id",
            "PMI",
            "name",
            "lead_id",
            "start_date",
            "start_time",
            "end_date",
            "end_time",
            "subject",
            "status",
          ],
          order: [["start_date", "ASC"]],
        }),

        // Overdue follow-ups
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            due_date: {
              [Op.between]: [
                dateController.oneWeekBeforeDate,
                dateController.yesterdayDate,
              ],
            },
            status: { [Op.ne]: "Completed" },

            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          order: [["due_date", "DESC"]],
          attributes: [
            "task_id",
            "lead_id",
            "name",
            "PMI",
            "lead_email",
            "due_date",
            "status",
            "subject",
          ],
        }),

        // Overdue appointments
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: { [Op.ne]: "Test Drive" },
            start_date: {
              [Op.between]: [
                dateController.oneWeekBeforeDate,
                dateController.yesterdayDate,
              ],
            },
            status: { [Op.ne]: "Finished" },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          order: [["start_date", "DESC"]],
          attributes: [
            "event_id",
            "PMI",
            "name",
            "lead_id",
            "start_date",
            "start_time",
            "end_date",
            "end_time",
            "subject",
            "status",
          ],
        }),

        // Overdue test drives
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: "Test Drive",
            start_date: {
              [Op.between]: [
                dateController.oneWeekBeforeDate,
                dateController.yesterdayDate,
              ],
            },
            status: { [Op.ne]: "Finished" },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          order: [["start_date", "DESC"]],

          attributes: [
            "event_id",
            "PMI",
            "name",
            "lead_id",
            "start_date",
            "start_time",
            "end_date",
            "end_time",
            "subject",
            "status",
          ],
        }),
      ]);

      selectedUserPerformance = {
        user_id: selectedUser.user_id,
        name: selectedUser.name,
        enquiries: enquiries,
        testDrives: testDrives,
        retail: retail,
        orders: orders,
        cancellation: cancellation,
        Upcoming: {
          upComingFollowups: upComingFollowups.rows,
          upComingAppointment: upComingAppointment.rows,
          upComingTestDrive: upComingTestDrive.rows,
        },
        Overdue: {
          overdueFollowups: overdueFollowups.rows,
          overdueAppointments: overdueAppointments.rows,
          overdueTestDrives: overdueTestDrives.rows,
        },
      };
    }
    if (selectedUserPerformance) {
      return responses.success(res, "User performance fetched successfully", {
        selectedUserPerformance,
      });
    } else {
      return responses.success(res, "Team performance fetched successfully", {
        totalPerformance,
        teamComparsion,
        logs_status,
        allMember: members.map((member) => ({
          user_id: member.user_id,
          fname: member.fname,
          lname: member.lname,
          name: member.name,
          profile: member.profile_pic,
          initials: member.initials,
        })),
      });
    }
  } catch (error) {
    logger.error(
      `Failed to fetch team performance for user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const getCallAnalytics = async (req, res) => {
  try {
    const { userId } = req;
    const { type } = req.query;
    const { start, end } = getDateRange(type);

    // Fetch logged-in user with both team_id & tl_id
    const user = await User.findByPk(userId, {
      attributes: ["user_id", "team_id", "tl_id"],
    });

    if (!user) {
      return responses.badRequest(res, "Invalid user");
    }

    // -----------------------------
    // ⭐ ROLE-BASED DIFFERENTIATION
    // -----------------------------
    const groupKey = req.userRole === "TL" ? "tl_id" : "team_id";
    const groupId = req.userRole === "TL" ? user.tl_id : user.team_id;

    // Fetch team members dynamically
    const members = await User.findAll({
      where: {
        user_id: { [Op.ne]: req.userId },
        [groupKey]: groupId, // << CHANGE APPLIED HERE
        deleted: false,
      },
      attributes: ["user_id", "name", "dealer_id", "team_id", "tl_id"],
    });

    const member_id = members.map((m) => m.user_id);

    // Fetch leads belonging to members
    const leads = await Leads.findAll({
      attributes: ["sp_id", "mobile"],
      where: {
        sp_id: { [Op.in]: member_id },
        deleted: false,
      },
    });

    const leadMobile = new Set(leads.map(({ mobile }) => mobile));

    // Fetch call logs of these members
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
        [Op.or]: [{ is_excluded: false }, { is_excluded: null }],
        call_date: { [Op.between]: [start, end] },
      },
    });

    // ========= INITIALIZE STATS ==========
    let enquiriesCallStats = {};
    let coldCallStats = {};
    let combinedCallStats = {};

    let enquiriesTotalConnected = 0;
    let enquiriesTotalDuration = 0;
    let enquiriesDeclined = 0;

    let coldCallsTotalConnected = 0;
    let coldCallsTotalDuration = 0;
    let coldCallsDeclined = 0;

    let combinedTotalConnected = 0;
    let combinedTotalDuration = 0;
    let combinedDeclined = 0;

    for (const m of members) {
      enquiriesCallStats[m.user_id] = {
        user_id: m.user_id,
        name: m.name,
        outgoing: 0,
        incoming: 0,
        connected: 0,
        duration: 0,
        declined: 0,
      };

      coldCallStats[m.user_id] = {
        user_id: m.user_id,
        name: m.name,
        outgoing: 0,
        incoming: 0,
        connected: 0,
        duration: 0,
        declined: 0,
      };

      combinedCallStats[m.user_id] = {
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

    const validTypes = ["incoming", "outgoing", "missed", "rejected"];

    // ========= PROCESS CALL LOGS ==========
    for (const { sp_id, call_type, call_duration, mobile } of callLogs) {
      if (!validTypes.includes(call_type)) continue;

      const isLead = leadMobile.has(mobile);
      const durationSec = Number(call_duration) || 0;

      const targetStats = isLead ? enquiriesCallStats : coldCallStats;
      const stats = targetStats[sp_id];
      const combinedStats = combinedCallStats[sp_id];

      if (call_type === "outgoing" || call_type === "incoming") {
        stats[call_type]++;
        combinedStats[call_type]++;
      } else if (call_type === "rejected") {
        stats.declined++;
        combinedStats.declined++;

        if (isLead) enquiriesDeclined++;
        else coldCallsDeclined++;

        combinedDeclined++;
      }

      if (durationSec > 0) {
        stats.connected++;
        stats.duration += durationSec;
        combinedStats.connected++;
        combinedStats.duration += durationSec;

        if (isLead) {
          enquiriesTotalConnected++;
          enquiriesTotalDuration += durationSec;
        } else {
          coldCallsTotalConnected++;
          coldCallsTotalDuration += durationSec;
        }

        combinedTotalConnected++;
        combinedTotalDuration += durationSec;
      }
    }

    const enquiriesMemberStats = Object.values(enquiriesCallStats).map(
      (calls) => ({
        ...calls,
        duration: formatDuration(calls.duration),
      })
    );

    const coldCallsMemberStats = Object.values(coldCallStats).map((calls) => ({
      ...calls,
      duration: formatDuration(calls.duration),
    }));

    const combinedMemberStats = Object.values(combinedCallStats).map(
      (calls) => ({
        ...calls,
        duration: formatDuration(calls.duration),
      })
    );

    return responses.success(res, "Call Analytics data fetched", {
      enquiriesCalls: {
        teamSize: members.length,
        TotalConnected: enquiriesTotalConnected,
        TotalDuration: formatDuration(enquiriesTotalDuration),
        Declined: enquiriesDeclined,
        members: enquiriesMemberStats,
      },
      coldCalls: {
        teamSize: members.length,
        TotalConnected: coldCallsTotalConnected,
        TotalDuration: formatDuration(coldCallsTotalDuration),
        Declined: coldCallsDeclined,
        members: coldCallsMemberStats,
      },
      combinedCalls: {
        teamSize: members.length,
        TotalConnected: combinedTotalConnected,
        TotalDuration: formatDuration(combinedTotalDuration),
        Declined: combinedDeclined,
        members: combinedMemberStats,
      },
    });
  } catch (err) {
    logger.error(
      `Failed to fetch Call Analytics data by user ${req.userId} at ${req.originalUrl}: ${err.message}`
    );
    return responses.serverError(res, err.message);
  }
};

module.exports = {
  getCallAnalytics,
  getTeamsDetails,
};
