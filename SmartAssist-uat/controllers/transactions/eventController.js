require("dotenv").config();
const moment = require("moment-timezone");
const logger = require("../../middlewares/fileLogs/logger");
const rpaLogger = require("../../middlewares/fileLogs/rpaLogger");
const logErrorToDB = require("../../middlewares/dbLogs/transactDbLogs");
const { sendNotification } = require("../../utils/notification");
const fs = require("fs");
const path = require("path");
const {
  handleErrorAndSendLog,
} = require("../../middlewares/emails/triggerEmailErrors");
// const {
// sendConfirmation,
// } = require("../../middlewares/emails/testDriveScheduled");
const { Op, literal } = require("sequelize");
const dateController = require("../../utils/dateFilter");
const getNotificationTemplate = require("../../utils/notificationTemplate");
const responses = require("../../utils/globalResponse");
const Events = require("../../models/transactions/eventModel");
const Leads = require("../../models/transactions/leadsModel");
const Users = require("../../models/master/usersModel");
const EventActivity = require("../../models/auditLogs/event_activity");
const VehicleSlots = require("../../models/transactions/vehicleSlotsModel");
const { default: axios } = require("axios");
const { bookSlot } = require("./slotController");

//create new test drive
const createTestDrive = async (req, res) => {
  try {
    const { userId, userEmail } = req;
    const recordId = req.params.recordId;
    const bodyObj = req.body;
    const [lead, assignee] = await Promise.all([
      Leads.findByPk(recordId),
      Users.findByPk(bodyObj.sp_id),
    ]);

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

    const getModel = (PMI) => {
      return modelOfVehicle[PMI];
    };
    //date formatting
    const start_date_format = moment(bodyObj.start_date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");
    const end_date_format = moment(bodyObj.end_date, "DD-MM-YYYY")
      .local()
      .format("YYYY-MM-DD");

    const newEventForLeads = await Events.create({
      ...bodyObj,
      brand: "Land Rover",
      reamrks: bodyObj.description,
      PMI: bodyObj.PMI ? bodyObj.PMI : lead.PMI,
      model: getModel(bodyObj.PMI ? bodyObj.PMI : lead.PMI),
      location: bodyObj.location ? bodyObj.location : lead.location,
      subject: "Test Drive",
      notification_category: "test drive",
      category: "testdrive",
      owner_email: assignee.email,
      start_date: start_date_format,
      end_date: end_date_format,
      due_date: start_date_format,
      mobile: lead.mobile,
      vehicle_id: bodyObj.vehicleId ? bodyObj.vehicleId : lead.vehicle_id,
      lead_email: lead.email,
      name: lead.lead_name,
      assigned_to: assignee.name,
      lead_id: recordId,
      lead_url: lead.url,
      houseOfBrand: lead.houseOfBrand,
      cxp_lead_code: lead.cxp_lead_code,
      corporate_id: lead.corporate_id,
      dealer_id: lead.dealer_id,
      updated_by: userEmail,
      created_by: userId,
      rpa_name: "eventcreate",
      opp_url: lead.opp_url || null,
      places: bodyObj.places,
    });

    let slotBookingResult = null;
    const eventId = newEventForLeads.event_id;

    try {
      slotBookingResult = await bookSlot(
        bodyObj.vehicleId,
        bodyObj.start_time_slot,
        bodyObj.end_time_slot,
        bodyObj.date_of_booking,
        eventId,
        req.dealerId
      );
    } catch (error) {
      logger.error(`Error booking slot: ${error.message}`);
    }

    if (newEventForLeads) {
      responses.created(res, `Test drive created ${process.env.ST201}`, {
        newEventForLeads,
        slotBookingResult,
      });

      logger.info(
        `Test drive created successfully by User ${userId} for lead ${recordId}`
      );
      const eventData = newEventForLeads.toJSON();
      const startDate = moment(eventData.start_date).format("DD-MMM-YYYY");
      // await sendConfirmation(eventData, assignee);

      await EventActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: eventData.event_id,
        action: "Create",
        new_value: JSON.stringify(eventData),
        original_value: JSON.stringify(eventData),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.warn(
          `Failed to log activity for ${eventData.event_id}: ${err.message}`
        );
      });

      try {
        const notificationData = getNotificationTemplate(
          eventData.subject.toLowerCase(),
          eventData
        );

        await sendNotification({
          category: "test drive",
          userId: assignee.user_id,
          recordId: eventData.lead_id,
          deviceToken: assignee.device_token,
          title: notificationData.title,
          body: notificationData.body,

          content: notificationData.content || null,
        });
      } catch (notificationError) {
        logger.error(
          `Failed to send notification for Test drive of Lead ID ${recordId} to user ${assignee.user_id}: ${notificationError.message}`
        );
      }
      if (lead.url != null) {
        try {
          const axiosResponse = await axios.post(
            process.env.EVENT_URL,
            { ...eventData, startDate: startDate },
            { headers: { "Content-Type": "application/json" } }
          );

          rpaLogger.info(
            `Event create with ${eventData.event_id} sent to RPA`,
            axiosResponse.data
          );
        } catch (err) {
          console.error(
            `Event reate API error`,
            err.response?.data || err.message
          );
          rpaLogger.error(
            `Failed to post Event create API: ${
              err.response?.data?.message || err.message
            }`
          );
        }
      }
    }
    // else {
    //   responses.badRequest(
    //     res,
    //     `Test drive created successfully, Failed to send notification`
    //   );
    // }
  } catch (error) {
    // Log error to database
    // const failedRecord = req.body;
    // await logErrorToDB({
    //   reqUrl: req.originalUrl,
    //   errorType: error.name,
    //   errorMessage: error.message,
    //   failedRecord,
    //   userId: req.userId || null,
    // });

    // // Log error details
    // logger.error(
    //   `Error creating Event by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    // );
    // console.error(
    //   `Error creating Event by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    // );

    // // Get the most recent error log file
    // const logDir = path.join(__dirname, "../../logs");
    // const logFiles = fs
    //   .readdirSync(logDir)
    //   .filter((file) => file.startsWith("error-"))
    //   .sort();

    // const latestLogFilePath =
    //   logFiles.length > 0
    //     ? path.join(logDir, logFiles[logFiles.length - 1])
    //     : null;

    // // Send email with error log if the log file exists
    // if (latestLogFilePath) {
    //   await handleErrorAndSendLog(latestLogFilePath);
    // }

    // responses.badRequest(res, error.message);
    console.error(error.message);
    logger.error(error.message);
  }
};
//end

