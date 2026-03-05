const { Op } = require("sequelize");
const logger = require("../../middlewares/fileLogs/logger");
const Analytics = require("../../models/master/analyticsModel");
const Dealers = require("../../models/master/dealerModel");
const SuperAdmin = require("../../models/master/superAdminModel");
const User = require("../../models/master/usersModel");
const CallLogs = require("../../models/transactions/callLogsModel");
const Events = require("../../models/transactions/eventModel");
const Leads = require("../../models/transactions/leadsModel");
const { getDateRange } = require("../../utils/filterType");
const responses = require("../../utils/globalResponse");
const dateController = require("../../utils/dateFilter");
const Targets = require("../../models/master/targetMasterModel");
const Tasks = require("../../models/transactions/taskModel");

const newSuperAdminDashboard = async (req, res) => {
  const { corporate_id } = req;
  const { dealer_id, user_id, type, start_date, end_date } = req.query;
  const analyticsRange = ["MTD", "QTD", "YTD"].includes(type) ? type : "MTD";
  let dateRange = null;
  if (type) {
    const { start, end } = getDateRange(type);
    dateRange = { start, end };
  } else if (start_date && end_date) {
    dateRange = { start: start_date, end: end_date };
  }

  const formatDuration = (duration) => {
    const h = Math.floor(duration / 3600);
    const m = Math.floor((duration % 3600) / 60);
    const s = duration % 60;
    return `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${s ? `${s}s` : ""}`.trim();
  };

  const parseDuration = (duration) => {
    if (!duration || duration.trim() === "") return 0;
    let seconds = 0;
    const parts = duration.trim().split(/\s+/);
    for (const part of parts) {
      if (part.endsWith("h")) {
        seconds += parseInt(part.slice(0, -1)) * 3600;
      } else if (part.endsWith("m")) {
        seconds += parseInt(part.slice(0, -1)) * 60;
      } else if (part.endsWith("s")) {
        seconds += parseInt(part.slice(0, -1));
      }
    }
    return seconds;
  };

  try {
    const superAdmin = await SuperAdmin.findOne({
      attributes: ["corporate_id"],
      where: { corporate_id },
      raw: true,
    });

    // fetch all dealers
    const allDealers = await Dealers.findAll({
      attributes: ["dealer_id", "dealer_name", "dealer_email", "corporate_id"],
      where: { corporate_id: superAdmin.corporate_id },
      raw: true,
    });

    // dealer-level data
    const dealerData = await Promise.all(
      allDealers.map(async (dealer) => {
        // Fetch all users for the dealer (no role filtering)
        const allUsers = await User.findAll({
          attributes: ["user_id", "fname", "lname", "user_role", "password"],
          where: {
            dealer_id: dealer.dealer_id,
            deleted: false,
          },
          raw: true,
        });

        const UserIds = allUsers.map((u) => u.user_id);

        // Calculate user counts
        const totalUsersCount = allUsers.length;
        const activeUsersCount = allUsers.filter(
          (user) =>
            user.password !== null &&
            user.password !== undefined &&
            user.password !== ""
        ).length;

        // Fetch dealer-level metrics (total counts)
        const [
          upComingFollowups,
          overdueFollowups,
          enquiries,
          lostEnquiries,
          testDrives,
          analyticsData,
          callLogs,
        ] = await Promise.all([
          // Upcoming Follow-ups
          Tasks.findAndCountAll({
            where: {
              dealer_id: dealer.dealer_id,
              deleted: false,
              status: { [Op.ne]: "Completed" },
              due_date: {
                [Op.between]: [
                  dateController.todayDate,
                  dateController.oneWeekLaterDate,
                ],
              },
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

          // Overdue follow-ups
          Tasks.findAndCountAll({
            where: {
              dealer_id: dealer.dealer_id,
              deleted: false,
              due_date: {
                [Op.between]: [
                  dateController.oneWeekBeforeDate,
                  dateController.yesterdayDate,
                ],
              },
              status: { [Op.ne]: "Completed" },
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

          Leads.count({
            where: {
              dealer_id: dealer.dealer_id,
              status: { [Op.ne]: "Lost" },
              deleted: false,
              created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            },
            raw: true,
          }),

          // Lost Enquiries
          Leads.count({
            where: {
              dealer_id: dealer.dealer_id,
              status: "Lost",
              deleted: false,
              created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            },
            raw: true,
          }),

          Events.count({
            where: {
              dealer_id: dealer.dealer_id,
              subject: "Test Drive",
              deleted: false,
              created_at: { [Op.between]: [dateRange.start, dateRange.end] },
            },
            distinct: true,
            col: "lead_id",
            raw: true,
          }),

          Analytics.findAll({
            where: {
              dealer_id: dealer.dealer_id,
              range: analyticsRange,
            },
            attributes: ["cancellations", "new_orders", "net_orders", "retail"],
            raw: true,
          }),

          CallLogs.findAll({
            where: {
              sp_id: { [Op.in]: UserIds },
              is_excluded: { [Op.not]: true },
              call_date: { [Op.between]: [dateRange.start, dateRange.end] },
            },
            attributes: ["sp_id", "call_type", "call_duration"],
            raw: true,
          }),
        ]);

        const totals = analyticsData.reduce(
          (acc, curr) => ({
            cancellations: acc.cancellations + Number(curr.cancellations || 0),
            orders: acc.orders + Number(curr.new_orders || 0),
            net_orders: acc.net_orders + Number(curr.net_orders || 0),
            retail: acc.retail + Number(curr.retail || 0),
          }),
          { cancellations: 0, orders: 0, net_orders: 0, retail: 0 }
        );

        // call log stats for dealer
        const callStats = {};
        for (const u of allUsers) {
          callStats[u.user_id] = {
            name: `${u.fname} ${u.lname}`,
            outgoing: 0,
            incoming: 0,
            connected: 0,
            declined: 0,
            duration: 0,
          };
        }

        for (const { sp_id, call_type, call_duration } of callLogs) {
          const stats = callStats[sp_id];
          if (!stats) continue;

          if (call_type === "outgoing" || call_type === "incoming") {
            stats[call_type]++;
          }
          if (call_duration > 0) {
            stats.connected++;
            stats.duration += call_duration;
          } else if (call_type === "rejected") {
            stats.declined++;
          }
        }

        const logsStatus = Object.values(callStats).map((calls) => ({
          ...calls,
          duration: formatDuration(calls.duration),
        }));

        const dealerCallStats = logsStatus.reduce(
          (acc, curr) => ({
            outgoing: acc.outgoing + curr.outgoing,
            incoming: acc.incoming + curr.incoming,
            connected: acc.connected + curr.connected,
            declined: acc.declined + curr.declined,
            duration: acc.duration + (parseDuration(curr.duration) || 0),
          }),
          {
            outgoing: 0,
            incoming: 0,
            connected: 0,
            declined: 0,
            duration: 0,
          }
        );

        dealerCallStats.duration = formatDuration(dealerCallStats.duration);

        // Fetch user data (only include if dealer_id matches)
        let userData = [];

        if (dealer.dealer_id === dealer_id) {
          // Fetch user-level analytics and call logs
          const [userAnalytics, userCallLogs] = await Promise.all([
            Analytics.findAll({
              where: {
                dealer_id: dealer.dealer_id,
                user_id: { [Op.in]: UserIds },
                range: analyticsRange,
              },
              attributes: [
                "user_id",
                "retail",
                "new_orders",
                "net_orders",
                "cancellations",
              ],
              raw: true,
            }),
            CallLogs.findAll({
              where: {
                sp_id: { [Op.in]: UserIds },
                is_excluded: { [Op.not]: true },
                call_date: { [Op.between]: [dateRange.start, dateRange.end] },
              },
              attributes: ["sp_id", "call_type", "call_duration"],
              raw: true,
            }),
          ]);

          // call stats for users
          const userCallStats = {};
          for (const u of allUsers) {
            userCallStats[u.user_id] = {
              name: `${u.fname} ${u.lname}`,
              outgoing: 0,
              incoming: 0,
              connected: 0,
              declined: 0,
              duration: 0,
            };
          }

          for (const { sp_id, call_type, call_duration } of userCallLogs) {
            const stats = userCallStats[sp_id];
            if (!stats) continue;

            if (call_type === "outgoing" || call_type === "incoming") {
              stats[call_type]++;
            }
            if (call_duration > 0) {
              stats.connected++;
              stats.duration += call_duration;
            } else if (call_type === "rejected") {
              stats.declined++;
            }
          }

          const userLogsStatus = Object.values(userCallStats).map((calls) => ({
            ...calls,
            duration: formatDuration(calls.duration),
          }));

          // Build user data
          userData = await Promise.all(
            allUsers.map(async (user) => {
              const analytics =
                userAnalytics.find((a) => a.user_id === user.user_id) || {};
              const userCallLog = userLogsStatus.find(
                (log) => log.name === `${user.fname} ${user.lname}`
              ) || {
                outgoing: 0,
                incoming: 0,
                connected: 0,
                declined: 0,
                duration: "0s",
              };

              // Fetch individual user metrics
              const [
                userUpComingFollowups,
                userOverdueFollowups,
                userLostEnquiries,
                userEnquiries,
                userTestDrives,
              ] = await Promise.all([
                // Upcoming Follow-ups
                Tasks.findAndCountAll({
                  where: {
                    sp_id: user.user_id,
                    deleted: false,
                    status: { [Op.ne]: "Completed" },
                    due_date: {
                      [Op.between]: [
                        dateController.todayDate,
                        dateController.oneWeekLaterDate,
                      ],
                    },
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

                // Overdue follow-ups
                Tasks.findAndCountAll({
                  where: {
                    sp_id: user.user_id,
                    deleted: false,
                    due_date: {
                      [Op.between]: [
                        dateController.oneWeekBeforeDate,
                        dateController.yesterdayDate,
                      ],
                    },
                    status: { [Op.ne]: "Completed" },
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

                // Lost Enquiries
                Leads.count({
                  where: {
                    sp_id: user.user_id,
                    status: "Lost",
                    deleted: false,
                    created_at: {
                      [Op.between]: [dateRange.start, dateRange.end],
                    },
                  },
                  raw: true,
                }),

                Leads.count({
                  where: {
                    sp_id: user.user_id,
                    deleted: false,
                    status: { [Op.ne]: "Lost" },
                    created_at: {
                      [Op.between]: [dateRange.start, dateRange.end],
                    },
                  },
                  raw: true,
                }),

                Events.count({
                  where: {
                    sp_id: user.user_id,
                    subject: "Test Drive",
                    deleted: false,
                    created_at: {
                      [Op.between]: [dateRange.start, dateRange.end],
                    },
                  },
                  distinct: true,
                  col: "lead_id",
                  raw: true,
                }),
              ]);

              return {
                user_id: user.user_id,
                user_name: `${user.fname} ${user.lname}`,
                user_role: user.user_role,
                upComingFollowups: userUpComingFollowups.count,
                overdueFollowups: userOverdueFollowups.count,
                lostEnquiries: userLostEnquiries,
                enquiries: userEnquiries,
                testDrives: userTestDrives,
                orders: Number(analytics.new_orders || 0),
                cancellations: Number(analytics.cancellations || 0),
                net_orders: Number(analytics.net_orders || 0),
                retail: Number(analytics.retail || 0),
                callLogs: userCallLog,
              };
            })
          );
        }

        return {
          dealer_id: dealer.dealer_id,
          dealer_name: dealer.dealer_name,
          dealer_email: dealer.dealer_email,
          upComingFollowups: upComingFollowups.count,
          overdueFollowups: overdueFollowups.count,
          enquiries,
          lostEnquiries,
          testDrives,
          cancellations: totals.cancellations,
          orders: totals.orders,
          net_orders: totals.net_orders,
          retail: totals.retail,
          totalUsersCount, // New KPI: Total users count
          activeUsersCount, // New KPI: Active users count (users with password)
          callLogs: dealerCallStats,
          user_list: userData,
        };
      })
    );

    // ========================= Selected User Details =========================
    let selectedUser = null;
    if (user_id) {
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
        // Upcoming
        Events.findAll({
          attributes: ["name", "subject", "PMI"],
          where: {
            dealer_id,
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
            dealer_id,
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
            dealer_id,
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
              [Op.between]: [dateRange.start, dateRange.end],
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
            created_at: { [Op.between]: [dateRange.start, dateRange.end] },
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
          where: { user_id },
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

      const enqBank = await Leads.count({
        where: {
          status: { [Op.notIn]: ["Qualified", "Lost"] },
          sp_id: user_id,
          deleted: false,
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
        testDriveTarget - uniqueTestDrives,
        0
      );

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

      let performance = {
        newEnquiries,
        lostEnquiries: lostEnquiries.length,
        enquiriesToAchieveTarget,
        followupsPerLostEnquiry,
        avgEnquiry,
        enquiryBank: enqBank,
        followupsPerLostDigitalEnquiry,
        uniqueTestDrives,
        remainingTestDrives,
        TestDrivesAvg,
        enquiryToUniqueTestdriveRatio,
        testDriveRatio,
        orders,
        net_orders,
        retail,
        cancellations,
        orderTarget,
        contributionToDealershipmsg: cancellation_contribution,
        TestDriveToRetail: td_to_retail,
        UTestDriveToRetail: utd_to_retail,
        digitalEnquiryToOrderRatio,
      };

      selectedUser = {
        fname: user.fname,
        lname: user.lname,
        upcomingTestDrives: upcoming,
        completedTestDrives: completed,
        overdueTestDrives: overdue,
        summaryEnquiry: processLogs(SummaryMap.lead),
        summaryColdCalls: processLogs(SummaryMap.nonlead),
        performance,
      };
    }

    return responses.success(res, "SuperAdmin data fetched", {
      dealers: dealerData,
      ...(selectedUser && { selectedUser }),
    });
  } catch (error) {
    logger.error(`Error in SuperAdmin Dashboard: ${error.message}`);
    return responses.serverError(res, error.message);
  }
};

module.exports = { newSuperAdminDashboard };
