const User = require("../models/master/usersModel");
const Leads = require("../models/transactions/leadsModel");
const Events = require("../models/transactions/eventModel");
const { getDateRange } = require("../utils/filterType");
const responses = require("../utils/globalResponse");
const logger = require("../middlewares/fileLogs/logger");
const { Op } = require("sequelize");
const Tasks = require("../models/transactions/taskModel");
const dateController = require("../utils/dateFilter");
const CallLogs = require("../models/transactions/callLogsModel");
const Analytics = require("../models/master/analyticsModel");

const myTeamsDetails = async (req, res) => {
  try {
    const { userId } = req.query;
    const {
      user_id,
      userIds,
      logs_userIds,
      total_performance,
      type,
      start_date,
      end_date,
      target,
    } = req.query;

    const selectedUserIds = userIds
      ? userIds.split(",")
      : total_performance
      ? total_performance.split(",")
      : [];

    const logsUserIds = logs_userIds ? logs_userIds.split(",") : [];

    let dateRange = null;
    let range = null;

    if (type) {
      const { start, end } = getDateRange(type);
      dateRange = { start, end };
      range = type.toUpperCase();
    } else if (start_date && end_date) {
      dateRange = { start: start_date, end: end_date };
    }

    //fetch logged-in user team
    const user = await User.findOne({
      where: { user_id: userId },
      attributes: ["team_id"],
    });

    // get all team members except current user
    const allMembers = await User.findAll({
      where: {
        user_id: { [Op.ne]: userId },
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
      ],
    });

    // ===========Process Call Logs============
    let callStats = {};
    let logs_status;
    if (logsUserIds) {
      for (const u of allMembers) {
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
      const whereCondition = {
        sp_id: { [Op.in]: logsUserIds },
      };
      if (dateRange) {
        whereCondition.call_date = {
          [Op.between]: [dateRange.start, dateRange.end],
        };
      }
      const callLogs = await CallLogs.findAll({
        where: {
          ...whereCondition,
        },
        attributes: [
          "name",
          "start_time",
          "call_type",
          "call_duration",
          "sp_id",
        ],
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

    // =========fetch analytics =============

    const getAllPerformance = async (user) => {
      const whereCondition = {
        sp_id: user.user_id,
        deleted: false,
      };

      if (dateRange) {
        whereCondition.created_at = {
          [Op.between]: [dateRange.start, dateRange.end],
        };
      }
      const [enquiries, testDrives] = await Promise.all([
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
      ]);
      return { enquiries, testDrives };
    };
    const ANALYTICS_ATTRIBUTES = [
      "user_id",
      "user_name",
      "user_email",
      "dealer_id",
      "retail",
      "net_orders",
      "unique_td",
      "enquiry_to_UTD",
      "enquiry_to_TD",
      "new_orders",
      "td_to_retail",
      "cancellations",
      "cancellation_contro",
      "avg_enq_to_ord_days",
      "dig_enq_to_ord_days",
      "team_id",
      "dealer_id",
    ];
    const allUserIds = allMembers.map((u) => u.user_id);
    const analytics = await Analytics.findAll({
      where: {
        user_id: { [Op.in]: allUserIds },
        range: range,
      },
      attributes: ANALYTICS_ATTRIBUTES,
      raw: true,
    });

    const Int = (val) => Number.parseInt(val ?? 0);
    const getPerformace = allMembers.map(async (member) => {
      const performance = await getAllPerformance(member);
      const memberAnalytics = analytics.find(
        (a) => a.user_id === member.user_id
      );

      return {
        user_id: member.user_id,
        name: member.name,
        [target]: Int(memberAnalytics?.[target]),
        isSelected: selectedUserIds.includes(member.user_id.toString()),
        enquiry: Int(performance?.enquiries),
        testDrives: Int(performance?.testDrives),
        new_orders: Int(memberAnalytics?.new_orders),
        cancellations: Int(memberAnalytics?.cancellations),
        net_orders: Int(memberAnalytics?.net_orders),
        retail: Int(memberAnalytics?.retail),
      };
    });

    const result = await Promise.all(getPerformace);
    const selectedPerformace = selectedUserIds.length
      ? result.filter((p) => p.isSelected)
      : result;
    const totalPerformance = selectedPerformace.reduce(
      (acc, curr) => {
        acc.enquiries += Int(curr.enquiry);
        acc.testDrives += Int(curr.testDrives);
        acc.orders += Int(curr.new_orders);
        acc.cancellation += Int(curr.cancellations);
        acc.retail += Int(curr.retail);
        acc.net_orders += Int(curr.net_orders);
        return acc;
      },
      {
        enquiries: 0,
        testDrives: 0,
        orders: 0,
        cancellation: 0,
        retail: 0,
        net_orders: 0,
      }
    );

    const teamComparsion = (
      selectedUserIds.length > 1 ? selectedPerformace : result
    ).map((member) => ({
      user_id: member.user_id,
      name: member.name,
      //[summary]: Int(member[summary]),
      [target]: Int(member[target]),
      isSelected: member.isSelected,
      enquiries: Int(member.enquiry),
      testDrives: Int(member.testDrives),
      orders: Int(member.new_orders),
      cancellation: Int(member.cancellations),
      net_orders: Int(member.net_orders),
      retail: Int(member.retail),
    }));

    //  individual user performance
    let selectedUserPerformance = null;
    if (user_id) {
      const whereCondition = {
        sp_id: user_id,
        deleted: false,
      };
      if (dateRange) {
        whereCondition.created_at = {
          [Op.between]: [dateRange.start, dateRange.end],
        };
      }
      const selectedUser = allMembers.find((m) => m.user_id == user_id);
      const data = await Analytics.findOne({
        where: {
          user_id: user_id,
          range: range,
        },
        attributes: ANALYTICS_ATTRIBUTES,
      });
      const [
        enquiries,
        testDrives,
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

      const analyticsData = data || {
        enquiry: 0,
        unique_td: 0,
        retail: 0,
        net_orders: 0,
        new_orders: 0,
        cancellations: 0,
      };

      selectedUserPerformance = {
        user_id: selectedUser.user_id,
        name: selectedUser.name,
        enquiries: Int(enquiries),
        testDrives: Int(testDrives),
        retail: Int(analyticsData.retail),
        orders: Int(analyticsData.new_orders),
        net_orders: Int(analyticsData.net_orders),
        cancellation: Int(analyticsData.cancellations),
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
        allMember: allMembers.map((member) => ({
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

module.exports = { myTeamsDetails };