//  mark a test drive as "No Show" and delete the slot
//start

const markAsNoShow = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Events.findByPk(eventId);
    if (!event) {
      return responses.notFound(res, "Event not found");
    }

    event.status = "No Show";
    await event.save();
    const deletedCount = await VehicleSlots.destroy({
      where: { event_id: event.event_id },
    });

    await EventActivity.create({
      userId: req.userId,
      userEmail: req.userEmail,
      userRole: req.userRole,
      recordId: event.event_id,
      action: "Update",
      new_value: JSON.stringify({ status: "No Show" }),
      original_value: JSON.stringify({ status: event.status }),
      modiified_at: dateController.CurrentDate(),
    }).catch((err) => {
      logger.warn(
        `Failed to log activity for ${event.event_id}: ${err.message}`
      );
    });
    if (deletedCount > 0) {
      return responses.success(res, "Marked as No Show and slot released", {
        eventId: event.event_id,
        slotReleased: deletedCount > 0,
      });
    }
  } catch (error) {
    logger.error("Error marking no show:", error.message);
    return responses.badRequest(res, error.message);
  }
};

//end

//update an event
// const updateEvent = async (req, res) => {
//   const { userId, userEmail } = req;
//   const body = req.body;
//   const eventId = req.params.eventId;

//   const modelOfVehicle = {
//     "New Range Rover": "Range Rover",
//     "Range Rover": "Range Rover",
//     "New Range Rover Sport": "Range Rover Sport",
//     "Range Rover Sport": "Range Rover Sport",
//     "Range Rover Velar": "Range Rover Velar",
//     Defender: "New Defender",
//     "Range Rover Evoque": "All New Range Rover Evoque",
//     "New Range Rover Evoque": "All New Range Rover Evoque",
//     "Discovery Sport": "Discovery Sport",
//     Discovery: "Discovery",
//   };
//   const getModel = (PMI) => modelOfVehicle[PMI];

