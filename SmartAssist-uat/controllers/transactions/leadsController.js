require("dotenv").config();
const { Op, literal } = require("sequelize");
const fs = require("fs");
const path = require("path");
const logger = require("../../middlewares/fileLogs/logger");
const rpaLogger = require("../../middlewares/fileLogs/rpaLogger");
const ICSLogger = require("../../middlewares/fileLogs/ICSLogger");
const dateController = require("../../utils/dateFilter");
const responses = require("../../utils/globalResponse");
const { sendNotification } = require("../../utils/notification");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
const {
  validateInput,
  validatePhoneNumber,
} = require("../../middlewares/validators/validatorMiddleware");
const { formatDate, trimStringValues } = require("../../utils/formatter");
const { postLeadToICS } = require("../../exernal_apis/post_ICS");
const getNotificationTemplate = require("../../utils/notificationTemplate");
const transactionNotification = require("../../middlewares/notifications/transactionalNotifications");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const Users = require("../../models/master/usersModel");
const LeadActivity = require("../../models/auditLogs/lead_activity");
const { default: axios } = require("axios");
const Vehicles = require("../../models/master/vehicleModel");

// const moment = require("moment-timezone");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const puppeteer = require("puppeteer");
<<<<<<< HEAD
const defenderGuideModel = require("../../models/master/defenderGuideModel");
=======
>>>>>>> 27fb6eb53d10f6b2477adc8ebfdd8a8f302bcbe5



const createLead = async (req, res) => {
  try {
    const bodyObj = req.body;

    // Run user and vehicle queries in parallel
    const [user, vehicle, isDuplicate] = await Promise.all([
      Users.findByPk(req.userId, {
        attributes: [
          "user_id",
          "email",
          "team_id",
          "dealer_name",
          "dealer_code",
          "dealer_id",
          "corporate_id",
          "name",
          "fname",
          "lname",
          "device_token",
          "ics_id",
          "excellence",
        ],
      }),
      Vehicles.findByPk(bodyObj.vehicle_id),
      Leads.findOne({
        where: {
          mobile: { [Op.iLike]: `%${bodyObj.mobile}%` },
          dealer_id: req.dealerId,
          [Op.or]: [
            { opp_status: { [Op.ne]: "Won" } },
            { opp_status: { [Op.is]: null } },
          ],
        },
      }),
    ]);

    if (!user) {
      return responses.badRequest(res, "Invalid user");
    }

    const icsUser = user.toJSON();
    if (isDuplicate) {
      return responses.badRequest(res, "Enquiry already exists");
    }

    const formattedDate = formatDate(bodyObj.expected_date_purchase);
    const [fname, lname, email] = trimStringValues([
      bodyObj.fname,
      bodyObj.lname,
      bodyObj.email,
    ]);
    validateInput([fname, lname]);
    validatePhoneNumber([bodyObj.mobile]);

    const newLead = await Leads.create({
      ...bodyObj,
      fname,
      lname,
      lead_name: `${fname} ${lname}`,
      brand: vehicle?.brand,
      cxp_mobile: bodyObj.mobile.split("+91")[1],
      email: email.toLowerCase(),
      houseOfBrand: vehicle?.houseOfBrand || null,
      lead_owner: user.name,
      owner_email: user.email,
      expected_date_purchase: formattedDate || null,
      dealer_name: user.dealer_name,
      dealer_code: user.dealer_code,
      corporate_id: user.corporate_id,
      dealer_id: user.dealer_id,
      sp_id: bodyObj.sp_id || req.userId,
      team_id: user.team_id,
      updated_by: req.userEmail,
      created_by: req.userId,
      rpa_name: "leadcreate",
      for_company: bodyObj?.company_name ? true : false,
    });
    logger.info(`Lead created by ${req.userId}, mobile: ${bodyObj.mobile}`);

    // Respond early
    responses.created(res, `Lead created ${process.env.ST201}`, newLead);

    // Background processing
    setImmediate(async () => {
      try {
        try {
          await LeadActivity.create({
            userId: req.userId,
            userEmail: req.userEmail,
            userRole: req.userRole,
            recordId: newLead.lead_id,
            action: "Create",
            original_value: JSON.stringify(newLead.toJSON()),
            new_value: JSON.stringify(newLead.toJSON()),
            modiified_at: dateController.CurrentDate(),
          }).catch((err) => {
            logger.warn(
              `Failed to log activity for ${newLead.lead_id}: ${err.message}`
            );
          });
        } catch (err) {
          logger.error(`Error in background process: ${err.message}`);
        }
        try {
          await postLeadToICS(newLead, icsUser);
        } catch (err) {
          ICSLogger.error(
            `ICS post failed for Lead ID ${newLead.lead_id}: ${err.message}`
          );
        }
        try {
          const leadsData = newLead.toJSON();
          const notificationData = getNotificationTemplate("leads", leadsData);

          sendNotification({
            category: "leads",
            userId: user.user_id,
            recordId: leadsData.lead_id,
            deviceToken: user.device_token,
            title: notificationData.title,
            body: notificationData.body,
            content: notificationData.content || null,
          }).catch((notificationError) => {
            logger.error(
              `Notification failed for Lead ID ${leadsData.lead_id}: ${notificationError.message}`
            );
          });

          await axios.post(process.env.RPA_URL, leadsData, {
            headers: { "Content-Type": "application/json" },
          });

          rpaLogger.info(
            `Lead create sent to RPA successfully for record ${leadsData}`
          );
        } catch (err) {
          rpaLogger.error(
            `RPA post failed for Lead create of ${newLead.lead_id}: ${err.message}`
          );
        }
      } catch (err) {
        logger.error(`Post-processing failed: ${err.message}`);
      }
    });
  } catch (error) {
    logger.error(`Lead creation error by ${req.userId}: ${error.message}`);

    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();
    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error);
  }
};

//end

