/* eslint-disable no-useless-escape */
const Users = require("../../models/master/usersModel");
const Vehicles = require("../../models/master/vehicleModel");
const Dealers = require("../../models/master/dealerModel");
const Analytics = require("../../models/master/analyticsModel");
const Teams = require("../../models/master/teamMasterModel");
const TeamLead = require("../../models/master/teamLeadModel");
const Colors = require("../../models/master/colorModel");
const Campaign = require("../../models/master/campaignModel");
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const sfLogger = require("../../middlewares/fileLogs/sfLogger");
const dateController = require("../../utils/dateFilter");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const {
  sendMailForSf,
} = require("../../middlewares/emails/triggerEmailErrors");
const logErrorToDB = require("../../middlewares/dbLogs/sfDbLogs");
const digitalLogs = require("../../middlewares/dbLogs/digitalEnqLogs");
const IST = "Asia/Kolkata";
const { Op, fn, col, where } = require("sequelize");
const Roles = require("../../models/master/roleModel");

//bulk insert dealers
const insertDealers = async (req, res) => {
  try {
    let dealerData = req.body;
    // Map dealer data to gather information for bulk insertion
    const dealerToInsert = await Promise.all(
      dealerData.map(async (dealer) => {
        const { dealer_name, dealer_code, corporate_id } = dealer;

        // Prepare the data object for bulk insertion
        return {
          dealer_name,
          dealer_code,
          corporate_id,
        };
      })
    );

    // Attempt bulk insert of all dealers
    const insertedDealers = await Dealers.bulkCreate(dealerToInsert, {
      returning: true,
    });

    res.status(201).json({
      message: `Dealers created ${process.env.ST201}`,
      dealers: insertedDealers,
    });
  } catch (error) {
    console.error("Error creating dealers:", error);
    res.status(400).json({
      error: "Failed to create dealers",
      details: error.message,
    });
  }
};
//end

//bulk insert dealer pricipal
const insertDP = async (req, res) => {
  try {
    const dataArray = req.body;
    const success = [];
    const failed = [];

    const results = await Promise.allSettled(
      dataArray.map(async (user) => {
        try {
          const dealer = await Dealers.findOne({
            where: { dealer_code: user.dealer_code },
            raw: true,
          });
          const existingUser = await Users.findOne({
            where: { email: user.email },
          });
          if (existingUser) {
            throw new Error(`User already exists with email: ${user.email}`);
          }

          if (!dealer) {
            throw new Error(`Dealer not found for code: ${user.dealer_code}`);
          }

          const role = await Roles.findOne({
            where: { role_name: user.user_role },
            raw: true,
          });
          if (!role) {
            throw new Error(`Role not found for user role: ${user.user_role}`);
          }
          const formattedEmail = user.email.toLowerCase();

          const name = `${user.fname || ""} ${user.lname || ""}`;
          //update dealer table to add dp
          await Dealers.update(
            {
              dealer_email: formattedEmail,
            },
            {
              where: { dealer_id: dealer.dealer_id },
            }
          );
          // Construct the user object to insert
          return {
            ...user,
            email: formattedEmail,
            name,
            role_id: role.role_id,
            dealer_id: dealer.dealer_id,
            dealer_name: dealer.dealer_name,
            corporate_id: dealer.corporate_id,
          };
        } catch (err) {
          throw { error: err.message, record: user };
        }
      })
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        success.push(result.value);
      } else {
        failed.push(result.reason);
      }
    });

    if (success.length > 0) {
      await Users.bulkCreate(success, { validate: true });
    }

    return res.status(200).json({
      message: "User data processed",
      insertedRecords: success.length,
      failedRecords: failed.length,
      failed,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    return res.status(500).json({ error: error.message });
  }
};
//bulk insert managers
const insertSM = async (req, res) => {
  try {
    const dataArray = req.body;
    const success = [];
    const failed = [];

    const results = await Promise.allSettled(
      dataArray.map(async (user) => {
        try {
          const dealer = await Dealers.findOne({
            where: { dealer_code: user.dealer_code },
            raw: true,
          });
          const existingUser = await Users.findOne({
            where: { email: user.email },
          });
          if (existingUser) {
            throw new Error(`User already exists with email: ${user.email}`);
          }
          if (!dealer) {
            throw new Error(`Dealer not found for code: ${user.dealer_code}`);
          }
          const role = await Roles.findOne({
            where: { role_name: user.user_role },
          });
          if (!role) {
            throw new Error(`Role not found for user role: ${user.user_role}`);
          }

          const formattedEmail = user.email.toLowerCase();
          const firstName = user.fname?.trim() || "";
          const lastName = user.lname?.trim() || "";
          const name = `${firstName || ""} ${lastName || ""}`;
          const team = await Teams.create({
            team_name: name,
            team_lead_email: formattedEmail,
            dealer_id: dealer.dealer_id,
            corporate_id: dealer.corporate_id,
          });

          const teamFormat = team.toJSON();

          // Construct the user object to insert
          return {
            ...user,
            email: formattedEmail,
            name,
            role_id: role.role_id,
            team_id: teamFormat.team_id,
            dealer_id: dealer.dealer_id,
            dealer_name: dealer.dealer_name,
            team_role: "Owner",
            corporate_id: dealer.corporate_id,
          };
        } catch (err) {
          const detailedError =
            err.name === "SequelizeValidationError" ||
            err.name === "SequelizeUniqueConstraintError"
              ? err.errors.map((e) => ({
                  message: e.message,
                  path: e.path,
                  value: e.value,
                }))
              : [{ message: err.message || "Unknown error" }];

          throw { errors: detailedError, record: user };
        }
      })
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        success.push(result.value);
      } else {
        failed.push(result.reason);
      }
    });

    if (success.length > 0) {
      try {
        await Users.bulkCreate(success, { validate: true });
      } catch (bulkErr) {
        if (
          bulkErr.name === "SequelizeValidationError" ||
          bulkErr.name === "SequelizeUniqueConstraintError"
        ) {
          bulkErr.errors.forEach((e, index) => {
            failed.push({
              errors: [
                {
                  message: e.message,
                  path: e.path,
                  value: e.value,
                },
              ],
              record: success[index],
            });
          });
        } else {
          failed.push({ error: bulkErr.message, records: success });
        }

        // Clear success since insertion failed
        success.length = 0;
      }
    }

    return res.status(200).json({
      message: "User data processed",
      insertedRecords: success.length,
      failedRecords: failed.length,
      failed,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    return res.status(500).json({ error: error.message });
  }
};
//end