//   try {
//     // 1) Load event (include PMI so getModel works)
//     const event = await Events.findByPk(eventId, {
//       attributes: [
//         "event_id",
//         "sp_id",
//         "name",
//         "subject",
//         "remarks",
//         "notification_category",
//         "lead_id",
//         "url",
//         "PMI",
//       ],
//     });
//     if (!event) {
//       return responses.notFound(res, "Event not found");
//     }

//     // 2) Validate slot conflict BEFORE updating
//     if (
//       body.vehicle_id &&
//       body.start_time_slot &&
//       body.end_time_slot &&
//       body.date_of_booking
//     ) {
//       const conflictSlot = await VehicleSlots.findOne({
//         where: {
//           vehicle_id: body.vehicle_id,
//           start_time_slot: body.start_time_slot,
//           end_time_slot: body.end_time_slot,
//           date_of_booking: body.date_of_booking,
//           event_id: { [Op.ne]: eventId },
//         },
//       });
//       if (conflictSlot) {
//         logger.error("Slot already booked for the selected date and time");
//         return responses.badRequest(
//           res,
//           "Slot already booked for the selected date and time"
//         );
//       }
//     }

//     // 3) Normalize dates
//     const start_date_format = body?.start_date
//       ? moment(body.start_date, "DD-MM-YYYY").format("YYYY-MM-DD")
//       : undefined;
//     const end_date_format = body?.end_date
//       ? moment(body.end_date, "DD-MM-YYYY").format("YYYY-MM-DD")
//       : undefined;

//     // 4) Build update object
//     const updateObj = {
//       ...body,
//       model: getModel(body.PMI ?? event.PMI),
//       description: body.remarks,
//       completed: body.status === "Finished" || body.status === "No Show",
//       completed_at:
//         body.status === "Finished" || body.status === "No Show"
//           ? dateController.CurrentDate()
//           : null,
//       updated_by: userEmail,
//       updated: true,
//       rpa_name: "eventupdate",
//       update_flag: "active",
//     };
//     if (start_date_format) updateObj.start_date = start_date_format;
//     if (end_date_format) updateObj.end_date = end_date_format;

//     // 5) Update event
//     const [affectedRows, updatedRows] = await Events.update(updateObj, {
//       where: { event_id: eventId },
//       returning: true,
//     });
//     if (affectedRows === 0) {
//       logger.warn(`No rows updated for event ${eventId} by user ${userId}`);
//       return responses.badRequest(res, "Nothing to update");
//     }
//     const [updatedData] = updatedRows.map((row) => row.dataValues);
//     try {
//       const slotUpdate = {};
//       if (body.vehicle_id) slotUpdate.vehicle_id = body.vehicle_id; // fix: check snake_case
//       if (body.start_time_slot)
//         slotUpdate.start_time_slot = body.start_time_slot;
//       if (body.end_time_slot) slotUpdate.end_time_slot = body.end_time_slot;
//       if (body.date_of_booking)
//         slotUpdate.date_of_booking = body.date_of_booking;

//       if (Object.keys(slotUpdate).length > 0) {
//         await VehicleSlots.update(slotUpdate, { where: { event_id: eventId } });
//         logger.info(`Slot updated for event id ${eventId}`);
//       }

