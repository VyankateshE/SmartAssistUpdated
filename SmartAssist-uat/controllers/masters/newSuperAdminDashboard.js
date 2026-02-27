const logger = require("../../middlewares/fileLogs/logger");
const Analytics = require("../../models/master/analyticsModel");
const Dealers = require("../../models/master/dealerModel");
const SuperAdmin = require("../../models/master/superAdminModel");
const User = require("../../models/master/usersModel");
const CallLogs = require("../../models/transactions/callLogsModel");
const Events = require("../../models/transactions/eventModel");
const Leads = require("../../models/transactions/leadsModel");
const {
  getDateRange,
  groupData,
  groupDataByHour,
} = require("../../utils/filterType");
const responses = require("../../utils/globalResponse");
// const dateController = require("../../utils/dateFilter");
// const Targets = require("../../models/master/targetMasterModel");
const UserActivity = require("../../models/auditLogs/user_activity");
const Tasks = require("../../models/transactions/taskModel");
const moment = require("moment-timezone");

const { Op, Sequelize, QueryTypes } = require("sequelize");

const newSuperAdminDashboard = async (req, res) => {
  const { type, start_date, end_date } = req.query;

  const analyticsRange = ["MTD", "QTD", "YTD"].includes(type) ? type : "MTD";
  let dateRange;

  if (start_date && end_date) {
    dateRange = {
      start: moment(start_date, ["DD/MM/YYYY", "YYYY-MM-DD"]).format(
        "YYYY-MM-DD"
      ),
      end: moment(end_date, ["DD/MM/YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD"),
    };
  } else {
    const { start, end } = getDateRange(analyticsRange);
    dateRange = {
      start: moment(start).format("YYYY-MM-DD"),
      end: moment(end).format("YYYY-MM-DD"),
    };
  }

  try {
    const allDealers = await Dealers.findAll({
      attributes: ["dealer_id", "dealer_name", "dealer_email", "corporate_id"],
      raw: true,
    });
    if (!allDealers.length) {
      return responses.success(res, "SuperAdmin data fetched", []);
    }

    const allUsers = await User.findAll({
      attributes: ["user_id", "dealer_id", "fname", "lname", "password"],
      where: {
        dealer_id: { [Op.in]: allDealers.map((d) => d.dealer_id) },
        deleted: false,
      },
      raw: true,
    });
    const allUserIds = allUsers.map((u) => u.user_id);
    if (!allUserIds.length) {
      return responses.success(res, "SuperAdmin data fetched", []);
    }

    const sequelize = Leads.sequelize;

    // --- Batched aggregations ---
    const [callRows, leadRows, taskRows, eventRows] = await Promise.all([
      sequelize.query(
        `
        SELECT
          sp_id,
          COUNT(*)::int AS "totalCalls",
          SUM((call_type = 'outgoing')::int)::int AS "outgoing",
          SUM((call_type = 'incoming')::int)::int AS "incoming",
          SUM((call_duration > 0)::int)::int AS "connected",
          SUM((call_type = 'rejected')::int)::int AS "declined",
          COALESCE(SUM(call_duration), 0)::int AS "durationSec"
        FROM public."CallLogs"
        WHERE sp_id IN (:user_ids)
          AND COALESCE(is_excluded, false) = false
          AND call_date BETWEEN :start::date AND :end::date
        GROUP BY sp_id
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: allUserIds,
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),

      sequelize.query(
        `
  SELECT
    sp_id,
    COUNT(*)::int AS total,
    SUM((url IS NOT NULL)::int)::int AS cxp,
    SUM((ics_posted = true)::int)::int AS ics,
COALESCE(SUM((from_cxp = true)::int), 0)::int AS "fromCxp",
COALESCE(SUM((from_cxp = false)::int), 0)::int AS "fromSa"

  FROM public."Leads"
  WHERE sp_id IN (:user_ids)
    AND deleted = false
    AND created_at::date BETWEEN :start::date AND :end::date
  GROUP BY sp_id
  `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: allUserIds,
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),

      sequelize.query(
        `
        SELECT
          sp_id,
          SUM((created_at::date BETWEEN :start::date AND :end::date)::int)::int AS total,
          SUM((completed = false AND due_date >= :start AND url IS NOT null AND created_at::date BETWEEN :start::date AND :end::date)::int)::int AS open,
          SUM((completed = false AND due_date < :start)::int)::int AS closed,
          SUM((url IS NOT NULL AND created_at::date BETWEEN :start::date AND :end::date)::int)::int AS cxp
        FROM public."Tasks"
        WHERE sp_id IN (:user_ids)
          AND deleted = false
        GROUP BY sp_id
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: allUserIds,
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),

      sequelize.query(
        `
    SELECT
    sp_id,
    SUM((created_at::date BETWEEN :start::date AND :end::date)::int)::int AS total,
    COUNT(DISTINCT CASE WHEN subject = 'Test Drive' AND completed = true AND created_at::date BETWEEN :start::date AND :end::date THEN lead_id END)::int AS "uniqueTd",
    SUM((completed = false AND start_date >= :start AND url IS NOT null AND created_at::date BETWEEN :start::date AND :end::date)::int)::int AS open,
    SUM((status = 'Finished' AND completed = true AND subject = 'Test Drive' AND created_at::date BETWEEN :start::date AND :end::date)::int)::int AS "completed",
    SUM((completed = false AND start_date < :start)::int)::int AS closed,
    SUM((subject = 'Test Drive' AND url IS NOT NULL AND created_at::date BETWEEN :start::date AND :end::date)::int)::int AS cxp
    FROM public."Events"
    WHERE sp_id IN (:user_ids)
    AND deleted = false
    GROUP BY sp_id
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: allUserIds,
            start: dateRange.start,
            end: dateRange.end,
          },
        }
      ),
    ]);

    // --- Build quick lookup maps ---
    const callMap = Object.fromEntries(callRows.map((r) => [r.sp_id, r]));
    const leadsMap = Object.fromEntries(leadRows.map((r) => [r.sp_id, r]));
    const tasksMap = Object.fromEntries(taskRows.map((r) => [r.sp_id, r]));
    const eventsMap = Object.fromEntries(eventRows.map((r) => [r.sp_id, r]));

    // --- Assemble final structure ---
    const dealerData = allDealers
      .map((dealer) => {
        const dealerUsers = allUsers.filter(
          (u) => u.dealer_id === dealer.dealer_id
        );

        if (!dealerUsers.length) return null;

        const users = dealerUsers
          .map((user) => {
            const l = leadsMap[user.user_id] || {
              total: 0,
              cxp: 0,
              ics: 0,
              fromCxp: 0,
              fromSa: 0,
            };
            const t = tasksMap[user.user_id] || {
              total: 0,
              open: 0,
              closed: 0,
              cxp: 0,
            };
            const e = eventsMap[user.user_id] || {
              total: 0,
              uniqueTd: 0,
              open: 0,
              completed: 0,
              closed: 0,
              cxp: 0,
            };
            const c = callMap[user.user_id] || {
              totalCalls: 0,
              outgoing: 0,
              incoming: 0,
              connected: 0,
              declined: 0,
              durationSec: 0,
            };

            return {
              user: `${user.fname} ${user.lname}`,
              active: !!(user.password && user.password !== ""),
              leads: {
                total: l.total,
                cxp: l.cxp,
                ics: l.ics,
                fromCxp: l.fromCxp,
                fromSa: l.fromSa,
              },
              followups: {
                total: t.total,
                open: t.open,
                closed: t.closed,
                cxp: t.cxp,
              },
              testdrives: {
                total: e.total,
                uniqueTd: e.uniqueTd,
                open: e.open,
                completed: e.completed,
                closed: e.closed,
                cxp: e.cxp,
              },
              calls: {
                totalCalls: c.totalCalls,
                outgoing: c.outgoing,
                incoming: c.incoming,
                connected: c.connected,
                rejected: c.declined,
                durationSec: c.durationSec,
              },
            };
          })
          .sort((a, b) => {
            return b.active - a.active || a.user.localeCompare(b.user);
          });
        return {
          dealerId: dealer.dealer_id,
          dealerName: dealer.dealer_name,
          users,
        };
      })
      .filter(Boolean);

    return responses.success(res, "SuperAdmin data fetched", dealerData);
  } catch (error) {
    logger.error(`Error in SuperAdmin Dashboard: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

const formatAboveOneMin = (aboveOneMin, connected) => {
  const a = Number(aboveOneMin) || 0;
  const c = Number(connected) || 0;
  if (!c) return `${a} (0%)`;
  const percentage = ((a / c) * 100).toFixed(2);
  return `${a} (${percentage}%)`;
};

const calculateAvgConnected = (connected, duration) => {
  const c = Number(connected) || 0;
  const d = Number(duration) || 0;
  if (!c) return 0;
  return Number((d / c / 60).toFixed(2));
};

const dashboardReport = async (req, res) => {
  const { corporate_id } = req;
  const { dealer_Ids, dealer_id, user_id, type, start_date, end_date } =
    req.query;
  const dealerIds = dealer_Ids ? dealer_Ids.split(",") : [];

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
    return responses.badRequest(res, "Date range is required");
  }

  const ensureStringArray = (arr) => arr.map((id) => String(id));

  try {
    const superAdmin = await SuperAdmin.findOne({
      attributes: ["corporate_id"],
      where: { corporate_id },
      raw: true,
    });

    if (!superAdmin) {
      return responses.serverError(res, "SuperAdmin not found");
    }

    // FETCH GLOBAL LEAD MOBILES (available for both single-user & multi-user logic)
    const allLeadMobiles = await Leads.findAll({
      attributes: ["mobile"],
      where: { deleted: false },
      raw: true,
    });

    const globalLeadMobileSet = new Set(
      allLeadMobiles.map(({ mobile }) => mobile)
    );

    // ==================== SINGLE USER QUERY ====================
    if (user_id) {
      const user = await User.findOne({
        where: {
          user_id,
          corporate_id: superAdmin.corporate_id,
          deleted: false,
        },
        attributes: ["fname", "lname", "dealer_id"],
        raw: true,
      });

      if (!user) {
        return responses.notFound(res, "User not found");
      }

      // Fetch only call logs for the user (we already have global lead mobiles)
      const callLogs = await CallLogs.findAll({
        attributes: ["call_type", "mobile", "call_duration"],
        where: {
          sp_id: user_id,
          [Op.or]: [{ is_excluded: false }, { is_excluded: null }],
          call_date: { [Op.between]: [dateRange.start, dateRange.end] },
        },
        raw: true,
      });

      // Use the global leads set (any number present in Leads table is an enquiry)
      const leadMobileSet = globalLeadMobileSet;
      const validTypes = ["incoming", "outgoing", "missed", "rejected"];

      const initSummary = () => ({
        totalCalls: 0,
        connectedCalls: 0,
        outgoing: 0,
        incoming: 0,
        declined: 0,
        missed: 0,
        duration: 0,
        callsAbove1Min: 0,
        uniqueClients: new Set(),
      });

      const summaryMap = {
        lead: initSummary(),
        nonlead: initSummary(),
      };

      // Process each call log
      for (const call of callLogs) {
        const { call_type, call_duration = 0, mobile } = call;
        if (!validTypes.includes(call_type)) continue;

        // Determine if this is a lead or non-lead call
        const isLead = leadMobileSet.has(mobile);
        const stats = summaryMap[isLead ? "lead" : "nonlead"];
        const durationSec = Number(call_duration) || 0;

        // Increment total calls
        stats.totalCalls++;

        // Add to duration
        stats.duration += durationSec;

        // Track unique clients
        stats.uniqueClients.add(mobile);

        // Count by call type
        if (call_type === "outgoing") stats.outgoing++;
        else if (call_type === "incoming") stats.incoming++;
        else if (call_type === "rejected") stats.declined++;
        else if (call_type === "missed") stats.missed++;

        // Connected only if duration > 0
        if (durationSec > 0) {
          stats.connectedCalls++;
        }

        // Calls above 1 minute
        if (durationSec > 60) {
          stats.callsAbove1Min++;
        }
      }

      const formatSummary = (data) => ({
        totalCalls: data.totalCalls,
        connectedCalls: data.connectedCalls,
        outgoing: data.outgoing,
        incoming: data.incoming,
        declined: data.declined,
        missed: data.missed,
        callsAbove1Min: data.callsAbove1Min,
        totalUniqueClients: data.uniqueClients.size,
        totalDurationSec: data.duration,
      });

      const combinedUniqueClients = new Set([
        ...summaryMap.lead.uniqueClients,
        ...summaryMap.nonlead.uniqueClients,
      ]);

      const combinedCalls = {
        totalCalls: summaryMap.lead.totalCalls + summaryMap.nonlead.totalCalls,
        connectedCalls:
          summaryMap.lead.connectedCalls + summaryMap.nonlead.connectedCalls,
        outgoing: summaryMap.lead.outgoing + summaryMap.nonlead.outgoing,
        incoming: summaryMap.lead.incoming + summaryMap.nonlead.incoming,
        declined: summaryMap.lead.declined + summaryMap.nonlead.declined,
        missed: summaryMap.lead.missed + summaryMap.nonlead.missed,
        callsAbove1Min:
          summaryMap.lead.callsAbove1Min + summaryMap.nonlead.callsAbove1Min,
        totalUniqueClients: combinedUniqueClients.size,
        totalDurationSec: (
          (summaryMap.lead.duration + summaryMap.nonlead.duration) /
          60
        ).toFixed(2),
      };

      return responses.success(res, "Call summary fetched successfully", {
        user_id,
        fname: user.fname,
        lname: user.lname,
        summaryEnquiry: formatSummary(summaryMap.lead),
        summaryColdCalls: formatSummary(summaryMap.nonlead),
        combinedCalls,
      });
    }

    // ==================== MULTIPLE DEALERS/USERS QUERY ====================
    const isUserActive = (lastLogin) => {
      if (!lastLogin || !dateRange) return false;
      const lastLoginDate = moment(lastLogin);
      const startDate = moment(dateRange.start);
      const endDate = moment(dateRange.end);
      return lastLoginDate.isBetween(startDate, endDate, null, "[]");
    };

    const dealerWhere = dealerIds.length
      ? {
          corporate_id: superAdmin.corporate_id,
          dealer_id: { [Op.in]: ensureStringArray(dealerIds) },
        }
      : { corporate_id: superAdmin.corporate_id };

    const allDealers = await Dealers.findAll({
      attributes: [
        "dealer_id",
        "dealer_name",
        "dealer_email",
        "corporate_id",
        "password",
      ],
      where: dealerWhere,
      raw: true,
    });

    if (!allDealers.length) {
      return responses.success(res, "SuperAdmin data fetched", {});
    }

    const selectedDealerIds = allDealers.map((d) => d.dealer_id);

    const allUsers = await User.findAll({
      attributes: [
        "user_id",
        "dealer_id",
        "fname",
        "lname",
        "password",
        "user_role",
      ],
      where: {
        dealer_id: { [Op.in]: selectedDealerIds },
        deleted: false,
      },
      raw: true,
    });

    const allUserIds = allUsers.map((u) => u.user_id);

    if (!allUserIds.length) {
      return responses.success(res, "SuperAdmin data fetched", {
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
        dealerData: [],
      });
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

    // Use the global lead set here
    const leadMobileSet = globalLeadMobileSet;

    const sequelize = Leads.sequelize;

    // ==================== FETCH CALL LOGS WITH DEALER JOIN ====================
    const allCallLogsRaw = await sequelize.query(
      `
        SELECT
          c."sp_id",
          c."mobile",
          c."call_type",
          c."call_duration",
          u."dealer_id"
        FROM public."CallLogs" c
        JOIN public."Users" u ON c."sp_id"::text = u."user_id"::text
        WHERE c."sp_id"::text = ANY(string_to_array(:user_ids, ','))
          AND COALESCE(c."is_excluded", false) = false
          AND c."call_date" BETWEEN :start AND :end
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          user_ids: ensureStringArray(allUserIds).join(","),
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
      declined: 0,
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
      userCallSummaryMap[userId] = {
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
        if (call_type === "rejected") statsObj.declined++;
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

      if (userCallSummaryMap[sp_id]) {
        updateCallStats(userCallSummaryMap[sp_id][callCategory]);
        updateCallStats(userCallSummaryMap[sp_id].combined);
      }
    }

    const totalCalls = globalCallSummary.combined.totalCalls;
    const totalCallsConnected = globalCallSummary.combined.connectedCalls;

    // ==================== BUILD BACKWARD COMPATIBLE CALL ROWS ====================
    const callRows = allUserIds.map((userId) => {
      const userStats =
        userCallSummaryMap[userId]?.combined || initCallSummary();
      return {
        sp_id: userId,
        totalCalls: userStats.totalCalls,
        outgoing: userStats.outgoing,
        incoming: userStats.incoming,
        connected: userStats.connectedCalls,
        declined: userStats.declined,
        durationSec: userStats.duration,
        callsAbove1Min: formatAboveOneMin(
          userStats.callsAbove1Min,
          userStats.connectedCalls
        ),
      };
    });

    const dealerCallRows = selectedDealerIds.map((dealerId) => {
      const dealerStats =
        dealerCallSummaryMap[dealerId]?.combined || initCallSummary();
      return {
        dealer_id: dealerId,
        totalCalls: dealerStats.totalCalls,
        outgoing: dealerStats.outgoing,
        incoming: dealerStats.incoming,
        connected: dealerStats.connectedCalls,
        declined: dealerStats.declined,
        durationSec: dealerStats.duration,
        callsAbove1Min: formatAboveOneMin(
          dealerStats.callsAbove1Min,
          dealerStats.connectedCalls
        ),
      };
    });

    // ==================== FETCH LEADS, TASKS, EVENTS DATA ====================
    const [
      totalLeads,
      leadRows,
      taskRows,
      eventRows,
      dealerLeadRows,
      dealerTaskRows,
      dealerEventRows,
    ] = await Promise.all([
      Leads.count({
        where: {
          dealer_id: { [Op.in]: selectedDealerIds },
          deleted: false,
          created_at: { [Op.between]: [dateRange.start, dateRange.end] },
        },
      }),

      sequelize.query(
        `
          SELECT
            "sp_id",
            COUNT(*)::int AS total,
            SUM((from_cxp = false and url is not null)::int)::int AS cxp,
            SUM(("ics_posted" = true)::int)::int AS ics,
            SUM(("from_cxp" = false)::int)::int AS sa,
            SUM(("from_cxp" = true)::int)::int AS "manuallyEntered",
            SUM(("status" != 'Lost' AND "converted" = true)::int)::int AS "opportunitiesConverted"
          FROM public."Leads"
          WHERE "sp_id"::text = ANY(string_to_array(:user_ids, ','))
            AND "deleted" = false
            AND "created_at" BETWEEN :start AND :end
          GROUP BY "sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
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
            SUM((t."url" IS NOT NULL AND t."created_at" BETWEEN :start AND :end)::int)::int AS cxp,
            SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS sa,
            SUM((t."subject" != 'Call' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "taskFollowups",
            SUM((t."subject" = 'Call' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "callFollowups",
            SUM((t."subject" = 'Call' AND t."status" = 'Completed' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "connectedFollowups"
          FROM public."Tasks" t
          WHERE t."sp_id"::text = ANY(string_to_array(:user_ids, ','))
            AND t."deleted" = false
          GROUP BY t."sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
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
               SUM((e."completed" = false AND e."start_date" < :start )::int)::int AS closed,
             SUM((e."status" = 'Finished' AND e."completed" = true AND e."subject" = 'Test Drive'  AND e."created_at" BETWEEN :start AND :end)::int)::int AS completed,
            COUNT(e."completed" = false AND e."start_date" >= :start  AND e."created_at" BETWEEN :start AND :end )::int AS upcoming,
          SUM((e."subject" = 'Test Drive' AND e."url" IS NOT NULL AND e."created_at" BETWEEN :start AND :end
         )::int)::int AS cxp,
            SUM((e."created_at" BETWEEN :start AND :end)::int)::int AS sa
          FROM public."Events" e
          WHERE e."sp_id"::text = ANY(string_to_array(:user_ids, ','))
            AND e."deleted" = false
            AND e."subject" = 'Test Drive'
          GROUP BY e."sp_id"
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            user_ids: ensureStringArray(allUserIds).join(","),
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
            SUM((from_cxp = false and url is not null)::int)::int AS cxp,
            SUM((ics_posted = true)::int)::int AS ics,
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
            SUM((t."completed" = true AND t."created_at" BETWEEN :start AND :end)::int)::int AS completed,
            SUM((t."url" IS NOT NULL AND t."created_at" BETWEEN :start AND :end)::int)::int AS cxp,
            SUM((t."created_at" BETWEEN :start AND :end)::int)::int AS sa,
            SUM((t."subject" != 'Call' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "taskFollowups",
            SUM((t."subject" = 'Call' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "callFollowups",
            SUM((t."subject" = 'Call' AND t."status" = 'Completed' AND t."created_at" BETWEEN :start AND :end)::int)::int AS "connectedFollowups"
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
                SUM((e."completed" = false AND e."start_date" < :start )::int)::int AS closed,
               SUM((e."status" = 'Finished' AND e."completed" = true AND e."subject" = 'Test Drive'  AND e."created_at" BETWEEN :start AND :end)::int)::int AS completed,
            COUNT(e."completed" = false AND e."start_date" >= :start AND e."created_at" BETWEEN :start AND :end )::int AS upcoming,
          SUM((e."subject" = 'Test Drive' AND e."url" IS NOT NULL AND e."created_at" BETWEEN :start AND :end
         )::int)::int AS cxp,
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
    ]);

    // ==================== CALCULATE USER STATISTICS ====================
    const users = allUsersWithActivity.length;
    const registerUsers = allUsersWithActivity.filter(
      (u) => u.password && u.password !== ""
    ).length;
    const activeUsers = allUsersWithActivity.filter((u) => {
      const lastLogin = u.userActivity?.last_login;
      return isUserActive(lastLogin);
    }).length;

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

    // ==================== CREATE LOOKUP MAPS ====================
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

    // ==================== BUILD DEALER DATA WITH PROPER CALL DIFFERENTIATION ====================
    const dealerData = allDealers
      .map((dealer) => {
        const dealerUsers = dealerUserMap[dealer.dealer_id] || [];
        if (!dealerUsers.length) return null;

        const dl = dealerLeadsMap[dealer.dealer_id] || {
          total: 0,
          cxp: 0,
          ics: 0,
          sa: 0,
          manuallyEntered: 0,
          opportunitiesConverted: 0,
        };
        const dt = dealerTasksMap[dealer.dealer_id] || {
          total: 0,
          open: 0,
          closed: 0,
          completed: 0,
          cxp: 0,
          sa: 0,
          taskFollowups: 0,
          callFollowups: 0,
          connectedFollowups: 0,
        };
        const de = dealerEventsMap[dealer.dealer_id] || {
          total: 0,
          unique: 0,
          closed: 0,
          completed: 0,
          planned_not_completed: 0,
          upcoming: 0,
          cxp: 0,
          sa: 0,
        };
        const dc = dealerCallMap[dealer.dealer_id] || {
          totalCalls: 0,
          outgoing: 0,
          incoming: 0,
          connected: 0,
          declined: 0,
          durationSec: 0,
          callsAbove1Min: 0,
        };

        const dealerCallData = dealerCallSummaryMap[dealer.dealer_id] || {
          enquiries: initCallSummary(),
          coldCalls: initCallSummary(),
          combined: initCallSummary(),
        };

        const totalUsers = dealerUsers.length;
        const registerDealerUsers = dealerUsers.filter(
          (user) => user.password && user.password !== ""
        ).length;
        const activeDealerUsers = dealerUsers.filter((user) => {
          const lastLogin = user.userActivity?.last_login;
          return isUserActive(lastLogin);
        }).length;

        let userData = [];

        if (dealer.dealer_id == dealer_id || dealerIds.length > 0) {
          userData = dealerUsers
            .map((user) => {
              const l = leadsMap[user.user_id] || {
                total: 0,
                cxp: 0,
                ics: 0,
                sa: 0,
                manuallyEntered: 0,
                opportunitiesConverted: 0,
              };
              const t = tasksMap[user.user_id] || {
                total: 0,
                open: 0,
                closed: 0,
                completed: 0,
                cxp: 0,
                sa: 0,
                taskFollowups: 0,
                callFollowups: 0,
                connectedFollowups: 0,
              };
              const e = eventsMap[user.user_id] || {
                total: 0,
                unique: 0,
                closed: 0,
                completed: 0,
                planned_not_completed: 0,
                upcoming: 0,
                cxp: 0,
                sa: 0,
              };
              const c = callMap[user.user_id] || {
                totalCalls: 0,
                outgoing: 0,
                incoming: 0,
                connected: 0,
                declined: 0,
                durationSec: 0,
                callsAbove1Min: 0,
              };

              const userCallData = userCallSummaryMap[user.user_id] || {
                enquiries: initCallSummary(),
                coldCalls: initCallSummary(),
                combined: initCallSummary(),
              };

              const lastLogin = user.userActivity?.last_login;
              const isActive = isUserActive(lastLogin);

              return {
                user_id: user.user_id,
                user: `${user.fname} ${user.lname}`,
                user_role: user.user_role,
                registerUser: !!(user.password && user.password !== ""),
                active: isActive,
                last_login: lastLogin,
                leads: {
                  total: l.total,
                  cxp: l.cxp,
                  ics: l.ics,
                  sa: l.sa,
                  manuallyEntered: l.manuallyEntered,
                },
                followups: {
                  total: t.total,
                  open: t.open,
                  closed: t.closed,
                  cxp: t.cxp,
                  completed: t.completed,
                  sa: t.sa,
                  taskFollowups: t.taskFollowups,
                  callFollowups: t.callFollowups,
                  connectedFollowups: t.connectedFollowups,
                },
                testdrives: {
                  total: e.total,
                  unique: e.unique,
                  closed: e.closed,
                  completed: e.completed,
                  planned_not_completed: e.planned_not_completed,
                  upcoming: e.upcoming,
                  cxp: e.cxp,
                  sa: e.sa,
                },
                opportunitiesConverted: l.opportunitiesConverted,
                calls: {
                  totalCalls: c.totalCalls,
                  outgoing: c.outgoing,
                  incoming: c.incoming,
                  connected: c.connected,
                  declined: c.declined,
                  durationSec: c.durationSec,
                  callsAbove1Min: formatAboveOneMin(
                    c.callsAbove1Min,
                    c.connected
                  ),
                  avgConnected: calculateAvgConnected(
                    c.connected,
                    c.durationSec
                  ),
                },
                // USER-LEVEL ENQUIRIES CALLS (calls to lead mobiles)
                enquiriesCalls: {
                  totalCalls: userCallData.enquiries.totalCalls,
                  connectedCalls: userCallData.enquiries.connectedCalls,
                  outgoing: userCallData.enquiries.outgoing,
                  incoming: userCallData.enquiries.incoming,
                  declined: userCallData.enquiries.declined,
                  missed: userCallData.enquiries.missed,
                  duration: userCallData.enquiries.duration,
                  callsAbove1Min: formatAboveOneMin(
                    userCallData.enquiries.callsAbove1Min,
                    userCallData.enquiries.connectedCalls
                  ),
                  avgConnected: calculateAvgConnected(
                    userCallData.enquiries.connectedCalls,
                    userCallData.enquiries.duration
                  ),
                },
                // USER-LEVEL COLD CALLS (calls to non-lead mobiles)
                coldCalls: {
                  totalCalls: userCallData.coldCalls.totalCalls,
                  connectedCalls: userCallData.coldCalls.connectedCalls,
                  outgoing: userCallData.coldCalls.outgoing,
                  incoming: userCallData.coldCalls.incoming,
                  declined: userCallData.coldCalls.declined,
                  missed: userCallData.coldCalls.missed,
                  duration: userCallData.coldCalls.duration,
                  callsAbove1Min: formatAboveOneMin(
                    userCallData.coldCalls.callsAbove1Min,
                    userCallData.coldCalls.connectedCalls
                  ),
                  avgConnected: calculateAvgConnected(
                    userCallData.coldCalls.connectedCalls,
                    userCallData.coldCalls.duration
                  ),
                },
                // USER-LEVEL COMBINED CALLS (all calls)
                combinedCalls: {
                  totalCalls: userCallData.combined.totalCalls,
                  connectedCalls: userCallData.combined.connectedCalls,
                  outgoing: userCallData.combined.outgoing,
                  incoming: userCallData.combined.incoming,
                  declined: userCallData.combined.declined,
                  missed: userCallData.combined.missed,
                  duration: userCallData.combined.duration,
                  callsAbove1Min: formatAboveOneMin(
                    userCallData.combined.callsAbove1Min,
                    userCallData.combined.connectedCalls
                  ),
                  avgConnected: calculateAvgConnected(
                    userCallData.combined.connectedCalls,
                    userCallData.combined.duration
                  ),
                },
              };
            })
            .sort((a, b) => {
              return (
                Number(b.active) - Number(a.active) ||
                a.user.localeCompare(b.user)
              );
            });
        }

        return {
          dealerId: dealer.dealer_id,
          dealerName: dealer.dealer_name,
          totalUsers,
          registerUsers: registerDealerUsers,
          activeUsers: activeDealerUsers,
          totalLeads: dl.total,
          cxpLeads: dl.cxp,
          icsLeads: dl.ics,
          saLeads: dl.sa,
          manuallyEnteredLeads: dl.manuallyEntered,
          totalFollowUps: dt.total,
          openFollowUps: dt.open,
          closedFollowUps: dt.closed,
          completedFollowUps: dt.completed,
          saFollowUps: dt.sa,
          taskFollowups: dt.taskFollowups,
          callFollowups: dt.callFollowups,
          connectedFollowups: dt.connectedFollowups,
          cxpFollowUps: dt.cxp,
          totalTestDrives: de.total,
          uniqueTestDrives: de.unique,
          closedTestDrives: de.closed,
          completedTestDrives: de.completed,
          plannedNotCompletedTestDrives: de.planned_not_completed,
          upcomingTestDrives: de.upcoming,
          cxpTestDrives: de.cxp,
          saTestDrives: de.sa,
          opportunitiesConverted: dl.opportunitiesConverted,
          // DEALER-LEVEL ENQUIRIES CALLS (calls to lead mobiles)
          enquiriesCalls: {
            totalCalls: dealerCallData.enquiries.totalCalls,
            connectedCalls: dealerCallData.enquiries.connectedCalls,
            outgoing: dealerCallData.enquiries.outgoing,
            incoming: dealerCallData.enquiries.incoming,
            declined: dealerCallData.enquiries.declined,
            missed: dealerCallData.enquiries.missed,
            duration: dealerCallData.enquiries.duration,
            callsAbove1Min: formatAboveOneMin(
              dealerCallData.enquiries.callsAbove1Min,
              dealerCallData.enquiries.connectedCalls
            ),
            avgConnected: calculateAvgConnected(
              dealerCallData.enquiries.connectedCalls,
              dealerCallData.enquiries.duration
            ),
          },
          // DEALER-LEVEL COLD CALLS (calls to non-lead mobiles)
          coldCalls: {
            totalCalls: dealerCallData.coldCalls.totalCalls,
            connectedCalls: dealerCallData.coldCalls.connectedCalls,
            outgoing: dealerCallData.coldCalls.outgoing,
            incoming: dealerCallData.coldCalls.incoming,
            declined: dealerCallData.coldCalls.declined,
            missed: dealerCallData.coldCalls.missed,
            duration: dealerCallData.coldCalls.duration,
            callsAbove1Min: formatAboveOneMin(
              dealerCallData.coldCalls.callsAbove1Min,
              dealerCallData.coldCalls.connectedCalls
            ),
            avgConnected: calculateAvgConnected(
              dealerCallData.coldCalls.connectedCalls,
              dealerCallData.coldCalls.duration
            ),
          },
          // DEALER-LEVEL COMBINED CALLS (all calls)
          combinedCalls: {
            totalCalls: dealerCallData.combined.totalCalls,
            connectedCalls: dealerCallData.combined.connectedCalls,
            outgoing: dealerCallData.combined.outgoing,
            incoming: dealerCallData.combined.incoming,
            declined: dealerCallData.combined.declined,
            missed: dealerCallData.combined.missed,
            duration: dealerCallData.combined.duration,
            callsAbove1Min: formatAboveOneMin(
              dealerCallData.combined.callsAbove1Min,
              dealerCallData.combined.connectedCalls
            ),
            avgConnected: calculateAvgConnected(
              dealerCallData.combined.connectedCalls,
              dealerCallData.combined.duration
            ),
          },
          callLogs: dc,
          avgConnected: calculateAvgConnected(dc.connected, dc.durationSec),
          users: userData,
        };
      })
      .filter(Boolean);

    const dealers = allDealers.length;

    return responses.success(res, "SuperAdmin data fetched", {
      dealers,
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
      dealerData,
    });
  } catch (error) {
    logger.error(`Error in SuperAdmin Dashboard: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

const summaryDashboard = async (req, res) => {
  try {
    const { corporate_id } = req;
    const { dealer_ids, user_id, type, modal, start_date, end_date } =
      req.query;

    const selectedDealerIds = dealer_ids?.split(",") || [];
    const selectedUserIds = user_id?.split(",") || [];
    const selectedModels = modal?.split(",") || [];

    let dateRange = null;
    let prevDateRange = null;

    if (type) {
      const { start, end } = getDateRange(type);
      dateRange = { start, end };

      const currentStart = moment(start);
      const currentEnd = moment(end);
      const periodLength = currentEnd.diff(currentStart, "days") + 1;

      const prevEnd = currentStart.clone().subtract(1, "day");
      const prevStart = prevEnd.clone().subtract(periodLength - 1, "days");

      prevDateRange = {
        start: prevStart.format("YYYY-MM-DD HH:mm:ss"),
        end: prevEnd.format("YYYY-MM-DD HH:mm:ss"),
      };
    } else if (start_date && end_date) {
      dateRange = { start: start_date, end: end_date };

      const currentStart = moment(start_date);
      const currentEnd = moment(end_date);
      const periodLength = currentEnd.diff(currentStart, "days") + 1;

      // Calculate previous period - exact same duration
      const prevEnd = currentStart.clone().subtract(1, "day");
      const prevStart = prevEnd.clone().subtract(periodLength - 1, "days");

      prevDateRange = {
        start: prevStart.format("YYYY-MM-DD HH:mm:ss"),
        end: prevEnd.format("YYYY-MM-DD HH:mm:ss"),
      };
    }

    const dealersWithUsers = await Dealers.findAll({
      where: {
        corporate_id,
        ...(selectedDealerIds.length > 0 && {
          dealer_id: { [Op.in]: selectedDealerIds },
        }),
      },
      include: [
        {
          model: User,
          as: "Users",
          where: {
            deleted: false,
            ...(selectedUserIds.length > 0 && {
              user_id: { [Op.in]: selectedUserIds },
            }),
          },
          attributes: ["user_id", "name"],
          required: false,
        },
      ],
      attributes: ["dealer_id", "dealer_name"],
      raw: false,
    });

    const allDealers = dealersWithUsers.map((d) => ({
      dealer_id: d.dealer_id,
      dealer_name: d.dealer_name,
    }));

    const allUsers = dealersWithUsers.flatMap(
      (d) =>
        d.Users?.map((u) => ({
          user_id: u.user_id,
          name: u.name,
          dealer_id: d.dealer_id,
        })) || []
    );

    const userIds = allUsers.map((u) => u.user_id);
    const dealerIds = allDealers.map((d) => d.dealer_id);

    const defaultModels = await Leads.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("PMI")), "PMI"]],
      where: {
        corporate_id,
        deleted: false,
      },
      raw: true,
    });

    const finalSelectedModels =
      selectedModels.length > 0
        ? selectedModels
        : defaultModels.map((m) => m.PMI);

    const buildCurrentQuery = (
      baseWhere,
      dateField,
      useModelFilter = false
    ) => ({
      ...baseWhere,
      ...(useModelFilter &&
        finalSelectedModels.length > 0 && {
          PMI: { [Op.in]: finalSelectedModels },
        }),
      ...(dateRange && {
        [dateField]: { [Op.between]: [dateRange.start, dateRange.end] },
      }),
    });

    const buildPrevQuery = (baseWhere, dateField, useModelFilter = false) => ({
      ...baseWhere,
      ...(useModelFilter &&
        finalSelectedModels.length > 0 && {
          PMI: { [Op.in]: finalSelectedModels },
        }),
      ...(prevDateRange && {
        [dateField]: { [Op.between]: [prevDateRange.start, prevDateRange.end] },
      }),
    });

    const [
      leadsData,
      prevLeadsData,
      callLogsData,
      prevCallLogsData,
      testDrivesData,
      prevTestDrivesData,
      analyticsData,
      prevAnalyticsData,
    ] = await Promise.all([
      // Current period leads
      Leads.findAll({
        where: buildCurrentQuery(
          { deleted: false, sp_id: { [Op.in]: userIds } },
          "created_at",
          true
        ),
        attributes: [
          "sp_id",
          [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
        ],
        group: ["sp_id"],
        raw: true,
        having: Sequelize.literal("COUNT(*) > 0"),
      }),

      // Previous period leads
      ...(prevDateRange
        ? [
            Leads.findAll({
              where: buildPrevQuery(
                { deleted: false, sp_id: { [Op.in]: userIds } },
                "created_at",
                true
              ),
              attributes: [
                "sp_id",
                [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
              ],
              group: ["sp_id"],
              raw: true,
              having: Sequelize.literal("COUNT(*) > 0"),
            }),
          ]
        : [Promise.resolve([])]),

      // Current call logs with aggregated metrics
      CallLogs.findAll({
        where: buildCurrentQuery(
          { sp_id: { [Op.in]: userIds }, is_excluded: false },
          "call_date"
        ),
        attributes: [
          "sp_id",
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(`CASE WHEN call_type = 'outgoing' THEN 1 END`)
            ),
            "outgoingCalls",
          ],
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(`CASE WHEN call_duration > 0 THEN 1 END`)
            ),
            "connectedCalls",
          ],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.literal(
                `CASE WHEN call_duration > 0 THEN call_duration ELSE 0 END`
              )
            ),
            "totalDuration",
          ],
        ],
        group: ["sp_id"],
        raw: true,
        having: Sequelize.literal("COUNT(*) > 0"),
      }),

      // Previous call logs
      ...(prevDateRange
        ? [
            CallLogs.findAll({
              where: buildPrevQuery(
                { sp_id: { [Op.in]: userIds }, is_excluded: false },
                "call_date"
              ),
              attributes: [
                "sp_id",
                [
                  Sequelize.fn(
                    "COUNT",
                    Sequelize.literal(
                      `CASE WHEN call_type = 'outgoing' THEN 1 END`
                    )
                  ),
                  "outgoingCalls",
                ],
                [
                  Sequelize.fn(
                    "COUNT",
                    Sequelize.literal(`CASE WHEN call_duration > 0 THEN 1 END`)
                  ),
                  "connectedCalls",
                ],
                [
                  Sequelize.fn(
                    "SUM",
                    Sequelize.literal(
                      `CASE WHEN call_duration > 0 THEN call_duration ELSE 0 END`
                    )
                  ),
                  "totalDuration",
                ],
              ],
              group: ["sp_id"],
              raw: true,
              having: Sequelize.literal("COUNT(*) > 0"),
            }),
          ]
        : [Promise.resolve([])]),

      // Current test drives
      Events.findAll({
        where: buildCurrentQuery(
          {
            sp_id: { [Op.in]: userIds },
            subject: "Test Drive",
            deleted: false,
          },
          "created_at"
        ),
        attributes: [
          "sp_id",
          [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
        ],
        group: ["sp_id"],
        raw: true,
        having: Sequelize.literal("COUNT(*) > 0"),
      }),

      // Previous test drives
      ...(prevDateRange
        ? [
            Events.findAll({
              where: buildPrevQuery(
                {
                  sp_id: { [Op.in]: userIds },
                  subject: "Test Drive",
                  deleted: false,
                },
                "created_at"
              ),
              attributes: [
                "sp_id",
                [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
              ],
              group: ["sp_id"],
              raw: true,
              having: Sequelize.literal("COUNT(*) > 0"),
            }),
          ]
        : [Promise.resolve([])]),

      // Current analytics
      Analytics.findAll({
        where: buildCurrentQuery(
          { user_id: { [Op.in]: userIds } },
          "created_at"
        ),
        attributes: [
          "user_id",
          [
            Sequelize.fn(
              "SUM",
              Sequelize.cast(Sequelize.col("retail"), "INTEGER")
            ),
            "retailSum",
          ],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.cast(Sequelize.col("new_orders"), "INTEGER")
            ),
            "newOrdersSum",
          ],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.cast(Sequelize.col("net_orders"), "INTEGER")
            ),
            "netOrdersSum",
          ],
          [
            Sequelize.fn(
              "SUM",
              Sequelize.cast(Sequelize.col("cancellations"), "INTEGER")
            ),
            "cancellationsSum",
          ],
        ],
        group: ["user_id"],
        raw: true,
        having: Sequelize.literal(
          "SUM(CAST(retail AS INTEGER) + CAST(new_orders AS INTEGER) + CAST(net_orders AS INTEGER)) > 0"
        ),
      }),

      // Previous analytics
      ...(prevDateRange
        ? [
            Analytics.findAll({
              where: buildPrevQuery(
                { user_id: { [Op.in]: userIds } },
                "created_at"
              ),
              attributes: [
                "user_id",
                [
                  Sequelize.fn(
                    "SUM",
                    Sequelize.cast(Sequelize.col("retail"), "INTEGER")
                  ),
                  "retailSum",
                ],
                [
                  Sequelize.fn(
                    "SUM",
                    Sequelize.cast(Sequelize.col("new_orders"), "INTEGER")
                  ),
                  "newOrdersSum",
                ],
                [
                  Sequelize.fn(
                    "SUM",
                    Sequelize.cast(Sequelize.col("net_orders"), "INTEGER")
                  ),
                  "netOrdersSum",
                ],
                [
                  Sequelize.fn(
                    "SUM",
                    Sequelize.cast(Sequelize.col("cancellations"), "INTEGER")
                  ),
                  "cancellationsSum",
                ],
              ],
              group: ["user_id"],
              raw: true,
              having: Sequelize.literal(
                "SUM(CAST(retail AS INTEGER) + CAST(new_orders AS INTEGER) + CAST(net_orders AS INTEGER)) > 0"
              ),
            }),
          ]
        : [Promise.resolve([])]),
    ]);

    const createDataMap = (data, keyField, valueTransform) => {
      const map = new Map();
      data.forEach((item) => {
        map.set(item[keyField], valueTransform(item));
      });
      return map;
    };

    // Create lookup maps
    const leadsMap = createDataMap(leadsData, "sp_id", (item) =>
      parseInt(item.count)
    );
    const prevLeadsMap = createDataMap(prevLeadsData, "sp_id", (item) =>
      parseInt(item.count)
    );
    const testDriveMap = createDataMap(testDrivesData, "sp_id", (item) =>
      parseInt(item.count)
    );
    const prevTestDriveMap = createDataMap(
      prevTestDrivesData,
      "sp_id",
      (item) => parseInt(item.count)
    );

    const callMetricsMap = createDataMap(callLogsData, "sp_id", (item) => ({
      outgoingCalls: parseInt(item.outgoingCalls) || 0,
      connectedCalls: parseInt(item.connectedCalls) || 0,
      totalDuration: parseInt(item.totalDuration) || 0,
    }));

    const prevCallMetricsMap = createDataMap(
      prevCallLogsData,
      "sp_id",
      (item) => ({
        outgoingCalls: parseInt(item.outgoingCalls) || 0,
        connectedCalls: parseInt(item.connectedCalls) || 0,
        totalDuration: parseInt(item.totalDuration) || 0,
      })
    );

    const analyticsMap = createDataMap(analyticsData, "user_id", (item) => ({
      retail: +item.retailSum || 0,
      newOrders: +item.newOrdersSum || 0,
      netOrders: +item.netOrdersSum || 0,
      cancellations: +item.cancellationsSum || 0,
    }));

    const prevAnalyticsMap = createDataMap(
      prevAnalyticsData,
      "user_id",
      (item) => ({
        retail: +item.retailSum || 0,
        newOrders: +item.newOrdersSum || 0,
        netOrders: +item.netOrdersSum || 0,
        cancellations: +item.cancellationsSum || 0,
      })
    );

    const targetValues = {
      newInquiry: 2,
      outgoingCalls: 60,
      connectedCalls: 30,
      avgDuration: 120,
      utdPM: 30,
      utdInquiryPct: 50,
      newOrders: 3,
      netOrders: 2.5,
      retail: 3,
      gotPct: 20,
      notPct: 15,
      cancellationPct: 10,
      tdCarDay: 2,
      kmsTds: 5,
    };

    const modelOfVehicle = {
      "New Range Rover": "Range Rover",
      "Range Rover": "Range Rover",
      "New Range Rover Sport": "Range Rover Sport",
      "Range Rover Sport": "Range Rover Sport",
      "Range Rover Velar": "Range Rover Velar",
      Defender: "New Defender",
      "Range Rover Evoque": "All New Range Rover Evoque",
      "New Range Rover Evoque": "All New Range Rover Evoque",
      "Discovery Sport": "Discovery Sport",
      Discovery: "Discovery",
    };

    const calculateGrowth = (current, previous) => {
      if (previous === 0 || previous === null || previous === undefined) {
        return current > 0 ? 100 : 0;
      }

      if (current === 0 || current === null || current === undefined) {
        return -100;
      }

      const growth = ((current - previous) / Math.abs(previous)) * 100;
      return Math.round(growth * 10) / 10;
    };

    const kpi = (name, value, target, prevValue = 0) => {
      const growth = calculateGrowth(value, prevValue);
      const achieved = target > 0 ? Math.round((value / target) * 100) : 0;

      return {
        name,
        value: value || 0,
        target: target || 0,
        achieved,
        growth,
        // Additional debug info
        debug: {
          current: value,
          previous: prevValue,
          growthCalculation: `((${value} - ${prevValue}) / ${Math.abs(
            prevValue
          )}) * 100 = ${growth}%`,
        },
      };
    };

    // Calculate period length for target calculations
    const periodLength = dateRange
      ? moment(dateRange.end).diff(moment(dateRange.start), "days") + 1
      : 1;

    // Helper functions for correct target calculations
    const calculateUTDTarget = (userCount, periodLength) => {
      // UTD target is 30 per month per PS
      const monthlyTarget = targetValues.utdPM * userCount;
      return Math.round((monthlyTarget * periodLength) / 30);
    };

    const calculateMonthlyTarget = (
      monthlyTargetPerPS,
      userCount,
      periodLength
    ) => {
      // Monthly targets should be prorated based on period length
      const monthlyTarget = monthlyTargetPerPS * userCount;
      return Math.round((monthlyTarget * periodLength) / 30);
    };

    const calculateDailyTarget = (
      dailyTargetPerPS,
      userCount,
      periodLength
    ) => {
      // Daily targets multiplied by period length and user count
      return dailyTargetPerPS * userCount * periodLength;
    };

    // STREAMLINED METRIC AGGREGATION
    const aggregateUserMetrics = (userList, includePrevious = false) => {
      let totalDuration = 0,
        totalConnected = 0;
      let prevTotalDuration = 0,
        prevTotalConnected = 0;

      const metrics = userList.reduce(
        (acc, u) => {
          const id = u.user_id;

          // Current period data
          const callData = callMetricsMap.get(id) || {
            outgoingCalls: 0,
            connectedCalls: 0,
            totalDuration: 0,
          };
          const analytics = analyticsMap.get(id) || {
            retail: 0,
            newOrders: 0,
            netOrders: 0,
            cancellations: 0,
          };

          acc.current.newInquiry += leadsMap.get(id) || 0;
          acc.current.outgoingCalls += callData.outgoingCalls;
          acc.current.connectedCalls += callData.connectedCalls;
          acc.current.testDrives += testDriveMap.get(id) || 0;
          acc.current.retail += analytics.retail;
          acc.current.newOrders += analytics.newOrders;
          acc.current.netOrders += analytics.netOrders;
          acc.current.cancellations += analytics.cancellations;

          totalDuration += callData.totalDuration;
          totalConnected += callData.connectedCalls;

          // Previous period data
          if (includePrevious && prevDateRange) {
            const prevCallData = prevCallMetricsMap.get(id) || {
              outgoingCalls: 0,
              connectedCalls: 0,
              totalDuration: 0,
            };
            const prevAnalytics = prevAnalyticsMap.get(id) || {
              retail: 0,
              newOrders: 0,
              netOrders: 0,
              cancellations: 0,
            };

            acc.previous.newInquiry += prevLeadsMap.get(id) || 0;
            acc.previous.outgoingCalls += prevCallData.outgoingCalls;
            acc.previous.connectedCalls += prevCallData.connectedCalls;
            acc.previous.testDrives += prevTestDriveMap.get(id) || 0;
            acc.previous.retail += prevAnalytics.retail;
            acc.previous.newOrders += prevAnalytics.newOrders;
            acc.previous.netOrders += prevAnalytics.netOrders;
            acc.previous.cancellations += prevAnalytics.cancellations;

            prevTotalDuration += prevCallData.totalDuration;
            prevTotalConnected += prevCallData.connectedCalls;
          }

          return acc;
        },
        {
          current: {
            newInquiry: 0,
            outgoingCalls: 0,
            connectedCalls: 0,
            testDrives: 0,
            retail: 0,
            newOrders: 0,
            netOrders: 0,
            cancellations: 0,
          },
          previous: {
            newInquiry: 0,
            outgoingCalls: 0,
            connectedCalls: 0,
            testDrives: 0,
            retail: 0,
            newOrders: 0,
            netOrders: 0,
            cancellations: 0,
          },
        }
      );

      metrics.current.avgDuration =
        totalConnected > 0 ? Math.round(totalDuration / totalConnected) : 0;
      if (includePrevious && prevDateRange) {
        metrics.previous.avgDuration =
          prevTotalConnected > 0
            ? Math.round(prevTotalDuration / prevTotalConnected)
            : 0;
      }

      return includePrevious ? metrics : metrics.current;
    };

    const buildKPIs = (
      metrics,
      prevMetrics,
      userCount = 1,
      calculatePercentages = false
    ) => {
      // Calculate percentage metrics
      const gotEnquiryPct =
        metrics.newInquiry > 0
          ? Math.round((metrics.newOrders / metrics.newInquiry) * 100)
          : 0;

      const notEnquiryPct =
        metrics.newInquiry > 0
          ? Math.round((metrics.netOrders / metrics.newInquiry) * 100)
          : 0;

      const utdEnquiryPct =
        metrics.newInquiry > 0
          ? Math.round((metrics.testDrives / metrics.newInquiry) * 100)
          : 0;

      const cancellationPct =
        metrics.newInquiry > 0
          ? Math.round((metrics.cancellations / metrics.newInquiry) * 100)
          : 0;

      // Calculate previous period percentages for growth calculation
      const prevGotEnquiryPct =
        prevMetrics && prevMetrics.newInquiry > 0
          ? Math.round((prevMetrics.newOrders / prevMetrics.newInquiry) * 100)
          : 0;

      const prevNotEnquiryPct =
        prevMetrics && prevMetrics.newInquiry > 0
          ? Math.round((prevMetrics.netOrders / prevMetrics.newInquiry) * 100)
          : 0;

      const prevUtdEnquiryPct =
        prevMetrics && prevMetrics.newInquiry > 0
          ? Math.round((prevMetrics.testDrives / prevMetrics.newInquiry) * 100)
          : 0;

      const prevCancellationPct =
        prevMetrics && prevMetrics.newInquiry > 0
          ? Math.round(
              (prevMetrics.cancellations / prevMetrics.newInquiry) * 100
            )
          : 0;

      const efforts = {
        "New Enquiry": kpi(
          "New Enquiry",
          metrics.newInquiry,
          calculateDailyTarget(
            targetValues.newInquiry,
            userCount,
            periodLength
          ),
          prevMetrics?.newInquiry || 0
        ),
        "Outgoing Calls": kpi(
          "Outgoing Calls",
          metrics.outgoingCalls,
          calculateDailyTarget(
            targetValues.outgoingCalls,
            userCount,
            periodLength
          ),
          prevMetrics?.outgoingCalls || 0
        ),
        "Unq. Call Connected": kpi(
          "Unq. Call Connected",
          Math.max(0, metrics.outgoingCalls - metrics.connectedCalls),
          targetValues.connectedCalls,
          Math.max(
            0,
            (prevMetrics?.outgoingCalls || 0) -
              (prevMetrics?.connectedCalls || 0)
          )
        ),
        "Avg Duration/call": kpi(
          "Avg Duration/call",
          metrics.avgDuration,
          targetValues.avgDuration,
          prevMetrics?.avgDuration || 0
        ),
        "Avg Connected Calls/PS": kpi(
          "Avg Connected Calls/PS",
          userCount > 0 ? Math.round(metrics.connectedCalls / userCount) : 0,
          targetValues.connectedCalls,
          userCount > 0
            ? Math.round((prevMetrics?.connectedCalls || 0) / userCount)
            : 0
        ),
        UTD: kpi(
          "UTD",
          metrics.testDrives,
          calculateUTDTarget(userCount, periodLength),
          prevMetrics?.testDrives || 0
        ),
        "UTD / Enquiry %": kpi(
          "UTD / Enquiry %",
          utdEnquiryPct,
          targetValues.utdInquiryPct,
          prevUtdEnquiryPct
        ),
      };

      const productivity = {
        "New Orders": kpi(
          "New Orders",
          metrics.newOrders,
          calculateMonthlyTarget(
            targetValues.newOrders,
            userCount,
            periodLength
          ),
          prevMetrics?.newOrders || 0
        ),
        "Net Orders": kpi(
          "Net Orders",
          metrics.netOrders,
          calculateMonthlyTarget(
            targetValues.netOrders,
            userCount,
            periodLength
          ),
          prevMetrics?.netOrders || 0
        ),
        Retails: kpi(
          "Retails",
          metrics.retail,
          calculateMonthlyTarget(targetValues.retail, userCount, periodLength),
          prevMetrics?.retail || 0
        ),
        "GOT/Eng.%": kpi(
          "GOT/Eng.%",
          gotEnquiryPct,
          targetValues.gotPct,
          prevGotEnquiryPct
        ),
        "NOT/Eng.%": kpi(
          "NOT/Eng.%",
          notEnquiryPct,
          targetValues.notPct,
          prevNotEnquiryPct
        ),
        "Cancellation %": kpi(
          "Cancellation %",
          cancellationPct,
          targetValues.cancellationPct,
          prevCancellationPct
        ),
      };

      const otherKpis = {
        "By Test Drive": kpi(
          "By Test Drive",
          metrics.testDrives,
          calculateMonthlyTarget(targetValues.utdPM, userCount, periodLength),
          prevMetrics?.testDrives || 0
        ),
        "TD/Car/Day": kpi(
          "TD/Car/Day",
          userCount > 0 ? Math.round(metrics.testDrives / userCount) : 0,
          targetValues.tdCarDay,
          userCount > 0 && prevMetrics
            ? Math.round((prevMetrics.testDrives || 0) / userCount)
            : 0
        ),
        "KMs/TDs": kpi("KMs/TDs", 0, targetValues.kmsTds, 0),
      };

      const result = { efforts, productivity, otherKpis };

      if (calculatePercentages) {
        const weights = {
          efforts: {
            "New Enquiry": 0.15,
            "Outgoing Calls": 0.15,
            "Unq. Call, Connected": 0.05,
            "Avg Duration/call": 0.1,
            "Avg Connected Calls/PS": 0.1,
            UTD: 0.2,
            "UTD / Enquiry %": 0.25,
          },
          productivity: {
            "New Orders": 0.15,
            "Net Orders": 0.15,
            Retails: 0.2,
            "GOT/Eng.%": 0.15,
            "NOT/Eng.%": 0.15,
            "Cancellation %": 0.2,
          },
          otherKpis: {
            "By Test Drive": 0.5,
            "TD/Car/Day": 0.25,
            "KMs/TDs": 0.25,
          },
        };

        const calculateCategoryPercentage = (kpis, categoryWeights) => {
          return Math.round(
            Object.values(kpis).reduce((total, kpiData) => {
              const weight = categoryWeights[kpiData.name] || 0;
              const achPercent =
                kpiData.target > 0
                  ? Math.min(100, (kpiData.value / kpiData.target) * 100)
                  : 0;
              return total + weight * achPercent;
            }, 0)
          );
        };

        result.categoryPercentages = {
          Efforts: calculateCategoryPercentage(efforts, weights.efforts),
          Productivity: calculateCategoryPercentage(
            productivity,
            weights.productivity
          ),
          "Other KPIs": calculateCategoryPercentage(
            otherKpis,
            weights.otherKpis
          ),
        };
      }

      return result;
    };

    // OPTIMIZATION 10: Use caching for user metrics
    const userMetricsCache = new Map();
    allUsers.forEach((u) => {
      const { current, previous } = aggregateUserMetrics([u], true);
      const kpis = buildKPIs(current, previous);
      userMetricsCache.set(u.user_id, {
        user_id: u.user_id,
        name: u.name,
        dealer_id: u.dealer_id,
        selected: selectedUserIds.includes(u.user_id),
        efforts: kpis.efforts,
        productivity: kpis.productivity,
        otherKpis: kpis.otherKpis,
      });
    });

    // Build dealer data efficiently
    const dealerData = allDealers.map((dealer) => {
      const dealerUsers = allUsers.filter(
        (u) => u.dealer_id === dealer.dealer_id
      );
      const { current, previous } = aggregateUserMetrics(dealerUsers, true);
      const kpis = buildKPIs(current, previous, dealerUsers.length);

      return {
        dealer_id: dealer.dealer_id,
        dealer_name: dealer.dealer_name,
        selected: selectedDealerIds.includes(dealer.dealer_id),
        userCount: dealerUsers.length,
        efforts: kpis.efforts,
        productivity: kpis.productivity,
        otherKpis: kpis.otherKpis,
        users: dealerUsers.map((u) => userMetricsCache.get(u.user_id)),
      };
    });

    // Build aggregated metrics
    const { current: allUserMetrics, previous: allUserPrevMetrics } =
      aggregateUserMetrics(allUsers, true);
    const userAggregatedMetrics = buildKPIs(
      allUserMetrics,
      allUserPrevMetrics,
      allUsers.length,
      true
    );
    const dealerAggregatedMetrics = buildKPIs(
      allUserMetrics,
      allUserPrevMetrics,
      allUsers.length,
      true
    );

    let selectedUserAggregatedMetrics = null;
    let selectedDealerAggregatedMetrics = null;
    let selectedUsers = null;
    let selectedDealers = null;

    if (selectedUserIds.length > 0) {
      const filteredUsers = allUsers.filter((u) =>
        selectedUserIds.includes(u.user_id)
      );
      const { current, previous } = aggregateUserMetrics(filteredUsers, true);
      selectedUserAggregatedMetrics = buildKPIs(
        current,
        previous,
        filteredUsers.length,
        true
      );
      selectedUsers = filteredUsers.map((u) => userMetricsCache.get(u.user_id));
    }

    if (selectedDealerIds.length > 0) {
      const filteredDealers = dealerData.filter((d) => d.selected);
      const allSelectedDealerUsers = allUsers.filter((u) =>
        selectedDealerIds.includes(u.dealer_id)
      );
      const { current, previous } = aggregateUserMetrics(
        allSelectedDealerUsers,
        true
      );

      selectedDealerAggregatedMetrics = buildKPIs(
        current,
        previous,
        allSelectedDealerUsers.length,
        true
      );
      selectedDealers = filteredDealers;
    }

    // Models with names
    const modelsWithNames = defaultModels.map((m) => ({
      model: m.PMI,
      model_name: modelOfVehicle[m.PMI] || m.PMI,
      selected: selectedModels.includes(m.PMI),
    }));
    // Build final response
    const response = {
      success: true,
      dealers: dealerData,
      models: modelsWithNames,
      period: dateRange,
      selectedDealers:
        selectedDealerIds.length > 0 ? selectedDealerIds : dealerIds,
      selectedUsers:
        selectedUserIds.length > 0
          ? selectedUserIds
          : allUsers.map((u) => u.user_id),
      selectedModels: finalSelectedModels,
      userAggregatedMetrics,
      dealerAggregatedMetrics,
    };

    // Add conditional fields
    if (selectedUserAggregatedMetrics)
      response.selectedUserAggregatedMetrics = selectedUserAggregatedMetrics;
    if (selectedDealerAggregatedMetrics)
      response.selectedDealerAggregatedMetrics =
        selectedDealerAggregatedMetrics;
    if (selectedUsers) response.selectedUsers = selectedUsers;
    if (selectedDealers) response.selectedDealers = selectedDealers;

    return res.json(response);
  } catch (err) {
    console.error("Dashboard Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

const getTrendChart = async (req, res) => {
  try {
    let {
      dealer_ids = [],
      type = "DAY",
      timezone = "Asia/Kolkata",
    } = req.query;

    if (!Array.isArray(dealer_ids)) {
      dealer_ids = dealer_ids
        ? dealer_ids.split(",").map((id) => id.trim())
        : [];
    }

    const { start, end } = getDateRange(type, timezone);

    // 1️⃣ Fetch users only once
    const allUsers = await User.findAll({
      where: { deleted: false },
      attributes: ["user_id", "dealer_id", "name", "user_role"],
      raw: true,
    });

    const spToDealer = Object.fromEntries(
      allUsers.map((u) => [u.user_id, u.dealer_id])
    );

    const dealerUserIds = dealer_ids.length
      ? allUsers
          .filter((u) => dealer_ids.includes(u.dealer_id))
          .map((u) => u.user_id)
      : allUsers.map((u) => u.user_id);

    // 2️⃣ Run DB calls in parallel (no dependency between them)
    const [
      activeDealersWithNames,
      allLeadMobiles,
      leads,
      testDrives,
      followups,
      calls,
      userLogins,
      distinctUsers,
    ] = await Promise.all([
      Dealers.findAll({
        attributes: ["dealer_id", "dealer_name"],
        where: {
          ...(dealer_ids.length ? { dealer_id: { [Op.in]: dealer_ids } } : {}),
        },
        raw: true,
      }),

      Leads.findAll({
        attributes: ["mobile", "sp_id", "dealer_id"],
        where: {
          deleted: false,
          ...(dealer_ids.length ? { dealer_id: { [Op.in]: dealer_ids } } : {}),
        },
        raw: true,
      }),

      Leads.findAll({
        where: {
          deleted: false,
          ...(dealer_ids.length ? { dealer_id: { [Op.in]: dealer_ids } } : {}),
          created_at: { [Op.between]: [start, end] },
          [Op.and]: [{ created_at: { [Op.notLike]: "%00:__:_%" } }],
        },
        attributes: ["created_at", "dealer_id", "sp_id", "from_cxp"],
        raw: true,
      }),

      Events.findAll({
        where: {
          ...(dealer_ids.length ? { dealer_id: { [Op.in]: dealer_ids } } : {}),
          subject: "Test Drive",
          created_at: { [Op.between]: [start, end] },
        },
        attributes: ["created_at", "dealer_id", "sp_id", "lead_id"],
        raw: true,
      }),

      Tasks.findAll({
        where: {
          ...(dealer_ids.length ? { dealer_id: { [Op.in]: dealer_ids } } : {}),
          created_at: { [Op.between]: [start, end] },
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

      UserActivity.count({
        distinct: true,
        col: "userId",
        where: {
          userId: { [Op.in]: dealerUserIds },
          created_at: { [Op.between]: [start, end] },
        },
      }),
    ]);

    // 3️⃣ Precompute sets for fast lookup
    const leadMobileSet = new Set(allLeadMobiles.map((l) => l.mobile));

    // 4️⃣ Filter calls directly using the set
    const enquiryCalls = [];
    const coldCalls = [];

    for (const c of calls) {
      (leadMobileSet.has(c.mobile) ? enquiryCalls : coldCalls).push(c);
    }

    // 5️⃣ Aggregate top card stats efficiently
    const saLeads = leads.filter((l) => l.from_cxp === false).length;
    const digitalLeads = leads.length - saLeads;
    const uniqueTestDrives = new Set(testDrives.map((td) => td.lead_id)).size;

    const topCards = {
      leads: leads.length,
      saLeads,
      digitalLeads,
      utd: uniqueTestDrives,
      testDrives: testDrives.length,
      followups: followups.length,
      enquiryCalls: enquiryCalls.length,
      coldCalls: coldCalls.length,
      calls: calls.length,
      lastLogin: userLogins.length,
      distinctUsers,
    };

    const isDayFilter = type === "DAY" || type === "YESTERDAY";
    const uniqueTestDriveRecords = Array.from(
      new Map(testDrives.map((td) => [td.lead_id, td])).values()
    );

    // 6️⃣ Chart generation optimized
    const makeCharts = (data, hourData, tz) => ({
      leads: groupData(data.leads, "created_at", type, tz),
      testDrives: groupData(data.testDrives, "created_at", type, tz),
      utd: groupData(data.utd, "created_at", type, tz),
      followups: groupData(data.followups, "created_at", type, tz),
      enquiryCalls: groupData(
        data.enquiryCalls,
        isDayFilter ? "start_time" : "call_date",
        type,
        tz
      ),
      coldCalls: groupData(
        data.coldCalls,
        isDayFilter ? "start_time" : "call_date",
        type,
        tz
      ),
      calls: groupData(
        data.calls,
        isDayFilter ? "start_time" : "call_date",
        type,
        tz
      ),
      lastLogin: groupData(data.lastLogin, "created_at", type, tz),
    });

    let leftCharts = {};
    let rightCharts = {};

    if (!dealer_ids.length) {
      const data = {
        leads,
        testDrives,
        utd: uniqueTestDriveRecords,
        followups,
        enquiryCalls,
        coldCalls,
        calls,
        lastLogin: userLogins,
      };

      leftCharts = makeCharts(data, false, timezone);
      rightCharts = {
        leads: groupDataByHour(leads, "created_at", timezone),
        testDrives: groupDataByHour(testDrives, "created_at", timezone),
        utd: groupDataByHour(uniqueTestDriveRecords, "created_at", timezone),
        followups: groupDataByHour(followups, "created_at", timezone),
        enquiryCalls: groupDataByHour(enquiryCalls, "start_time", timezone),
        coldCalls: groupDataByHour(coldCalls, "start_time", timezone),
        calls: groupDataByHour(calls, "start_time", timezone),
        lastLogin: groupDataByHour(userLogins, "created_at", timezone),
      };
    } else {
      for (const dId of dealer_ids) {
        const dealerName =
          activeDealersWithNames.find((d) => d.dealer_id == dId)?.dealer_name ||
          `Dealer ${dId}`;

        const dealerLeads = leads.filter((l) => l.dealer_id == dId);
        const dealerTestDrives = testDrives.filter((t) => t.dealer_id == dId);
        const dealerUniqueTD = Array.from(
          new Map(dealerTestDrives.map((td) => [td.lead_id, td])).values()
        );
        const dealerFollowups = followups.filter((f) => f.dealer_id == dId);
        const dealerCalls = calls.filter((c) => spToDealer[c.sp_id] == dId);
        const dealerEnquiryCalls = enquiryCalls.filter(
          (c) => spToDealer[c.sp_id] == dId
        );
        const dealerColdCalls = coldCalls.filter(
          (c) => spToDealer[c.sp_id] == dId
        );
        const dealerLogins = userLogins.filter(
          (u) => spToDealer[u.userId] == dId
        );

        const data = {
          leads: dealerLeads,
          testDrives: dealerTestDrives,
          utd: dealerUniqueTD,
          followups: dealerFollowups,
          enquiryCalls: dealerEnquiryCalls,
          coldCalls: dealerColdCalls,
          calls: dealerCalls,
          lastLogin: dealerLogins,
        };

        leftCharts[dealerName] = makeCharts(data, false, timezone);
        rightCharts[dealerName] = {
          leads: groupDataByHour(dealerLeads, "created_at", timezone),
          testDrives: groupDataByHour(dealerTestDrives, "created_at", timezone),
          utd: groupDataByHour(dealerUniqueTD, "created_at", timezone),
          followups: groupDataByHour(dealerFollowups, "created_at", timezone),
          enquiryCalls: groupDataByHour(
            dealerEnquiryCalls,
            "start_time",
            timezone
          ),
          coldCalls: groupDataByHour(dealerColdCalls, "start_time", timezone),
          calls: groupDataByHour(dealerCalls, "start_time", timezone),
          lastLogin: groupDataByHour(dealerLogins, "created_at", timezone),
        };
      }
    }

    // 7️⃣ PS-wise aggregation optimized
    const usersByDealer = allUsers.reduce((acc, user) => {
      if (!acc[user.dealer_id]) acc[user.dealer_id] = [];
      acc[user.dealer_id].push(user);
      return acc;
    }, {});

    const aggregate = (arr, keyField) =>
      arr.reduce((acc, r) => {
        acc[r[keyField]] = (acc[r[keyField]] || 0) + 1;
        return acc;
      }, {});

    const leadCounts = aggregate(leads, "sp_id");
    const saLeadCounts = aggregate(
      leads.filter((l) => !l.from_cxp),
      "sp_id"
    );
    const tdCounts = aggregate(testDrives, "sp_id");
    const taskCounts = aggregate(followups, "sp_id");
    const enquiryCallCounts = aggregate(enquiryCalls, "sp_id");
    const coldCallCounts = aggregate(coldCalls, "sp_id");
    const callCounts = aggregate(calls, "sp_id");
    const loginCounts = aggregate(userLogins, "userId");

    const utdCounts = {};
    for (const t of testDrives) {
      if (!utdCounts[t.sp_id]) utdCounts[t.sp_id] = new Set();
      utdCounts[t.sp_id].add(t.lead_id);
    }

    const psWiseActivity = {};
    for (const dealerId of Object.keys(usersByDealer)) {
      const dealerInfo = activeDealersWithNames.find(
        (d) => d.dealer_id == dealerId
      );
      const dealerName = dealerInfo
        ? dealerInfo.dealer_name
        : `Dealer ${dealerId}`;

      psWiseActivity[dealerName] = usersByDealer[dealerId].map((user) => ({
        user_id: user.user_id,
        name: user.name,
        role: user.user_role,
        leads: leadCounts[user.user_id] || 0,
        saLeads: saLeadCounts[user.user_id] || 0,
        testDrives: tdCounts[user.user_id] || 0,
        uniquetestDrives: utdCounts[user.user_id]
          ? utdCounts[user.user_id].size
          : 0,
        followups: taskCounts[user.user_id] || 0,
        enquiryCalls: enquiryCallCounts[user.user_id] || 0,
        coldCalls: coldCallCounts[user.user_id] || 0,
        calls: callCounts[user.user_id] || 0,
        lastLogin: loginCounts[user.user_id] || 0,
        target: 0,
      }));
    }

    return res.json({
      success: true,
      filterType: type,
      range: { start, end },
      dealerCount: dealer_ids.length || "All Dealers",
      activeDealers: activeDealersWithNames,
      topCards,
      left: leftCharts,
      right: rightCharts,
      psWiseActivity,
    });
  } catch (err) {
    console.error("Trend Controller Error:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong",
      details: err.message,
    });
  }
};

module.exports = {
  newSuperAdminDashboard,
  dashboardReport,
  getTrendChart,
  summaryDashboard,
};