//insert TL
const insertTL = async (req, res) => {
  try {
    const dataArray = req.body;
    const success = [];
    const failed = [];

    const results = await Promise.allSettled(
      dataArray.map(async (user) => {
        try {
          const dealer = await Dealers.findOne({
            where: { dealer_code: user.dealer_code },
            raw: true,
          });
          const existingUser = await Users.findOne({
            where: { email: user.email },
          });
          if (existingUser) {
            throw new Error(`User already exists with email: ${user.email}`);
          }
          if (!dealer) {
            throw new Error(`Dealer not found for code: ${user.dealer_code}`);
          }
          const role = await Roles.findOne({
            where: { role_name: user.user_role },
          });
          if (!role) {
            throw new Error(`Role not found for user role: ${user.user_role}`);
          }

          const formattedEmail = user.email.toLowerCase();
          const firstName = user.fname?.trim() || "";
          const lastName = user.lname?.trim() || "";
          const name = `${firstName || ""} ${lastName || ""}`;
          const team = await TeamLead.create({
            team_name: name,
            team_lead_email: formattedEmail,
            dealer_id: dealer.dealer_id,
            corporate_id: dealer.corporate_id,
          });

          const teamFormat = team.toJSON();

          // Construct the user object to insert
          return {
            ...user,
            email: formattedEmail,
            name,
            role_id: role.role_id,
            tl_id: teamFormat.tl_id,
            dealer_id: dealer.dealer_id,
            dealer_name: dealer.dealer_name,
            team_role: "Owner",
            corporate_id: dealer.corporate_id,
          };
        } catch (err) {
          const detailedError =
            err.name === "SequelizeValidationError" ||
            err.name === "SequelizeUniqueConstraintError"
              ? err.errors.map((e) => ({
                  message: e.message,
                  path: e.path,
                  value: e.value,
                }))
              : [{ message: err.message || "Unknown error" }];

          throw { errors: detailedError, record: user };
        }
      })
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        success.push(result.value);
      } else {
        failed.push(result.reason);
      }
    });

    if (success.length > 0) {
      try {
        await Users.bulkCreate(success, { validate: true });
      } catch (bulkErr) {
        if (
          bulkErr.name === "SequelizeValidationError" ||
          bulkErr.name === "SequelizeUniqueConstraintError"
        ) {
          bulkErr.errors.forEach((e, index) => {
            failed.push({
              errors: [
                {
                  message: e.message,
                  path: e.path,
                  value: e.value,
                },
              ],
              record: success[index],
            });
          });
        } else {
          failed.push({ error: bulkErr.message, records: success });
        }

        // Clear success since insertion failed
        success.length = 0;
      }
    }

    return res.status(200).json({
      message: "User data processed",
      insertedRecords: success.length,
      failedRecords: failed.length,
      failed,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    return res.status(500).json({ error: error.message });
  }
};
//end