//check for duplicates
const existingLeads = async (req, res) => {
  try {
    const { mobile } = req.query;

    const existingLead = await Leads.findOne({
      where: {
        dealer_id: req.dealerId,
        [Op.or]: [
          { opp_status: { [Op.ne]: "Won" } },
          { opp_status: { [Op.is]: null } },
        ],
        mobile: { [Op.iLike]: `%${mobile}%` },
      },
      raw: true,
    });

    if (existingLead) {
      return responses.success(
        res,
        "Enquiry already exists, consider performing an action on this enquiry instead",
        existingLead
      );
    }

    return responses.success(
      res,
      "Enquiry doesn't exist, proceed to create new"
    );
  } catch (error) {
    logger.error("Error checking for duplicate Enquiries:", error);
    return responses.serverError(res, error.message);
  }
};

//show all leads as a team owner
const getAllLeadsByTeamOwner = async (req, res) => {
  const leadAttributes = [
    "lead_id",
    "status",
    "brand",
    "PMI",
    "vehicle_id",
    "lead_source",
    "lead_name",
    "fname",
    "lname",
    "campaign",
    "mobile",
    "email",
    "lead_owner",
    "owner_email",
    "vehicle_name",
    "lead_age",
    "opp_status",
    "sp_id",
    "team_id",
    "dealer_id",
  ];

  // Common filter builder
  const buildFilters = (base, query) => {
    const { user_id, pmi, source, status, search = "" } = query;

    const optionalFilters = {
      sp_id: user_id,
      PMI: pmi,
      lead_source: source,
      status,
    };

    Object.entries(optionalFilters).forEach(([key, value]) => {
      if (value) base[key] = value;
    });

    if (search.trim()) {
      const searchFields = ["lead_name", "email", "PMI", "mobile"];
      base[Op.or] = searchFields.map((field) => ({
        [field]: { [Op.iLike]: `%${search.trim()}%` },
      }));
    }

    return base;
  };

  // Common pagination mapper
  const buildPagination = (req) => {
    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : null;

    return {
      page,
      limit,
      offset: page && limit ? (page - 1) * limit : null,
    };
  };
  try {
    const pagination = buildPagination(req);

    let adminUser = null;
    if (["SM", "TL"].includes(req.userRole)) {
      adminUser = await Users.findByPk(req.userId);
      if (!adminUser) {
        return responses.badRequest(res, "Invalid user");
      }
    }

    let teamMembers = [];
    let whereCondition = {};
    let dealerId = req.dealerId;
    let teamId = null;

    // Role-based data blocks
    if (req.userRole === "SM") {
      dealerId = adminUser.dealer_id;
      teamId = adminUser.team_id;

      teamMembers = await Users.findAll({
        where: { team_id: teamId, deleted: false },
        attributes: ["user_id", "name"],
        raw: true,
      });

      whereCondition = buildFilters(
        {
          dealer_id: dealerId,
          team_id: teamId,
          deleted: false,
        },
        req.query
      );
    } else if (req.userRole === "TCL") {
      teamMembers = await Users.findAll({
        where: { dealer_id: dealerId, deleted: false },
        attributes: ["user_id", "name"],
        raw: true,
      });

      whereCondition = buildFilters(
        {
          dealer_id: dealerId,
          deleted: false,
        },
        req.query
      );
    } else if (req.userRole === "TL") {
      dealerId = adminUser.dealer_id;
      const tlId = adminUser.tl_id;

      teamMembers = await Users.findAll({
        where: { tl_id: tlId, dealer_id: dealerId, deleted: false },
        attributes: ["user_id", "name"],
        raw: true,
      });

      whereCondition = buildFilters(
        {
          tl_id: tlId,
          dealer_id: dealerId,
          deleted: false,
        },
        req.query
      );
    } else {
      // SP role
      const user = await Users.findByPk(req.userId);

      whereCondition = buildFilters(
        {
          dealer_id: user.dealer_id,
          team_id: user.team_id,
          sp_id: req.userId,
          deleted: false,
        },
        req.query
      );

      const recordsCount = await Leads.count({ where: whereCondition });

      const leads = await Leads.findAndCountAll({
        where: whereCondition,
        order: [["updated_at", "DESC"]],
        attributes: leadAttributes,
        offset: (pagination.page - 1) * pagination.limit,
        limit: pagination.limit,
      });

      logger.info(`Request made by user ${req.userId} for viewing Leads`);

      return responses.success(res, `Leads fetched ${process.env.ST201}`, {
        recordsCount,
        leads,
      });
    }

    // Shared query execution for SM / TL / TCL
    const recordsCount = await Leads.count({ where: whereCondition });

    const leads = await Leads.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
      attributes: leadAttributes,
      limit: pagination.limit || undefined,
      offset: pagination.offset || undefined,
    });

    const responseData = {
      teamMembers,
      recordsCount,
      leads,
    };

    logger.info(`Request made by user ${req.userId} for viewing Leads`);

    return responses.success(
      res,
      `Leads fetched ${process.env.ST201}`,
      responseData
    );
  } catch (error) {
    logger.error(
      `Failed request attempt made by user ${req.userId} for leads at ${req.originalUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//show all leads assigned to salesp
const getAllLeadsByUser = async (req, res) => {
  try {
    const user = await Users.findByPk(req.userId, {
      attributes: ["dealer_id", "user_id"],
    });
    const queryObj = req.query;
    const whereCondition = {
      dealer_id: user.dealer_id,
      sp_id: user.user_id,
      // converted: false,
      deleted: false,
    };
    let condition;
    if (queryObj) {
      condition = { ...whereCondition, ...queryObj };
    }
    if (queryObj.created_at) {
      const date = req.query.created_at;
      condition.created_at = {
        [Op.gte]: new Date(`${date}T00:00:00`),
        [Op.lt]: new Date(`${date}T23:59:59`),
      };
    }

    const leads = await Leads.findAndCountAll({
      where: condition,
      order: [["updated_at", "DESC"]],
    });

    logger.info(`Request made by user ${req.userId} for viewing Leads`);

    return responses.success(res, `Leads fetched ${process.env.ST201}`, leads);
  } catch (error) {
    logger.error(
      `Failed request attempt made by user ${req.userId} for leads at ${req.originalUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

//info of a single lead selected
const getLeadById = async (req, res) => {
  try {
    const leadId = req.params.recordId;

    const lead = await Leads.findByPk(leadId);

    logger.info(
      `Request made by user ${req.userId} for viewing Lead with ID ${leadId}`
    );
    return responses.success(res, `Lead fetched ${process.env.ST201}`, lead);
  } catch (error) {
    const requestUrl = req.originalUrl;
    logger.error(
      `Failed request attempt made by user ${req.userId} for lead at ${requestUrl}: ${error.message}`
    );
    console.error("Error fetching leads:", error);
    return responses.serverError(res, error.message);
  }
};
//end//

const updateLead = async (req, res) => {
  try {
    const leadId = req.params.recordId;
    const bodyObj = req.body;

    // Fetch the original lead to get its current state
    const originalLead = await Leads.findByPk(leadId);
    if (req.userId !== originalLead.sp_id) {
      return responses.unauthorized(
        res,
        "You are not authorized to update this Enquiry"
      );
    }

    if (!originalLead) {
      return responses.notFound(res, "Lead not found");
    }
    let brand;
    if (
      bodyObj.PMI &&
      (bodyObj.PMI.toLowerCase().includes("d") ||
        bodyObj.PMI.toLowerCase().includes("ran"))
    ) {
      brand = "Land Rover";
    }

    // Add timestamp if status changes to "Lost"
    if (bodyObj.status === "Lost" && originalLead.status !== "Lost") {
      bodyObj.lost_created_at = new Date();
    }

    // Update the lead in the database
    const [affectedRows, updatedLead] = await Leads.update(
      {
        ...bodyObj,
        brand: brand,
        updated_by: req.userEmail,
        updated: true,
        rpa_name: "leadupdate",
        update_flag: "active",
      },
      {
        where: { lead_id: leadId },
        returning: true,
      }
    );

    if (affectedRows > 0) {
      logger.info(
        `Lead with ${leadId} updated successfully by user ${req.userId}`
      );

      // Immediately send a success response
      responses.success(
        res,
        `Enquiry updated ${process.env.ST201}`,
        updatedLead
      );

      (async () => {
        try {
          const [updatedData] = updatedLead.map((lead) => lead.dataValues);

          await LeadActivity.create({
            userId: req.userId,
            userEmail: req.userEmail,
            userRole: req.userRole,
            recordId: leadId,
            action: "Update",
            original_value: JSON.stringify(originalLead.toJSON()),
            new_value: JSON.stringify(updatedData),
            modiified_at: dateController.CurrentDate(),
          }).catch((err) => {
            logger.warn(`Failed to log activity for ${leadId}: ${err.message}`);
          });
          // 1. Post to RPA API
          try {
            const rpaResponse = await axios.post(
              process.env.RPA_URL,
              updatedData,
              {
                headers: { "Content-Type": "application/json" },
              }
            );
            rpaLogger.info(
              `Lead update posted to RPA successfully with data ${updatedData}`,
              rpaResponse.data.message
            );
          } catch (err) {
            console.error("RPA API err:", err.response?.data || err.message);
            rpaLogger.error(
              `Failed to post lead update to RPA API: ${
                err.response?.data?.message || err.message
              }`
            );
          }

          // 2. Send notification if sp_id changed
          if (bodyObj.sp_id && bodyObj.sp_id !== originalLead.sp_id) {
            const [assignee, notificationData] = await Promise.all([
              Users.findByPk(bodyObj.sp_id, {
                attributes: ["user_id", "device_token"],
              }),
              getNotificationTemplate("leads", bodyObj),
            ]);

            if (assignee) {
              sendNotification({
                category: "leads",
                userId: assignee.user_id,
                recordId: leadId,
                deviceToken: assignee.device_token,
                title: notificationData.title,
                body: notificationData.body,
                content: notificationData.content || null,
              }).catch((notificationError) => {
                logger.error(
                  `Failed to send notification for lead ID ${leadId} to user ${assignee.user_id}: ${notificationError.message}`
                );
              });
            }
          }
        } catch (backgroundError) {
          logger.error(
            `Error in background process for lead ID ${leadId}: ${backgroundError.message}`
          );
        }
      })();
      // --- End Background Processes ---

      return; // Explicitly return to avoid any further execution in this function
    } else {
      return responses.notFound(res, "Lead not found or no changes to update.");
    }
  } catch (error) {
    logger.error(
      `Error updating lead by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // This part for handling log files remains the same, but it's generally
    // better to have a more robust, centralized error-handling mechanism.
    const logDir = path.join(__dirname, "../../logs");
    if (fs.existsSync(logDir)) {
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("error-"))
        .sort();

      const latestLogFilePath =
        logFiles.length > 0
          ? path.join(logDir, logFiles[logFiles.length - 1])
          : null;

      if (latestLogFilePath) {
        await handleErrorAndSendLog(latestLogFilePath);
      }
    }

    return responses.badRequest(res, error.message);
  }
};

//end

//update assignee
const reassignLead = async (req, res) => {
  try {
    const { user_id, leadIds } = req.body;

    if (!leadIds?.length || !user_id)
      return responses.badRequest(res, "Missing user_id or leadIds");

    const oldLeads = await Leads.findAll({
      where: { lead_id: leadIds },
      raw: true,
    });

    if (!oldLeads.length)
      return responses.badRequest(res, "No leads found for reassignment");

    const user = await Users.findByPk(user_id, {
      attributes: ["user_id", "name"],
    });
    if (!user) return responses.badRequest(res, "Invalid user_id");

    await Leads.update(
      {
        lead_owner: user.name,
        owner_email: user.email,
        sp_id: user_id,
        updated_by: req.userEmail,
        reassign_flag: "active",
        updated: true,
      },
      { where: { lead_id: leadIds } }
    );

    logger.info(`Leads ${leadIds} reassigned to ${user_id} by ${req.userId}`);

    const newLeads = await Leads.findAll({
      where: { lead_id: leadIds },
      raw: true,
    });

    const oldMap = Object.fromEntries(oldLeads.map((l) => [l.lead_id, l]));
    const newMap = Object.fromEntries(newLeads.map((l) => [l.lead_id, l]));

    // Pre-fetch notification and token safely
    const [assignee, notificationData] = await Promise.allSettled([
      Users.findByPk(user_id, { attributes: ["user_id", "device_token"] }),
      getNotificationTemplate("leads", req.body),
    ]);

    const deviceToken =
      assignee.status === "fulfilled" ? assignee.value?.device_token : null;
    const notification =
      notificationData.status === "fulfilled" ? notificationData.value : {};

    // Process each lead safely
    const results = await Promise.allSettled(
      newLeads.map(async (lead) => {
        const oldState = oldMap[lead.lead_id] || {};
        const newState = newMap[lead.lead_id] || {};

        try {
          // Lead Activity Log
          await LeadActivity.create({
            userId: req.userId,
            userEmail: req.userEmail,
            userRole: req.userRole,
            recordId: lead.lead_id,
            action: "Reassign",
            original_value: JSON.stringify(oldState),
            new_value: JSON.stringify(newState),
            modified_at: dateController.CurrentDate(),
          }).catch((err) => {
            logger.warn(
              `Failed to log activity for ${lead.lead_id}: ${err.message}`
            );
          });

          // RPA Integration
          try {
            const apiRes = await axios.post(
              process.env.RPA_URL,
              { ...newState, rpa_name: "assign" },
              {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
              }
            );
            rpaLogger.info(
              `Lead ${lead.lead_id} reassigned successfully to RPA: ${
                apiRes.data?.message || "Success"
              }`
            );
          } catch (rpaErr) {
            rpaLogger.error(
              `RPA update failed for lead ${lead.lead_id}: ${rpaErr.message}`
            );
          }

          // Push Notification
          if (deviceToken && notification?.title && notification?.body) {
            try {
              await sendNotification({
                category: "leads",
                userId: user_id,
                recordId: lead.lead_id,
                deviceToken,
                title: notification.title,
                body: notification.body,
                content: notification.content || null,
              });
            } catch (notifErr) {
              logger.warn(
                `Notification failed for ${lead.lead_id}: ${notifErr.message}`
              );
            }
          }
        } catch (err) {
          logger.error(`Error processing lead ${lead.lead_id}: ${err.message}`);
          throw err;
        }
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    const total = leadIds.length;

    logger.info(
      `Lead reassignment completed. Total: ${total}, Failed: ${failed}`
    );

    return responses.success(
      res,
      failed
        ? `Reassignment completed with ${failed} failures.`
        : `All ${total} leads reassigned successfully.`,
      { total, failed }
    );
  } catch (error) {
    logger.error(
      `Error updating leads by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    try {
      const logDir = path.join(__dirname, "../../logs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("error-"))
        .sort();
      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await handleErrorAndSendLog(latestLogFilePath);
      }
    } catch (logErr) {
      logger.warn(`Failed to send error log: ${logErr.message}`);
    }

    return responses.badRequest(res, error.message);
  }
};

//end

//mark lead as lost
const markLost = async (req, res) => {
  const leadId = req.params.recordId;
  const { lost_remarks, lost_reason } = req.body;
  const userEmail = req.userEmail;

  if (!lost_remarks || !lost_reason) {
    return responses.badRequest(res, "Missing lost_remarks or lost_reason");
  }

  try {
    const lead = await Leads.findByPk(leadId);

    if (!lead) {
      return responses.notFound(res, "Enquiry not found");
    }

    if (lead.status === "Lost") {
      return responses.badRequest(res, "Enquiry is already marked as Lost");
    }

    const updatedResult = await Leads.update(
      {
        lost_reason,
        lost_remarks,
        status: "Lost",
        updated_by: userEmail,
        update_flag: "active",
        updated: true,
        rpa_name: "leadupdate",
      },
      {
        where: { lead_id: leadId },
        returning: true,
      }
    );

    const updatedLead = updatedResult?.[1]?.[0]?.dataValues;

    if (!updatedLead) {
      throw new Error("Failed to update lead status");
    } else {
      logger.info(`🔄 Lead ${leadId} marked as Lost by ${req.userId}`);
      await LeadActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: leadId,
        action: "Mark Lost",
        original_value: JSON.stringify(lead.toJSON()),
        new_value: JSON.stringify(updatedLead),
        modiified_at: dateController.CurrentDate(),
      });

      try {
        const res = await axios.post(process.env.RPA_URL, updatedLead, {
          headers: { "Content-Type": "application/json" },
        });
        rpaLogger.info(
          `Lost lead sent to RPA, data : ${updatedLead}`,
          res.data.message
        );
      } catch (err) {
        console.error(" API err:", err.response?.data || err.message);
        rpaLogger.error(
          `Failed to post Lead reassign API: ${
            err.response?.data?.message || err.message
          }`
        );
      }

      return responses.success(res, "Enquiry marked as Lost", updatedLead);
    }
  } catch (error) {
    logger.error(`🔥 Error marking lead ${leadId} as Lost → ${error.message}`);
    return responses.badRequest(res, "Failed to mark Enquiry as Lost");
  }
};

//end

const leadsEventNTasks = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const user_id = req.query.user_id || req.userId;
    const whereCondition = {
      lead_id: leadId,
      deleted: false,
      sp_id: user_id,
    };
    const data = await Promise.all([
      //completed tasks before today's date
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: "Completed",
          completed: true,
        },
        order: [["due_date", "ASC"]],
      }),

      //all upcoming tasks today & in future
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.and]: [
            {
              due_date: {
                [Op.gte]: dateController.todayDate,
              },
            },
          ],
        },
        order: [["due_date", "DESC"]],
      }),
      //all overdue tasks today
      Tasks.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Completed" },
          completed: false,
          [Op.and]: [
            {
              due_date: {
                [Op.lt]: dateController.todayDate,
              },
            },
          ],
        },
        order: [["due_date", "DESC"]],
      }),

      //completed events before today's date
      Events.findAll({
        where: {
          ...whereCondition,
          status: "Finished",
          completed: true,
        },
        order: [["start_date", "ASC"]],
      }),

      //all upcoming events today & in future
      Events.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Finished" },
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
        },
        order: [["start_date", "DESC"]],
      }),
      //all overdue events today
      Events.findAll({
        where: {
          ...whereCondition,
          status: { [Op.ne]: "Finished" },
          completed: false,
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
        },
        order: [["start_date", "DESC"]],
      }),
    ]);
    return responses.success(res, `Data fetched`, {
      completedTasks: data[0],
      upcomingTasks: data[1],
      overdueTasks: data[2],
      completedEvents: data[3],
      upcomingEvents: data[4],
      overdueEvents: data[5],
    });
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//create opportunity
const createOpportunity = async (req, res) => {
  try {
    const recordId = req.params.recordId;
    const bodyObj = req.body;
    const [lead, assignee] = await Promise.all([
      Leads.findByPk(recordId),
      Users.findByPk(bodyObj.sp_id ? bodyObj.sp_id : req.userId),
    ]);
    if (req.userId !== lead.sp_id) {
      return responses.unauthorized(
        res,
        "You are not authorized to update this Enquiry"
      );
    }
    if (lead.status === "Qualified") {
      return responses.badRequest(res, `Enquiry is already an Opporutnity !`);
    }

    const [affectedRows, updatedOpps] = await Leads.update(
      {
        ...bodyObj,
        updated_by: req.userEmail,
        created_by: req.userId,
        converted: "true",
        status: "Qualified",
        opp_status: "Qualify",
        rpa_name: "opp",
        opp_flag: "active",
        updated: true,
      },
      {
        where: { lead_id: recordId },
        returning: true,
      }
    );

    if (affectedRows > 0) {
      const [updatedData] = updatedOpps.map((Opp) => Opp.dataValues);
      logger.info(
        `Lead with lead ID ${recordId} converted to opportunity by user ${req.userId}`
      );
      responses.created(
        res,
        `Opportunity created ${process.env.ST201}`,
        updatedData
      );

      await LeadActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: recordId,
        action: "Convert to Opportunity",
        original_value: JSON.stringify(lead.toJSON()),
        new_value: JSON.stringify(updatedData),
        modiified_at: dateController.CurrentDate(),
      });

      transactionNotification
        .newOppNotification(updatedData, assignee)
        .catch((error) => {
          logger.error(
            `Failed to send notification for Opportunity with lead Id ${recordId} to user ${assignee.user_id}: ${error.message}`
          );
        });

      try {
        await postLeadToICS(lead, assignee);
      } catch (err) {
        ICSLogger.error(
          `ICS post failed for Lead ID ${lead.lead_id}: ${err.message}`
        );
      }

      try {
        const res = await axios.post(process.env.RPA_URL, updatedData, {
          headers: { "Content-Type": "application/json" },
        });

        rpaLogger.info(
          `Opp Data sent successfukky, data : ${updatedData}`,
          res.data.message
        );
      } catch (err) {
        console.error(" API err:", err.response?.data || err.message);
        rpaLogger.error(
          `Failed to post Opp API: ${
            err.response?.data?.message || err.message
          }`
        );
      }
    }
  } catch (error) {
    // Log error details
    logger.error(
      `Error creating Opportunity by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Get the most recent error log file
    const logDir = path.join(__dirname, "../../logs");
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith("error-"))
      .sort();

    const latestLogFilePath =
      logFiles.length > 0
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

    // Send email with error log if the log file exists
    if (latestLogFilePath) {
      await handleErrorAndSendLog(latestLogFilePath);
    }

    return responses.badRequest(res, error.message);
  }
};
//end


<<<<<<< HEAD
const PDF_TEMPLATE_PATH =
"D:/Node_Folder/SmartAssist-uat/pdfFolder/250107_IND_Handover Guide_DEFENDER_V12_Justify_Approved_Interactive.pdf";

const FIELD_MAP = {

  greeting: "Text Field 369",

  productSpecialist: "Text Field 327",

  name:     "Text Field 315",
  contact:  "Text Field 316",
  email:    "Text Field 317",
  address:  "Text Field 318",
  city:     "Text Field 320",
  state:    "Text Field 360",
  pin_code: "Text Field 361",

  end_user_name:    "Text Field 298",
  end_user_contact: "Text Field 310",
  end_user_email:   "Text Field 311",
  end_user_address: "Text Field 359",
  end_user_city:    "Text Field 314",
  end_user_state:   "Text Field 362",
  end_user_pin:     "Text Field 363",

  model:     "Text Field 3016",
  model_year:"Text Field 3017",
  mfg_year:  "Text Field 3018",
  engine_no: "Text Field 3019",
  chassis_no:"Text Field 3020",
  fuel_type: "Text Field 3021",

  exterior:       "Text Field 3010",
  upholstery:     "Text Field 3011",
  insurance_date: "Text Field 3012",
  invoice_date:   "Text Field 3013",
  pdi_date:       "Text Field 3014",
  delivery_date:  "Text Field 3015",

  fuel_reading:     "Text Field 285",
  odometer_reading: "Text Field 284",

};

const BOOLEAN_CHECKBOX_MAP = {

  vc_spare_dummy_keys:      "Check Box 95",
  vc_floor_carpet_mats:     "Check Box 97",
  vc_first_aid_kit:         "Check Box 99",
  vc_front_tyre_pressure:   "Check Box 101",
  vc_rear_tyre_pressure:    "Check Box 103",
  vc_invoice_debit_note:    "Check Box 105",

  vc_rto_tax_receipt:       "Check Box 136",
  vc_insurance_policy:      "Check Box 137",
  vc_defender_care:         "Check Box 138",
  vc_digital_owners_manual: "Check Box 102",
  vc_service_warranty:      "Check Box 104",
  vc_connected_car_service: "Check Box 1016",

  tk_screwdriver:             "Check Box 139",
  tk_wheel_key:               "Check Box 142",
  tk_spare_wheel:             "Check Box 140",
  tk_hazard_warning_triangle: "Check Box 143",
  tk_tow_away_hook:           "Check Box 141",
  tk_jack_and_handle:         "Check Box 1017"

};


const setText = (form, field, value) => {
  try {
    form.getTextField(field).setText(value !== undefined && value !== null ? String(value) : "");
  } catch (err) {
    console.warn("Missing text field:", field);
  }
};

const setBooleanCheckbox = (form, field, value) => {
  try {
    const checkbox = form.getCheckBox(field);
    if (value === true) checkbox.check();
    else checkbox.uncheck();
  } catch (err) {
    console.warn("Checkbox missing:", field);
  }
};

const generateDefenderGuidePdf = async (req, res) => {

  try {

    const leadId = req.params.leadId;

    const lead = await Leads.findByPk(leadId, { raw: true });

=======


// ─────────────────────────────────────────────
//  PATHS
// ─────────────────────────────────────────────
const PDF_TEMPLATE_PATH =
  "D:/Node_Folder/SmartAssist-uat/pdfFolder/250107_IND_Handover Guide_DEFENDER_V12_Justify_Approved_Interactive.pdf";

// ─────────────────────────────────────────────
//  PAGE SIZE: 1080 x 1536 pts
//  y = PAGE_HEIGHT - fromTop - fontSize
// ─────────────────────────────────────────────
const PAGE_HEIGHT = 1536;

// ─────────────────────────────────────────────
//  PAGE 5 — DEFENDER DIRECTORY
// ─────────────────────────────────────────────
const PAGE5_FIELDS = {
  productSpecialist:       { x: 280, fromTop: 540, size: 18 },
  clientExperienceManager: { x: 120, fromTop: 660, size: 13 },
  salesHead:               { x: 120, fromTop: 760, size: 13 },
  serviceCRM:              { x: 120, fromTop: 860, size: 13 },
  serviceHead:             { x: 120, fromTop: 960, size: 13 },
};

// ─────────────────────────────────────────────
//  PAGE 14 — VEHICLE CHECKLIST
// ─────────────────────────────────────────────
const PAGE14_FIELDS = {
  // Customer
  name:    { x: 180, fromTop: 317, size: 18 },
  contact: { x: 180, fromTop: 357, size: 18 },
  email:   { x: 180, fromTop: 395, size: 18 },

  name2:    { x: 740, fromTop: 317, size: 18 },
  contact2: { x: 740, fromTop: 357, size: 18 },
  email2:   { x: 740, fromTop: 395, size: 18 },

  // Vehicle
  model:      { x: 180, fromTop: 430,  size: 18 },
  modelYear:  { x: 730, fromTop: 460,  size: 18 },
  mfgYear:    { x: 730, fromTop: 490,  size: 18 },
  engineNo:   { x: 730, fromTop: 510,  size: 18 },
  chassisNo:  { x: 730, fromTop: 540,  size: 18 },
  fuelType:   { x: 730, fromTop: 560, size: 18 },
  exterior:   { x: 730, fromTop: 580, size: 18 },
  upholstery: { x: 730, fromTop: 600, size: 18 },

  // Dates
  insuranceDate: { x: 160, fromTop: 1180, size: 13 },
  invoiceDate:   { x: 370, fromTop: 1180, size: 13 },
  pdiDate:       { x: 580, fromTop: 1180, size: 13 },
  deliveryDate:  { x: 790, fromTop: 1180, size: 13 },

  // Readings
  fuelReading:     { x: 265, fromTop: 1260, size: 13 },
  odometerReading: { x: 730, fromTop: 1260, size: 13 },
};

// ─────────────────────────────────────────────
//  FONT LOADER — extracts font from PDF itself
// ─────────────────────────────────────────────
async function loadTemplateFont(pdfDoc) {
  try {
    const firstPage    = pdfDoc.getPages()[0];
    const resources    = firstPage.node.Resources();
    if (!resources) throw new Error("No resources");

    const fontDict = resources.lookup(pdfDoc.context.obj("Font"));
    if (!fontDict) throw new Error("No font dict");

    const fontKeys = fontDict.keys();
    if (!fontKeys.length) throw new Error("No font keys");

    const fontRef      = fontDict.lookup(fontKeys[0]);
    const fontDescDict = fontRef.lookup(pdfDoc.context.obj("FontDescriptor"));
    if (!fontDescDict) throw new Error("No font descriptor");

    const fontFileRef =
      fontDescDict.lookup(pdfDoc.context.obj("FontFile2")) ||
      fontDescDict.lookup(pdfDoc.context.obj("FontFile3")) ||
      fontDescDict.lookup(pdfDoc.context.obj("FontFile"));
    if (!fontFileRef) throw new Error("No font file");

    return await pdfDoc.embedFont(fontFileRef.contents, { subset: true });

  } catch (err) {
    console.warn("[Font] Falling back to Helvetica:", err.message);
    return await pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}


async function drawField(page, pdfDoc, text, field, options = {}) {
  if (text === null || text === undefined || text === "") return;

  const font     = options.font || await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = field.size || 13;
  const y        = PAGE_HEIGHT - field.fromTop - fontSize;

  page.drawText(String(text), {
    x: field.x,
    y,
    size: fontSize,
    font,
    color: field.color || rgb(0, 0, 0),
    ...(field.maxWidth && { maxWidth: field.maxWidth }),
  });
}


const downloadGuideWithProductSpecialist = async (req, res) => {
  try {
    const leadId = req.params.leadId;

    const lead = await Leads.findByPk(leadId, { raw: true });
>>>>>>> 27fb6eb53d10f6b2477adc8ebfdd8a8f302bcbe5
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

<<<<<<< HEAD
    const guide = await defenderGuideModel.findOne({
      where: { lead_id: leadId },
      raw: true
    });

    const existingPdf = fs.readFileSync(PDF_TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(existingPdf);
    const form = pdfDoc.getForm();


    const DIRECTORY_FIELDS = [
      "Text Field 322",  
      "Text Field 327",    
      "Text Field 349",  // Client Experience Manager name
      "Text Field 350",  // Client Experience Manager contact
      "Text Field 351",  // Sales Head name
      "Text Field 352",  // Sales Head contact
      "Text Field 353",  // Service CRM name
      "Text Field 354",  // Service CRM contact
      "Text Field 355",  // Service Head name
      "Text Field 356",  // Service Head contact
    ];

    DIRECTORY_FIELDS.forEach(field => setText(form, field, ""));


    const greetingText = [lead?.lead_owner, guide?.name]
      .filter(Boolean)
      .join(" / ");

    const productSpecialist = lead?.lead_owner || "";

    const name            = guide?.name            || "";
    const contact         = guide?.contact         || "";
    const email           = guide?.email           || "";
    const address         = guide?.address         || "";
    const city            = guide?.city            || "";
    const state           = guide?.state           || "";
    const pin_code        = guide?.pin_code        || "";

    const end_user_name    = guide?.end_user_name    || "";
    const end_user_contact = guide?.end_user_contact || "";
    const end_user_email   = guide?.end_user_email   || "";
    const end_user_address = guide?.end_user_address || "";
    const end_user_city    = guide?.end_user_city    || "";
    const end_user_state   = guide?.end_user_state   || "";
    const end_user_pin_code = guide?.end_user_pin_code || "";

    const model      = guide?.model      || "";
    const model_year = guide?.model_year || "";
    const mfg_year   = guide?.mfg_year   || "";
    const engine_no  = guide?.engine_no  || "";
    const chassis_no = guide?.chassis_no || "";
    const fuel_type  = guide?.fuel_type  || "";

    const exterior       = guide?.exterior       || "";
    const upholstery     = guide?.upholstery     || "";
    const insurance_date = guide?.insurance_date || "";
    const invoice_date   = guide?.invoice_date   || "";
    const pdi_date       = guide?.pdi_date       || "";
    const delivery_date  = guide?.delivery_date  || "";

    const fuel_reading     = guide?.fuel_reading     || "";
    const odometer_reading = guide?.odometer_reading || "";

    setText(form, FIELD_MAP.greeting, greetingText);
    setText(form, FIELD_MAP.productSpecialist, productSpecialist);
    setText(form, FIELD_MAP.name,     name);
    setText(form, FIELD_MAP.contact,  contact);
    setText(form, FIELD_MAP.email,    email);
    setText(form, FIELD_MAP.address,  address);
    setText(form, FIELD_MAP.city,     city);
    setText(form, FIELD_MAP.state,    state);
    setText(form, FIELD_MAP.pin_code, pin_code);

    setText(form, FIELD_MAP.end_user_name,    end_user_name);
    setText(form, FIELD_MAP.end_user_contact, end_user_contact);
    setText(form, FIELD_MAP.end_user_email,   end_user_email);
    setText(form, FIELD_MAP.end_user_address, end_user_address);
    setText(form, FIELD_MAP.end_user_city,    end_user_city);
    setText(form, FIELD_MAP.end_user_state,   end_user_state);
    setText(form, FIELD_MAP.end_user_pin, end_user_pin_code);

    setText(form, FIELD_MAP.model,      model);
    setText(form, FIELD_MAP.model_year, model_year);
    setText(form, FIELD_MAP.mfg_year,   mfg_year);
    setText(form, FIELD_MAP.engine_no,  engine_no);
    setText(form, FIELD_MAP.chassis_no, chassis_no);
    setText(form, FIELD_MAP.fuel_type,  fuel_type);

    setText(form, FIELD_MAP.exterior,       exterior);
    setText(form, FIELD_MAP.upholstery,     upholstery);
    setText(form, FIELD_MAP.insurance_date, insurance_date);
    setText(form, FIELD_MAP.invoice_date,   invoice_date);
    setText(form, FIELD_MAP.pdi_date,       pdi_date);
    setText(form, FIELD_MAP.delivery_date,  delivery_date);

    setText(form, FIELD_MAP.fuel_reading,     fuel_reading);
    setText(form, FIELD_MAP.odometer_reading, odometer_reading);


    if (guide) {
      Object.entries(BOOLEAN_CHECKBOX_MAP).forEach(([dbField, pdfField]) => {
        setBooleanCheckbox(form, pdfField, guide[dbField]);
      });
    }


    if (guide) {

      if (guide.collector_type === "OWNER") {
        const radio = form.getRadioGroup("Radio Button 3");
        if (guide.collector_present === true) radio.select(radio.getOptions()[0]);
        else radio.select(radio.getOptions()[1]);
      }

      if (guide.collector_type === "REPRESENTATIVE") {
        const radio = form.getRadioGroup("Radio Button 6");
        if (guide.collector_present === true) radio.select(radio.getOptions()[0]);
        else radio.select(radio.getOptions()[1]);
      }

    }

    if (guide?.collector_signature) {

      try {

        let base64 = guide.collector_signature;

        if (base64.startsWith("data:image")) {
          base64 = base64.split(",")[1];
        }

        const buffer = Buffer.from(base64, "base64");

        let image;
        try {
          image = await pdfDoc.embedPng(buffer);
        } catch {
          image = await pdfDoc.embedJpg(buffer);
        }

        const pages = pdfDoc.getPages();

        if (guide.collector_type === "OWNER") {
          pages[15].drawImage(image, { x: 280, y: 411, width: 200, height: 80 });
        }

        if (guide.collector_type === "REPRESENTATIVE") {
          pages[16].drawImage(image, { x: 280, y: 282, width: 200, height: 80 });
        }

      } catch (err) {
        console.warn("Signature failed:", err.message);
      }

    }



    form.flatten();

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Defender_Guide_${leadId}.pdf`
    );

    return res.send(Buffer.from(pdfBytes));

  } catch (err) {

    console.error("[PDF] Error:", err);
    return res.status(500).json({
      message: "Failed to generate PDF",
      error: err.message
    });

  }

};