//       if (body.status === "No Show") {
//         const deletedCount = await VehicleSlots.destroy({
//           where: { event_id: updatedData.event_id },
//         });
//         logger.info(
//           `Deleted ${deletedCount} vehicle slots for Event ID ${updatedData.event_id} due to No Show`
//         );
//       }
//     } catch (e) {
//       logger.error(`Slot update failed for Event ID ${eventId}: ${e.message}`);
//     }

//     // 6b) External API call
//     try {
//       await EventActivity.create({
//         userId: req.userId,
//         userEmail: req.userEmail,
//         userRole: req.userRole,
//         recordId: event.event_id,
//         action: "Update",
//         new_value: JSON.stringify(updatedData),
//         original_value: JSON.stringify(event),
//         modiified_at: dateController.CurrentDate(),
//       }).catch((err) => {
//         logger.warn(
//           `Failed to log activity for ${event.event_id}: ${err.message}`
//         );
//       });
//       if (event.url != null) {
//         const apiRes = await axios.post(
//           process.env.EVENT_URL,
//           {
//             ...updatedData,
//             startDate: moment(updatedData.start_date).format("DD-MMM-YYYY"),
//           },
//           { headers: { "Content-Type": "application/json" } }
//         );
//         rpaLogger.info(
//           `Event update data ${updatedData} sent to RPA`,
//           apiRes.data
//         );
//       }
//     } catch (err) {
//       rpaLogger.error(
//         `Failed to post Event update API: ${
//           err.response?.data?.message || err.message
//         }`
//       );
//     }
//     try {
//       if (body.sp_id && body.sp_id !== event.sp_id) {
//         const [assignee, notificationData] = await Promise.all([
//           Users.findByPk(body.sp_id, {
//             attributes: ["user_id", "device_token"],
//           }),
//           getNotificationTemplate((event.subject || "").toLowerCase(), event),
//         ]);

//         if (assignee) {
//           await sendNotification({
//             category: event.notification_category,
//             userId: assignee.user_id,
//             recordId: event.lead_id,
//             deviceToken: assignee.device_token,
//             title: notificationData.title,
//             body: notificationData.body,
//             content: notificationData.content || null,
//           }).catch((notificationError) => {
//             logger.error(
//               `Failed to send notification for Event ID ${eventId} to user ${assignee.user_id}: ${notificationError.message}`
//             );
//           });
//         }
//       }
//     } catch (e) {
//       logger.error(`Notification error for Event ID ${eventId}: ${e.message}`);
//     }

//     // 7) Respond once, at the end
//     logger.info(
//       `Event updated successfully by user ${userId} for record ${eventId}`
//     );
//     return responses.success(res, `Event updated ${process.env.ST201}`);
//   } catch (error) {
//     // Log everywhere
//     const failedRecord = req.body;
//     logErrorToDB({
//       reqUrl: req.originalUrl,
//       errorType: error.name,
//       errorMessage: error.message,
//       failedRecord,
//       userId: req.userId || null,
//     }).catch(() => {});
//     logger.error(
//       `Error updating Event by user ${req.userId} at ${req.originalUrl}: ${error.message}`
//     );

//     // Guard against double-send
//     if (!res.headersSent) {
//       return responses.badRequest(res, error.message);
//     }
//   }
// };

//end

