const { Op } = require("sequelize");
const moment = require("moment");
const Dealers = require("../../models/master/dealerModel");
const SuperAdmin = require("../../models/master/superAdminModel");
const Analytics = require("../../models/master/analyticsModel");
const logger = require("../../middlewares/fileLogs/logger");
const responses = require("../../utils/globalResponse");

// Helper to calculate % change
const calculateChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

// Rank dealers based on value
const rankDealers = (data) => {
  let prevValue = null;
  let rank = 1;

  return data
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((dealer, index) => {
      if (dealer.value !== prevValue) {
        rank = index + 1;
        prevValue = dealer.value;
      }
      return { ...dealer, rank };
    });
};

// Group data by dealer_id and sum values
const groupByDealer = (analyticsData, dealers, fieldName) => {
  const map = {};

  for (const item of analyticsData) {
    const dealerId = item.dealer_id;
    if (!dealerId || !item[fieldName]) continue;

    if (!map[dealerId]) map[dealerId] = 0;
    map[dealerId] += parseFloat(item[fieldName] || 0);
  }

  return Object.entries(map).map(([dealerId, value]) => {
    const dealer = dealers.find((d) => d.dealer_id === dealerId);
    return {
      dealer_id: dealerId,
      dealer_name: dealer?.dealer_name || "Unknown",
      dealer_code: dealer?.dealer_code || "N/A",
      location: dealer?.location || "N/A",
      mobile: dealer?.mobile || "N/A",
      phone: dealer?.phone || "N/A",
      value,
    };
  });
};

exports.superAdminDashboard = async (req, res) => {
  try {
    const { type = "MTD" } = req.query;
    const range = type.toUpperCase();

    const superAdmin = await SuperAdmin.findOne({
      where: { corporate_id: req.userId },
      attributes: ["corporate_id"],
      raw: true,
    });

    if (!superAdmin?.corporate_id) {
      logger.warn(`No corporateId found for user ${req.userId}`);
      return responses.notFound(res, "Corporate ID not found");
    }

    const dealers = await Dealers.findAll({
      where: {
        corporate_id: superAdmin.corporate_id,
        deleted: false,
      },
      attributes: [
        "dealer_id",
        "dealer_name",
        "dealer_code",
        "location",
        "mobile",
        "phone",
      ],
      raw: true,
    });

    const dealerIds = dealers.map((d) => d.dealer_id);

    // Fetch current Analytics
    const analyticsData = await Analytics.findAll({
      where: {
        dealer_id: { [Op.in]: dealerIds },
        range,
      },
      raw: true,
    });

    // Last Month Analytics (if available via created_at filtering)
    const lastMonth = moment().subtract(1, "month").format("YYYY-MM");
    const lastMonthAnalytics = await Analytics.findAll({
      where: {
        dealer_id: { [Op.in]: dealerIds },
        created_at: { [Op.like]: `${lastMonth}%` },
      },
      raw: true,
    });

    // Sum helper
    const sumField = (data, key) =>
      data.reduce((acc, curr) => acc + parseFloat(curr[key] || 0), 0);

    // Final counts
    const leads = sumField(analyticsData, "enquiry");
    const testDrives = sumField(analyticsData, "testDrives");
    const orders = sumField(analyticsData, "new_orders");

    const previous = sumField(lastMonthAnalytics, "enquiry");
    const previousTestDrives = sumField(lastMonthAnalytics, "testDrives");
    const previousOrders = sumField(lastMonthAnalytics, "new_orders");

    const totalTestDrives = sumField(analyticsData, "unique_td");
    const totalOrders = sumField(analyticsData, "new_orders");

    // Rankings
    const leadsByDealer = groupByDealer(analyticsData, dealers, "enquiry");
    const testDrivesByDealer = groupByDealer(
      analyticsData,
      dealers,
      "unique_td"
    );
    const ordersByDealer = groupByDealer(analyticsData, dealers, "new_orders");

    const finalResponse = {
      leads,
      current: leads,
      previous,
      change: calculateChange(leads, previous),

      testDrives,
      currentTestDrives: testDrives,
      previousTestDrives,
      testDriveChange: calculateChange(testDrives, previousTestDrives),

      orders,
      currentOrders: orders,
      previousOrders,
      orderChange: calculateChange(orders, previousOrders),

      totalTestDrives,
      totalOrders,

      rankings: {
        leads: rankDealers(leadsByDealer),
        testDrives: rankDealers(testDrivesByDealer),
        orders: rankDealers(ordersByDealer),
      },
    };

    return responses.success(
      res,
      "Dashboard Data fetched successfully",
      finalResponse
    );
  } catch (error) {
    logger.error(
      `Error fetching dashboard data for super admin ${req.userId}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};