const saveDefenderGuide = async (req, res) => {
  try {
    const { leadId } = req.params;    

    const VALID_COLLECTOR = ["OWNER", "REPRESENTATIVE"];

   if (req.body.collector_type && !VALID_COLLECTOR.includes(req.body.collector_type)) {
    return res.status(400).json({ message: "Invalid collector_type" });
   }

    const payload = {
      ...req.body,
      lead_id: leadId,
      dealer_id: req.dealerId,
      corporate_id: req.corporateId,
      created_by: req.userId,
    };

    let guide = await defenderGuideModel.findOne({
      where: { lead_id: leadId },
    });

    if (guide) {
      await guide.update(payload);
    } else {
      guide = await defenderGuideModel.create(payload);
    }

    return responses.success(res, "Guide saved", guide);

  } catch (err) {
    return responses.serverError(res, err.message);
  }
};



const getDefenderGuide = async (req, res) => {
  try {
    const { leadId } = req.params;

    const guide = await defenderGuideModel.findOne({
      where: { lead_id: leadId },
      raw: true,
    });

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    return res.json(guide);
  } catch (err) {
    return res.status(500).json({ message: "Fetch failed" });
=======
    const existingPdf = fs.readFileSync(PDF_TEMPLATE_PATH);
    const pdfDoc      = await PDFDocument.load(existingPdf);
    const pages       = pdfDoc.getPages();

    const font       = await loadTemplateFont(pdfDoc);
    const fontOption = { font };

    // ── PAGE 5 ───────────────────────────────────
    const page5 = pages[4];

    await drawField(page5, pdfDoc, lead.lead_owner,  PAGE5_FIELDS.productSpecialist,       fontOption);
    // Add these DB columns when available in your leads table:
    // await drawField(page5, pdfDoc, lead.client_experience_manager, PAGE5_FIELDS.clientExperienceManager, fontOption);
    // await drawField(page5, pdfDoc, lead.sales_head,                PAGE5_FIELDS.salesHead,               fontOption);
    // await drawField(page5, pdfDoc, lead.service_crm,               PAGE5_FIELDS.serviceCRM,              fontOption);
    // await drawField(page5, pdfDoc, lead.service_head,              PAGE5_FIELDS.serviceHead,             fontOption);

    // ── PAGE 14 ──────────────────────────────────
    const page14 = pages[13];

    // ✅ Use lead_name directly — already full name from DB
    await drawField(page14, pdfDoc, lead.lead_name,      PAGE14_FIELDS.name,    fontOption);
    await drawField(page14, pdfDoc, lead.mobile,         PAGE14_FIELDS.contact, fontOption);
    await drawField(page14, pdfDoc, lead.email,          PAGE14_FIELDS.email,   fontOption);

    await drawField(page14, pdfDoc, lead.lead_name,      PAGE14_FIELDS.name2,    fontOption);
    await drawField(page14, pdfDoc, lead.mobile,         PAGE14_FIELDS.contact2, fontOption);
    await drawField(page14, pdfDoc, lead.email,          PAGE14_FIELDS.email2,   fontOption);

    // Vehicle details
    await drawField(page14, pdfDoc, lead.vehicle_name,   PAGE14_FIELDS.model,         fontOption);
    await drawField(page14, pdfDoc, lead.VIN,            PAGE14_FIELDS.chassisNo,     fontOption);
    await drawField(page14, pdfDoc, lead.fuel_type,      PAGE14_FIELDS.fuelType,      fontOption);
    await drawField(page14, pdfDoc, lead.exterior_color, PAGE14_FIELDS.exterior,      fontOption);

    // Add these DB columns if they exist in your leads table:
    // await drawField(page14, pdfDoc, lead.model_year,     PAGE14_FIELDS.modelYear,     fontOption);
    // await drawField(page14, pdfDoc, lead.mfg_year,       PAGE14_FIELDS.mfgYear,       fontOption);
    // await drawField(page14, pdfDoc, lead.engine_no,      PAGE14_FIELDS.engineNo,      fontOption);
    // await drawField(page14, pdfDoc, lead.upholstery,     PAGE14_FIELDS.upholstery,    fontOption);
    // await drawField(page14, pdfDoc, lead.insurance_date, PAGE14_FIELDS.insuranceDate, fontOption);
    // await drawField(page14, pdfDoc, lead.invoice_date,   PAGE14_FIELDS.invoiceDate,   fontOption);
    // await drawField(page14, pdfDoc, lead.pdi_date,       PAGE14_FIELDS.pdiDate,       fontOption);
    // await drawField(page14, pdfDoc, lead.delivery_date,  PAGE14_FIELDS.deliveryDate,  fontOption);
    // await drawField(page14, pdfDoc, lead.fuel_reading,   PAGE14_FIELDS.fuelReading,   fontOption);
    // await drawField(page14, pdfDoc, lead.odometer_reading, PAGE14_FIELDS.odometerReading, fontOption);

    // ── Flatten → non-editable ───────────────────
    pdfDoc.getForm().flatten();

    // ── Send ─────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Defender_Guide_${leadId}.pdf`);
    return res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error("[PDF] Error:", err);
    return res.status(500).json({ message: "Failed to generate PDF", error: err.message });
>>>>>>> 27fb6eb53d10f6b2477adc8ebfdd8a8f302bcbe5
  }
};


module.exports = {
  createLead,
  getAllLeadsByTeamOwner,
  getAllLeadsByUser,
  getLeadById,
  updateLead,
  reassignLead,
  leadsEventNTasks,
  existingLeads,
  markLost,
  createOpportunity,
<<<<<<< HEAD
  generateDefenderGuidePdf,
  saveDefenderGuide,
  getDefenderGuide
};








=======
  downloadGuideWithProductSpecialist
};
>>>>>>> 27fb6eb53d10f6b2477adc8ebfdd8a8f302bcbe5
