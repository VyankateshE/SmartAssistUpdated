require("dotenv").config();
const { Op, literal } = require("sequelize");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const Notifications = require("../../models/master/notificationModel");
const dateController = require("../../utils/dateFilter");
const logger = require("../../middlewares/fileLogs/logger");
const responses = require("../../utils/globalResponse");
const Leads = require("../../models/transactions/leadsModel");
const { getDateRange } = require("../../utils/filterType");
const moment = require("moment-timezone");
const User = require("../../models/master/usersModel");
const UserActivity = require("../../models/auditLogs/user_activity");

const dashboardData = async (req, res) => {
  try {
    const { userId } = req;

    await Promise.all([
      User.update(
        {
          last_login: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
        },
        { where: { user_id: userId } }
      ),
      UserActivity.create({
        last_login: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
        userId: userId,
        userName: req.fname + " " + req.lname,
        userEmail: req.userEmail,
      }),
    ]);
    const data = await Promise.all([
      // Upcoming follow-ups
      Tasks.findAndCountAll({
        where: {
          sp_id: userId,
          deleted: false,
          [Op.and]: [
            {
              due_date: {
                [Op.gte]: dateController.todayDate,
              },
            },
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
            {
              due_date: {
                [Op.gte]: dateController.todayDate,
              },
            },
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
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
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
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
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
      `Error fetching dashboard data for user ${req.userId}: ${error.message}`
    );
    console.error(
      `Error fetching dashboard data for user ${req.userId}: ${error.message}`
    );
    return responses.serverError(res, error.message);
  }
};

const analyticsReports = async (req, res) => {
  try {
    const { userId } = req;
    const { type } = req.query;
    const { start, end } = getDateRange(type);

    const allUsers = await User.findAll({
      attributes: ["user_id", "dealer_id"],
    });
    const userID = allUsers.map((user) => user.user_id);
    const dealer_id = allUsers.map((user) => user.dealer_id);

    let performance;
    const fetchData = async (start, end) => {
      const [
        enquiries,
        lostEnquiries,
        digitalLostEnquiries,
        digitalEnquiries,
        testDrives,
        allTestDrives,
        newOrders,
        dealerCancellation,
        totalLostEnquiries,
        retails,
      ] = await Promise.all([
        // Enquiries
        Leads.findAll({
          attributes: ["lead_id", "created_at"],
          where: {
            sp_id: userId,
            status: {
              [Op.ne]: "Lost",
            },
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),
        // Lost Enquiries
        Leads.findAll({
          attributes: ["lead_id", "created_at"],
          where: {
            sp_id: userId,
            status: "Lost",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),
        // DigitalLostEnquiries
        Leads.findAll({
          attributes: ["lead_id", "created_at"],
          where: {
            sp_id: userId,
            status: "Lost",
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),
        // Digital Enquiries
        Leads.findAll({
          attributes: ["lead_id", "created_at"],
          where: {
            sp_id: userId,
            deleted: false,
            lead_source: "OEM Web & Digital",
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),
        // Test Drives
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            subject: "Test Drive",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["lead_id"],
          raw: true,
        }),

        // All Test Drives
        Events.findAll({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            subject: "Test Drive",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),

        // Orders
        Leads.findAll({
          attributes: ["lead_id", "converted_at"],
          where: {
            sp_id: userId,
            converted: true,
            opp_status: "Take Order",
            converted_at: { [Op.ne]: null },
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),

        //Dealer Cancellation (for that ps)
        Leads.count({
          where: {
            dealer_id: (
              await User.findOne({
                attributes: ["dealer_id"],
                where: { user_id: userId },
              })
            ).dealer_id,
            sp_id: userId,
            status: "Lost",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),

        // Total lost leads at dealership level (total cancellations)
        Leads.count({
          where: {
            status: "Lost",
            deleted: false,
            dealer_id: (
              await User.findOne({
                attributes: ["dealer_id"],
                where: { user_id: userId },
              })
            ).dealer_id,
            created_at: {
              [Op.between]: [start, end],
            },
          },
        }),

        // No. of retails
        Leads.count({
          attributes: ["lead_id"],
          where: {
            sp_id: userId,
            converted: true,
            converted_to_retail: true,
            converted_at: { [Op.ne]: null },
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["lead_id"],
        }),
      ]);

      // Enquiry Bank Count
      const enquiryBank = enquiries.filter(
        (lead) => !["Qualified", "Lost"].includes(lead.status)
      ).length;

      // lead count
      const newEnquiries = enquiries.length;

      const dealerId = (
        await User.findOne({
          where: { user_id: req.userId },
          attributes: ["dealer_id"],
        })
      ).dealer_id;

      // Get dealer's target data (if available)
      const targetData = await User.findAll({
        attributes: ["target_enquiries", "target_testdrives", "target_orders"],
        where: {
          dealer_id: dealerId,
          user_id: req.userId,
        },
      });

      // Map target_type to value
      const targetMap = {};
      for (const target of targetData) {
        targetMap["enquiries"] = target.target_enquiries;
        targetMap["testDrives"] = target.target_testdrives;
        targetMap["orders"] = target.target_orders;
      }

      //  Target values
      const enquiryTarget = targetMap.enquiries || 0;
      const testDriveTarget = targetMap.testDrives || 0;
      const orderTarget = targetMap.orders || 0;

      // more enquiries to achieve your target
      const enquiriesToAchieveTarget = Math.max(
        enquiryTarget - newEnquiries,
        0
      );

      // No. of follow ups per lost enquiry
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
        ? lostEnquiries.length / followupsPerLostEnquiry
        : 0;

      // No. of follow ups per lost digital enquiry
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

      // The average number of follow-ups per lost digital enquiry
      followupsPerLostDigitalEnquiry = lostEnquiries.length
        ? lostEnquiries.length / followupsPerLostDigitalEnquiry
        : 0;

      // Avg enquiry  to order time
      const avgEnquiry = newEnquiries
        ? Math.round(
            moment
              .duration(
                enquiries.reduce((acc, lead) => {
                  const opportunity = newOrders.find(
                    (opp) => opp.lead_id === lead.lead_id
                  );
                  if (opportunity?.converted_at) {
                    acc += moment(opportunity.converted_at).diff(
                      moment(lead.created_at)
                    );
                  }
                  return acc;
                }, 0) / newEnquiries
              )
              .asDays()
          )
        : 0;

      //Unique Test Drives
      const uniqueTestDrives = testDrives.length;

      // more test drives to achieve your target
      const remainingTestDrives = Math.max(
        testDriveTarget - uniqueTestDrives,
        0
      );

      //Avg TestDrives to Order Time (new)
      const TestDrivesAvg =
        uniqueTestDrives > 0
          ? Math.round(
              moment
                .duration(
                  testDrives.reduce((acc, testDrive) => {
                    const opportunity = newOrders.find(
                      (opp) => opp.lead_id === testDrive.lead_id
                    );
                    if (opportunity?.converted_at) {
                      acc += moment(opportunity.converted_at).diff(
                        moment(testDrive.created_at)
                      );
                    }
                    return acc;
                  }, 0) / uniqueTestDrives
                )
                .asDays()
            )
          : 0;

      //Enquiry to Unique Test Drive Ratio  (new)
      const enquiryToUniqueTestdriveRatio =
        newEnquiries > 0
          ? Number(((uniqueTestDrives / newEnquiries) * 100).toFixed(2))
          : 0;

      //Enquiry to Test Drive Ratio
      const testDriveRatio =
        newEnquiries > 0
          ? Number(((allTestDrives.length / newEnquiries) * 100).toFixed(2))
          : 0;

      const orders = newOrders.length;

      //Digital Enquiry to New Order Ratio
      const digitalEnquiriesCount = digitalEnquiries.length || 0;
      const digitalEnquiryToOrderRatio =
        digitalEnquiriesCount > 0 ? orders / digitalEnquiriesCount : 0;

      //Contribution to dealership calculations
      const contributionToDealershipmsg =
        dealerCancellation > 0
          ? (dealerCancellation / totalLostEnquiries) * 100
          : 0;

      // Test Drive to Retail Ratio
      const TestDriveToRetail = retails.length / allTestDrives.length;

      performance = {
        enquiry: enquiries.length,
        lostEnq: lostEnquiries.length,
        testDriveData: testDrives.length,
        dealerCancellation: dealerCancellation,
        orders: newOrders.length,
        retail: retails.length,
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
        contributionToDealershipmsg,
        TestDriveToRetail,
        digitalEnquiryToOrderRatio,
      };
    };

    // Function to count entries per user
    const countEntries = (arr) => {
      return arr.reduce((acc, { sp_id, count }) => {
        acc[sp_id] = parseInt(count);
        return acc;
      }, {});
    };

    // Function to get rank based on counts
    const getRank = (counts, user_id) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1]) // Sort in descending order
        .map(([sp_id]) => String(sp_id))
        .indexOf(String(user_id)) + 1;

    // DealerShipRank
    const fetchDealerRank = async (start, end, user_id) => {
      const user = await User.findOne({
        attributes: ["dealer_id"],
        where: { user_id },
      });
      const dealer_id = user.dealer_id;
      const [
        enquiries,
        lostEnquiries,
        testDrives,
        newOrders,
        cancellations,
        retails,
      ] = await Promise.all([
        Leads.count({
          attributes: ["sp_id"],
          where: {
            dealer_id,
            status: { [Op.ne]: "Lost" },
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        Leads.count({
          attributes: ["sp_id"],
          where: {
            dealer_id,

            status: "Lost",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
        // Test Drives count per user
        Events.count({
          attributes: ["sp_id"],
          where: {
            subject: "Test Drive",
            deleted: false,
            dealer_id,

            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        // New Orders count per user
        Leads.count({
          attributes: ["sp_id"],
          where: {
            opp_status: "Take Order",
            converted: true,
            deleted: false,
            dealer_id,

            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        Leads.count({
          attributes: ["sp_id"],
          where: {
            status: "Lost",
            dealer_id,

            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        Leads.count({
          attributes: ["sp_id"],
          where: {
            converted: true,
            opp_status: "Take Order",
            dealer_id,

            converted_at: { [Op.ne]: null },
            converted_to_retail: true,
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
      ]);

      return {
        // Calculate ranks
        enquiriesRank: getRank(countEntries(enquiries), user_id),
        lostEnquiriesRank: getRank(countEntries(lostEnquiries), user_id),
        testDrivesRank: getRank(countEntries(testDrives), user_id),
        newOrdersRank: getRank(countEntries(newOrders), user_id),
        cancellationsRank: getRank(countEntries(cancellations), user_id),
        retailRank: getRank(countEntries(retails), user_id),
      };
    };

    // All IndiaRank and All India best Performance
    const fetchAllIndiaRank = async (start, end, user_id) => {
      const [
        enquiries,
        lostEnquiries,
        testDrives,
        newOrders,
        cancellations,
        retails,
      ] = await Promise.all([
        Leads.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            status: {
              [Op.ne]: "Lost",
            },
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        Leads.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            status: "Lost",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
        Events.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
        Leads.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            converted: true,

            opp_status: "Take Order",
            converted_at: { [Op.ne]: null },
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
        Leads.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            dealer_id: dealer_id,
            status: "Lost",
            deleted: false,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),

        Leads.count({
          attributes: ["sp_id"],
          sp_id: userID,
          where: {
            converted: true,
            opp_status: "Take Order",
            converted_at: { [Op.ne]: null },
            converted_to_retail: true,
            created_at: {
              [Op.between]: [start, end],
            },
          },
          group: ["sp_id"],
        }),
      ]);

      const getCount = (data) =>
        data.reduce(
          (maxValue, curr) => (curr.count > maxValue ? curr.count : maxValue),
          0
        );
      if (user_id) {
        return {
          enquiriesRank: getRank(countEntries(enquiries), user_id),
          lostEnquiriesRank: getRank(countEntries(lostEnquiries), user_id),
          testDrivesRank: getRank(countEntries(testDrives), user_id),
          newOrdersRank: getRank(countEntries(newOrders), user_id),
          cancellationsRank: getRank(countEntries(cancellations), user_id),
          retailRank: getRank(countEntries(retails), user_id),
        };
      } else {
        return {
          enquiriesCount: getCount(enquiries),
          lostEnquiriesCount: getCount(lostEnquiries),
          testDrivesCount: getCount(testDrives),
          newOrdersCount: getCount(newOrders),
          cancellationsCount: getCount(cancellations),
          retailCount: getCount(retails),
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
