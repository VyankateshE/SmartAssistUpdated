const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");
const responses = require("../../utils/globalResponse");
const { getDateRange } = require("../../utils/filterType");
const { Op } = require("sequelize");
const logger = require("../../middlewares/fileLogs/logger");
const Users = require("../../models/master/usersModel");
const Dealers = require("../../models/master/dealerModel");
const Analytics = require("../../models/master/analyticsModel");

const dealerAnalysisDashboard = async (req, res) => {
  try {
    const { userIds, type } = req.query;
    const dealerId = req.dealerId;

    const allUsers = await Users.findAndCountAll({
      attributes: ["name", "dealer_id", "user_id"],
      where: {
        dealer_id: dealerId,
        deleted: false,
        user_role: {
          [Op.ne]: "CEO",
        },
      },
    });

    const dealer = await Dealers.findAll({
      attributes: ["dealer_id"],
      deleted: false,
    });
    const dealerID = dealer.map((d) => d.dealer_id);
    const selectedUser = userIds ? userIds.split(",") : [];

    const { start, end } = getDateRange(type);

    //  Enquiries and Test Drives
    const [enquiriesCount, testDrivesCount] = await Promise.all([
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
    ]);

    // remaining metrics from Analytics table
    const analytics = await Analytics.findAll({
      where: {
        dealer_id: dealerId,
        range: type,
      },
      attributes: ["new_orders", "cancellations", "retail", "net_orders"],
      raw: true,
    });

    const Int = (val) => Number.parseInt(val ?? 0);
    const metrics = analytics.reduce(
      (acc, curr) => {
        acc.new_orders += Int(curr.new_orders);
        acc.cancellations += Int(curr.cancellations);
        acc.retail += Int(curr.retail);
        acc.net_orders += Int(curr.net_orders);
        return acc;
      },
      {
        new_orders: 0,
        cancellations: 0,
        retail: 0,
        net_orders: 0,
      }
    );

    // User performance from Analytics table
    const getPerformanceStats = async (spId) => {
      //Enquiries and Test Drives from Leads and Events
      const user = await Users.findOne({
        attributes: ["name"],
        where: {
          user_id: spId,
          deleted: false,
        },
      });
      const [enquiries, testDrives] = await Promise.all([
        Leads.count({
          where: {
            sp_id: spId,
            dealer_id: dealerId,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
        }),
        Events.count({
          where: {
            sp_id: spId,
            dealer_id: dealerId,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
        }),
      ]);

      // Remaining metrics from Analytics
      const analytics = await Analytics.findOne({
        where: {
          user_id: spId,
          dealer_id: dealerId,
          range: type,
        },
        attributes: [
          "user_name",
          "user_id",
          "new_orders",
          "cancellations",
          "net_orders",
          "retail",
        ],
        raw: true,
      });

      const Int = (val) => Number.parseInt(val ?? 0);

      return {
        name: analytics?.user_name || `${user.name}`,
        user_id: analytics?.user_id || spId,
        enquiries,
        testDrives,
        newOrders: Int(analytics?.new_orders),
        cancellations: Int(analytics?.cancellations),
        netOrders: Int(analytics?.net_orders),
        retail: Int(analytics?.retail),
      };
    };

    const performance = await Promise.all(
      selectedUser.map(getPerformanceStats)
    );

    //  getRank function with proper ranking (tie support + 0 count users get last rank)
    const getRank = (data, dealerId) => {
      const entries = Object.entries(data).map(([id, count]) => ({
        id,
        count: parseInt(count || 0),
      }));

      // Add missing dealers with 0 count
      if (!entries.find((e) => String(e.id) === String(dealerId))) {
        entries.push({ id: dealerId, count: 0 });
      }

      entries.sort((a, b) => b.count - a.count);

      let rank = 1;
      let actualRank = 1;
      let prevCount = null;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        if (entry.count !== prevCount) {
          actualRank = rank;
        }

        if (String(entry.id) === String(dealerId)) {
          return actualRank;
        }

        prevCount = entry.count;
        rank++;
      }

      return entries.length;
    };

    const getAllIndiaAnalysis = async (start, end, dealer_id) => {
      // Get enquiries and test drives from DB (grouped by dealer)
      const [Enquiries, TestDrives] = await Promise.all([
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
      ]);

      //  Rest from Analytics
      const allAnalytics = await Analytics.findAll({
        where: {
          dealer_id: dealerID,
          range: type,
        },
        attributes: [
          "dealer_id",
          "new_orders",
          "cancellations",
          "net_orders",
          "retail",
        ],
        raw: true,
      });

      const getMaxCount = (data) =>
        Object.values(data).reduce((max, val) => (val > max ? val : max), 0);

      const countFormatFromArray = (arr) => {
        return arr.reduce((acc, row) => {
          acc[row.dealer_id] = parseInt(row.count || 0);
          return acc;
        }, {});
      };

      const countFormatFromAnalytics = (metric) => {
        return allAnalytics.reduce((acc, row) => {
          const dealer = row.dealer_id;
          const value = parseInt(row[metric] || 0);
          acc[dealer] = (acc[dealer] || 0) + value;
          return acc;
        }, {});
      };

      //  all KPI maps
      const enquiries = countFormatFromArray(Enquiries);
      const testDrives = countFormatFromArray(TestDrives);
      const newOrders = countFormatFromAnalytics("new_orders");
      const cancellations = countFormatFromAnalytics("cancellations");
      const netOrders = countFormatFromAnalytics("net_orders");
      const retail = countFormatFromAnalytics("retail");

      if (dealer_id) {
        return {
          enquiriesRank: getRank(enquiries, dealer_id),
          testDrivesRank: getRank(testDrives, dealer_id),
          newOrdersRank: getRank(newOrders, dealer_id),
          cancellationsRank: getRank(cancellations, dealer_id),
          netOrdersRank: getRank(netOrders, dealer_id),
          retailRank: getRank(retail, dealer_id),
        };
      } else {
        return {
          enquiriesCount: getMaxCount(enquiries),
          testDrivesCount: getMaxCount(testDrives),
          newOrdersCount: getMaxCount(newOrders),
          cancellationsCount: getMaxCount(cancellations),
          netOrdersCount: getMaxCount(netOrders),
          retailCount: getMaxCount(retail),
        };
      }
    };

    const [allIndiaBestPerformace, allIndiaRank] = await Promise.all([
      getAllIndiaAnalysis(start, end),
      getAllIndiaAnalysis(start, end, dealerId),
    ]);

    return responses.success(res, "Analysis dashboard data", {
      enquiries: enquiriesCount,
      testDrives: testDrivesCount,
      newOrders: metrics.new_orders,
      cancellations: metrics.cancellations,
      netOrders: metrics.net_orders,
      retail: metrics.retail,

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

module.exports = { dealerAnalysisDashboard };
