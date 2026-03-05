const { Op, fn, col } = require("sequelize");
const moment = require("moment-timezone");
const Issues = require("../../models/master/ticketModel");
const Leads = require("../../models/transactions/leadsModel");
const Users = require("../../models/master/usersModel");
const Dealers = require("../../models/master/dealerModel");
const { getDateRange } = require("../../utils/filterType");

exports.getIssueTrackerData = async (req, res) => {
  try {
    const { filterType = "MTD", dealerIds = [], subcategory } = req.query;

    const { start, end } = getDateRange(filterType);
    const dateFilter = { date_reported: { [Op.between]: [start, end] } };

    const [
      activeDealersFromLeads,
      totalLeads,
      issues,
      allUsers,
      closedIssuesCount,
    ] = await Promise.all([
      // Active dealers → distinct dealer_id present in Leads table
      Leads.findAll({
        attributes: [[fn("DISTINCT", col("dealer_id")), "dealer_id"]],
        where: {
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
        raw: true,
      }),

      Leads.count({
        where: {
          deleted: false,
          created_at: { [Op.between]: [start, end] },
        },
      }),

      Issues.findAll({
        attributes: ["reported_by", "subcategory", "date_reported", "status"],
        where: dateFilter,
        raw: true,
      }),

      // All users for email → dealer mapping
      Users.findAll({ attributes: ["email", "dealer_id"], raw: true }),

      Issues.count({
        where: {
          ...dateFilter,
          status: "closed",
        },
      }),
    ]);

    // Fetch dealer info for active dealers
    const activeDealerIds = activeDealersFromLeads
      .map((d) => d.dealer_id)
      .filter(Boolean);

    const activeDealersList = activeDealerIds.length
      ? await Dealers.findAll({
          attributes: ["dealer_id", "dealer_name"],
          where: { dealer_id: { [Op.in]: activeDealerIds } },
          raw: true,
        })
      : [];

    const activeDealersCount = activeDealerIds.length;

    // Mapping reported_by emails → dealer_id
    const emailToDealer = {};
    allUsers.forEach((u) => {
      if (u.email && u.dealer_id) emailToDealer[u.email] = u.dealer_id;
    });

    // Counting dealers with issues
    const dealerIssues = {};
    issues.forEach((i) => {
      const d = emailToDealer[i.reported_by];
      if (d) dealerIssues[d] = (dealerIssues[d] || 0) + 1;
    });

    const dealersWithIssuesCount = Object.keys(dealerIssues).length;
    const totalIssues = issues.length;

    const topCards = {
      activeDealers: activeDealersCount,
      totalLeads,
      dealersWithIssues: dealersWithIssuesCount,
      totalIssues,
      closedIssues: closedIssuesCount,
    };

    // ---------------- APPLY DEALER FILTER FOR DASHBOARD ---------------- //
    let filteredIssues = issues;
    if (dealerIds && dealerIds.length && dealerIds !== "all") {
      const dealerList = Array.isArray(dealerIds)
        ? dealerIds
        : dealerIds.split(",");
      filteredIssues = issues.filter((i) =>
        dealerList.includes(emailToDealer[i.reported_by])
      );
    }

    // ---------------- CASES BY CATEGORY (Based on Dealer Filter) ---------------- //
    const categoryCounts = {};
    filteredIssues.forEach((i) => {
      const sub = i.subcategory || "Unspecified";
      categoryCounts[sub] = (categoryCounts[sub] || 0) + 1;
    });
    const casesByCategory = Object.entries(categoryCounts).map(
      ([subcategory, count]) => ({ subcategory, count })
    );

    // ---------------- SELECTED SUBCATEGORY DETAILS (Based on Dealer Filter) ---------------- //
    let subcategoryDetail = null;

    // If subcategory is passed, filter for that specific one
    // else, include all subcategories together
    const filtered =
      subcategory && subcategory !== "all"
        ? filteredIssues.filter((i) => i.subcategory === subcategory)
        : filteredIssues;

    if (filtered.length > 0) {
      // ✅ Label formatter declared first (before usage)
      const labelFormat = (date) => {
        switch (filterType) {
          case "WEEK":
          case "LAST_WEEK":
            return moment(date).format("ddd");
          case "MTD":
          case "LAST_MONTH":
            return `Wk ${moment(date).isoWeek() - moment(start).isoWeek() + 1}`;
          case "QTD":
          case "LAST_QUARTER":
            return moment(date).format("MMM");
          case "SIX_MONTH":
            return moment(date).format("MMM");
          case "YTD": {
            const month = moment(date).month();
            if (month >= 3 && month <= 5) return "Apr–Jun";
            if (month >= 6 && month <= 8) return "Jul–Sep";
            if (month >= 9 && month <= 11) return "Oct–Dec";
            return "Jan–Mar";
          }
          default:
            return moment(date).format("MMM");
        }
      };

      // ✅ Dealer-wise aggregation
      const dealerWiseMap = new Map();
      filtered.forEach((i) => {
        const d = emailToDealer[i.reported_by];
        if (d) dealerWiseMap.set(d, (dealerWiseMap.get(d) || 0) + 1);
      });

      const dealerIdsList = Array.from(dealerWiseMap.keys());
      const dealersInfo = dealerIdsList.length
        ? await Dealers.findAll({
            attributes: ["dealer_id", "dealer_name"],
            where: { dealer_id: { [Op.in]: dealerIdsList } },
            raw: true,
          })
        : [];
      const dealerNameMap = {};
      dealersInfo.forEach((d) => (dealerNameMap[d.dealer_id] = d.dealer_name));

      // ✅ Enhanced dealer-wise + period label counts
      const dealerWiseCounts = [];
      filtered.forEach((i) => {
        const dealerId = emailToDealer[i.reported_by];
        if (!dealerId) return;

        const label = labelFormat(i.date_reported);
        const dealerName = dealerNameMap[dealerId] || "Unknown Dealer";

        // Merge counts by dealer + label
        const existing = dealerWiseCounts.find(
          (d) => d.dealer_id === dealerId && d.label === label
        );

        if (existing) {
          existing.count += 1;
        } else {
          dealerWiseCounts.push({
            dealer_id: dealerId,
            dealer_name: dealerName,
            label,
            count: 1,
          });
        }
      });

      // ✅ Period-wise aggregation
      const periodCounts = {};
      filtered.forEach((i) => {
        const label = labelFormat(i.date_reported);
        periodCounts[label] = (periodCounts[label] || 0) + 1;
      });

      const periodWiseCounts = Object.entries(periodCounts).map(
        ([label, count]) => ({ label, count })
      );

      subcategoryDetail = {
        selectedSubcategory: subcategory || "All Categories",
        totalCases: filtered.length,
        periodWiseCounts,
        dealerWiseCounts,
      };
    }

    // ---------------- FINAL RESPONSE ---------------- //
    return res.status(200).json({
      success: true,
      data: {
        activeDealersList,
        topCards,
        casesByCategory,
        subcategoryDetail,
      },
    });
  } catch (error) {
    console.error("Error in getIssueTrackerData:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch issue tracker data",
      error: error.message,
    });
  }
};
