require("dotenv").config();
const { Op, literal } = require("sequelize");
const Tasks = require("../models/transactions/taskModel");
const Events = require("../models/transactions/eventModel");
const Notifications = require("../models/master/notificationModel");
const dateController = require("../utils/dateFilter");
const logger = require("../middlewares/fileLogs/logger");
const responses = require("../utils/globalResponse");
const Leads = require("../models/transactions/leadsModel");
const { getDateRange } = require("../utils/filterType");
// const moment = require("moment-timezone");
const User = require("../models/master/usersModel");
const Analytics = require("../models/master/analyticsModel");
const Targets = require("../models/master/targetMasterModel");

const dashboardData = async (req, res) => {
  try {
    const { userId } = req.query;
    const data = await Promise.all([
      // Upcoming follow-ups
      Tasks.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["due_date", "ASC"]],
        limit: 3,
      }),

      // Upcoming appointments
      Tasks.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          [Op.and]: [
            literal(
              `due_date > '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time > '${dateController.now}')`
            ),
          ],
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["due_date", "ASC"]],
        limit: 3,
      }),

      // Upcoming test drives
      Events.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
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
        order: [["start_date", "ASC"]],
        limit: 3,
      }),

      // Overdue follow-ups
      Tasks.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
          [Op.and]: [
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
          ],
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          completed: false,
          priority: "High",
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["due_date", "DESC"]],
        limit: 3,
      }),

      // Overdue appointments
      Tasks.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          [Op.and]: [
            literal(
              `due_date < '${dateController.todayDate}' OR (due_date = '${dateController.todayDate}' AND time < '${dateController.now}')`
            ),
          ],
          completed: false,
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["due_date", "DESC"]],
        limit: 3,
      }),

      // Overdue test drives
      Events.findAndCountAll({
        where: {
          sp_id: userId,
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
        limit: 3,
      }),
      //unread counts
      Notifications.count({ where: { user_id: req.userId, read: false } }),
      User.findByPk(userId, {
        attributes: ["fname", "lname", "initials", "profile_pic"],
      }),
    ]);

    const greetings = `${dateController.greet(req.fname, req.lname)}`;
    responses.success(res, "Dashboard Data fetched successfully", {
      upcomingFollowups: data[0].rows,
      upcomingAppointments: data[1].rows,
      upcomingTestDrives: data[2].rows,
      overdueFollowups: data[3].rows,
      overdueAppointments: data[4].rows,
      overdueTestDrives: data[5].rows,
      userData: data[7],
      // Counts
      upcomingFollowupsCount: data[0].count,
      upcomingAppointmentsCount: data[1].count,
      upcomingTestDrivesCount: data[2].count,
      overdueFollowupsCount: data[3].count,
      overdueAppointmentsCount: data[4].count,
      overdueTestDrivesCount: data[5].count,
      notifications: data[6],
      greetings,
    });
  } catch (error) {
    logger.error(
      `Error fetching dashboard data by user ${req.userId}: ${error.message}`
    );
    console.error(
      `Error fetching dashboard data by user ${req.userId}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const analyticsReports = async (req, res) => {
  try {
    const { userId, type } = req.query;
    const { start, end } = getDateRange(type);

    const allUsers = await User.findAll({
      attributes: ["user_id", "dealer_id"],
    });
    // const userID = allUsers.map((user) => user.user_id);

    let performance;

    const fetchData = async (start, end) => {
      const [
        enquiries,
        lostEnquiries,
        digitalLostEnquiries,
        digitalEnquiries,
        testDrives,
        allTestDrives,
        analyticsData,
      ] = await Promise.all([
        // Enquiries
        Leads.findAll({
          attributes: ["lead_id", "lost_created_at"],
          where: {
            sp_id: userId,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        // Lost Enquiries
        Leads.findAll({
          attributes: ["lead_id", "lost_created_at"],
          where: {
            sp_id: userId,
            status: "Lost",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        // Digital Lost Enquiries
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            status: "Lost",
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [start, end] },
          },
        }),
        // Digital Enquiries
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [start, end] },
          },
        }),
        //Test Drives
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          group: ["lead_id"],
          raw: true,
        }),
        //Test Drives all
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
        }),
        Analytics.findOne({
          where: {
            user_id: userId,
            range: type.toUpperCase(),
          },
        }),
      ]);

      const newEnquiries = enquiries.length;
      const uniqueTestDrives = testDrives.length;

      //enquery bank
      const enqBank = await Leads.findAll({
        attributes: ["lead_id"],
        where: {
          status: { [Op.notIn]: ["Qualified", "Lost"] },
          sp_id: userId,
          deleted: false,
        },
      });

      const enquiryBank = enqBank.length;

      const orders = Number(analyticsData?.new_orders) || 0;
      const net_orders = Number(analyticsData?.net_orders) || 0;
      const retail = Number(analyticsData?.retail) || 0;
      const cancellations = Number(analyticsData?.cancellations) || 0;
      const td_to_retail = Number(analyticsData?.td_to_retail) || 0;
      const utd_to_retail = Number(analyticsData?.utd_to_retail) || 0;

      const cancellation_contribution =
        Number(analyticsData?.cancellation_contribution) || 0;

      const dealerId = (
        await User.findOne({
          attributes: ["dealer_id"],
          where: { user_id: userId },
        })
      )?.dealer_id;

      const targetData = await Targets.findOne({
        attributes: ["enquiries", "testDrives", "orders"],
        where: { dealer_id: dealerId, user_id: userId },
      });

      const enquiryTarget = targetData?.enquiries || 0;
      const testDriveTarget = targetData?.testDrives || 0;
      const orderTarget = targetData?.orders || 0;
      const enquiriesToAchieveTarget = Math.max(
        enquiryTarget - newEnquiries,
        0
      );
      const remainingTestDrives = Math.max(
        testDriveTarget - uniqueTestDrives,
        0
      );

      let followupsPerLostEnquiry = 0;
      for (let lead of lostEnquiries) {
        const followUps = await Tasks.count({
          where: {
            lead_id: lead.lead_id,
            sp_id: userId,
            deleted: false,
            created_at: {
              [Op.gt]: lead.lost_created_at,
            },
          },
        });

        followupsPerLostEnquiry += followUps;
      }
      followupsPerLostEnquiry = lostEnquiries.length
        ? followupsPerLostEnquiry / lostEnquiries.length
        : 0;

      let followupsPerLostDigitalEnquiry = 0;
      for (let lead of digitalLostEnquiries) {
        const followUps = await Tasks.count({
          where: {
            lead_id: lead.lead_id,
            sp_id: userId,
            deleted: false,
            created_at: {
              [Op.gt]: lead.lost_created_at,
            },
          },
        });
        followupsPerLostDigitalEnquiry += followUps;
      }
      followupsPerLostDigitalEnquiry = digitalLostEnquiries.length
        ? followupsPerLostDigitalEnquiry / digitalLostEnquiries.length
        : 0;

      const avgEnquiry = Number(analyticsData?.avg_enq_to_ord_days) || 0;
      const TestDrivesAvg = Number(analyticsData?.avg_td_to_ord_days) || 0;
      const enquiryToUniqueTestdriveRatio = newEnquiries
        ? Number(((uniqueTestDrives / newEnquiries) * 100).toFixed(2))
        : 0;

      const testDriveRatio = newEnquiries
        ? Number(((allTestDrives.length / newEnquiries) * 100).toFixed(2))
        : 0;

      const digitalEnquiryToOrderRatio =
        digitalEnquiries.length > 0
          ? Number((orders / digitalEnquiries.length).toFixed(2))
          : 0;

      performance = {
        enquiry: newEnquiries,
        lostEnq: lostEnquiries.length,
        testDriveData: testDrives.length,
        dealerCancellation: cancellations,
        orders: orders,
        retail: retail,
        net_orders,
      };

      return {
        newEnquiries,
        lostEnquiries: lostEnquiries.length,
        enquiriesToAchieveTarget,
        followupsPerLostEnquiry,
        avgEnquiry,
        enquiryBank,
        followupsPerLostDigitalEnquiry,

        uniqueTestDrives,
        remainingTestDrives,
        TestDrivesAvg,
        enquiryToUniqueTestdriveRatio,
        testDriveRatio,

        orders,
        orderTarget,
        contributionToDealershipmsg: cancellation_contribution,
        TestDriveToRetail: td_to_retail,
        UTestDriveToRetail: utd_to_retail,

        digitalEnquiryToOrderRatio,
      };
    };

    const getRank = (countsMap, userId) => {
      const userIdStr = String(userId);

      //  If the user is NOT present at all
      if (!(userIdStr in countsMap)) return 0;

      const entries = Object.entries(countsMap)
        .map(([id, value]) => ({ id, value }))
        .sort((a, b) => b.value - a.value);

      let rank = 1;
      let prevValue = null;
      let ranks = {};
      let actualRank = 1;

      for (let i = 0; i < entries.length; i++) {
        const { id, value } = entries[i];

        if (value !== prevValue) {
          rank = actualRank;
        }

        ranks[id] = rank;
        prevValue = value;
        actualRank++;
      }

      return ranks[userIdStr];
    };

    const fetchDealerRank = async (start, end, user_id) => {
      const user = await User.findOne({
        attributes: ["dealer_id"],
        where: { user_id },
        raw: true,
      });

      const dealer_id = user.dealer_id;

      // Get all users from this dealer
      const dealerUsers = allUsers
        .filter((u) => u.dealer_id === dealer_id)
        .map((u) => String(u.user_id));

      // DB-based counts
      const [enquiries, lostEnquiries, testDrives] = await Promise.all([
        Leads.findAll({
          attributes: ["sp_id"],
          where: {
            dealer_id,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
            sp_id: { [Op.in]: dealerUsers },
          },
          // group: ["sp_id"],
          raw: true,
        }),

        //lost enqueries
        Leads.findAll({
          attributes: ["lead_id", "sp_id"],
          where: {
            status: "Lost",
            dealer_id: dealer_id,
            deleted: false,
            created_at: { [Op.between]: [start, end] },
            sp_id: userId || { [Op.in]: dealerUsers },
          },
          raw: true,
        }),

        Events.findAll({
          attributes: ["sp_id"],
          where: {
            dealer_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
            sp_id: { [Op.in]: dealerUsers },
          },
          // group: ["sp_id"],
          raw: true,
        }),
      ]);

      // Count leads per sp_id manually
      const enquiryCountMap = {};
      dealerUsers.forEach((id) => (enquiryCountMap[id] = 0));
      for (const lead of enquiries) {
        const id = String(lead.sp_id);
        enquiryCountMap[id] = (enquiryCountMap[id] || 0) + 1;
      }
      // count lost leads
      const lostEnquiryCountMap = {};
      dealerUsers.forEach((id) => (lostEnquiryCountMap[id] = 0));
      for (const lead of lostEnquiries) {
        const id = String(lead.sp_id);
        lostEnquiryCountMap[id] = (lostEnquiryCountMap[id] || 0) + 1;
      }
      // Count test drives per sp_id manually
      const testDriveCountMap = {};
      dealerUsers.forEach((id) => (testDriveCountMap[id] = 0));
      for (const event of testDrives) {
        const id = String(event.sp_id);
        testDriveCountMap[id] = (testDriveCountMap[id] || 0) + 1;
      }

      const analytics = await Analytics.findAll({
        attributes: [
          "user_id",
          "new_orders",
          "net_orders",
          "cancellations",
          "retail",
          "range",
        ],
        where: {
          range: type.toUpperCase(),
          user_id: { [Op.in]: dealerUsers },
          dealer_id: dealer_id,
        },
        raw: true,
      });

      const getCountFromAnalytics = (field) => {
        const map = {};
        for (const uid of dealerUsers) {
          const entry = analytics.find((a) => String(a.user_id) === uid);
          if (!entry) continue; // skip if user not present in analytics
          const val = parseInt(entry?.[field], 10);
          map[uid] = isNaN(val) ? 0 : val;
        }
        return map;
      };

      // Proper rank calculation for leads and testDrives using DB
      const safeGetRank = (map, userId) =>
        Object.prototype.hasOwnProperty.call(map, userId)
          ? getRank(map, userId)
          : 0;

      const newOrdersMap = getCountFromAnalytics("new_orders");
      const netOrdersMap = getCountFromAnalytics("net_orders");
      const cancellationsMap = getCountFromAnalytics("cancellations");
      const retailMap = getCountFromAnalytics("retail");
      //const lostEnquiriesMap = getCountFromAnalytics("lost_enquiries");

      return {
        enquiriesRank: safeGetRank(enquiryCountMap, user_id),
        testDrivesRank: safeGetRank(testDriveCountMap, user_id),
        newOrdersRank: safeGetRank(newOrdersMap, user_id),
        netOrdersRank: safeGetRank(netOrdersMap, user_id),
        cancellationsRank: safeGetRank(cancellationsMap, user_id),
        retailRank: safeGetRank(retailMap, user_id),
        lostEnquiriesRank: safeGetRank(lostEnquiryCountMap, user_id),
      };
    };

    const fetchAllIndiaRank = async (start, end, user_id) => {
      const analytics = await Analytics.findAll({
        attributes: [
          "user_id",
          "new_orders",
          "net_orders",
          "cancellations",
          "retail",
          "range",
        ],
        where: {
          range: type.toUpperCase(),
        },
        raw: true,
      });

      // const allUsersInAnalytics = analytics.map((a) => String(a.user_id));

      const [enquiries, lostEnquiries, testDrives] = await Promise.all([
        Leads.findAll({
          attributes: ["sp_id"],
          where: {
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["sp_id"],
          where: {
            status: "Lost",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        Events.findAll({
          attributes: ["sp_id"],
          where: {
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
      ]);

      const countPerSpId = (items) => {
        const map = {};
        for (const item of items) {
          const id = String(item.sp_id);
          if (!id) continue;
          map[id] = (map[id] || 0) + 1;
        }
        return map;
      };

      const getCountFromAnalytics = (field) => {
        const map = {};
        for (const a of analytics) {
          const val = parseInt(a[field]);
          if (!isNaN(val)) map[a.user_id] = val;
        }
        return map;
      };

      const getMaxFromAnalytics = (field) =>
        Math.max(...analytics.map((a) => parseInt(a[field] || 0)));

      if (user_id) {
        return {
          enquiriesRank: getRank(countPerSpId(enquiries), user_id),
          lostEnquiriesRank: getRank(countPerSpId(lostEnquiries), user_id),
          testDrivesRank: getRank(countPerSpId(testDrives), user_id),
          newOrdersRank: getRank(getCountFromAnalytics("new_orders"), user_id),
          netOrdersRank: getRank(getCountFromAnalytics("net_orders"), user_id),
          cancellationsRank: getRank(
            getCountFromAnalytics("cancellations"),
            user_id
          ),
          retailRank: getRank(getCountFromAnalytics("retail"), user_id),
        };
      } else {
        return {
          enquiriesCount: Math.max(
            ...Object.values(countPerSpId(enquiries)),
            0
          ),
          lostEnquiriesCount: Math.max(
            ...Object.values(countPerSpId(lostEnquiries)),
            0
          ),
          testDrivesCount: Math.max(
            ...Object.values(countPerSpId(testDrives)),
            0
          ),
          newOrdersCount: getMaxFromAnalytics("new_orders"),
          netOrdersCount: getMaxFromAnalytics("net_orders"),
          cancellationsCount: getMaxFromAnalytics("cancellations"),
          retailCount: getMaxFromAnalytics("retail"),
        };
      }
    };

    const [data, dealerShipRank] = await Promise.all([
      fetchData(start, end),
      fetchDealerRank(start, end, userId),
    ]);
    const [allIndiaBestPerformace, allIndiaRank] = await Promise.all([
      fetchAllIndiaRank(start, end),
      fetchAllIndiaRank(start, end, userId),
    ]);
    responses.success(res, "Dashboard Data fetched successfully", {
      data,
      dealerShipRank,
      performance,
      allIndiaBestPerformace,
      allIndiaRank,
    });
  } catch (error) {
    logger.error(
      `Error fetching dashboard data for user ${req.userId}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  dashboardData,
  analyticsReports,
};