//bulk insert PS
const insertPS = async (req, res) => {
  try {
    let dataArray = req.body;
    const success = [];
    const failed = [];

    const usersToInsert = await Promise.allSettled(
      dataArray.map(async (user) => {
        try {
          const dealer = await Dealers.findOne({
            where: { dealer_code: user.dealer_code },
          });
          const formattedEmail = user?.email?.toLowerCase();
          const firstName = user.fname?.trim() || "";
          const lastName = user.lname?.trim() || "";
          const name = `${firstName || ""} ${lastName || ""}`;
          // const existingUser = await Users.findOne({
          //   where: { email: user.email },
          // });
          // if (existingUser) {
          //   throw new Error(`User already exists with email: ${user.email}`);
          // }

          if (user.manager) {
            const team_lead = await Teams.findOne({
              where: { team_name: user.manager },
            });

            if (team_lead) {
              user.team_id = team_lead.team_id;
            }
          }
          const role = await Roles.findOne({
            where: { role_name: user.user_role },
          });
          if (!role) {
            throw new Error(`Role not found for user role: ${user.user_role}`);
          }

          return {
            ...user,
            name,
            role_id: role.role_id,
            email: formattedEmail,
            dealer_id: dealer.dealer_id,
            dealer_name: dealer.dealer_name,
            corporate_id: dealer.corporate_id,
          };
        } catch (err) {
          sfLogger.error(
            JSON.stringify({
              error: err.message,
            })
          );
          await logErrorToDB({
            reqUrl: req.originalUrl,
            errorType: err.name,
            errorMessage: err.message,
            // failedRecord: user,
            userId: req.userId || null,
          });
          throw err;
        }
      })
    );

    usersToInsert.forEach((user, index) => {
      if (user.status === "fulfilled") {
        success.push(user.value);
      } else if (user.status === "rejected") {
        failed.push({
          record: insertPS[index],
          error: user.reason.message,
        });
      }
    });

    if (success.length > 0) {
      await Users.bulkCreate(success);
    }

    if (failed.length > 0) {
      sfLogger.error(`Failed records: ${JSON.stringify(failed, null, 2)}`);
      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath =
        logFiles.length > 0
          ? path.join(logDir, logFiles[logFiles.length - 1])
          : null;

      // Send email with error log if the log file exists
      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }
      return res.status(400).json({ message: "Error logs sent successfully" });
    }

    return res.status(200).json({
      message: "users data inserted",
      insertedRecords: success.length,
      failedRecords: failed.length,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    sfLogger.error({
      error: "Critical error during processing",
      details: error.message,
    });
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: req.userId || null,
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
//end

//bulk insert leads
const insertLeads = async (req, res) => {
  const BATCH_SIZE = 1000;
  try {
    const leadsArray = req.body;
    const successfulRecords = [];
    const failedRecords = [];
    const createdRecords = [];
    const skippedDuplicates = [];

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const processLead = async (lead, reqUrl) => {
      try {
        const firstName = lead.fname?.trim() || "";
        const lastName = lead.lname?.trim() || "";
        const lead_name = (firstName + " " + lastName).trim();
        const namePart = lead_name;
        let retailer;
        if (lead.dealer_name) {
          retailer = lead.dealer_name;
        } else {
          const data = await Users.findOne({
            where: {
              name: lead.lead_owner,
            },
            returning: true,
          });
          retailer = data.dealer_name;
        }

        const urlSlug =
          `${lead.cxp_lead_code}/` +
          namePart
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\-]/g, "");

        const user = await Users.findOne({
          where: {
            [Op.and]: [
              where(
                fn("LOWER", col("name")),
                Op.eq,
                lead.lead_owner.toLowerCase()
              ),
              { dealer_name: retailer },
            ],
          },
        });

        if (!user) {
          throw new Error(`User not found: ${lead.lead_owner}`);
        }

        // Check if lead already exists
        const normalizedMobile =
          (lead.mobile?.length === 10 ? "+91" : "") + (lead.mobile ?? "");

        const existingLead = await Leads.findOne({
          where: {
            mobile: normalizedMobile,
            dealer_id: user.dealer_id,
          },
        });

        if (existingLead) {
          return { isDuplicate: true, existingLead };
        }

        const vehicle = await Vehicles.findOne({
          where: { vehicle_name: lead.PMI, dealer_id: user.dealer_id },
        });

        if (!vehicle) {
          throw new Error(`Vehicle not found: ${lead.PMI}`);
        }

        const leadData = {
          ...lead,
          url: `${process.env.CXP_SLUG}${urlSlug}`,
          lead_name,
          mobile:
            (lead.mobile?.length === 10 ? "+91" : "") + (lead.mobile ?? ""),
          owner_email: user.email,
          brand: vehicle.brand,
          team_id: user.team_id || null,
          dealer_code: user.dealer_code,
          dealer_name: user.dealer_name,
          dealer_id: user.dealer_id,
          corporate_id: user.corporate_id,
          vehicle_id: vehicle.vehicle_id,
          vehicle_name: vehicle.vehicle_name,
          houseOfBrand: vehicle.houseOfBrand,
          chat_id: `91${lead.mobile}@c.us`,
          sp_id: user.user_id,
          flag: "inactive",
          reassign_flag: "inactive",
          from_cxp: true,
          ics_posted: true,
        };

        return { leadData, isDuplicate: false };
      } catch (err) {
        sfLogger.error(JSON.stringify({ error: err.message }));
        await logErrorToDB({
          reqUrl,
          errorType: err.name,
          errorMessage: err.message,
          failedRecord: lead,
          userId: null,
        });
        throw err;
      }
    };

    const batches = chunkArray(leadsArray, BATCH_SIZE);

    for (const batch of batches) {
      const settledResults = await Promise.allSettled(
        batch.map(async (lead) => await processLead(lead, req.originalUrl))
      );

      const batchCreateData = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const { leadData, isDuplicate, existingLead } = result.value;

          if (isDuplicate) {
            skippedDuplicates.push({
              record: batch[index],
              existingLeadId: existingLead.lead_id,
            });
          } else {
            batchCreateData.push(leadData);
          }
        } else {
          failedRecords.push({
            record: batch[index],
            reason: result.reason.message,
          });
        }
      });

      // Execute bulk create for new records
      if (batchCreateData.length > 0) {
        try {
          const createdLeads = await Leads.bulkCreate(batchCreateData);
          createdRecords.push(...createdLeads);
          createdLeads.forEach((lead) => {
            successfulRecords.push({ ...lead.toJSON(), operation: "created" });
          });
        } catch (createError) {
          sfLogger.error(`Bulk create error: ${createError.message}`);
          batchCreateData.forEach((leadData) => {
            failedRecords.push({
              record: leadData,
              reason: `Bulk create failed: ${createError.message}`,
            });
          });
        }
      }
    }

    // Handle failure logs
    if (failedRecords.length > 0) {
      sfLogger.error(
        `Failed records summary:\n${JSON.stringify(failedRecords, null, 2)}`
      );

      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }

      return res.status(400).json({
        message: "Some records failed. Error logs sent.",
        processedRecords: successfulRecords.length,
        createdRecords: createdRecords.length,
        skippedDuplicates: skippedDuplicates.length,
        failedRecords: failedRecords,
      });
    }

    return res.status(200).json({
      message: "All leads processed successfully",
      processedRecords: successfulRecords.length,
      createdRecords: createdRecords.length,
      skippedDuplicates: skippedDuplicates.length,
      failedRecords: 0,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    sfLogger.error({
      error: "Critical error during processing",
      details: error.message,
    });

    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: null,
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};

//end
const insertTasks = async (req, res) => {
  const BATCH_SIZE = 1000;
  try {
    const dataArr = req.body;
    const successfulRecords = [];
    const failedRecords = [];

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const batches = chunkArray(dataArr, BATCH_SIZE);

    for (const batch of batches) {
      const settledResults = await Promise.allSettled(
        batch.map(async (task) => {
          try {
            const status =
              task.completed === true ? "Completed" : "Not Started";

            const lead = await Leads.findOne({
              where: { cxp_lead_code: task.cxp_lead_code },
            });
            if (!lead) {
              throw Object.assign(
                new Error(`Lead not found: ${task.cxp_lead_code}`),
                {
                  reason: "LeadNotFound",
                }
              );
            }
            const user = await Users.findOne({
              where: where(
                fn("LOWER", col("name")),
                Op.eq,
                task.assigned_to.toLowerCase()
              ),
            });

            if (!user) {
              throw Object.assign(
                new Error(`User not found: ${task.assigned_to}`),
                {
                  reason: "UserNotFound",
                }
              );
            }

            const vehicle = await Vehicles.findOne({
              where: { vehicle_name: task.PMI },
            });
            if (!vehicle) {
              throw Object.assign(new Error(`Vehicle not found: ${task.PMI}`), {
                reason: "VehicleNotFound",
              });
            }

            let category, notification_category;
            if (["Call", "Send SMS", "Send Email"].includes(task.subject)) {
              category = "followups";
              notification_category = "followups";
            } else {
              category = "appointment";
              notification_category = "Appointment";
            }

            return {
              ...task,
              category,
              notification_category,
              status,
              dealer_name: user.dealer_name,
              dealer_id: user.dealer_id,
              corporate_id: user.corporate_id,
              lead_id: lead.lead_id,
              mobile: lead.mobile,
              lead_email: lead.email,
              lead_url: lead.url,
              sp_id: user.user_id,
              flag: "inactive",
              vehicle_id: vehicle.vehicle_id,
              houseOfBrand: vehicle.houseOfBrand,
            };
          } catch (error) {
            sfLogger.error(JSON.stringify({ error: error.message }));

            await logErrorToDB({
              reqUrl: req.originalUrl,
              errorType: error.name,
              errorMessage: error.message,
              failedRecord: task,
              userId: req.userId || null,
            });

            throw error;
          }
        })
      );

      const batchSuccess = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          batchSuccess.push(result.value);
        } else {
          const reason =
            result.reason.reason || result.reason.message || "Unknown Error";
          failedRecords.push({
            record: batch[index],
            reason,
          });
        }
      });

      if (batchSuccess.length > 0) {
        await Tasks.bulkCreate(batchSuccess);
        successfulRecords.push(...batchSuccess);
        sfLogger.info(
          `Inserted ${batchSuccess.length} task records into Tasks`
        );
      }
    }

    if (successfulRecords.length + failedRecords.length !== dataArr.length) {
      sfLogger.warn("Mismatch in processed task record count.");
    }

    if (failedRecords.length > 0) {
      sfLogger.error(
        `Failed task records: ${JSON.stringify(failedRecords, null, 2)}`
      );

      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }

      return res.status(400).json({
        message: "Some task records failed. Error logs sent.",
        insertedRecords: successfulRecords.length,
        failedRecords: failedRecords.length,
        failedDetails: failedRecords,
      });
    }

    return res.status(200).json({
      message: "All tasks inserted successfully",
      insertedRecords: successfulRecords.length,
      failedRecords: 0,
    });
  } catch (error) {
    console.error("Critical error during task processing:", error);
    sfLogger.error({
      error: "Critical error during task processing",
      details: error.message,
    });

    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: req.userId || null,
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const insertEvents = async (req, res) => {
  const BATCH_SIZE = 1000;
  try {
    const dataArr = req.body;
    const successfulRecords = [];
    const failedRecords = [];

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const batches = chunkArray(dataArr, BATCH_SIZE);

    for (const batch of batches) {
      const settledResults = await Promise.allSettled(
        batch.map(async (event) => {
          try {
            const status = event.completed === true ? "Finished" : "Planned";

            const lead = await Leads.findOne({
              where: { cxp_lead_code: event.cxp_lead_code },
            });
            if (!lead) {
              throw Object.assign(
                new Error(`Lead not found: ${event.cxp_lead_code}`),
                {
                  reason: "LeadNotFound",
                }
              );
            }

            const user = await Users.findOne({
              where: where(
                fn("LOWER", col("name")),
                Op.eq,
                event.assigned_to.toLowerCase()
              ),
            });
            if (!user) {
              throw Object.assign(
                new Error(`User not found: ${event.assigned_to}`),
                {
                  reason: "UserNotFound",
                }
              );
            }

            const vehicle = await Vehicles.findOne({
              where: { vehicle_name: event.PMI },
            });
            if (!vehicle) {
              throw Object.assign(
                new Error(`Vehicle not found: ${event.PMI}`),
                {
                  reason: "VehicleNotFound",
                }
              );
            }

            return {
              ...event,
              status,
              subject: "Test Drive",
              category: "testdrive",
              start_date: event.due_date,
              end_date: event.due_date,
              notification_category: "test drive",
              flag: "inactive",
              dealer_name: user.dealer_name,
              dealer_id: user.dealer_id,
              corporate_id: user.corporate_id,
              lead_id: lead.lead_id,
              mobile: lead.mobile,
              lead_email: lead.email,
              lead_url: lead.url,
              sp_id: user.user_id,
              houseOfBrand: vehicle.houseOfBrand,
              vehicle_id: vehicle.vehicle_id,
            };
          } catch (error) {
            sfLogger.error(JSON.stringify({ error: error.message }));

            await logErrorToDB({
              reqUrl: req.originalUrl,
              errorType: error.name,
              errorMessage: error.message,
              failedRecord: event,
              userId: req.userId || null,
            });

            throw error;
          }
        })
      );

      const batchSuccess = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          batchSuccess.push(result.value);
        } else {
          const reason =
            result.reason.reason || result.reason.message || "Unknown Error";
          failedRecords.push({
            record: batch[index],
            reason,
          });
        }
      });

      if (batchSuccess.length > 0) {
        await Events.bulkCreate(batchSuccess);
        successfulRecords.push(...batchSuccess); // Only push after actual insertion
        sfLogger.info(`Inserted ${batchSuccess.length} records into Events`);
      }
    }

    if (successfulRecords.length + failedRecords.length !== dataArr.length) {
      sfLogger.warn("Mismatch in processed record count.");
    }

    if (failedRecords.length > 0) {
      sfLogger.error(
        `Failed records: ${JSON.stringify(failedRecords, null, 2)}`
      );

      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }

      return res.status(400).json({
        message: "Some records failed. Error logs sent.",
        insertedRecords: successfulRecords.length,
        failedRecords: failedRecords.length,
        failedDetails: failedRecords,
      });
    }

    return res.status(200).json({
      message: "All events inserted successfully",
      insertedRecords: successfulRecords.length,
      failedRecords: 0,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    sfLogger.error({
      error: "Critical error during processing",
      details: error.message,
    });

    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: req.userId || null,
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};

//end

const analyticalRecords = async (req, res) => {
  const BATCH_SIZE = 1000;
  try {
    const dataArr = req.body;
    const created_at = moment().tz(IST).format("YYYY-MM-DD HH:mm:ss");
    const updated_at = moment().tz(IST).format("YYYY-MM-DD HH:mm:ss");
    const insertedRecords = [];
    const updatedRecords = [];
    const failedRecords = [];

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const batches = chunkArray(dataArr, BATCH_SIZE);

    for (const batch of batches) {
      const settledResults = await Promise.allSettled(
        batch.map(async (data) => {
          try {
            const user = await Users.findOne({
              where: { email: data.owner_email },
              attributes: [
                "user_id",
                "email",
                "name",
                "dealer_name",
                "dealer_id",
                "corporate_id",
                "team_id",
              ],
            });

            if (!user) {
              const message = `User not found: ${data.owner_email}`;
              sfLogger.error(JSON.stringify({ error: message }));
              await logErrorToDB({
                reqUrl: req.originalUrl,
                errorType: "UserNotFound",
                errorMessage: message,
                failedRecord: data,
              });
              return null;
            }

            const existingRecord = await Analytics.findOne({
              where: { user_id: user.user_id, range: data.range },
            });

            if (existingRecord) {
              await Analytics.update(
                {
                  ...data,
                  user_id: user.user_id,
                  user_name: user.name,
                },
                {
                  where: { record_id: existingRecord.record_id },
                }
              );
              return { type: "update", record: data };
            } else {
              return {
                type: "insert",
                record: {
                  ...data,
                  created_at,
                  updated_at,
                  team_id: user.team_id,
                  dealer_id: user.dealer_id,
                  corporate_id: user.corporate_id,
                  user_id: user.user_id,
                  user_name: user.name,
                },
              };
            }
          } catch (error) {
            sfLogger.error(JSON.stringify({ error: error.message }));
            await logErrorToDB({
              reqUrl: req.originalUrl,
              errorType: error.name,
              errorMessage: error.message,
              failedRecord: data,
            });
            throw error;
          }
        })
      );

      const insertBatch = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) {
          const value = result.value;
          if (value.type === "insert") {
            insertBatch.push(value.record);
            insertedRecords.push(value.record);
          } else if (value.type === "update") {
            updatedRecords.push(batch[index]);
          }
        } else {
          failedRecords.push({
            record: batch[index],
            error:
              result.status === "rejected"
                ? result.reason.message
                : "User not found",
          });
        }
      });

      if (insertBatch.length > 0) {
        await Analytics.bulkCreate(insertBatch, {
          individualHooks: true,
        });
      }
    }

    if (failedRecords.length > 0) {
      sfLogger.error(
        `Failed records: ${JSON.stringify(failedRecords, null, 2)}`
      );

      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }

      return res.status(400).json({
        message: "Some records failed. Error logs sent.",
        insertedRecords: insertedRecords.length,
        updatedRecords: updatedRecords.length,
        failedRecords: failedRecords.length,
      });
    }

    return res.status(200).json({
      message: "All data processed successfully",
      insertedRecords: insertedRecords.length,
      updatedRecords: updatedRecords.length,
      failedRecords: 0,
    });
  } catch (err) {
    console.error("Critical error during processing:", err);
    res.status(500).json({ error: err.message });
  }
};