const driveFeedback = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Events.findByPk(eventId);
    if (!event) {
      return responses.notFound(res, "Event not found");
    }
    if (event.feedback_submitted === true) {
      return responses.badRequest(
        res,
        "Feedback has already been recorded for this test drive"
      );
    }
    const {
      // sp_id,
      purchase_potential,
      drive_feedback,
      feedback_comments,
      time_frame,
    } = req.body;
    const avg =
      drive_feedback.ambience +
      drive_feedback.features +
      drive_feedback.ride_comfort +
      drive_feedback.quality +
      drive_feedback.dynamics +
      drive_feedback.driving_experience;
    const average = avg / 6;
    const avg_rating = average.toFixed(1);
    const updateDrive = await Events.update(
      {
        drive_feedback,
        feedback_comments,
        time_frame,
        purchase_potential,
        avg_rating: avg_rating,
        feedback_submitted: true,
      },
      {
        where: { event_id: eventId },
        returning: true,
      }
    );

    if (updateDrive) {
      await EventActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: event.event_id,
        action: "Update",
        new_value: JSON.stringify(updateDrive),
        original_value: JSON.stringify(event),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.error(
          `Failed to log activity for ${event.event_id}: ${err.message}`
        );
      });
      logger.info(
        `Event updated successfully by user ${req.userId} for record ${eventId}`
      );
      return responses.success(res, "Feedback saved successfully", updateDrive);
    } else {
      logger.info(`Failed to update Event`);
      return responses.badRequest(res, "Failed to update event");
    }
  } catch (error) {
    logger.error("Failed to create feedback for drive");
    return responses.badRequest(res, error.message);
  }
};

//get all events in descending order
const getAllEvents = async (req, res) => {
  try {
    const { category } = req.query;
    const whereCondition = { sp_id: req.userId, deleted: false };

    if (category) {
      whereCondition.category = category;
    }

    const events = await Promise.all([
      //all
      Events.findAndCountAll({
        where: whereCondition,
        order: [["start_date", "DESC"]],
        limit: 100,
      }),
      //upcoming
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Finished", "No Show"],
          },
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
      //overdue
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          status: {
            [Op.notIn]: ["Finished", "No Show"],
          },
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
        },
        order: [["due_date", "DESC"]],
      }),
    ]);
    //end
    logger.info(`Request made by user ${req.userId} to view all events`);
    return responses.success(res, `Events data fetched ${process.env.ST201}`, {
      allEvents: events[0],
      upcomingEvents: events[1],
      overdueEvents: events[2],
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return responses.badRequest(res, error.message);
  }
};
//end

