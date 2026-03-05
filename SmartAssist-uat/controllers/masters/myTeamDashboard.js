const User = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");
const { getDateRange } = require("../../utils/filterType");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");
const { Op, literal } = require("sequelize");
const Tasks = require("../../models/transactions/taskModel");
const dateController = require("../../utils/dateFilter");
const CallLogs = require("../../models/transactions/callLogsModel");
const Analytics = require("../../models/master/analyticsModel");
const UserActivity = require("../../models/auditLogs/user_activity");
const moment = require("moment-timezone");

const myTeamsDetails = async (req, res) => {
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

  const Int = (val) => Number.parseInt(val ?? 0, 10);

  const formatDuration = (durationSeconds) => {
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    const s = Math.floor(durationSeconds % 60);
    return (
      `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${s ? `${s}s` : ""}`.trim() ||
      "0s"
    );
  };

  const buildDateRangeFromQuery = (type, start_date, end_date) => {
    if (type) {
      const { start, end } = getDateRange(type);
      return { start, end, range: type.toUpperCase() };
    }
    if (start_date && end_date) {
      return { start: start_date, end: end_date, range: null };
    }
    return null;
  };

  try {
    const { userId } = req;
    await Promise.all([
      User.update(
        {
          last_login: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
        },
        { where: { user_id: userId } }
      ),
      UserActivity.create({
        last_login: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
        userId,
        userName: `${req.fname ?? ""} ${req.lname ?? ""}`.trim(),
        userEmail: req.userEmail,
      }),
    ]);

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

    const selectedUserIds = Array.isArray(userIds)
      ? userIds
      : userIds
      ? String(userIds)
          .split(",")
          .map((s) => s.trim())
      : total_performance
      ? String(total_performance)
          .split(",")
          .map((s) => s.trim())
      : [];

    const logsUserIds = logs_userIds
      ? String(logs_userIds)
          .split(",")
          .map((s) => s.trim())
      : [];

    const dateRangeObj = buildDateRangeFromQuery(type, start_date, end_date);
    const dateRange = dateRangeObj
      ? { start: dateRangeObj.start, end: dateRangeObj.end }
      : null;
    const range = dateRangeObj ? dateRangeObj.range : null;

    const user = await User.findOne({
      where: { user_id: userId },
      attributes: ["team_id", "tl_id", "dealer_id", "fname", "lname"],
      raw: true,
    });

    if (!user) {
      return responses.badRequest(res, "Invalid user");
    }

    const groupKey = req.userRole === "TL" ? "tl_id" : "team_id";
    const groupId = req.userRole === "TL" ? user.tl_id : user.team_id;

    const allMembers = await User.findAll({
      where: {
        user_id: { [Op.ne]: userId },
        [groupKey]: groupId,
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
        "team_id",
        "tl_id",
      ],
      raw: true,
    });

    let logs_status = undefined;
    if (logsUserIds.length > 0) {
      const callStats = {};
      for (const m of allMembers) {
        if (logsUserIds.includes(String(m.user_id))) {
          callStats[m.user_id] = {
            name: m.name,
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
        where: whereCondition,
        attributes: ["start_time", "call_type", "call_duration", "sp_id"],
        raw: true,
      });

      for (const log of callLogs) {
        const spId = log.sp_id;
        if (!callStats[spId]) continue;
        const stats = callStats[spId];
        const ct = log.call_type;
        const duration = Number(log.call_duration) || 0;
        if (ct === "outgoing" || ct === "incoming") stats[ct] += 1;
        if (duration > 0) {
          stats.connected += 1;
          stats.duration += duration;
        } else if (ct === "rejected" || ct === "declined") {
          stats.declined += 1;
        }
      }

      logs_status = Object.values(callStats).map((s) => ({
        ...s,
        duration: formatDuration(s.duration),
      }));
    }

    const allUserIds = allMembers.map((u) => u.user_id);
    const analytics = allUserIds.length
      ? await Analytics.findAll({
          where: {
            user_id: { [Op.in]: allUserIds },
            range,
          },
          attributes: ANALYTICS_ATTRIBUTES,
          raw: true,
        })
      : [];

    const getAllPerformance = async (member) => {
      const whereCondition = {
        sp_id: member.user_id,
        deleted: false,
      };
      if (dateRange) {
        whereCondition.created_at = {
          [Op.between]: [dateRange.start, dateRange.end],
        };
      }
      const [enquiries, testDrives] = await Promise.all([
        Leads.count({ where: whereCondition }),
        Events.count({
          where: { ...whereCondition, subject: "Test Drive" },
          distinct: true,
          col: "lead_id",
        }),
      ]);
      return { enquiries, testDrives };
    };

    const performancePromises = allMembers.map(async (member) => {
      const performance = await getAllPerformance(member);
      const memberAnalytics =
        analytics.find((a) => a.user_id === member.user_id) || {};
      return {
        user_id: member.user_id,
        name: member.name,
        [target]: Int(memberAnalytics?.[target]),
        isSelected: selectedUserIds.includes(String(member.user_id)),
        enquiry: Int(performance.enquiries),
        testDrives: Int(performance.testDrives),
        new_orders: Int(memberAnalytics?.new_orders),
        cancellations: Int(memberAnalytics?.cancellations),
        net_orders: Int(memberAnalytics?.net_orders),
        retail: Int(memberAnalytics?.retail),
      };
    });

    const result = await Promise.all(performancePromises);

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
      [target]: Int(member[target]),
      isSelected: member.isSelected,
      enquiries: Int(member.enquiry),
      testDrives: Int(member.testDrives),
      orders: Int(member.new_orders),
      cancellation: Int(member.cancellations),
      net_orders: Int(member.net_orders),
      retail: Int(member.retail),
    }));

    let selectedUserPerformance = null;
    if (user_id) {
      const selWhere = {
        sp_id: user_id,
        deleted: false,
      };
      if (dateRange)
        selWhere.created_at = {
          [Op.between]: [dateRange.start, dateRange.end],
        };

      const selectedUser = allMembers.find(
        (m) => String(m.user_id) === String(user_id)
      );
      const data = await Analytics.findOne({
        where: { user_id, range },
        attributes: ANALYTICS_ATTRIBUTES,
        raw: true,
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
        Leads.count({ where: selWhere }),
        Events.count({
          where: { ...selWhere, subject: "Test Drive" },
          distinct: true,
          col: "lead_id",
        }),
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            [Op.and]: [{ due_date: { [Op.gte]: dateController.todayDate } }],
            subject: {
              [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
            },
            status: { [Op.ne]: "Completed" },
            completed: false,
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
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            subject: {
              [Op.notIn]: [
                "Call",
                "Send Email",
                "Send SMS",
                "Provide Quotation",
              ],
            },
            [Op.and]: [{ due_date: { [Op.gte]: dateController.todayDate } }],
            status: { [Op.ne]: "Completed" },
            completed: false,
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
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            subject: "Test Drive",
            [Op.and]: [
              literal(
                `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
              ),
            ],
            status: { [Op.ne]: "Finished" },
            completed: false,
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
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            [Op.and]: [{ due_date: { [Op.lt]: dateController.todayDate } }],
            subject: {
              [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
            },
            completed: false,
            priority: "High",
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
        Tasks.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: {
              [Op.notIn]: [
                "Call",
                "Send Email",
                "Send SMS",
                "Provide Quotation",
              ],
            },
            [Op.and]: [{ due_date: { [Op.lt]: dateController.todayDate } }],
            completed: false,
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
        Events.findAndCountAll({
          where: {
            sp_id: user_id,
            deleted: false,
            subject: "Test Drive",
            [Op.and]: [
              literal(
                `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
              ),
            ],
            completed: false,
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

      if (selectedUser) {
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
      } else {
        selectedUserPerformance = null;
      }
    }

    if (selectedUserPerformance) {
      return responses.success(res, "User performance fetched successfully", {
        selectedUserPerformance,
      });
    }

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
  } catch (error) {
    logger.error(
      `Failed to fetch team performance for user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

module.exports = { myTeamsDetails };
