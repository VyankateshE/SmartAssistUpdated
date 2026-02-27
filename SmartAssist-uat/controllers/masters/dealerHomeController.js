const { Op, col, fn } = require("sequelize");
const Events = require("../../models/transactions/eventModel");
const dateController = require("../../utils/dateFilter");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");
const User = require("../../models/master/usersModel");
const Leads = require("../../models/transactions/leadsModel");
const TeamMaster = require("../../models/master/teamMasterModel");
const CallLogs = require("../../models/transactions/callLogsModel");
const Analytics = require("../../models/master/analyticsModel");
const { getDateRange } = require("../../utils/filterType");
const Tasks = require("../../models/transactions/taskModel");
const Targets = require("../../models/master/targetMasterModel");

const dealerHome = async (req, res) => {
  const { dealerId } = req;
  const { user_id, sm_id, type } = req.query;
  const { start, end } = getDateRange(type);
  const analyticsTypes = ["MTD", "QTD", "YTD"];
  const analyticsRange = analyticsTypes.includes(type) ? type : "MTD";

  try {
    // fetch SM list and teams name
    const [smList, teamNames] = await Promise.all([
      User.findAll({
        attributes: ["user_id", "fname", "lname", "team_id"],
        where: {
          dealer_id: dealerId,
          user_role: "SM",
          deleted: false,
        },
        raw: true,
      }),
      TeamMaster.findAll({
        attributes: ["team_id", "team_name"],

        where: { dealer_id: dealerId },
        raw: true,
      }),
    ]);

    const teamNamesMap = Object.fromEntries(
      teamNames.map((t) => [t.team_id, t.team_name])
    );
    const allTeamIds = smList.map((sm) => sm.team_id);

    // ===== Fetch PS Users =====
    const psUsers = await User.findAll({
      where: {
        team_id: { [Op.in]: allTeamIds },
        user_role: "PS",
        deleted: false,
      },
      attributes: ["user_id", "fname", "lname", "team_id"],
      raw: true,
    });
    const ps_userIds = psUsers.map((u) => u.user_id);

    // ===  Fetch: Test Drives, Enquiries, Analytics ===
    const [
      tableTestDrives_today,
      tableTestDrives_oneweek,
      enquiries,
      testDrives,
      analytics,
    ] = await Promise.all([
      // Today's test drives
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
        order: [["start_date", "DESC"]],
        raw: true,
      }),
      // Next week test drives
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
            [Op.gt]: dateController.todayDate,
            [Op.lte]: dateController.oneWeekLaterDate,
          },
          [Op.or]: [{ favourite: true }, { favourite: null }],
        },
        order: [["start_date", "DESC"]],
        raw: true,
      }),
      Leads.findAll({
        where: {
          sp_id: { [Op.in]: ps_userIds },
          deleted: false,
          status: { [Op.ne]: "Lost" },
          created_at: {
            [Op.between]: [start, end],
          },
        },
        attributes: ["sp_id", [fn("COUNT", col("lead_id")), "count"]],

        group: ["sp_id"],
        raw: true,
      }),
      Events.findAll({
        where: {
          sp_id: { [Op.in]: ps_userIds },
          subject: "Test Drive",
          deleted: false,
          created_at: {
            [Op.between]: [start, end],
          },
        },
        attributes: ["sp_id", [fn("COUNT", col("event_id")), "count"]],

        raw: true,
        group: ["sp_id"],
      }),
      Analytics.findAll({
        where: {
          dealer_id: dealerId,
          range: analyticsRange,
        },
        attributes: [
          "user_id",
          "user_name",
          "user_email",
          "dealer_id",
          "retail",
          "net_orders",
          "unique_td",
          "new_orders",
          "cancellations",
          "team_id",
          "dealer_id",
        ],
        raw: true,
      }),
    ]);

    const enquiryMap = Object.fromEntries(
      enquiries.map((l) => [l.sp_id, Number(l.count)])
    );

    const testDriveMap = Object.fromEntries(
      testDrives.map((l) => [l.sp_id, Number(l.count)])
    );
    const analyticsMap = Object.fromEntries(
      analytics.map((a) => [a.user_id, a])
    );
    // ======== SM Data ========
    const smData = smList.map((sm) => {
      const psInTeam = psUsers.filter((ps) => ps.team_id === sm.team_id);
      const totals = psInTeam.reduce(
        (acc, ps) => {
          const psAnalytics = analyticsMap[ps.user_id] || {};
          acc.enquiries += enquiryMap[ps.user_id] || 0;
          acc.testDrives += testDriveMap[ps.user_id] || 0;
          acc.orders += Number(psAnalytics.new_orders || 0);
          acc.cancellations += Number(psAnalytics.cancellations || 0);
          acc.net_orders += Number(psAnalytics.net_orders || 0);
          acc.retail += Number(psAnalytics.retail || 0);
          return acc;
        },
        {
          enquiries: 0,
          testDrives: 0,
          orders: 0,
          cancellations: 0,
          net_orders: 0,
          retail: 0,
        }
      );

      const result = {
        sm_id: sm.user_id,
        sm_name: `${sm.fname} ${sm.lname}`,
        team_id: sm.team_id,
        team_name: teamNamesMap[sm.team_id],
        ...totals,
      };

      if (sm_id && sm.user_id === sm_id) {
        result.ps_list = psInTeam.map((ps) => ({
          ps_id: ps.user_id,
          ps_fname: ps.fname,
          ps_lname: ps.lname,
          enquiries: enquiryMap[ps.user_id] || 0,
          testDrives: testDriveMap[ps.user_id] || 0,
          orders: Number((analyticsMap[ps.user_id] || {}).new_orders || 0),
          cancellation: Number(
            (analyticsMap[ps.user_id] || {}).cancellations || 0
          ),
          net_orders: Number((analyticsMap[ps.user_id] || {}).net_orders || 0),
          retail: Number((analyticsMap[ps.user_id] || {}).retail || 0),
        }));
      }

      return result;
    });

    // ========================= Selected User Details =========================
    let selectedUser = null;
    if (user_id) {
      const [
        upcoming,
        completed,
        overdue,
        user,
        enqBank,
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
        // Upcoming
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
          order: [["start_date", "DESC"]],
          raw: true,
        }),
        // Completed
        Events.findAll({
          attributes: ["name", "subject", "PMI"],
          where: {
            dealer_id: dealerId,
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
        // Overdue
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
          raw: true,
        }),

        User.findOne({
          where: { user_id: user_id },
          attributes: ["fname", "lname", "dealer_id"],
          raw: true,
        }),

        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            status: { [Op.notIn]: ["Qualified", "Lost"] },
            sp_id: user_id,
            deleted: false,
          },
          raw: true,
        }),
        Leads.findAll({
          attributes: ["mobile"],
          where: {
            sp_id: user_id,
            deleted: false,
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
            is_excluded: {
              [Op.not]: true,
            },
            call_date: {
              [Op.between]: [start, end],
            },
          },
          raw: true,
        }),

        // Enquiries
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        // Lost Enquiries
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
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
            sp_id: user_id,
            status: "Lost",
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        // Digital Enquiries
        Leads.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),

        // Test Drives
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          group: ["lead_id"],
          raw: true,
        }),
        //All testdrives
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: user_id,
            subject: "Test Drive",
            deleted: false,
            created_at: { [Op.between]: [start, end] },
          },
          raw: true,
        }),
        Analytics.findOne({
          where: {
            user_id: user_id,
            range: analyticsRange,
          },
          raw: true,
        }),
        Targets.findOne({
          attributes: ["enquiries", "testDrives", "orders"],
          where: { dealer_id: dealerId, user_id },
        }),
      ]);

      const leadMobile = new Set(leads.map(({ mobile }) => mobile));
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

      const formatTypeLogs = (call_date, start_time, type) => {
        const dt = new Date(call_date);
        if (type === "DAY") {
          return Number(start_time?.slice(0, 2));
        } else if (type === "WEEK") {
          return dt.toLocaleDateString("en-US", { weekday: "short" });
        } else if (type === "MTD") {
          const day = dt.getDate();
          if (day <= 7) return "Week 1";
          else if (day <= 14) return "Week 2";
          else if (day <= 21) return "Week 3";
          else return "Week 4";
        } else if (type === "QTD") {
          return dt.toLocaleDateString("en-US", { month: "short" });
        } else if (type === "YTD") {
          const month = dt.getMonth();
          if (month <= 2) return "Q1";
          else if (month <= 5) return "Q2";
          else if (month <= 8) return "Q3";
          else return "Q4";
        }
      };
      const validTypes = ["incoming", "outgoing", "missed", "rejected"];
      for (const {
        call_type,
        start_time,
        call_duration,
        call_date,
        mobile,
      } of callLogs) {
        if (!validTypes.includes(call_type)) continue;

        const isLead = leadMobile.has(mobile);
        const key = isLead ? "lead" : "nonlead";
        const stats = SummaryMap[key];
        stats.dates.add(call_date);

        const formatType = formatTypeLogs(call_date, start_time, type);
        stats.hourly[formatType] ||= {
          AllCalls: { calls: 0, duration: 0 },
          connected: { calls: 0, duration: 0 },
          missedCalls: 0,
        };
        stats.hourly[formatType].AllCalls.calls++;
        stats.hourly[formatType].AllCalls.duration += call_duration;
        if (call_type === "missed") stats.hourly[formatType].missedCalls++;
        if (call_duration > 0) {
          stats.hourly[formatType].connected.calls++;
          stats.hourly[formatType].connected.duration += call_duration;
        }

        const addSummary = (type) => {
          stats.summary[type] ||= {
            calls: 0,
            duration: 0,
            uniqueClients: new Set(),
          };
          stats.summary[type].calls++;
          stats.summary[type].duration += call_duration;
          stats.summary[type].uniqueClients.add(mobile);
        };

        addSummary("All Calls");
        if (call_type === "missed") addSummary("Missed");
        if (call_type === "rejected") addSummary("Rejected");
        if (call_duration > 0) {
          addSummary("Connected");
          stats.totalConnected++;
          stats.totalConversation += call_duration;
        }
        if (["missed", "rejected"].includes(call_type)) {
          stats.missedCalls++;
        }
      }

      const formatDuration = (duration) => {
        const h = Math.floor(duration / 3600);
        const m = Math.floor((duration % 3600) / 60);
        const s = duration % 60;
        return `${h ? `${h}h ` : `${0}h`} ${m ? `${m}m ` : `${0}m`} ${
          s ? `${s}s` : `${0}s`
        }`;
      };

      const processLogs = (data) => ({
        totalConnected: data.totalConnected,
        conversationTime: formatDuration(data.totalConversation),
        notConnected: data.missedCalls,
        summary: Object.fromEntries(
          Object.entries(data.summary).map(([k, v]) => [
            k,
            {
              calls: v.calls,
              duration: formatDuration(v.duration),
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
                duration: formatDuration(s.AllCalls.duration),
              },
              Connected: {
                calls: s.connected.calls,
                duration: formatDuration(s.connected.duration),
              },
              missedCalls: s.missedCalls,
            },
          ])
        ),
      });

      const newEnquiries = enquiries.length;
      const uniqueTestDrives = testDrives.length;

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

      let followupsPerLostEnquiry = 0;
      for (let lead of lostEnquiries) {
        const followUps = await Tasks.count({
          where: {
            lead_id: lead.lead_id,
            sp_id: user_id,
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
            sp_id: user_id,
            deleted: false,
            created_at: {
              [Op.gt]: lead.lost_created_at,
            },
          },
        });
        followupsPerLostDigitalEnquiry += followUps;
      }

      selectedUser = {
        fname: user.fname,
        lname: user.lname,
        upcomingTestDrives: upcoming,
        completedTestDrives: completed,
        overdueTestDrives: overdue,
        summaryEnquiry: processLogs(SummaryMap.lead),
        summaryColdCalls: processLogs(SummaryMap.nonlead),
        performance: {
          newEnquiries,
          lostEnquiries: lostEnquiries.length,
          enquiriesToAchieveTarget: Math.max(enquiryTarget - newEnquiries, 0),
          followupsPerLostEnquiry,
          avgEnquiry: Number(analyticsData?.avg_enq_to_ord_days) || 0,
          enquiryBank: enqBank.length,
          followupsPerLostDigitalEnquiry: digitalLostEnquiries.length
            ? followupsPerLostDigitalEnquiry / digitalLostEnquiries.length
            : 0,
          uniqueTestDrives,
          remainingTestDrives: Math.max(testDriveTarget - uniqueTestDrives, 0),
          TestDrivesAvg: Number(analyticsData?.avg_td_to_ord_days) || 0,
          enquiryToUniqueTestdriveRatio: newEnquiries
            ? Number(((uniqueTestDrives / newEnquiries) * 100).toFixed(2))
            : 0,
          testDriveRatio: newEnquiries
            ? Number(((allTestDrives.length / newEnquiries) * 100).toFixed(2))
            : 0,
          orders,
          net_orders,
          retail,
          cancellations,
          orderTarget,
          contributionToDealershipmsg: cancellation_contribution,
          TestDriveToRetail: td_to_retail,
          UTestDriveToRetail: utd_to_retail,
          digitalEnquiryToOrderRatio:
            digitalEnquiries.length > 0
              ? Number((orders / digitalEnquiries.length).toFixed(2))
              : 0,
        },
      };
    }
    return responses.success(res, "Dealer data fetched", {
      tableTestDrives_today,
      tableTestDrives_oneweek,
      smData,
      ...(selectedUser && { selectedUser }),
    });
  } catch (error) {
    logger.error(`Error in dealerHome: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

module.exports = { dealerHome };