//get all events of lead in descending order
const getAllEventsOfLead = async (req, res) => {
  try {
    const { category } = req.query;
    const leadId = req.params.leadId;
    const whereCondition = { lead_id: leadId, deleted: false };

    if (category) {
      whereCondition.category = category;
    }

    const events = await Promise.all([
      //all
      Events.findAndCountAll({ where: whereCondition }),
      //upcoming
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            literal(
              `start_date > '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time > '${dateController.now}')`
            ),
          ],
        },
      }),
      //overdue
      Events.findAndCountAll({
        where: {
          ...whereCondition,
          [Op.and]: [
            literal(
              `start_date < '${dateController.todayDate}' OR (start_date = '${dateController.todayDate}' AND start_time < '${dateController.now}')`
            ),
          ],
        },
      }),
    ]);
    //end
    logger.info(`Request made by user ${req.userId} to view all events`);
    return responses.success(
      res,
      `Events data of lead fetched ${process.env.ST201}`,
      {
        allEvents: events[0],
        upcomingEvents: events[1],
        overdueEvents: events[2],
      }
    );
  } catch (error) {
    console.error("Error fetching events:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get one event
const getEventById = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Events.findOne({
      where: { event_id: eventId },
    });
    return responses.success(res, `Event fetched ${process.env.ST201}`, event);
  } catch (error) {
    logger.error("Error fetching event:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//delete event
const deleteEvent = async (req, res) => {
  try {
    const { userId } = req;
    const eventId = req.params.eventId;
    const deleteData = await Events.update(
      {
        deleted: true,
      },
      {
        where: { event_id: eventId },
      }
    );
    if (deleteData > 0) {
      logger.info(
        `Event Deleted sucessfully by user ${userId} for record ${eventId}`
      );
      return responses.success(res, `Event ${process.env.DELETE}`);
    } else {
      logger.warn(`Delete for event ${eventId} failed by user ${userId}`);
      return responses.badRequest(res, `Failed to delete event`);
    }
  } catch (error) {
    const { userId } = req;
    const requestUrl = req.originalUrl;

    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    // Log error details
    logger.error(
      `Error deleting Event by user ${userId} at ${requestUrl}: ${error.message}`
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

const getSlotsByEventId = async (req, res) => {
  try {
    const { eventId } = req.params;
    const eventSlot = await VehicleSlots.findOne({
      where: {
        event_id: eventId,
        deleted: false,
      },
      order: [["created_at", "DESC"]],
      raw: true,
    });

    if (!eventSlot) {
      return responses.success(res, "No slot found for this event", {
        event_slot: null,
        vehicle_slots: [],
      });
    }
    const vehicleSlots = await VehicleSlots.findAll({
      where: {
        vehicle_id: eventSlot.vehicle_id,
        event_id: { [Op.ne]: eventId },
      },
      order: [["created_at", "DESC"]],
      raw: true,
    });

    return responses.success(res, "Slot fetched successfully", {
      event_slot: eventSlot,
      vehicle_slots: vehicleSlots,
    });
  } catch (error) {
    logger.error(
      `Error fetching slot for event_id=${req.params.eventId} at ${req.originalUrl}: ${error.stack}`
    );
    return responses.serverError(res, "Failed to fetch event slot");
  }
};
const updateEvent = async (req, res) => {
  const { userId, userEmail } = req;
  const body = req.body;
  const eventId = req.params.eventId;

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
  const getModel = (PMI) => modelOfVehicle[PMI];

  try {
    // 1) Load event (include PMI so getModel works)
    const event = await Events.findByPk(eventId, {
      attributes: [
        "event_id",
        "sp_id",
        "name",
        "subject",
        "remarks",
        "notification_category",
        "lead_id",
        "url",
        "PMI",
      ],
    });
    if (!event) {
      return responses.notFound(res, "Event not found");
    }

    // 2) Validate slot conflict BEFORE updating
    if (
      body.vehicle_id &&
      body.start_time_slot &&
      body.end_time_slot &&
      body.date_of_booking
    ) {
      const conflictSlot = await VehicleSlots.findOne({
        where: {
          vehicle_id: body.vehicle_id,
          start_time_slot: body.start_time_slot,
          end_time_slot: body.end_time_slot,
          date_of_booking: body.date_of_booking,
          event_id: { [Op.ne]: eventId },
        },
      });
      if (conflictSlot) {
        logger.error("Slot already booked for the selected date and time");
        return responses.badRequest(
          res,
          "Slot already booked for the selected date and time"
        );
      }
    }

    // 3) Normalize dates
    const start_date_format = body?.start_date
      ? moment(body.start_date, "DD-MM-YYYY").format("YYYY-MM-DD")
      : undefined;
    const end_date_format = body?.end_date
      ? moment(body.end_date, "DD-MM-YYYY").format("YYYY-MM-DD")
      : undefined;

    // 4) Build update object
    const updateObj = {
      ...body,
      model: getModel(body.PMI ?? event.PMI),
      description: body.remarks,
      completed: body.status === "Finished" || body.status === "No Show",
      completed_at:
        body.status === "Finished" || body.status === "No Show"
          ? dateController.CurrentDate()
          : null,
      updated_by: userEmail,
      updated: true,
      rpa_name: "eventupdate",
      update_flag: "active",
    };
    if (start_date_format) updateObj.start_date = start_date_format;
    if (end_date_format) updateObj.end_date = end_date_format;

    // 5) Update event
    const [affectedRows, updatedRows] = await Events.update(updateObj, {
      where: { event_id: eventId },
      returning: true,
    });
    if (affectedRows === 0) {
      logger.warn(`No rows updated for event ${eventId} by user ${userId}`);
      return responses.badRequest(res, "Nothing to update");
    }
    const [updatedData] = updatedRows.map((row) => row.dataValues);
    try {
      const slotUpdate = {};
      if (body.vehicle_id) slotUpdate.vehicle_id = body.vehicle_id; // fix: check snake_case
      if (body.start_time_slot)
        slotUpdate.start_time_slot = body.start_time_slot;
      if (body.end_time_slot) slotUpdate.end_time_slot = body.end_time_slot;
      if (body.date_of_booking)
        slotUpdate.date_of_booking = body.date_of_booking;

      if (Object.keys(slotUpdate).length > 0) {
        await VehicleSlots.update(slotUpdate, { where: { event_id: eventId } });
        logger.info(`Slot updated for event id ${eventId}`);
      }

      if (body.status === "No Show") {
        const deletedCount = await VehicleSlots.destroy({
          where: { event_id: updatedData.event_id },
        });
        logger.info(
          `Deleted ${deletedCount} vehicle slots for Event ID ${updatedData.event_id} due to No Show`
        );
      }
    } catch (e) {
      logger.error(`Slot update failed for Event ID ${eventId}: ${e.message}`);
    }

    // 6b) External API call
    try {
      await EventActivity.create({
        userId: req.userId,
        userEmail: req.userEmail,
        userRole: req.userRole,
        recordId: event.event_id,
        action: "Update",
        new_value: JSON.stringify(updatedData),
        original_value: JSON.stringify(event),
        modiified_at: dateController.CurrentDate(),
      }).catch((err) => {
        logger.warn(
          `Failed to log activity for ${event.event_id}: ${err.message}`
        );
      });
      if (event.url != null) {
        const apiRes = await axios.post(
          process.env.EVENT_URL,
          {
            ...updatedData,
            startDate: moment(updatedData.start_date).format("DD-MMM-YYYY"),
          },
          { headers: { "Content-Type": "application/json" } }
        );
        rpaLogger.info(
          `Event update data ${updatedData} sent to RPA`,
          apiRes.data
        );
      }
    } catch (err) {
      rpaLogger.error(
        `Failed to post Event update API: ${
          err.response?.data?.message || err.message
        }`
      );
    }
    try {
      if (body.sp_id && body.sp_id !== event.sp_id) {
        const [assignee, notificationData] = await Promise.all([
          Users.findByPk(body.sp_id, {
            attributes: ["user_id", "device_token"],
          }),
          getNotificationTemplate((event.subject || "").toLowerCase(), event),
        ]);

        if (assignee) {
          await sendNotification({
            category: event.notification_category,
            userId: assignee.user_id,
            recordId: event.lead_id,
            deviceToken: assignee.device_token,
            title: notificationData.title,
            body: notificationData.body,
            content: notificationData.content || null,
          }).catch((notificationError) => {
            logger.error(
              `Failed to send notification for Event ID ${eventId} to user ${assignee.user_id}: ${notificationError.message}`
            );
          });
        }
      }
    } catch (e) {
      logger.error(`Notification error for Event ID ${eventId}: ${e.message}`);
    }

    // 7) Respond once, at the end
    logger.info(
      `Event updated successfully by user ${userId} for record ${eventId}`
    );
    return responses.success(res, `Event updated ${process.env.ST201}`);
  } catch (error) {
    // Log everywhere
    const failedRecord = req.body;
    logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    }).catch(() => {});
    logger.error(
      `Error updating Event by user ${req.userId} at ${req.originalUrl}: ${error.message}`
    );

    // Guard against double-send
    if (!res.headersSent) {
      return responses.badRequest(res, error.message);
    }
  }
};

module.exports = {
  createTestDrive,
  updateEvent,
  getAllEvents,
  getAllEventsOfLead,
  getEventById,
  deleteEvent,
  driveFeedback,
  markAsNoShow,
  getSlotsByEventId,
};
