const { Op } = require("sequelize");
const responses = require("../../utils/globalResponse");
const { getDateRange } = require("../../utils/filterType");
const Dealers = require("../../models/master/dealerModel");
const Analytics = require("../../models/master/analyticsModel");
const logger = require("../../middlewares/fileLogs/logger");

const Leads = require("../../models/transactions/leadsModel");
const Events = require("../../models/transactions/eventModel");
const TeamMaster = require("../../models/master/teamMasterModel");
const { literal } = require("sequelize");
const User = require("../../models/master/usersModel");

const superAdminHome = async (req, res) => {
  const corporate_id = req.corporate_id;
  if (!corporate_id) {
    logger.warn(`No corporateId found for user ${req.user?.userId}`);
    return responses.notFound(res, "Corporate ID not found");
  }
  const { type, user_id, dealer_id, sm_id } = req.query;
  const { start, end } = getDateRange(type || "MTD");
  const analyticsRange = ["MTD", "QTD", "YTD"].includes(type) ? type : "MTD";

  try {
    //  Fetch all dealers
    const dealers = await Dealers.findAll({
      where: { corporate_id, deleted: false },
      attributes: ["dealer_id", "dealer_name"],
      raw: true,
    });

    const dealerIds = dealers.map((d) => d.dealer_id);

    if (!dealerIds.length) {
      return responses.notFound(res, "No dealers found for this corporate");
    }

    //  Corporate-level KPIs
    const [
      totalLeads,
      totalTestDrives,
      lostLeads,
      totalOrdersObj,
      cancellationsObj,
      netOrdersObj,
      retailObj,
    ] = await Promise.all([
      Leads.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Events.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          subject: "Test Drive",
          created_at: { [Op.between]: [start, end] },
        },
        distinct: true,
        col: "lead_id",
      }),
      Leads.count({
        where: {
          dealer_id: { [Op.in]: dealerIds },
          deleted: false,
          status: "Lost",
          created_at: { [Op.between]: [start, end] },
        },
      }),
      Analytics.findOne({
        attributes: [[literal(`SUM(CAST("new_orders" AS INTEGER))`), "total"]],
        where: { corporate_id, range: analyticsRange },
        raw: true,
      }),
      Analytics.findOne({
        attributes: [
          [literal(`SUM(CAST("cancellations" AS INTEGER))`), "total"],
        ],
        where: { corporate_id, range: analyticsRange },
        raw: true,
      }),

      Analytics.findOne({
        attributes: [[literal(`SUM(CAST("net_orders" AS INTEGER))`), "total"]],
        where: { corporate_id, range: analyticsRange },
        raw: true,
      }),

      Analytics.findOne({
        attributes: [[literal(`SUM(CAST("retail" AS INTEGER))`), "total"]],
        where: { corporate_id, range: analyticsRange },
        raw: true,
      }),
    ]);
    const totalOrders = Number(totalOrdersObj.total || 0);
    const cancellations = Number(cancellationsObj.total || 0);
    const netOrders = Number(netOrdersObj.total || 0);
    const retail = Number(retailObj.total || 0);

    const analytics = await Analytics.findAll({
      where: { corporate_id, range: analyticsRange },
      raw: true,
    });

    const analyticsMap = Object.fromEntries(
      analytics.map((a) => [a.user_id, a])
    );
    const responseData = {
      kpi: {
        totalLeads,
        totalTestDrives,
        totalOrders,
        lostLeads,
        cancellations,
        netOrders,
        retail,
      },
    };

    //  No dealer/user ID → show all dealers
    if (!dealer_id && !user_id) {
      const dealerAnalytics = await Promise.all(
        dealers.map(async (dealer) => {
          const [enquiries, testDrives, lost, analyticsData] =
            await Promise.all([
              Leads.count({
                where: {
                  dealer_id: dealer.dealer_id,
                  deleted: false,
                  created_at: { [Op.between]: [start, end] },
                },
              }),
              Events.count({
                where: {
                  dealer_id: dealer.dealer_id,
                  deleted: false,
                  subject: "Test Drive",
                  created_at: { [Op.between]: [start, end] },
                },
                distinct: true,
                col: "lead_id",
              }),
              Leads.count({
                where: {
                  dealer_id: dealer.dealer_id,
                  deleted: false,
                  status: "Lost",
                  created_at: { [Op.between]: [start, end] },
                },
              }),
              Analytics.findOne({
                attributes: [
                  [literal(`SUM(CAST("new_orders" AS INTEGER))`), "orders"],
                  [
                    literal(`SUM(CAST("cancellations" AS INTEGER))`),
                    "cancellations",
                  ],
                  [literal(`SUM(CAST("net_orders" AS INTEGER))`), "netOrders"],
                  [literal(`SUM(CAST("retail" AS INTEGER))`), "retail"],
                ],
                where: {
                  dealer_id: dealer.dealer_id,
                  corporate_id,
                  range: analyticsRange,
                },
                raw: true,
              }),
            ]);

          return {
            ...dealer,
            enquiries,
            testDrives,
            lostLeads: lost,
            orders: Number(analyticsData?.orders || 0),
            cancellations: Number(analyticsData?.cancellations || 0),
            netOrders: Number(analyticsData?.netOrders || 0),
            retail: Number(analyticsData?.retail || 0),
          };
        })
      );

      responseData.dealers = dealerAnalytics;
    }

    //  Dealer passed → return SMs
    if (dealer_id && !user_id) {
      const smList = await User.findAll({
        where: { dealer_id, user_role: "SM", deleted: false },
        attributes: ["user_id", "fname", "lname", "team_id"],
        raw: true,
      });

      const sms = await Promise.all(
        smList.map(async (sm) => {
          const team = await TeamMaster.findOne({
            where: { team_id: sm.team_id },
            attributes: ["team_name"],
            raw: true,
          });
          const psUsers = await User.findAll({
            where: { team_id: sm.team_id, user_role: "PS", deleted: false },
            attributes: ["user_id"],
            raw: true,
          });

          let smTotals = {
            enquiries: 0,
            testDrives: 0,
            orders: 0,
            cancellations: 0,
            netOrders: 0,
            retail: 0,
          };

          for (const ps of psUsers) {
            const [enquiries, testDrives] = await Promise.all([
              Leads.count({
                where: {
                  sp_id: ps.user_id,
                  deleted: false,
                  created_at: { [Op.between]: [start, end] },
                },
              }),
              Events.count({
                where: {
                  sp_id: ps.user_id,
                  subject: "Test Drive",
                  created_at: { [Op.between]: [start, end] },
                },
                distinct: true,
                col: "lead_id",
              }),
            ]);
            const a = analyticsMap[ps.user_id] || {};
            smTotals.enquiries += enquiries;
            smTotals.testDrives += testDrives;
            smTotals.orders += Number(a.new_orders || 0);
            smTotals.cancellations += Number(a.cancellations || 0);
            smTotals.netOrders += Number(a.net_orders || 0);
            smTotals.retail += Number(a.retail || 0);
          }

          return {
            sm_id: sm.user_id,
            sm_name: `${sm.fname} ${sm.lname}`,
            team_id: sm.team_id,
            team_name: team?.team_name,
            ...smTotals,
          };
        })
      );

      responseData.sms = sms;
    }

    //User ID passed → show PSs if user is SM, or individual if PS
    let selectedUserAnalytics = null;
    // let sms = [];
    let psList = [];

    const selectedId = user_id || sm_id;

    if (selectedId) {
      const selectedUser = await User.findOne({
        where: { user_id: selectedId, deleted: false },
        attributes: ["user_id", "fname", "lname", "user_role", "team_id"],
        raw: true,
      });

      if (selectedUser?.user_role === "PS") {
        const [enquiries, testDrives] = await Promise.all([
          Leads.count({
            where: {
              sp_id: selectedId,
              deleted: false,
              created_at: { [Op.between]: [start, end] },
            },
          }),
          Events.count({
            where: {
              sp_id: selectedId,
              subject: "Test Drive",
              created_at: { [Op.between]: [start, end] },
            },
            distinct: true,
            col: "lead_id",
          }),
        ]);

        const a = analyticsMap[selectedId] || {};
        selectedUserAnalytics = {
          ps_id: selectedId,
          ps_fname: selectedUser.fname,
          ps_lname: selectedUser.lname,
          enquiries,
          testDrives,
          orders: Number(a.new_orders || 0),
          cancellation: Number(a.cancellations || 0),
          net_orders: Number(a.net_orders || 0),
          retail: Number(a.retail || 0),
        };

        responseData.selectedUserAnalytics = selectedUserAnalytics;
      }

      if (selectedUser?.user_role === "SM") {
        const psUsers = await User.findAll({
          where: {
            team_id: selectedUser.team_id,
            user_role: "PS",
            deleted: false,
          },
          attributes: ["user_id", "fname", "lname"],
          raw: true,
        });

        psList = await Promise.all(
          psUsers.map(async (ps) => {
            const [enquiryCount, testDriveCount] = await Promise.all([
              Leads.count({
                where: {
                  sp_id: ps.user_id,
                  deleted: false,
                  created_at: { [Op.between]: [start, end] },
                },
              }),
              Events.count({
                where: {
                  sp_id: ps.user_id,
                  subject: "Test Drive",
                  created_at: { [Op.between]: [start, end] },
                },
                distinct: true,
                col: "lead_id",
              }),
            ]);

            const a = analyticsMap[ps.user_id] || {};

            return {
              ps_id: ps.user_id,
              ps_fname: ps.fname,
              ps_lname: ps.lname,
              enquiries: enquiryCount,
              testDrives: testDriveCount,
              orders: Number(a.new_orders || 0),
              cancellation: Number(a.cancellations || 0),
              net_orders: Number(a.net_orders || 0),
              retail: Number(a.retail || 0),
            };
          })
        );

        responseData.ps = psList;
      }
    }

    return responses.success(res, "Super Admin Dashboard", responseData);
  } catch (error) {
    logger.error(`Error in superAdminHome: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

module.exports = { superAdminHome };
