const { Op } = require("sequelize");
const moment = require("moment");
const Dealers = require("../../models/master/dealerModel");
const superAdmin = require("../../models/master/superAdminModel");
const Analytics = require("../../models/master/analyticsModel");
const logger = require("../../middlewares/fileLogs/logger");
const responses = require("../../utils/globalResponse");
const { getDateRange } = require("../../utils/filterType");
const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");

const calculateChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

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

exports.superAdminDashboard = async (req, res) => {
  try {
    const { type = "MTD" } = req.query;
    const range = type.toUpperCase();
    const { start, end } = getDateRange(range);

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
    const spIds = dealers.map((d) => d.sp_id).filter((id) => id);

    let totalLeads = 0;
    let totalTestDrives = 0;

    const leadsByDealer = [];
    const testDrivesByDealer = [];

    // Loop through each dealer to calculate counts from Leads and Events tables
    for (const dealer of dealers) {
      const [leadCount, tdCount] = await Promise.all([
        Leads.count({
          where: {
            dealer_id: dealer.dealer_id,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
        }),
        Events.count({
          where: {
            dealer_id: dealer.dealer_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
        }),
      ]);

      totalLeads += leadCount;
      totalTestDrives += tdCount;

      leadsByDealer.push({
        ...dealer,
        value: leadCount,
      });

      testDrivesByDealer.push({
        ...dealer,
        value: tdCount,
      });
    }

    // Fetch analytics data for rest (orders, retail, cancellations)
    const analyticsData = await Analytics.findAll({
      where: {
        user_id: { [Op.in]: spIds }, // array of relevant user_ids
        range: "MTD", // or QTD/YTD
      },
      attributes: ["user_id", "retail", "cancellations", "net_orders"],
      raw: true,
    });

    const lastMonth = moment().subtract(1, "month").format("YYYY-MM");
    const previousAnalytics = await Analytics.findAll({
      where: {
        dealer_id: { [Op.in]: dealerIds },
        created_at: { [Op.like]: `${lastMonth}%` },
      },

      raw: true,
    });

    const sumField = (data, key) =>
      data.reduce((acc, curr) => acc + parseFloat(curr[key] || 0), 0);

    const orders = sumField(analyticsData, "new_orders");
    const totalOrders = sumField(analyticsData, "retail");
    const cancellations = sumField(analyticsData, "cancellations");
    const netOrders = totalOrders - cancellations;

    const previousLeads = sumField(previousAnalytics, "enquiry");
    const previousTestDrives = sumField(previousAnalytics, "unique_td");
    const previousOrders = sumField(previousAnalytics, "new_orders");

    const ordersByDealer = analyticsData.reduce((acc, curr) => {
      const dealer = dealers.find((d) => d.dealer_id === curr.dealer_id);
      if (!dealer) return acc;

      const index = acc.findIndex((a) => a.dealer_id === curr.dealer_id);
      if (index >= 0) {
        acc[index].value += parseFloat(curr.retail || 0);
      } else {
        acc.push({
          ...dealer,
          value: parseFloat(curr.retail || 0),
        });
      }
      return acc;
    }, []);

    const finalResponse = {
      leads: totalLeads,
      current: totalLeads,
      previous: previousLeads,
      change: calculateChange(totalLeads, previousLeads),

      testDrives: totalTestDrives,
      currentTestDrives: totalTestDrives,
      previousTestDrives,
      testDriveChange: calculateChange(totalTestDrives, previousTestDrives),

      orders,
      currentOrders: orders,
      previousOrders,
      orderChange: calculateChange(orders, previousOrders),

      totalTestDrives,
      totalOrders,
      cancellations: Math.round(cancellations),
      netOrders: Math.round(netOrders),

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
