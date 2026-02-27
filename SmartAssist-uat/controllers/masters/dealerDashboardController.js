const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");
const responses = require("../../utils/globalResponse");
const { getDateRange } = require("../../utils/filterType");
const { Op } = require("sequelize");
const dateController = require("../../utils/dateFilter");
const logger = require("../../middlewares/fileLogs/logger");
const Users = require("../../models/master/usersModel");
const Dealers = require("../../models/master/dealerModel");
const CallLogs = require("../../models/transactions/callLogsModel");

const dealerHome = async (req, res) => {
  try {
    const { user_id } = req.query;
    const dealerId = req.dealerId;
    const user = await Users.findAll({
      attributes: ["user_id", "name", "fname", "lname"],
      where: {
        dealer_id: dealerId,
        deleted: false,
      },
    });
    // tableTestDrives_today
    const data = await Promise.all([
      Events.findAll({
        attributes: [
          "subject",
          "start_date",
          "start_time",
          "end_time",
          "assigned_to",
          "VIN",
          "PMI",
        ],
        where: {
          dealer_id: dealerId,
          deleted: false,
          subject: "Test Drive",
          start_date: dateController.todayDate,
        },
        order: [["start_date", "ASC"]],
      }),

      //tableTestDrives_oneweek
      Events.findAll({
        attributes: [
          "subject",
          "start_date",
          "start_time",
          "end_time",
          "assigned_to",
          "VIN",
          "PMI",
        ],
        where: {
          dealer_id: dealerId,
          deleted: false,
          subject: "Test Drive",
          start_date: {
            [Op.gt]: dateController.todayDate, // tomorrow onward
            [Op.lte]: dateController.oneWeekLaterDate,
          },
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["start_date", "ASC"]],
      }),
    ]);

    let selectedUser = null;
    if (user_id) {
      const [todayTestDrives, upcomingTestDrives, overdueTestDrives] =
        await Promise.all([
          // Today test drives
          Events.findAll({
            attributes: ["name", "subject", "PMI"],
            where: {
              dealer_id: dealerId,
              sp_id: user_id,
              deleted: false,
              subject: "Test Drive",
              start_date: dateController.todayDate,
              [Op.or]: [{ favourite: true }, { favourite: null }],
            },
            order: [["start_date", "ASC"]],
          }),

          // Upcoming test drives
          Events.findAll({
            attributes: ["name", "subject", "PMI"],
            where: {
              dealer_id: dealerId,
              sp_id: user_id,
              deleted: false,
              subject: "Test Drive",
              start_date: {
                [Op.gt]: dateController.todayDate,
                [Op.lte]: dateController.oneWeekLaterDate,
              },
              status: { [Op.ne]: "Finished" },

              [Op.or]: [{ favourite: true }, { favourite: null }],
            },
            order: [["start_date", "ASC"]],
          }),

          //Overdue test drives
          Events.findAll({
            attributes: ["name", "subject", "PMI"],
            where: {
              dealer_id: dealerId,
              sp_id: user_id,
              deleted: false,
              subject: "Test Drive",
              start_date: {
                [Op.gte]: dateController.oneWeekBeforeDate,
                [Op.lt]: dateController.todayDate,
              },
              status: { [Op.ne]: "Finished" },
              [Op.or]: [{ favourite: true }, { favourite: null }],
            },
            order: [["start_date", "DESC"]],
          }),
        ]);

      selectedUser = {
        todayTestDrives,
        upcomingTestDrives,
        overdueTestDrives,
      };
    }

    logger.info(`Dealer ${dealerId} dashboard counts fetched.`);

    return responses.success(
      res,
      `Dashboard counts fetched successfully ${process.env.ST201}`,
      {
        tableTestDrives_today: data[0],
        tableTestDrives_oneweek: data[1],
        selectedUser,
        user,
      }
    );
  } catch (error) {
    console.error("Error in dealerDashboard:", error);
    logger.error(
      `Dealer ${req.dealerId} dashboard fetch failed: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const analysisDashboard = async (req, res) => {
  try {
    const { userIds, type } = req.query;
    const dealerId = req.dealerId;

    const allUsers = await Users.findAll({
      attributes: ["name", "dealer_id", "user_id"],
      where: { dealer_id: dealerId, user_id: { [Op.notIn]: [req.userId] } },
      deleted: false,
    });
    const dealer = await Dealers.findAll({
      attributes: ["dealer_id"],
      deleted: false,
    });
    const dealerID = dealer.map((d) => d.dealer_id);
    const selectedUser = userIds ? userIds.split(",") : [];

    const { start, end } = getDateRange(type);
    const data = await Promise.all([
      Leads.count({
        where: {
          dealer_id: dealerId,
          status: { [Op.ne]: "Lost" },
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Events.count({
        where: {
          dealer_id: dealerId,
          subject: "Test Drive",
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Leads.count({
        where: {
          dealer_id: dealerId,

          opp_status: "Take Order",

          deleted: false,
          converted: true,
          converted_at: { [Op.ne]: null },
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Leads.count({
        where: {
          dealer_id: dealerId,

          opp_status: "Lost",

          deleted: false,
          converted: true,
          converted_at: { [Op.ne]: null },
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Leads.count({
        where: {
          dealer_id: dealerId,
          converted_to_retail: true,
          converted: true,
          converted_at: { [Op.ne]: null },
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
      }),
    ]);

    const getPerformanceStats = async (spId) => {
      const whereCondition = {
        sp_id: spId,
        dealer_id: dealerId,
        deleted: false,
        created_at: { [Op.between]: [start, end] },
      };

      const [enquiries, testDrives, newOrders, cancellations, retail] =
        await Promise.all([
          Leads.count({
            where: { ...whereCondition, status: { [Op.ne]: "Lost" } },
          }),
          Events.count({ where: { ...whereCondition, subject: "Test Drive" } }),
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
              opp_status: "Lost",
              converted: true,
              converted_at: { [Op.ne]: null },
            },
          }),
          Leads.count({
            where: {
              ...whereCondition,
              converted: true,
              converted_to_retail: true,
              converted_at: { [Op.ne]: null },
            },
          }),
        ]);

      return {
        enquiries,
        testDrives,
        newOrders,
        cancellations,
        netOrders: newOrders - cancellations,
        retail,
      };
    };

    const performance = await Promise.all(
      selectedUser.map(getPerformanceStats)
    );

    const getCount = (arr) => {
      return arr.reduce((acc, { dealer_id, count }) => {
        acc[dealer_id] = parseInt(count);
        return acc;
      }, {});
    };
    const getRank = (data, dealerId) =>
      Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([dealer_id]) => String(dealer_id))
        .indexOf(String(dealerId)) + 1;

    //  All India Summary & Ranking
    const getAllIndiaAnalysis = async (start, end, dealer_id) => {
      const [enquiries, testDrives, newOrders, cancellations, retails] =
        await Promise.all([
          Leads.count({
            attributes: ["dealer_id"],
            where: {
              deleted: false,
              dealer_id: dealerID,
              status: { [Op.ne]: "Lost" },
              created_at: { [Op.between]: [start, end] },
            },
            group: ["dealer_id"],
          }),
          Events.count({
            attributes: ["dealer_id"],
            where: {
              deleted: false,
              dealer_id: dealerID,
              subject: "Test Drive",
              created_at: { [Op.between]: [start, end] },
            },
            group: ["dealer_id"],
          }),
          Leads.count({
            attributes: ["dealer_id"],
            where: {
              deleted: false,
              dealer_id: dealerID,
              opp_status: "Take Order",
              converted: true,
              converted_at: { [Op.ne]: null },
              created_at: { [Op.between]: [start, end] },
            },
            group: ["dealer_id"],
          }),
          Leads.count({
            attributes: ["dealer_id"],
            where: {
              deleted: false,
              dealer_id: dealerID,
              opp_status: "Lost",
              converted: true,
              converted_at: { [Op.ne]: null },
              created_at: { [Op.between]: [start, end] },
            },
            group: ["dealer_id"],
          }),
          Leads.count({
            attributes: ["dealer_id"],
            where: {
              deleted: false,
              dealer_id: dealerID,
              converted: true,
              converted_to_retail: true,
              converted_at: { [Op.ne]: null },
              created_at: { [Op.between]: [start, end] },
            },
            group: ["dealer_id"],
          }),
        ]);

      const getMaxCount = (data) =>
        data.reduce(
          (maxValue, curr) => (curr.count > maxValue ? curr.count : maxValue),
          0
        );
      if (dealer_id) {
        return {
          enquiriesRank: getRank(getCount(enquiries), dealer_id),
          testDrivesRank: getRank(getCount(testDrives), dealer_id),
          newOrdersRank: getRank(getCount(newOrders), dealer_id),
          cancellationsRank: getRank(getCount(cancellations), dealer_id),
          retailRank: getRank(getCount(retails), dealer_id),
        };
      } else {
        return {
          enquiriesCount: getMaxCount(enquiries),
          testDrivesCount: getMaxCount(testDrives),
          newOrdersCount: getMaxCount(newOrders),
          cancellationsCount: getMaxCount(cancellations),
          retailCount: getMaxCount(retails),
        };
      }
    };

    const [allIndiaBestPerformace, allIndiaRank] = await Promise.all([
      getAllIndiaAnalysis(start, end),
      getAllIndiaAnalysis(start, end, dealerId),
    ]);

    return responses.success(res, "Analysis dashboard data", {
      enquiries: data[0],
      testDrives: data[1],
      newOrders: data[2],
      cancellations: data[3],
      netOrders: data[2] - data[3],
      retail: data[4],

      performance,
      allIndiaBestPerformace,

      allIndiaRank,
      users: allUsers,
    });
  } catch (error) {
    console.error("Error in analysisDashboard:", error);
    logger.error(`
      Error in analysisDashboard for dealer ${req.dealerId} at ${req.originalUrl}: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

const getCallAnalytics = async (req, res) => {
  try {
    const { dealerId } = req;
    const { type } = req.query;
    const { start, end } = getDateRange(type);
    const dealer = await Dealers.findByPk(dealerId, {
      attributes: ["dealer_id", "corporate_id"],
    });

    const members = await Users.findAll({
      where: {
        dealer_id: dealerId,
        corporate_id: dealer.corporate_id,
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

module.exports = {
  dealerHome,
  analysisDashboard,
  getCallAnalytics,
};
