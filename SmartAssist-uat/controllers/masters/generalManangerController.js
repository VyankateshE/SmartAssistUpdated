const logger = require("../../middlewares/fileLogs/logger");

const Dealers = require("../../models/master/dealerModel");
const GeneralManager = require("../../models/master/generalManagerModel");
const Users = require("../../models/master/usersModel");
const CallLogs = require("../../models/transactions/callLogsModel");
const Events = require("../../models/transactions/eventModel");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const UserActivity = require("../../models/auditLogs/user_activity");
const Targets = require("../../models/master/targetMasterModel");
const {
  getDateRange,
  groupData,
  groupDataByHour,
} = require("../../utils/filterType");
const responses = require("../../utils/globalResponse");
const dateController = require("../../utils/dateFilter");
const { Op, QueryTypes } = require("sequelize");
const Analytics = require("../../models/master/analyticsModel");
const moment = require("moment");
const dpLogins = require("../../models/master/dpLoginModel");

const GMDashboardReport = async (req, res) => {
  const { userId, userRole, dealerId } = req;
  const { dealer_Ids, dealer_id, user_id, type, start_date, end_date } =
    req.query;
  const dealerIds = dealer_Ids ? dealer_Ids.split(",").map(String) : [];

  let dateRange = null;
  if (type) {
    const { start, end } = getDateRange(type);
    dateRange = { start, end };
  } else if (start_date && end_date) {
    dateRange = {
      start: moment(start_date).startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      end: moment(end_date).endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    };
  } else {
    logger.error("Date range or type is required");
    return responses.badRequest(res, "Date range or type is required");
  }

  const getAnalyticsRange = (type) => {
    const ranges = {
      MTD: [
        "Today",
        "Yesterday",
        "This Week",
        "Last Week",
        "This Month",
        "Last Month",
        "MTD",
        "DAY",
        "WEEK",
      ],
      QTD: ["This Quarter", "Last Quarter", "QTD"],
      YTD: ["This Year", "Last 6 Months", "Lifetime", "YTD"],
    };
    for (const [range, typeList] of Object.entries(ranges)) {
      if (typeList.includes(type)) return range;
    }
    return "MTD";
  };

  const analyticsRange = getAnalyticsRange(type);
  const isUserActive = (lastLogin) => {
    if (!lastLogin || !dateRange) return false;
    const lastLoginDate = moment(lastLogin);
    const startDate = moment(dateRange.start);
    const endDate = moment(dateRange.end);
    return lastLoginDate.isBetween(startDate, endDate, null, "[]");
  };

  const ensureStringArray = (arr) => arr.map((id) => String(id));

  try {
    let dealerWhere = {};
    let userContext = {};
    let accessLevel = "";
    let dashboardType = "";

    if (userRole === "DP" && !dealer_id) {
      let dpUser;
      dpUser = await GeneralManager.findOne({
        attributes: ["generalManager_id", "name", "corporate_id"],
        where: { generalManager_id: userId, deleted: false },
        raw: true,
      });

      if (!dpUser) {
        dpUser = await dpLogins.findOne({
          attributes: ["dp_id", "name", "corporate_id"],
          where: { dp_id: userId, deleted: false },
          raw: true,
        });
        userContext = {
          role: "DP",
          dpId: dpUser.dp_id,
          dpName: dpUser.name,
          corporateId: dpUser.corporate_id,
        };
        dealerWhere = {
          dp_id: dpUser.dp_id,
          deleted: false,
        };
        if (!dpUser) {
          return responses.badRequest(res, "Dealer not found");
        }
      } else {
        userContext = {
          role: "DP",
          gmId: dpUser.generalManager_id,
          gmName: dpUser.name,
          corporateId: dpUser.corporate_id,
        };
        dealerWhere = {
          generalManager_id: dpUser.generalManager_id,
          deleted: false,
        };
        logger.info(`GM Dashboard Access - GM ID: ${userId}`);
      }

      accessLevel = "MULTI_DEALER";
      dashboardType = "DP_DASHBOARD";
    } else {
      // Handle CEO and regular dealer access
      let targetDealerId =
        userRole === "CEO" ? dealer_id || dealerId : dealer_id;
      if (!targetDealerId) {
        logger.error("Dealer ID is required for dealer dashboard");
        return responses.badRequest(res, "Dealer ID is required");
      }

      const dealer = await Dealers.findOne({
        attributes: [
          "dealer_id",
          "dealer_name",
          "generalManager_id",
          "corporate_id",
        ],
        where: { dealer_id: targetDealerId, deleted: false },
        raw: true,
      });

      if (!dealer) {
        logger.error(`Dealer not found for dealer_id: ${targetDealerId}`);
        return responses.badRequest(res, "Dealer not found", 404);
      }

      userContext = {
        role: "DEALER",
        dealerId: dealer.dealer_id,
        dealerName: dealer.dealer_name,
        corporateId: dealer.corporate_id,
        createdByGM: dealer.generalManager_id,
      };
      accessLevel = "SINGLE_DEALER";
      dashboardType = "DEALER_DASHBOARD";
      dealerWhere = { dealer_id: dealer.dealer_id, deleted: false };
      logger.info(
        `Dealer Dashboard Access - Dealer ID: ${targetDealerId}, Name: ${dealer.dealer_name}`
      );
    }

    const allDealers = await Dealers.findAll({
      attributes: [
        "dealer_id",
        "dealer_name",
        "dealer_email",
        "password",
        "generalManager_id",
      ],
      where: dealerWhere,
      order: [["dealer_name", "ASC"]],
      raw: true,
    });

    if (!allDealers.length) {
      const emptyResponse = {
        userRole,
        userContext,
        dashboardType,
        accessLevel,
        analyticsRange,
        dateRange,
        dealers: [],
        overview: {
          dealers: 0,
          activeNetwork: 0,
          users: 0,
          registerUsers: 0,
          activeUsers: 0,
          leads: 0,
          calls: 0,
          connectedCalls: 0,
          totalFollowUps: 0,
          uniqueTestDrives: 0,
          completedTestDrives: 0,
        },
      };
      const message =
        dashboardType === "DP_DASHBOARD"
          ? "No dealers found for this user"
          : "No dealer data found";
      return responses.success(res, message, emptyResponse);
    }

    const selectedDealerIds = allDealers.map((d) => d.dealer_id);

    const allUsers = await Users.findAll({
      attributes: [
        "user_id",
        "dealer_id",
        "fname",
        "lname",
        "password",
        "user_role",
      ],
      where: { dealer_id: { [Op.in]: selectedDealerIds }, deleted: false },
      order: [
        ["fname", "ASC"],
        ["lname", "ASC"],
      ],
      raw: true,
    });

    const allUserIds = allUsers.map((u) => u.user_id);

    if (!allUserIds.length) {
      const emptyResponse = {
        userRole,
        userContext,
        dashboardType,
        accessLevel,
        analyticsRange,
        dateRange,
        dealers: allDealers.length,
        overview: {
          dealers: allDealers.length,
          activeNetwork: 0,
          users: 0,
          registerUsers: 0,
          activeUsers: 0,
          leads: 0,
          calls: 0,
          connectedCalls: 0,
          totalFollowUps: 0,
          uniqueTestDrives: 0,
          completedTestDrives: 0,
        },
      };
      return responses.success(
        res,
        "No users found for selected dealers",
        emptyResponse
      );
    }

    const userActivities = await UserActivity.findAll({
      attributes: ["userId", "last_login"],
      where: {
        userId: { [Op.in]: allUserIds },
        last_login: { [Op.between]: [dateRange.start, dateRange.end] },
      },
      raw: true,
    });

    const userActivityMap = Object.fromEntries(
      userActivities.map((activity) => [activity.userId, activity])
    );

    const allUsersWithActivity = allUsers.map((user) => ({
      ...user,
      userActivity: userActivityMap[user.user_id] || null,
    }));

    const allLeadMobiles = await Leads.findAll({
      attributes: ["mobile"],
      where: {
        deleted: false,
      },
      raw: true,
    });

    const leadMobileSet = new Set(allLeadMobiles.map(({ mobile }) => mobile));
    const sequelize = Leads.sequelize;

    const allCallLogsRaw = await sequelize.query(
      `
      SELECT
        c."sp_id",
        c."mobile",
        c."call_type",
        c."call_duration",
        c."call_date",
        u."dealer_id"
      FROM public."CallLogs" c
      JOIN public."Users" u ON c."sp_id"::text = u."user_id"::text
      WHERE c."sp_id"::text = ANY(string_to_array(:user_ids, ','))
        AND COALESCE(c."is_excluded", false) = false
        AND c."call_date" BETWEEN :start AND :end
        AND u."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
      ORDER BY c."call_date" DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          user_ids: ensureStringArray(allUserIds).join(","),
          dealer_ids: ensureStringArray(selectedDealerIds).join(","),
          start: dateRange.start,
          end: dateRange.end,
        },
      }
    );

    const initCallSummary = () => ({
      totalCalls: 0,
      connectedCalls: 0,
      outgoing: 0,
      incoming: 0,
      rejected: 0,
      missed: 0,
      duration: 0,
      callsAbove1Min: 0,
    });

    const globalCallSummary = {
      enquiries: initCallSummary(),
      coldCalls: initCallSummary(),
      combined: initCallSummary(),
    };

    const dealerCallSummaryMap = {};
    selectedDealerIds.forEach((dealerId) => {
      dealerCallSummaryMap[dealerId] = {
        enquiries: initCallSummary(),
        coldCalls: initCallSummary(),
        combined: initCallSummary(),
      };
    });

    const userCallSummaryMap = {};
    allUserIds.forEach((userId) => {
      userCallSummaryMap[String(userId)] = {
        enquiries: initCallSummary(),
        coldCalls: initCallSummary(),
        combined: initCallSummary(),
      };
    });

    const validTypes = ["incoming", "outgoing", "missed", "rejected"];

    for (const call of allCallLogsRaw) {
      const { sp_id, mobile, call_type, call_duration = 0, dealer_id } = call;

      if (!validTypes.includes(call_type)) continue;

      const durationSec = Number(call_duration) || 0;

      const isLead = leadMobileSet.has(mobile);
      const callCategory = isLead ? "enquiries" : "coldCalls";

      const updateCallStats = (statsObj) => {
        statsObj.totalCalls++;
        if (call_type === "outgoing") statsObj.outgoing++;
        if (call_type === "incoming") statsObj.incoming++;
        if (call_type === "rejected") statsObj.rejected++;
        if (call_type === "missed") statsObj.missed++;

        if (durationSec > 0) {
          statsObj.connectedCalls++;
        }

        statsObj.duration += durationSec;

        if (durationSec > 60) {
          statsObj.callsAbove1Min++;
        }
      };

      updateCallStats(globalCallSummary[callCategory]);
      updateCallStats(globalCallSummary.combined);

      if (dealerCallSummaryMap[dealer_id]) {
        updateCallStats(dealerCallSummaryMap[dealer_id][callCategory]);
        updateCallStats(dealerCallSummaryMap[dealer_id].combined);
      }

      const userKey = String(sp_id);
      if (userCallSummaryMap[userKey]) {
        updateCallStats(userCallSummaryMap[userKey][callCategory]);
        updateCallStats(userCallSummaryMap[userKey].combined);
      }
    }

    const totalCalls = globalCallSummary.combined.totalCalls;
    const totalCallsConnected = globalCallSummary.combined.connectedCalls;

    const [totalLeads] = await Promise.all([
      Leads.count({
        where: {
          dealer_id: { [Op.in]: selectedDealerIds },
          deleted: false,
          created_at: { [Op.between]: [dateRange.start, dateRange.end] },
        },
        raw: true,
      }),
    ]);

    // ==================== FETCH OTHER DATA ====================
    const [
      callRows,
      leadRows,
      taskRows,
      eventRows,
      dealerCallRows,
      dealerLeadRows,
      dealerTaskRows,
      dealerEventRows,
      analyticsRows,
    ] = await Promise.all([
      sequelize.query(
        `
        SELECT
          c."sp_id",
          COUNT(*)::int AS "totalCalls",
          SUM(("call_type" = 'outgoing')::int)::int AS "outgoing",
          SUM(("call_type" = 'incoming')::int)::int AS "incoming",
          SUM(("call_duration" > 0)::int)::int AS "connected",
          SUM(("call_type" = 'rejected')::int)::int AS "declined",
          COALESCE(SUM("call_duration"), 0)::int AS "durationSec"
        FROM public."CallLogs" c
        JOIN public."Users" u ON c."sp_id"::text = u."user_id"::text
        WHERE c."sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND COALESCE(c."is_excluded", false) = false
          AND c."call_date" BETWEEN :start AND :end
          AND u."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
        GROUP BY c."sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          "sp_id",
          COUNT(*)::int AS total,
          SUM(("from_cxp" = false)::int)::int AS sa,
          SUM(("from_cxp" = true)::int)::int AS "manuallyEntered",
          SUM(("status" != 'Lost' AND "converted" = true)::int)::int AS "opportunitiesConverted"
        FROM public."Leads"
        WHERE "sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND "deleted" = false
          AND "created_at" BETWEEN :start AND :end
          AND "dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
        GROUP BY "sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          t."sp_id",
          SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS total,
          SUM((t."completed" = false AND t."due_date" >= :start AND t."created_at" BETWEEN :start AND :end)::int)::int AS open,
          SUM((t."completed" = false AND t."due_date" < :start)::int)::int AS closed,
          SUM((t."completed" = true AND t."created_at" BETWEEN :start AND :end)::int)::int AS completed,
          SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS sa
        FROM public."Tasks" t
        WHERE t."sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND t."deleted" = false
          AND t."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
        GROUP BY t."sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          e."sp_id",
          SUM((e."created_at" BETWEEN :start AND :end)::int)::int AS total,
          COUNT( DISTINCT CASE WHEN e."created_at" BETWEEN :start AND :end AND e."completed" = true THEN e."lead_id" END)::int AS "unique",
          SUM((e."completed" = false AND e."start_date" < :start)::int)::int AS closed,
          SUM((e."status" = 'Finished' AND e."completed" = true AND e."subject" = 'Test Drive' AND e."created_at" BETWEEN :start AND :end)::int)::int AS completed,
          SUM((e."completed" = false AND e."start_date" >= :start AND e."created_at" BETWEEN :start AND :end)::int)::int AS upcoming,
          SUM((e."created_at" BETWEEN :start AND :end)::int)::int AS sa
        FROM public."Events" e
        WHERE e."sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND e."deleted" = false
          AND e."subject" = 'Test Drive'
          AND e."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
        GROUP BY e."sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          u."dealer_id",
          COUNT(*)::int AS "totalCalls",
          SUM((c."call_type" = 'outgoing')::int)::int AS "outgoing",
          SUM((c."call_type" = 'incoming')::int)::int AS "incoming",
          SUM((c."call_duration" > 0)::int)::int AS "connected",
          SUM((c."call_type" = 'rejected')::int)::int AS "declined",
          COALESCE(SUM(c."call_duration"), 0)::int AS "durationSec"
        FROM public."CallLogs" c
        JOIN public."Users" u ON c."sp_id"::text = u."user_id"::text
        WHERE c."sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND COALESCE(c."is_excluded", false) = false
          AND c."call_date" BETWEEN :start AND :end
          AND u."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
        GROUP BY u."dealer_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          "dealer_id",
          COUNT(*)::int AS total,
          SUM(("from_cxp" = false)::int)::int AS sa,
          SUM(("from_cxp" = true)::int)::int AS "manuallyEntered",
          SUM(("status" != 'Lost' AND "converted" = true)::int)::int AS "opportunitiesConverted"
        FROM public."Leads"
        WHERE "dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
          AND "deleted" = false
          AND "created_at" BETWEEN :start AND :end
        GROUP BY "dealer_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          t."dealer_id",
          SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS total,
          SUM((t."completed" = false AND t."due_date" >= :start AND t."created_at" BETWEEN :start AND :end)::int)::int AS open,
          SUM((t."completed" = false AND t."due_date" < :start)::int)::int AS closed,
          SUM((t."completed" = true)::int)::int AS completed,
          SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS sa
        FROM public."Tasks" t
        WHERE t."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
          AND t."deleted" = false
        GROUP BY t."dealer_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      sequelize.query(
        `
        SELECT
          e."dealer_id",
          SUM((e."created_at" BETWEEN :start AND :end)::int)::int AS total,
          COUNT( DISTINCT CASE WHEN e."created_at" BETWEEN :start AND :end AND e."completed" = true THEN e."lead_id" END)::int AS "unique",
          SUM((e."completed" = false AND e."start_date" < :start)::int)::int AS closed,
          SUM((e."status" = 'Finished' AND e."completed" = true AND e."subject" = 'Test Drive' AND e."created_at" BETWEEN :start AND :end)::int)::int AS completed,
          SUM((e."completed" = false AND e."start_date" >= :start AND e."created_at" BETWEEN :start AND :end)::int)::int AS upcoming,
          SUM((e."created_at" BETWEEN :start AND :end)::int)::int AS sa
        FROM public."Events" e
        WHERE e."dealer_id"::text = ANY(string_to_array(:dealer_ids, ','))
          AND e."deleted" = false
          AND e."subject" = 'Test Drive'
        GROUP BY e."dealer_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            dealer_ids: ensureStringArray(selectedDealerIds).join(","),
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
      Analytics.findAll({
        where: { user_id: { [Op.in]: allUserIds }, range: analyticsRange },
        attributes: [
          "user_id",
          "new_orders",
          "net_orders",
          "retail",
          "cancellations",
        ],
        raw: true,
      }),
    ]);

    const analyticsMap = Object.fromEntries(
      analyticsRows.map((r) => [r.user_id, r])
    );
    const users = allUsersWithActivity.length;
    const registerUsers = allUsersWithActivity.filter(
      (u) => u.password && u.password !== ""
    ).length;
    const activeUsers = allUsersWithActivity.filter((u) =>
      isUserActive(u.userActivity?.last_login)
    ).length;

    const dealerUserMap = allUsersWithActivity.reduce((acc, user) => {
      acc[user.dealer_id] = acc[user.dealer_id] || [];
      acc[user.dealer_id].push(user);
      return acc;
    }, {});

    const dealersWithLeads = new Set(
      dealerLeadRows.map((row) => row.dealer_id)
    );
    const activeNetwork = allDealers.filter((dealer) =>
      dealersWithLeads.has(dealer.dealer_id)
    ).length;

    const totalFollowUps = dealerTaskRows.reduce(
      (sum, row) => sum + (row.total || 0),
      0
    );
    const uniqueTestDrives = dealerEventRows.reduce(
      (sum, row) => sum + (row.unique || 0),
      0
    );
    const completedTestDrives = dealerEventRows.reduce(
      (sum, row) => sum + (row.completed || 0),
      0
    );

    const shouldIncludeAnalyticsInOverview = ["MTD", "QTD", "YTD"].includes(
      type
    );
    const totalNewOrders = shouldIncludeAnalyticsInOverview
      ? analyticsRows.reduce(
          (sum, row) => sum + (Number(row.new_orders) || 0),
          0
        )
      : 0;
    const totalNetOrders = shouldIncludeAnalyticsInOverview
      ? analyticsRows.reduce(
          (sum, row) => sum + (Number(row.net_orders) || 0),
          0
        )
      : 0;
    const totalRetail = shouldIncludeAnalyticsInOverview
      ? analyticsRows.reduce((sum, row) => sum + (Number(row.retail) || 0), 0)
      : 0;
    const totalCancellations = shouldIncludeAnalyticsInOverview
      ? analyticsRows.reduce(
          (sum, row) => sum + (Number(row.cancellations) || 0),
          0
        )
      : 0;

    const callMap = Object.fromEntries(callRows.map((r) => [r.sp_id, r]));
    const leadsMap = Object.fromEntries(leadRows.map((r) => [r.sp_id, r]));
    const tasksMap = Object.fromEntries(taskRows.map((r) => [r.sp_id, r]));
    const eventsMap = Object.fromEntries(eventRows.map((r) => [r.sp_id, r]));
    const dealerCallMap = Object.fromEntries(
      dealerCallRows.map((r) => [r.dealer_id, r])
    );
    const dealerLeadsMap = Object.fromEntries(
      dealerLeadRows.map((r) => [r.dealer_id, r])
    );
    const dealerTasksMap = Object.fromEntries(
      dealerTaskRows.map((r) => [r.dealer_id, r])
    );
    const dealerEventsMap = Object.fromEntries(
      dealerEventRows.map((r) => [r.dealer_id, r])
    );

    let dealerData = allDealers
      .map((dealer) => {
        const dealerUsers = dealerUserMap[dealer.dealer_id] || [];

        const dl = dealerLeadsMap[dealer.dealer_id] || {
          total: 0,
          sa: 0,
          manuallyEntered: 0,
          opportunitiesConverted: 0,
        };
        const dt = dealerTasksMap[dealer.dealer_id] || {
          total: 0,
          open: 0,
          closed: 0,
          completed: 0,
          sa: 0,
        };
        const de = dealerEventsMap[dealer.dealer_id] || {
          total: 0,
          unique: 0,
          closed: 0,
          completed: 0,
          upcoming: 0,
          sa: 0,
        };
        const dc = dealerCallMap[dealer.dealer_id] || {
          totalCalls: 0,
          outgoing: 0,
          incoming: 0,
          connected: 0,
          declined: 0,
          durationSec: 0,
        };

        // Use the enquiries/cold calls split from dealerCallSummaryMap
        const dealerCallData = dealerCallSummaryMap[dealer.dealer_id] || {
          enquiries: initCallSummary(),
          coldCalls: initCallSummary(),
          combined: initCallSummary(),
        };

        const shouldIncludeAnalytics = ["MTD", "QTD", "YTD"].includes(type);
        const dealerAnalytics = shouldIncludeAnalytics
          ? dealerUsers.reduce(
              (acc, user) => {
                const userAnalytics = analyticsMap[user.user_id] || {};
                acc.newOrders += Number(userAnalytics.new_orders || 0);
                acc.netOrders += Number(userAnalytics.net_orders || 0);
                acc.retail += Number(userAnalytics.retail || 0);
                acc.cancellations += Number(userAnalytics.cancellations || 0);
                return acc;
              },
              { newOrders: 0, netOrders: 0, retail: 0, cancellations: 0 }
            )
          : { newOrders: 0, netOrders: 0, retail: 0, cancellations: 0 };

        const totalUsers = dealerUsers.length;
        const registerDealerUsers = dealerUsers.filter(
          (user) => user.password && user.password !== ""
        ).length;
        const activeDealerUsers = dealerUsers.filter((user) =>
          isUserActive(user.userActivity?.last_login)
        ).length;

        // *** UPDATED: DP_DASHBOARD now has same access as GM_DASHBOARD ***
        const shouldShowUserDetails =
          dashboardType === "DEALER_DASHBOARD" ||
          (dashboardType === "DP_DASHBOARD" &&
            (dealerIds.includes(dealer.dealer_id) ||
              dealer_id === dealer.dealer_id));

        let userData = [];
        if (shouldShowUserDetails && dealerUsers.length > 0) {
          userData = dealerUsers
            .map((user) => {
              const l = leadsMap[user.user_id] || {
                total: 0,
                sa: 0,
                manuallyEntered: 0,
                opportunitiesConverted: 0,
              };
              const t = tasksMap[user.user_id] || {
                total: 0,
                open: 0,
                closed: 0,
                completed: 0,
                sa: 0,
              };
              const e = eventsMap[user.user_id] || {
                total: 0,
                unique: 0,
                closed: 0,
                completed: 0,
                upcoming: 0,
                sa: 0,
              };
              const c = callMap[user.user_id] || {
                totalCalls: 0,
                outgoing: 0,
                incoming: 0,
                connected: 0,
                declined: 0,
                durationSec: 0,
              };

              const userCallData = userCallSummaryMap[user.user_id] || {
                enquiries: initCallSummary(),
                coldCalls: initCallSummary(),
                combined: initCallSummary(),
              };

              const userAnalytics = analyticsMap[user.user_id] || {};
              const lastLogin = user.userActivity?.last_login;
              const isActive = isUserActive(lastLogin);

              return {
                user_id: user.user_id,
                user: `${user.fname} ${user.lname}`,
                user_role: user.user_role,
                registerUser: !!(user.password && user.password !== ""),
                active: isActive,
                last_login: lastLogin || null,
                leads: {
                  total: l.total,
                  sa: l.sa,
                  manuallyEntered: l.manuallyEntered,
                },
                followups: {
                  total: t.total,
                  open: t.open,
                  closed: t.closed,
                  completed: t.completed,
                  sa: t.sa,
                },
                testdrives: {
                  total: e.total,
                  unique: e.unique,
                  closed: e.closed,
                  completed: e.completed,
                  upcoming: e.upcoming,
                  sa: e.sa,
                },
                opportunitiesConverted: l.opportunitiesConverted,
                newOrders: shouldIncludeAnalytics
                  ? Number(userAnalytics.new_orders || 0)
                  : 0,
                netOrders: shouldIncludeAnalytics
                  ? Number(userAnalytics.net_orders || 0)
                  : 0,
                retail: shouldIncludeAnalytics
                  ? Number(userAnalytics.retail || 0)
                  : 0,
                cancellations: shouldIncludeAnalytics
                  ? Number(userAnalytics.cancellations || 0)
                  : 0,
                calls: {
                  totalCalls: c.totalCalls,
                  outgoing: c.outgoing,
                  incoming: c.incoming,
                  connected: c.connected,
                  declined: c.declined,
                  durationSec: c.durationSec,
                },
                // User-level enquiries calls
                enquiriesCalls: {
                  totalCalls: userCallData.enquiries.totalCalls,
                  connected: userCallData.enquiries.connectedCalls,
                  outgoing: userCallData.enquiries.outgoing,
                  incoming: userCallData.enquiries.incoming,
                  declined: userCallData.enquiries.rejected,
                  missed: userCallData.enquiries.missed,
                  duration: userCallData.enquiries.duration,
                  callsAbove1Min: userCallData.enquiries.callsAbove1Min,
                },
                // User-level cold calls
                coldCalls: {
                  totalCalls: userCallData.coldCalls.totalCalls,
                  connected: userCallData.coldCalls.connectedCalls,
                  outgoing: userCallData.coldCalls.outgoing,
                  incoming: userCallData.coldCalls.incoming,
                  declined: userCallData.coldCalls.rejected,
                  missed: userCallData.coldCalls.missed,
                  duration: userCallData.coldCalls.duration,
                  callsAbove1Min: userCallData.coldCalls.callsAbove1Min,
                },
                // User-level combined calls
                combinedCalls: {
                  totalCalls: userCallData.combined.totalCalls,
                  connected: userCallData.combined.connectedCalls,
                  outgoing: userCallData.combined.outgoing,
                  incoming: userCallData.combined.incoming,
                  declined: userCallData.combined.rejected,
                  missed: userCallData.combined.missed,
                  duration: userCallData.combined.duration,
                  callsAbove1Min: userCallData.combined.callsAbove1Min,
                },
              };
            })
            .sort((a, b) => {
              if (a.active !== b.active)
                return Number(b.active) - Number(a.active);
              return a.user.localeCompare(b.user);
            });
        }

        return {
          dealerId: dealer.dealer_id,
          dealerName: dealer.dealer_name,
          dealerEmail: dealer.dealer_email,
          createdByGM: dealer.generalManager_id,
          isSelected: dealerIds.includes(dealer.dealer_id),
          totalUsers,
          registerUsers: registerDealerUsers,
          activeUsers: activeDealerUsers,
          totalLeads: dl.total,
          saLeads: dl.sa,
          manuallyEnteredLeads: dl.manuallyEntered,
          opportunitiesConverted: dl.opportunitiesConverted,
          totalFollowUps: dt.total,
          openFollowUps: dt.open,
          closedFollowUps: dt.closed,
          completedFollowUps: dt.completed,
          saFollowUps: dt.sa,
          totalTestDrives: de.total,
          uniqueTestDrives: de.unique,
          closedTestDrives: de.closed,
          completedTestDrives: de.completed,
          upcomingTestDrives: de.upcoming,
          saTestDrives: de.sa,
          newOrders: dealerAnalytics.newOrders,
          netOrders: dealerAnalytics.netOrders,
          retail: dealerAnalytics.retail,
          cancellations: dealerAnalytics.cancellations,
          // Dealer-level enquiries calls
          enquiriesCalls: {
            totalCalls: dealerCallData.enquiries.totalCalls,
            connectedCalls: dealerCallData.enquiries.connectedCalls,
            outgoing: dealerCallData.enquiries.outgoing,
            incoming: dealerCallData.enquiries.incoming,
            declined: dealerCallData.enquiries.rejected,
            missed: dealerCallData.enquiries.missed,
            duration: dealerCallData.enquiries.duration,
            callsAbove1Min: dealerCallData.enquiries.callsAbove1Min,
          },
          // Dealer-level cold calls
          coldCalls: {
            totalCalls: dealerCallData.coldCalls.totalCalls,
            connectedCalls: dealerCallData.coldCalls.connectedCalls,
            outgoing: dealerCallData.coldCalls.outgoing,
            incoming: dealerCallData.coldCalls.incoming,
            declined: dealerCallData.coldCalls.rejected,
            missed: dealerCallData.coldCalls.missed,
            duration: dealerCallData.coldCalls.duration,
            callsAbove1Min: dealerCallData.coldCalls.callsAbove1Min,
          },
          // Dealer-level combined calls
          combinedCalls: {
            totalCalls: dealerCallData.combined.totalCalls,
            connectedCalls: dealerCallData.combined.connectedCalls,
            outgoing: dealerCallData.combined.outgoing,
            incoming: dealerCallData.combined.incoming,
            declined: dealerCallData.combined.rejected,
            missed: dealerCallData.combined.missed,
            duration: dealerCallData.combined.duration,
            callsAbove1Min: dealerCallData.combined.callsAbove1Min,
          },
          callLogs: dc,
          users: userData,
          showUserDetails: shouldShowUserDetails,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dealerName.localeCompare(b.dealerName));

    if (dealer_id) {
      dealerData = dealerData.filter((dealer) => dealer.dealerId === dealer_id);
      if (!dealerData.length) {
        logger.error(`No data found for dealer_id: ${dealer_id}`);
        return responses.badRequest(
          res,
          "No data found for the specified dealer",
          404
        );
      }
    }

    // ==================== HANDLE SINGLE USER QUERY ====================
    let selectedUser = null;
    if (user_id) {
      const userBelongsToDealer = allUsers.find((u) => u.user_id === user_id);
      if (!userBelongsToDealer) {
        return responses.badRequest(res, "Access denied for this user", 403);
      }

      const [
        upcoming,
        completed,
        overdue,
        user,
        leads,
        callLogs,
        enquiries,
        lostEnquiries,
        digitalLostEnquiries,
        digitalEnquiries,
        testDrives,
        allTestDrives,
        analyticsData,
        targetData,
      ] = await Promise.all([
        Events.findAll({
          attributes: ["name", "subject", "PMI"],
          where: {
            dealer_id: { [Op.in]: selectedDealerIds },
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
          order: [["start_date", "DESC"]],
          raw: true,
        }),
        Events.findAll({
          attributes: ["name", "subject", "PMI"],
          where: {
            dealer_id: { [Op.in]: selectedDealerIds },
            sp_id: user_id,
            deleted: false,
            subject: "Test Drive",
            status: "Finished",
            start_date: {
              [Op.gte]: dateController.oneWeekBeforeDate,
              [Op.lte]: dateController.todayDate,
            },
            [Op.or]: [{ favourite: true }, { favourite: null }],
          },
          order: [["start_date", "DESC"]],
          raw: true,
        }),
        Events.findAll({
          attributes: ["name", "subject", "PMI"],
          where: {
            dealer_id: { [Op.in]: selectedDealerIds },
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
          raw: true,
        }),
        Users.findOne({
          where: {
            user_id: user_id,
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          attributes: ["fname", "lname", "dealer_id"],
          raw: true,
        }),
        Leads.findAll({
          attributes: ["mobile"],
          where: {
            sp_id: user_id,
            deleted: false,
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
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
            sp_id: user_id,
            is_excluded: { [Op.not]: true },
            call_date: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["lead_id", "lost_created_at"],
          where: {
            sp_id: user_id,
            status: "Lost",
            deleted: false,
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["lead_id", "lost_created_at"],
          where: {
            sp_id: user_id,
            status: "Lost",
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          group: ["lead_id"],
          raw: true,
        }),
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
          raw: true,
        }),
        Analytics.findOne({
          where: { user_id: user_id, range: analyticsRange },
          raw: true,
        }),
        Targets.findOne({
          attributes: ["enquiries", "testDrives", "orders"],
          where: { user_id },
          raw: true,
        }),
      ]);

      if (!user) {
        logger.error(`User not found for user_id: ${user_id}`);
        return responses.badRequest(res, "User not found", 404);
      }

      // Create user-specific lead mobile set
      const userLeadMobileSet = new Set(leads.map((l) => l.mobile));

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

      const formatTypeLogs = (call_date, start_time, filterType) => {
        const dt = new Date(call_date);
        if (filterType === "DAY") {
          return Number(start_time?.slice(0, 2));
        } else if (filterType === "WEEK") {
          return dt.toLocaleDateString("en-US", { weekday: "short" });
        } else if (filterType === "MTD") {
          const day = dt.getDate();
          if (day <= 7) return "Week 1";
          else if (day <= 14) return "Week 2";
          else if (day <= 21) return "Week 3";
          else return "Week 4";
        } else if (filterType === "QTD") {
          return dt.toLocaleDateString("en-US", { month: "short" });
        } else if (filterType === "YTD") {
          const month = dt.getMonth();
          if (month <= 2) return "Q1";
          else if (month <= 5) return "Q2";
          else if (month <= 8) return "Q3";
          else return "Q4";
        } else {
          return dt.toISOString().slice(0, 10);
        }
      };

      // Process call logs for selected user
      for (const {
        call_type,
        start_time,
        call_duration = 0,
        call_date,
        mobile,
      } of callLogs) {
        if (!validTypes.includes(call_type)) continue;

        // Check against user-specific lead mobile set
        const isLead = userLeadMobileSet.has(mobile);
        const key = isLead ? "lead" : "nonlead";
        const stats = SummaryMap[key];
        stats.dates.add(call_date);

        const formatType = formatTypeLogs(call_date, start_time, type);
        stats.hourly[formatType] ||= {
          AllCalls: { calls: 0, durationSec: 0 },
          connected: { calls: 0, durationSec: 0 },
          missedCalls: 0,
        };

        stats.hourly[formatType].AllCalls.calls++;
        stats.hourly[formatType].AllCalls.durationSec +=
          Number(call_duration) || 0;

        if (call_type === "missed") stats.hourly[formatType].missedCalls++;
        if (Number(call_duration) > 0) {
          stats.hourly[formatType].connected.calls++;
          stats.hourly[formatType].connected.durationSec +=
            Number(call_duration) || 0;
        }

        const addSummary = (t) => {
          stats.summary[t] ||= {
            calls: 0,
            durationSec: 0,
            uniqueClients: new Set(),
          };
          stats.summary[t].calls++;
          stats.summary[t].durationSec += Number(call_duration) || 0;
          stats.summary[t].uniqueClients.add(mobile);
        };

        addSummary("All Calls");
        if (call_type === "missed") addSummary("Missed");
        if (call_type === "rejected") addSummary("Rejected");
        if (Number(call_duration) > 0) {
          addSummary("Connected");
          stats.totalConnected++;
          stats.totalConversation += Number(call_duration) || 0;
        }
        if (["missed", "rejected"].includes(call_type)) {
          stats.missedCalls++;
        }
      }

      const processLogs = (data) => ({
        totalConnected: data.totalConnected,
        conversationTime: data.totalConversation,
        notConnected: data.missedCalls,
        summary: Object.fromEntries(
          Object.entries(data.summary).map(([k, v]) => [
            k,
            {
              calls: v.calls,
              durationSec: v.durationSec,
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
                durationSec: s.AllCalls.durationSec,
              },
              Connected: {
                calls: s.connected.calls,
                durationSec: s.connected.durationSec,
              },
              missedCalls: s.missedCalls,
            },
          ])
        ),
      });

      const newEnquiries = enquiries.length;
      const uniqueUserTestDrives = testDrives.length;

      const enqBank = await Leads.count({
        where: {
          status: { [Op.notIn]: ["Qualified", "Lost"] },
          sp_id: user_id,
          deleted: false,
          dealer_id: { [Op.in]: selectedDealerIds },
        },
        raw: true,
      });

      const orders = Number(analyticsData?.new_orders) || 0;
      const net_orders = Number(analyticsData?.net_orders) || 0;
      const retail = Number(analyticsData?.retail) || 0;
      const cancellations = Number(analyticsData?.cancellations) || 0;
      const td_to_retail = Number(analyticsData?.td_to_retail) || 0;
      const utd_to_retail = Number(analyticsData?.utd_to_retail) || 0;
      const cancellation_contribution =
        Number(analyticsData?.cancellation_contribution) || 0;

      const enquiryTarget = targetData?.enquiries || 0;
      const testDriveTarget = targetData?.testDrives || 0;
      const orderTarget = targetData?.orders || 0;

      const enquiriesToAchieveTarget = Math.max(
        enquiryTarget - newEnquiries,
        0
      );
      const remainingTestDrives = Math.max(
        testDriveTarget - uniqueUserTestDrives,
        0
      );

      let followupsPerLostEnquiry = 0;
      for (const lead of lostEnquiries) {
        const followUps = await Tasks.count({
          where: {
            lead_id: lead.lead_id,
            sp_id: user_id,
            deleted: false,
            created_at: { [Op.gt]: lead.lost_created_at },
            dealer_id: { [Op.in]: selectedDealerIds },
          },
        });
        followupsPerLostEnquiry += followUps;
      }
      followupsPerLostEnquiry = lostEnquiries.length
        ? followupsPerLostEnquiry / lostEnquiries.length
        : 0;

      let followupsPerLostDigitalEnquiry = 0;
      for (const lead of digitalLostEnquiries) {
        const followUps = await Tasks.count({
          where: {
            lead_id: lead.lead_id,
            sp_id: user_id,
            deleted: false,
            created_at: { [Op.gt]: lead.lost_created_at },
            dealer_id: { [Op.in]: selectedDealerIds },
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
        ? Number(((uniqueUserTestDrives / newEnquiries) * 100).toFixed(2))
        : 0;
      const testDriveRatio = newEnquiries
        ? Number(((allTestDrives.length / newEnquiries) * 100).toFixed(2))
        : 0;
      const digitalEnquiryToOrderRatio =
        digitalEnquiries.length > 0
          ? Number((orders / digitalEnquiries.length).toFixed(2))
          : 0;

      const performance = {
        newEnquiries,
        lostEnquiries: lostEnquiries.length,
        enquiriesToAchieveTarget,
        followupsPerLostEnquiry,
        avgEnquiry,
        enquiryBank: enqBank,
        followupsPerLostDigitalEnquiry,
        uniqueTestDrives: uniqueUserTestDrives,
        remainingTestDrives,
        TestDrivesAvg,
        enquiryToUniqueTestdriveRatio,
        testDriveRatio,
        orders,
        net_orders,
        retail,
        cancellations,
        orderTarget,
        contributionToDealership: cancellation_contribution,
        TestDriveToRetail: td_to_retail,
        UTestDriveToRetail: utd_to_retail,
        digitalEnquiryToOrderRatio,
      };

      selectedUser = {
        fname: user.fname,
        lname: user.lname,
        dealer_id: user.dealer_id,
        upcomingTestDrives: upcoming,
        completedTestDrives: completed,
        overdueTestDrives: overdue,
        summaryEnquiry: processLogs(SummaryMap.lead),
        summaryColdCalls: processLogs(SummaryMap.nonlead),
        performance,
      };
    }

    // ==================== BUILD GLOBAL CALLS SUMMARY ====================
    const globalCallsSummary = {
      enquiries: {
        totalCalls: globalCallSummary.enquiries.totalCalls,
        connectedCalls: globalCallSummary.enquiries.connectedCalls,
        outgoing: globalCallSummary.enquiries.outgoing,
        incoming: globalCallSummary.enquiries.incoming,
        declined: globalCallSummary.enquiries.rejected,
        missed: globalCallSummary.enquiries.missed,
        duration: globalCallSummary.enquiries.duration,
        callsAbove1Min: globalCallSummary.enquiries.callsAbove1Min,
      },
      coldCalls: {
        totalCalls: globalCallSummary.coldCalls.totalCalls,
        connectedCalls: globalCallSummary.coldCalls.connectedCalls,
        outgoing: globalCallSummary.coldCalls.outgoing,
        incoming: globalCallSummary.coldCalls.incoming,
        declined: globalCallSummary.coldCalls.rejected,
        missed: globalCallSummary.coldCalls.missed,
        duration: globalCallSummary.coldCalls.duration,
        callsAbove1Min: globalCallSummary.coldCalls.callsAbove1Min,
      },
      combined: {
        totalCalls: globalCallSummary.combined.totalCalls,
        connectedCalls: globalCallSummary.combined.connectedCalls,
        outgoing: globalCallSummary.combined.outgoing,
        incoming: globalCallSummary.combined.incoming,
        declined: globalCallSummary.combined.rejected,
        missed: globalCallSummary.combined.missed,
        duration: globalCallSummary.combined.duration,
        callsAbove1Min: globalCallSummary.combined.callsAbove1Min,
      },
    };

    const responseData = {
      userRole,
      userContext,
      dashboardType,
      overview: {
        dealers: allDealers.length,
        activeNetwork,
        users,
        registerUsers,
        activeUsers,
        leads: totalLeads,
        calls: totalCalls,
        connectedCalls: totalCallsConnected,
        totalFollowUps,
        uniqueTestDrives,
        completedTestDrives,
        newOrders: totalNewOrders,
        netOrders: totalNetOrders,
        retail: totalRetail,
        cancellations: totalCancellations,
      },
      globalCallsSummary,
      dealerData,
      ...(selectedUser && { selectedUser }),
    };

    let successMessage = "";
    if (dashboardType === "DP_DASHBOARD") {
      successMessage =
        userContext.role === "DP"
          ? "GM dashboard report generated successfully"
          : "DP dashboard report generated successfully";
    } else if (dashboardType === "DEALER_DASHBOARD") {
      const dealerName = dealerData[0]?.dealerName;
      successMessage = `Dealer dashboard report generated successfully for ${dealerName}`;
    }

    return responses.success(res, successMessage, responseData);
  } catch (error) {
    console.error(`Error in Dashboard:`, error);
    logger.error(`Error in Dashboard: ${error.message}`, {
      userId,
      userRole,
      stack: error.stack,
    });
    return responses.serverError(res, error.message);
  }
};

const getTrendChart = async (req, res) => {
  const { userId, userRole, dealerId } = req;
  let { dealer_ids, type } = req.query;
  const selectedDealerIds = dealer_ids
    ? dealer_ids.split(",").map((id) => id.trim())
    : [];
  const timezone = "Asia/Kolkata";

  try {
    const { start, end } = getDateRange(type);

    let dealerWhere = {};
    let userContext = {};
    let accessLevel = "";
    let dashboardType = "";

    // -------------------------
    // DP / GM Hierarchy (merged)
    // Treat GeneralManager & dpLogins as the same role (GM/DP unified)
    // -------------------------
    if (userRole === "DP") {
      // Try GeneralManager first
      let dpUser = await GeneralManager.findOne({
        attributes: ["generalManager_id", "name", "corporate_id"],
        where: { generalManager_id: userId, deleted: false },
        raw: true,
      });

      if (dpUser) {
        // Found as GM
        userContext = {
          role: "DP",
          gmId: dpUser.generalManager_id,
          gmName: dpUser.name,
          corporateId: dpUser.corporate_id,
        };

        dealerWhere = {
          generalManager_id: dpUser.generalManager_id,
          deleted: false,
        };

        accessLevel = "MULTI_DEALER";
        dashboardType = "GM_TREND_CHART";

        logger.info(
          `GM Trend Chart Access - GM ID: ${userId}, Dealers Filter: ${
            selectedDealerIds.length > 0 ? selectedDealerIds.join(", ") : "All"
          }`
        );
      } else {
        // Fallback to dpLogins
        dpUser = await dpLogins.findOne({
          attributes: ["dp_id", "name", "corporate_id"],
          where: { dp_id: userId, deleted: false },
          raw: true,
        });

        if (!dpUser) {
          logger.error(`DP user not found for userId: ${userId}`);
          return responses.badRequest(
            res,
            "General Manager / DP not found",
            404
          );
        }

        userContext = {
          role: "DP",
          dpId: dpUser.dp_id,
          dpName: dpUser.name,
          corporateId: dpUser.corporate_id,
        };

        dealerWhere = {
          dp_id: dpUser.dp_id,
          deleted: false,
        };

        accessLevel = "MULTI_DEALER";
        dashboardType = "GM_TREND_CHART";

        logger.info(
          `DP Trend Chart Access (fallback dpLogins) - DP ID: ${userId}, Dealers Filter: ${
            selectedDealerIds.length > 0 ? selectedDealerIds.join(", ") : "All"
          }`
        );
      }
    } else if (userRole === "CEO") {
      const targetDealerId = dealer_ids ? selectedDealerIds[0] : dealerId;

      if (!targetDealerId) {
        logger.error("Dealer ID is required for dealer trend chart");
        return responses.badRequest(res, "Dealer ID is required");
      }

      const dealer = await Dealers.findOne({
        attributes: [
          "dealer_id",
          "dealer_name",
          "generalManager_id",
          "corporate_id",
        ],
        where: { dealer_id: targetDealerId, deleted: false },
        raw: true,
      });

      if (!dealer) {
        logger.error(`Dealer not found for dealer_id: ${targetDealerId}`);
        return responses.badRequest(res, "Dealer not found", 404);
      }

      userContext = {
        role: "DEALER",
        dealerId: dealer.dealer_id,
        dealerName: dealer.dealer_name,
        corporateId: dealer.corporate_id,
        createdByGM: dealer.generalManager_id,
      };

      accessLevel = "SINGLE_DEALER";
      dashboardType = "DEALER_TREND_CHART";

      dealerWhere = {
        dealer_id: dealer.dealer_id,
        deleted: false,
      };

      logger.info(
        `Dealer Trend Chart Access - Dealer ID: ${targetDealerId}, Name: ${dealer.dealer_name}`
      );
    } else {
      logger.error(`Invalid user role: ${userRole}`);
      return responses.badRequest(res, "Invalid user role");
    }

    // Fetch dealers based on access control
    const activeDealersWithNames = await Dealers.findAll({
      attributes: ["dealer_id", "dealer_name"],
      where: dealerWhere,
      order: [["dealer_name", "ASC"]],
      raw: true,
    });

    if (!activeDealersWithNames.length) {
      const emptyResponse = {
        userRole,
        userContext,
        dashboardType,
        accessLevel,
        filterType: type,
        range: { start, end },
        dealerCount: 0,
        activeDealers: [],
        topCards: {
          leads: 0,
          testDrives: 0,
          followups: 0,
          calls: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          enquiries: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          coldCalls: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          lastLogin: 0,
          distinctUsers: 0,
        },
        leftCharts: {},
        rightCharts: {},
        psWiseActivity: {},
      };

      return responses.success(
        res,
        dashboardType === "GM_TREND_CHART"
          ? "No dealers found for this GM"
          : "No dealer data found",
        emptyResponse
      );
    }

    const dealerIds = activeDealersWithNames.map((d) => d.dealer_id);
    const filteredDealerIds = selectedDealerIds.length
      ? dealerIds.filter((id) => selectedDealerIds.includes(id))
      : dealerIds;

    // Fetch all users for the selected dealers
    const allUsers = await Users.findAll({
      attributes: ["user_id", "dealer_id", "name", "user_role"],
      where: { dealer_id: { [Op.in]: dealerIds }, deleted: false },
      raw: true,
    });

    const spToDealer = {};
    allUsers.forEach((u) => {
      spToDealer[u.user_id] = u.dealer_id;
    });

    const dealerUserIds = filteredDealerIds.length
      ? allUsers
          .filter((u) => filteredDealerIds.includes(u.dealer_id))
          .map((u) => u.user_id)
      : allUsers.map((u) => u.user_id);

    if (!dealerUserIds.length) {
      const emptyResponse = {
        userRole,
        userContext,
        dashboardType,
        accessLevel,
        filterType: type,
        range: { start, end },
        dealerCount: activeDealersWithNames.length,
        activeDealers: activeDealersWithNames,
        topCards: {
          leads: 0,
          testDrives: 0,
          followups: 0,
          calls: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          enquiries: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          coldCalls: {
            totalCalls: 0,
            connectedCalls: 0,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            duration: 0,
            declined: 0,
          },
          lastLogin: 0,
          distinctUsers: 0,
        },
        leftCharts: {},
        rightCharts: {},
        psWiseActivity: {},
      };

      return responses.success(
        res,
        "No users found for selected dealers",
        emptyResponse
      );
    }

    const [
      leads,
      testDrives,
      followups,
      calls,
      userLogins,
      psWiseUsers,
      distinctUsers,
    ] = await Promise.all([
      Leads.findAll({
        where: {
          dealer_id: { [Op.in]: filteredDealerIds },
          created_at: { [Op.between]: [start, end] },
          [Op.and]: [{ created_at: { [Op.notLike]: "%00:__:_%" } }],
          deleted: false,
        },
        attributes: ["created_at", "dealer_id", "sp_id", "from_cxp", "mobile"],

        raw: true,
      }),
      Events.findAll({
        where: {
          dealer_id: { [Op.in]: filteredDealerIds },
          subject: "Test Drive",
          created_at: { [Op.between]: [start, end] },
          deleted: false,
        },
        attributes: ["created_at", "dealer_id", "lead_id", "sp_id"],
        raw: true,
      }),
      Tasks.findAll({
        where: {
          dealer_id: { [Op.in]: filteredDealerIds },
          created_at: { [Op.between]: [start, end] },
          deleted: false,
        },
        attributes: ["created_at", "dealer_id", "sp_id"],
        raw: true,
      }),
      CallLogs.findAll({
        where: {
          sp_id: { [Op.in]: dealerUserIds },
          call_date: { [Op.between]: [start, end] },
          is_excluded: { [Op.not]: true },
          call_type: {
            [Op.in]: ["incoming", "outgoing", "missed", "rejected"],
          },
        },
        attributes: [
          "call_date",
          "sp_id",
          "mobile",
          "call_type",
          "call_duration",
          "start_time",
        ],
        raw: true,
      }),
      UserActivity.findAll({
        where: {
          userId: { [Op.in]: dealerUserIds },
          created_at: { [Op.between]: [start, end] },
        },
        attributes: ["created_at", "userId"],
        raw: true,
      }),
      Users.findAll({
        where: {
          dealer_id: { [Op.in]: filteredDealerIds },
          user_role: { [Op.ne]: "CEO" },
          deleted: false,
        },
        attributes: ["user_id", "name", "user_role", "dealer_id"],
        raw: true,
      }),
      UserActivity.count({
        distinct: true,
        col: "userId",
        where: {
          userId: { [Op.in]: dealerUserIds },
          created_at: { [Op.between]: [start, end] },
        },
      }),
    ]);

    // Categorize calls into enquiries and cold calls
    const leadMobileSet = new Set(leads.map((lead) => lead.mobile));
    const enquiriesCalls = calls.filter((call) =>
      leadMobileSet.has(call.mobile)
    );
    const coldCalls = calls.filter((call) => !leadMobileSet.has(call.mobile));

    // Initialize call summary structures
    const initCallSummary = () => ({
      totalCalls: 0,
      connectedCalls: 0,
      outgoing: 0,
      incoming: 0,
      connected: 0,
      duration: 0,
      declined: 0,
      missed: 0,
    });

    const globalCallSummary = {
      calls: initCallSummary(),
      enquiries: initCallSummary(),
      coldCalls: initCallSummary(),
    };

    const dealerCallSummaryMap = {};
    filteredDealerIds.forEach((dealerId) => {
      dealerCallSummaryMap[dealerId] = {
        calls: initCallSummary(),
        enquiries: initCallSummary(),
        coldCalls: initCallSummary(),
      };
    });

    const userCallSummaryMap = {};
    dealerUserIds.forEach((userId) => {
      userCallSummaryMap[userId] = {
        calls: initCallSummary(),
        enquiries: initCallSummary(),
        coldCalls: initCallSummary(),
      };
    });

    // Process call logs and build summaries
    const validTypes = ["incoming", "outgoing", "missed", "rejected"];
    for (const call of calls) {
      const { sp_id, mobile, call_type, call_duration } = call;
      if (!validTypes.includes(call_type)) continue;

      const isLead = leadMobileSet.has(mobile);
      const isConnected = call_duration > 0;
      const callCategories = [
        "calls", // Total calls
        isLead ? "enquiries" : "coldCalls",
      ];

      const updateCallStats = (statsObj) => {
        statsObj.totalCalls++;
        if (isConnected) {
          statsObj.connectedCalls++;
          statsObj.connected++;
        }
        if (call_type === "incoming") statsObj.incoming++;
        if (call_type === "outgoing") statsObj.outgoing++;
        if (call_type === "rejected") statsObj.declined++;
        if (call_type === "missed") statsObj.missed++;
        statsObj.duration += call_duration || 0;
      };

      callCategories.forEach((category) => {
        updateCallStats(globalCallSummary[category]);
        const dealerId = spToDealer[sp_id];
        if (dealerCallSummaryMap[dealerId]) {
          updateCallStats(dealerCallSummaryMap[dealerId][category]);
        }
        if (userCallSummaryMap[sp_id]) {
          updateCallStats(userCallSummaryMap[sp_id][category]);
        }
      });
    }

    const saLeads = leads.filter((l) => l.from_cxp === false).length;
    const digitalLeads = leads.filter((l) => l.from_cxp === true).length;
    const uniqueTestDrives = new Set(testDrives.map((td) => td.lead_id)).size;

    const topCards = {
      saLeads: saLeads,
      digitalLeads: digitalLeads,
      testDrives: testDrives.length,
      utd: uniqueTestDrives,
      followups: followups.length,
      calls: globalCallSummary.calls,
      enquiries: globalCallSummary.enquiries,
      coldCalls: globalCallSummary.coldCalls,
      lastLogin: userLogins.length,
      distinctUsers: distinctUsers,
    };

    let leftCharts = {};
    let rightCharts = {};

    const uniqueTestDriveRecords = Array.from(
      new Map(testDrives.map((td) => [td.lead_id, td])).values()
    );
    const isDayFilter = type === "DAY" || type === "YESTERDAY";
    if (dashboardType === "GM_TREND_CHART" && !selectedDealerIds.length) {
      // Aggregate data for all dealers
      leftCharts = {
        leads: groupData(leads, "created_at", type, timezone),
        testDrives: groupData(testDrives, "created_at", type, timezone),
        utd: groupData(uniqueTestDriveRecords, "created_at", type, timezone),
        followups: groupData(followups, "created_at", type, timezone),
        calls: {
          totalCalls: groupData(
            calls,
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          incoming: groupData(
            calls.filter((c) => c.call_type === "incoming"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          outgoing: groupData(
            calls.filter((c) => c.call_type === "outgoing"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          missed: groupData(
            calls.filter((c) => c.call_type === "missed"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          rejected: groupData(
            calls.filter((c) => c.call_type === "rejected"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          connected: groupData(
            calls.filter((c) => c.call_duration > 0),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
        },
        enquiries: {
          totalCalls: groupData(enquiriesCalls, "call_date", type, timezone),
          incoming: groupData(
            enquiriesCalls.filter((c) => c.call_type === "incoming"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          outgoing: groupData(
            enquiriesCalls.filter((c) => c.call_type === "outgoing"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          missed: groupData(
            enquiriesCalls.filter((c) => c.call_type === "missed"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          rejected: groupData(
            enquiriesCalls.filter((c) => c.call_type === "rejected"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          connected: groupData(
            enquiriesCalls.filter((c) => c.call_duration > 0),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
        },
        coldCalls: {
          totalCalls: groupData(coldCalls, "call_date", type, timezone),
          incoming: groupData(
            coldCalls.filter((c) => c.call_type === "incoming"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          outgoing: groupData(
            coldCalls.filter((c) => c.call_type === "outgoing"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          missed: groupData(
            coldCalls.filter((c) => c.call_type === "missed"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          rejected: groupData(
            coldCalls.filter((c) => c.call_type === "rejected"),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
          connected: groupData(
            coldCalls.filter((c) => c.call_duration > 0),
            isDayFilter ? "start_time" : "call_date",
            type,
            timezone
          ),
        },
        lastLogin: groupData(userLogins, "created_at", type, timezone),
      };
      rightCharts = {
        leads: groupDataByHour(leads, "created_at", timezone),
        testDrives: groupDataByHour(testDrives, "created_at", timezone),
        utd: groupDataByHour(uniqueTestDriveRecords, "created_at", timezone),
        followups: groupDataByHour(followups, "created_at", timezone),
        calls: {
          totalCalls: groupDataByHour(calls, "start_time", timezone),
          incoming: groupDataByHour(
            calls.filter((c) => c.call_type === "incoming"),
            "start_time",
            timezone
          ),
          outgoing: groupDataByHour(
            calls.filter((c) => c.call_type === "outgoing"),
            "start_time",
            timezone
          ),
          missed: groupDataByHour(
            calls.filter((c) => c.call_type === "missed"),
            "start_time",
            timezone
          ),
          rejected: groupDataByHour(
            calls.filter((c) => c.call_type === "rejected"),
            "start_time",
            timezone
          ),
          connected: groupDataByHour(
            calls.filter((c) => c.call_duration > 0),
            "start_time",
            timezone
          ),
        },
        enquiries: {
          totalCalls: groupDataByHour(enquiriesCalls, "start_time", timezone),
          incoming: groupDataByHour(
            enquiriesCalls.filter((c) => c.call_type === "incoming"),
            "start_time",
            timezone
          ),
          outgoing: groupDataByHour(
            enquiriesCalls.filter((c) => c.call_type === "outgoing"),
            "start_time",
            timezone
          ),
          missed: groupDataByHour(
            enquiriesCalls.filter((c) => c.call_type === "missed"),
            "start_time",
            timezone
          ),
          rejected: groupDataByHour(
            enquiriesCalls.filter((c) => c.call_type === "rejected"),
            "start_time",
            timezone
          ),
          connected: groupDataByHour(
            enquiriesCalls.filter((c) => c.call_duration > 0),
            "start_time",
            timezone
          ),
        },
        coldCalls: {
          totalCalls: groupDataByHour(coldCalls, "start_time", timezone),
          incoming: groupDataByHour(
            coldCalls.filter((c) => c.call_type === "incoming"),
            "start_time",
            timezone
          ),
          outgoing: groupDataByHour(
            coldCalls.filter((c) => c.call_type === "outgoing"),
            "start_time",
            timezone
          ),
          missed: groupDataByHour(
            coldCalls.filter((c) => c.call_type === "missed"),
            "start_time",
            timezone
          ),
          rejected: groupDataByHour(
            coldCalls.filter((c) => c.call_type === "rejected"),
            "start_time",
            timezone
          ),
          connected: groupDataByHour(
            coldCalls.filter((c) => c.call_duration > 0),
            "start_time",
            timezone
          ),
        },
        lastLogin: groupDataByHour(userLogins, "created_at", timezone),
      };
    } else {
      // Per-dealer data
      for (const dId of filteredDealerIds) {
        const dealerName =
          activeDealersWithNames.find((d) => d.dealer_id === dId)
            ?.dealer_name || `Dealer ${dId}`;

        const dealerLeads = leads.filter((l) => l.dealer_id === dId);
        const dealerTestDrives = testDrives.filter((t) => t.dealer_id === dId);
        const dealerUniqueTD = Array.from(
          new Map(dealerTestDrives.map((td) => [td.dealer_id, td])).values()
        );
        const dealerFollowups = followups.filter((f) => f.dealer_id === dId);
        const dealerCalls = calls.filter((c) => spToDealer[c.sp_id] === dId);
        const dealerEnquiriesCalls = enquiriesCalls.filter(
          (c) => spToDealer[c.sp_id] === dId
        );
        const dealerColdCalls = coldCalls.filter(
          (c) => spToDealer[c.sp_id] === dId
        );
        const dealerLogins = userLogins.filter(
          (u) => spToDealer[u.userId] === dId
        );

        leftCharts[dealerName] = {
          leads: groupData(dealerLeads, "created_at", type, timezone),
          testDrives: groupData(dealerTestDrives, "created_at", type, timezone),
          utd: groupData(dealerUniqueTD, "created_at", type, timezone),
          followups: groupData(dealerFollowups, "created_at", type, timezone),
          calls: {
            totalCalls: groupData(
              dealerCalls,
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            incoming: groupData(
              dealerCalls.filter((c) => c.call_type === "incoming"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            outgoing: groupData(
              dealerCalls.filter((c) => c.call_type === "outgoing"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            missed: groupData(
              dealerCalls.filter((c) => c.call_type === "missed"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            rejected: groupData(
              dealerCalls.filter((c) => c.call_type === "rejected"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            connected: groupData(
              dealerCalls.filter((c) => c.call_duration > 0),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
          },
          enquiries: {
            totalCalls: groupData(
              dealerEnquiriesCalls,
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            incoming: groupData(
              dealerEnquiriesCalls.filter((c) => c.call_type === "incoming"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            outgoing: groupData(
              dealerEnquiriesCalls.filter((c) => c.call_type === "outgoing"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            missed: groupData(
              dealerEnquiriesCalls.filter((c) => c.call_type === "missed"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            rejected: groupData(
              dealerEnquiriesCalls.filter((c) => c.call_type === "rejected"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            connected: groupData(
              dealerEnquiriesCalls.filter((c) => c.call_duration > 0),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
          },
          coldCalls: {
            totalCalls: groupData(dealerColdCalls, "call_date", type, timezone),
            incoming: groupData(
              dealerColdCalls.filter((c) => c.call_type === "incoming"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            outgoing: groupData(
              dealerColdCalls.filter((c) => c.call_type === "outgoing"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            missed: groupData(
              dealerColdCalls.filter((c) => c.call_type === "missed"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            rejected: groupData(
              dealerColdCalls.filter((c) => c.call_type === "rejected"),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
            connected: groupData(
              dealerColdCalls.filter((c) => c.call_duration > 0),
              isDayFilter ? "start_time" : "call_date",
              type,
              timezone
            ),
          },
          lastLogin: groupData(dealerLogins, "created_at", type, timezone),
        };

        rightCharts[dealerName] = {
          leads: groupDataByHour(dealerLeads, "created_at", timezone),
          testDrives: groupDataByHour(dealerTestDrives, "created_at", timezone),
          utd: groupDataByHour(dealerUniqueTD, "created_at", timezone),
          followups: groupDataByHour(dealerFollowups, "created_at", timezone),
          calls: {
            totalCalls: groupDataByHour(dealerCalls, "start_time", timezone),
            incoming: groupDataByHour(
              dealerCalls.filter((c) => c.call_type === "incoming"),
              "start_time",
              timezone
            ),
            outgoing: groupDataByHour(
              dealerCalls.filter((c) => c.call_type === "outgoing"),
              "start_time",
              timezone
            ),
            missed: groupDataByHour(
              dealerCalls.filter((c) => c.call_type === "missed"),
              "start_time",
              timezone
            ),
            rejected: groupDataByHour(
              dealerCalls.filter((c) => c.call_type === "rejected"),
              "start_time",
              timezone
            ),
            connected: groupDataByHour(
              dealerCalls.filter((c) => c.call_duration > 0),
              "start_time",
              timezone
            ),
          },
          enquiries: {
            totalCalls: groupDataByHour(
              dealerEnquiriesCalls,
              "start_time",
              timezone
            ),
            incoming: groupDataByHour(
              dealerEnquiriesCalls.filter((c) => c.call_type === "incoming"),
              "start_time",
              timezone
            ),
            outgoing: groupDataByHour(
              dealerEnquiriesCalls.filter((c) => c.call_type === "outgoing"),
              "start_time",
              timezone
            ),
            missed: groupDataByHour(
              dealerEnquiriesCalls.filter((c) => c.call_type === "missed"),
              "start_time",
              timezone
            ),
            rejected: groupDataByHour(
              dealerEnquiriesCalls.filter((c) => c.call_type === "rejected"),
              "start_time",
              timezone
            ),
            connected: groupDataByHour(
              dealerEnquiriesCalls.filter((c) => c.call_duration > 0),
              "start_time",
              timezone
            ),
          },
          coldCalls: {
            totalCalls: groupDataByHour(
              dealerColdCalls,
              "start_time",
              timezone
            ),
            incoming: groupDataByHour(
              dealerColdCalls.filter((c) => c.call_type === "incoming"),
              "start_time",
              timezone
            ),
            outgoing: groupDataByHour(
              dealerColdCalls.filter((c) => c.call_type === "outgoing"),
              "start_time",
              timezone
            ),
            missed: groupDataByHour(
              dealerColdCalls.filter((c) => c.call_type === "missed"),
              "start_time",
              timezone
            ),
            rejected: groupDataByHour(
              dealerColdCalls.filter((c) => c.call_type === "rejected"),
              "start_time",
              timezone
            ),
            connected: groupDataByHour(
              dealerColdCalls.filter((c) => c.call_duration > 0),
              "start_time",
              timezone
            ),
          },
          lastLogin: groupDataByHour(dealerLogins, "created_at", timezone),
        };
      }
    }

    // PS-WISE ACTIVITY
    const usersByDealer = psWiseUsers.reduce((acc, user) => {
      if (!acc[user.dealer_id]) acc[user.dealer_id] = [];
      acc[user.dealer_id].push(user);
      return acc;
    }, {});

    const leadCounts = leads.reduce((acc, l) => {
      acc[l.sp_id] = (acc[l.sp_id] || 0) + 1;
      return acc;
    }, {});

    const saLeadCounts = leads.reduce((acc, l) => {
      if (l.from_cxp === false) {
        acc[l.sp_id] = (acc[l.sp_id] || 0) + 1;
      }
      return acc;
    }, {});

    const utdCounts = testDrives.reduce((acc, t) => {
      if (!acc[t.sp_id]) acc[t.sp_id] = new Set();
      acc[t.sp_id].add(t.lead_id);
      return acc;
    }, {});

    const tdCounts = testDrives.reduce((acc, t) => {
      acc[t.sp_id] = (acc[t.sp_id] || 0) + 1;
      return acc;
    }, {});

    const taskCounts = followups.reduce((acc, f) => {
      acc[f.sp_id] = (acc[f.sp_id] || 0) + 1;
      return acc;
    }, {});

    const loginCounts = userLogins.reduce((acc, u) => {
      acc[u.userId] = (acc[u.userId] || 0) + 1;
      return acc;
    }, {});

    const psWiseActivity = {};
    for (const dealerId of filteredDealerIds) {
      const dealerInfo = activeDealersWithNames.find(
        (d) => d.dealer_id === dealerId
      );
      const dealerName = dealerInfo
        ? dealerInfo.dealer_name
        : `Dealer ${dealerId}`;

      psWiseActivity[dealerName] = (usersByDealer[dealerId] || []).map(
        (user) => ({
          user_id: user.user_id,
          name: user.name,
          role: user.user_role,

          saLeads: saLeadCounts[user.user_id] || 0,
          testDrives: tdCounts[user.user_id] || 0,
          uniquetestDrives: utdCounts[user.user_id]
            ? utdCounts[user.user_id].size
            : 0,
          leads: leadCounts[user.user_id] || 0,
          followups: taskCounts[user.user_id] || 0,
          calls: userCallSummaryMap[user.user_id]?.calls || initCallSummary(),
          enquiries:
            userCallSummaryMap[user.user_id]?.enquiries || initCallSummary(),
          coldCalls:
            userCallSummaryMap[user.user_id]?.coldCalls || initCallSummary(),
          lastLogin: loginCounts[user.user_id] || 0,
          target: 0,
        })
      );
    }

    // Build response
    const responseData = {
      userRole,
      userContext,
      dashboardType,
      accessLevel,
      filterType: type,
      range: { start, end },
      dealerCount: filteredDealerIds.length || activeDealersWithNames.length,
      activeDealers: activeDealersWithNames.map((d) => ({
        dealer_id: d.dealer_id,
        dealer_name: d.dealer_name,
        isSelected: filteredDealerIds.includes(d.dealer_id),
      })),
      topCards,
      leftCharts,
      rightCharts,
      psWiseActivity,
    };

    // Generate success message
    let successMessage = "";
    if (dashboardType === "GM_TREND_CHART") {
      const dealerCount =
        filteredDealerIds.length || activeDealersWithNames.length;
      const dealerText = dealerCount === 1 ? "dealer" : "dealers";
      const filterText =
        selectedDealerIds.length > 0
          ? ` (selected dealers: ${selectedDealerIds.join(", ")})`
          : "";
      successMessage = `GM trend chart generated successfully for ${dealerCount} ${dealerText}${filterText}`;
    } else {
      const dealerName = userContext.dealerName || "Unknown Dealer";
      successMessage = `Dealer trend chart generated successfully for ${dealerName}`;
    }

    logger.info(`${dashboardType} - Success: ${successMessage}`);
    return responses.success(res, successMessage, responseData);
  } catch (err) {
    logger.error(`Error in ${"Trend Chart"}: ${err.message}`, {
      userId,
      userRole,
      stack: err.stack,
    });
    return responses.serverError(res, err.message);
  }
};

module.exports = { GMDashboardReport, getTrendChart };
