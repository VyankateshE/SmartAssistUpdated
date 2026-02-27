require("dotenv").config();
const moment = require("moment-timezone");
const { triggerOtp } = require("../../middlewares/emails/testDriveConsent");
const Events = require("../../models/transactions/eventModel");
// const { calculateDistance } = require("../../utils/calculations/distance");
const responses = require("../../utils/globalResponse");
const { sendFeedbackSMS } = require("../../utils/sendSMS");
const logger = require("../../middlewares/fileLogs/logger");
const { sendFeedback } = require("../../middlewares/emails/testDriveFeedback");
const dateController = require("../../utils/dateFilter");
const VehicleSlots = require("../../models/transactions/vehicleSlotsModel");
const { default: axios } = require("axios");

const testDriveController = {
  //trigger OTP to start test drive
  triggerConsentOtp: async (req, res) => {
    responses.success(res, "OTP sent to the customer");
    try {
      await triggerOtp(req.params.eventId);
      logger.info(`OTP sent successfully`);
    } catch (err) {
      logger.error(`Failed to send OTP: ${err}`);
    }
  },

  //verify OTP & take consent before starting drive
  verifyOTP: async (req, res) => {
    const { otp } = req.body;
    const event = await Events.findByPk(req.params.eventId);

    const currentTime = dateController.now;
    if (
      event.consent_otp !== otp ||
      currentTime > event.consent_otp_expiration
    ) {
      logger.error(`Invalid OTP`);
      return responses.badRequest(res, process.env.INV_OTP);
    }
    return responses.success(res, process.env.VERIFIED);
  },
  // Starts a new test drive session
  startTestDrive: async (req, res) => {
    const { eventId } = req.params;
    // const { userId } = req;
    const { start_location } = req.body;

    // const sessionData = {
    //   userId,
    //   startCoordinates,
    //   route: [startCoordinates],
    //   startTime: dateController.CurrentDate(),
    //   totalDistance: 0,
    // };
    const event = await Events.findByPk(eventId);
    if (event.status === "Finished") {
      return responses.badRequest(res, "Test drive already completed");
    }
    await Events.update(
      {
        start_location: start_location,
        actual_start_date: moment().tz("Asia/Kolkata").format("YYYY-MM-DD"),
        actual_start_time: moment().tz("Asia/Kolkata").format("HH:mm"),
      },
      { where: { event_id: eventId } }
    );

    return responses.success(res, "Test drive started successfully", {
      eventId,
      start_location,
    });
  },

  // // Handles real-time location updates and distance calculation
  // updateLocation: (io, socket) => {
  //   socket.on("joinTestDrive", ({ eventId }) => {
  //     socket.join(eventId);
  //   });

  //   socket.on("updateLocation", async ({ eventId, newCoordinates }) => {
  //     const session = await getClient().get(`testDrive:${eventId}`);
  //     if (!session) {
  //       return socket.emit("error", { message: "Test drive not found" });
  //     }

  //     const testDrive = JSON.parse(session);
  //     const lastCoordinates = testDrive.route[testDrive.route.length - 1];
  //     const distance = calculateDistance(lastCoordinates, newCoordinates);

  //     testDrive.route.push(newCoordinates);
  //     testDrive.totalDistance += distance;

  //     await getClient().set(`testDrive:${eventId}`, JSON.stringify(testDrive));

  //     io.to(eventId).emit("locationUpdated", {
  //       totalDistance: testDrive.totalDistance,
  //       newCoordinates,
  //     });
  //   });
  // },

  // Ends a test drive session and stores final data
  endTestDrive: async (req, res) => {
    const { eventId } = req.params;
    const { send_feedback } = req.query;
    const dataObj = req.body;

    if (send_feedback == "true") {
      try {
        await Promise.all([sendFeedback(eventId), sendFeedbackSMS(eventId)]);
      } catch (error) {
        logger.error(`Failed to send feedback: ${error}`);
        return responses.serverError(res, error.message);
      }
    }

    // const existingEvent = await Events.findByPk(eventId, {
    //   attributes: ["status"],
    // });

    const [affectedRows, updateEvent] = await Events.update(
      {
        ...dataObj,
        status: "Finished",
        updated: true,
        completed: true,
        rpa_name: "eventupdate",
        update_flag: "active",
        completed_at: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
        actual_end_date: moment().tz("Asia/Kolkata").format("YYYY-MM-DD"),
        actual_end_time: moment().tz("Asia/Kolkata").format("HH:mm"),
      },
      {
        where: { event_id: eventId },
        returning: true,
      }
    );
    if (affectedRows > 0) {
      responses.success(res, "Test drive ended successfully");
      const [updatedData] = updateEvent.map((task) => task.dataValues);
      const deletedCount = await VehicleSlots.destroy({
        where: { event_id: eventId },
      });
      logger.info(
        `Deleted ${deletedCount} vehicle slots for Event ID ${eventId} due to No Show`
      );
      try {
        const res = await axios.post(
          process.env.EVENT_URL,
          {
            ...updatedData,
            startDate: moment(updatedData.start_date).format("DD-MMM-YYYY"),
          },
          { headers: { "Content-Type": "application/json" } }
        );

        logger.info("Event update successfully -------->", res.data.message);
      } catch (err) {
        console.error(" API err:", err.response?.data || err.message);
        logger.error(
          `Failed to post Event  API: ${
            err.response?.data?.message || err.message
          }`
        );
      }
    }
  },
};

module.exports = { testDriveController };