//bulkinsert colors
const bulkInsertColors = async (req, res) => {
  try {
    const colorsArray = req.body;
    const bulkInsert = await Colors.bulkCreate(colorsArray);
    return res
      .status(200)
      .json({ message: "Colors inserted successfully: ", bulkInsert });
  } catch (err) {
    console.error("Error inserting colors:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
//bulkinsert campaigns
const bulkInsertCampaign = async (req, res) => {
  try {
    const campaign = req.body;
    const bulkInsert = await Campaign.bulkCreate(campaign);
    return res
      .status(200)
      .json({ message: "Campaigns inserted successfully: ", bulkInsert });
  } catch (err) {
    console.error("Error inserting campaigns:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

//bulk update opp_status
const bulkUpdateOpportunityStatus = async (req, res) => {
  try {
    const updatesArray = req.body;

    if (!Array.isArray(updatesArray) || updatesArray.length === 0) {
      return res
        .status(400)
        .json({ message: "Request body must be a non-empty array." });
    }

    const successfulUpdates = [];
    const failedUpdates = [];

    for (const item of updatesArray) {
      const { cxp_opp_code, cxp_lead_code, opp_status } = item;

      if (!cxp_opp_code || !opp_status) {
        failedUpdates.push({
          record: item,
          error: "Missing cxp_opp_code or opp_status",
        });
        continue;
      }

      try {
        const lead = await Leads.findOne({
          where: { cxp_lead_code },
        });

        if (!lead) {
          throw new Error("Lead not found");
        }

        await lead.update({
          opp_status,
          updated_at: dateController.now,
        });
        successfulUpdates.push(cxp_opp_code);
      } catch (error) {
        sfLogger.error(`Update failed for ${cxp_opp_code}: ${error.message}`);
        await logErrorToDB({
          reqUrl: req.originalUrl,
          errorType: error.name,
          errorMessage: error.message,
          failedRecord: item,
          userId: req.userId || null,
        });

        failedUpdates.push({
          record: item,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      message: "Bulk opportunity status update completed",
      updatedRecords: successfulUpdates.length,
      failedRecords: failedUpdates.length,
    });
  } catch (error) {
    console.error("Critical error during bulk update:", error);
    sfLogger.error({
      error: "Critical error during opportunity status bulk update",
      details: error.message,
    });

    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: req.userId || null,
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const oppsAdd = async (req, res) => {
  try {
    const dataArr = req.body;
    const results = {
      success: [],
      failed: [],
      totalProcessed: 0,
    };
    // Use for...of instead of forEach to handle async operations properly
    for (const data of dataArr) {
      try {
        // Find user with better error handling
        const user = await Users.findOne({
          where: { email: data.opp_owner_email },
          attributes: ["user_id", "email", "name"],
        });

        if (!user) {
          console.warn(`User not found for email: ${data.owner_email}`);
          results.failed.push({
            cxp_lead_code: data.cxp_lead_code,
            owner_email: data.owner_email,
            reason: "User not found",
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Update lead with additional validation
        const [affectedRows] = await Leads.update(
          { ...data, sp_id: user.sp_id, status: "Qualified", converted: true },
          { where: { cxp_lead_code: data.cxp_lead_code } }
        );

        if (affectedRows === 0) {
          console.warn(
            `No lead found to update for cxp_lead_code: ${data.cxp_lead_code}`
          );
          results.failed.push({
            cxp_lead_code: data.cxp_lead_code,
            owner_email: data.owner_email,
            reason: "Lead not found or no changes made",
            timestamp: new Date().toISOString(),
          });
        } else {
          results.success.push({
            cxp_lead_code: data.cxp_lead_code,
            owner_email: data.owner_email,
            sp_id: user.sp_id,
            affectedRows: affectedRows,
            timestamp: new Date().toISOString(),
          });
        }

        results.totalProcessed++;
      } catch (recordError) {
        console.error(
          `Error processing record ${data.cxp_lead_code}:`,
          recordError
        );
        results.failed.push({
          cxp_lead_code: data.cxp_lead_code,
          owner_email: data.owner_email,
          reason: recordError.message,
          stack: recordError.stack,
          timestamp: new Date().toISOString(),
        });
        results.totalProcessed++;
      }
    }

    // Return results to client
    res.status(200).json({
      message: "Bulk update completed",
      summary: {
        totalRecords: dataArr.length,
        successful: results.success.length,
        failed: results.failed.length,
        processed: results.totalProcessed,
      },
      details: results,
    });
  } catch (error) {
    console.error("Critical error in bulk update process:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      message: "Internal server error during bulk update",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

const insertDigitalLeads = async (req, res) => {
  const BATCH_SIZE = 100;
  try {
    const leadsArray = req.body;
    const successfulRecords = [];
    const failedRecords = [];
    const createdRecords = [];
    const skippedDuplicates = [];

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const processLead = async (lead, reqUrl) => {
      try {
        const firstName = lead.fname?.trim() || "";
        const lastName = lead.lname?.trim() || "";
        const lead_name = (firstName + " " + lastName).trim();
        const namePart = lead_name;
        let retailer;
        if (lead.dealer_name) {
          retailer = lead.dealer_name;
        } else {
          const data = await Users.findOne({
            where: {
              name: lead.lead_owner,
            },
            returning: true,
          });
          retailer = data.dealer_name;
        }

        const urlSlug =
          `${lead.cxp_lead_code}/` +
          namePart
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\-]/g, "");

        const user = await Users.findOne({
          where: {
            [Op.and]: [
              where(
                fn("LOWER", col("name")),
                Op.eq,
                lead.lead_owner.toLowerCase()
              ),
              { dealer_name: retailer },
            ],
          },
        });

        if (!user) {
          throw new Error(`User not found: ${lead.lead_owner}`);
        }

        // Check if lead already exists
        const normalizedMobile =
          (lead.mobile?.length === 10 ? "+91" : "") + (lead.mobile ?? "");

        const existingLead = await Leads.findOne({
          where: {
            mobile: normalizedMobile,
            dealer_id: user.dealer_id,
          },
        });

        if (existingLead) {
          return { isDuplicate: true, existingLead };
        }

        const vehicle = await Vehicles.findOne({
          where: { vehicle_name: lead.PMI, dealer_id: user.dealer_id },
        });

        if (!vehicle) {
          throw new Error(`Vehicle not found: ${lead.PMI}`);
        }

        const leadData = {
          ...lead,
          url: `${process.env.CXP_SLUG}${urlSlug}`,
          lead_name,
          mobile:
            (lead.mobile?.length === 10 ? "+91" : "") + (lead.mobile ?? ""),
          owner_email: user.email,
          brand: vehicle.brand,
          team_id: user.team_id || null,
          dealer_code: user.dealer_code,
          dealer_name: user.dealer_name,
          dealer_id: user.dealer_id,
          corporate_id: user.corporate_id,
          vehicle_id: vehicle.vehicle_id,
          vehicle_name: vehicle.vehicle_name,
          houseOfBrand: vehicle.houseOfBrand,
          chat_id: `91${lead.mobile}@c.us`,
          sp_id: user.user_id,
          flag: "inactive",
          reassign_flag: "inactive",
          from_cxp: true,
        };

        return { leadData, isDuplicate: false };
      } catch (err) {
        await logErrorToDB({
          reqUrl,
          errorType: err.name,
          errorMessage: err.message,
          failedRecord: lead,
          userId: null,
        });
        throw err;
      }
    };

    const batches = chunkArray(leadsArray, BATCH_SIZE);

    for (const batch of batches) {
      const settledResults = await Promise.allSettled(
        batch.map(async (lead) => await processLead(lead, req.originalUrl))
      );

      const batchCreateData = [];

      settledResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const { leadData, isDuplicate, existingLead } = result.value;

          if (isDuplicate) {
            skippedDuplicates.push({
              record: batch[index],
              existingLeadId: existingLead.lead_id,
            });
          } else {
            batchCreateData.push(leadData);
          }
        } else {
          failedRecords.push({
            record: batch[index],
            reason: result.reason.message,
          });
        }
      });

      // Execute bulk create for new records
      if (batchCreateData.length > 0) {
        try {
          const createdLeads = await Leads.bulkCreate(batchCreateData);
          createdRecords.push(...createdLeads);
          createdLeads.forEach((lead) => {
            successfulRecords.push({ ...lead.toJSON(), operation: "created" });
          });
        } catch (createError) {
          sfLogger.error(`Bulk create error: ${createError.message}`);
          batchCreateData.forEach((leadData) => {
            failedRecords.push({
              record: leadData,
              reason: `Bulk create failed: ${createError.message}`,
            });
          });
        }
      }
    }

    // Handle failure logs
    if (failedRecords.length > 0) {
      sfLogger.error(`Failed records summary: ${failedRecords.length})}`);

      const logDir = path.join(__dirname, "../../sflogs");
      const logFiles = fs
        .readdirSync(logDir)
        .filter((file) => file.startsWith("sferror-"))
        .sort();

      const latestLogFilePath = logFiles.length
        ? path.join(logDir, logFiles[logFiles.length - 1])
        : null;

      if (latestLogFilePath) {
        await sendMailForSf(latestLogFilePath);
      }

      return res.status(400).json({
        message: "Some records failed. Error logs sent.",
        processedRecords: successfulRecords.length,
        createdRecords: createdRecords.length,
        skippedDuplicates: skippedDuplicates.length,
        failedRecords: failedRecords.length,
      });
    }

    return res.status(200).json({
      message: "All leads processed successfully",
      processedRecords: successfulRecords.length,
      createdRecords: createdRecords.length,
      skippedDuplicates: skippedDuplicates.length,
      failedRecords: 0,
    });
  } catch (error) {
    console.error("Critical error during processing:", error);
    sfLogger.error({
      error: "Critical error during processing",
      details: error.message,
    });

    await digitalLogs({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord: null,
      userId: null,
    });

    return res.status(500).json({ error: "Internal Server Error" });
  }
};
module.exports = {
  insertDealers,
  insertSM,
  insertTL,
  insertDP,
  insertPS,
  insertLeads,
  insertDigitalLeads,
  insertTasks,
  insertEvents,
  analyticalRecords,
  bulkInsertColors,
  bulkInsertCampaign,
  bulkUpdateOpportunityStatus,
  oppsAdd,
};
