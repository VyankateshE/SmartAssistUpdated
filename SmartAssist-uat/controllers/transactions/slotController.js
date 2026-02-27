const Slots = require("../../models/transactions/vehicleSlotsModel");
const Events = require("../../models/transactions/eventModel");
const Vehicles = require("../../models/master/vehicleModel");
const Users = require("../../models/master/usersModel");
// const logErrorToDB = require("../../middlewares/dbLogs/transactDbLogs");
const logger = require("../../middlewares/fileLogs/logger");
// const {
//   handleErrorAndSendLog,
// } = require("../../middlewares/emails/triggerEmailErrors");
require("dotenv").config();
const responses = require("../../utils/globalResponse");

//create slot for a vehicle

const bookSlot = async (
  vehicleId,
  start_time_slot,
  end_time_slot,
  date_of_booking,
  event_id,
  dealer_id
) => {
  const vehicle = await Vehicles.findByPk(vehicleId);
  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  const existingSlot = await Slots.findOne({
    where: {
      vehicle_id: vehicleId,
      start_time_slot,
      end_time_slot,
      date_of_booking,
      dealer_id,
    },
  });

  if (existingSlot) {
    throw new Error("Slot already booked for the selected date and time");
  }

  try {
    const newSlot = await Slots.create({
      start_time_slot,
      end_time_slot,
      date_of_booking,
      vehicle_name: vehicle.vehicle_name,
      VIN: vehicle.VIN,
      vehicle_id: vehicleId,
      event_id,
      dealer_id: dealer_id,
    });

    logger.info(`Slot booked for vehicle ${vehicleId}`);
    return newSlot;
  } catch (createErr) {
    throw new Error("Failed to create slot: " + createErr.message);
  }
};

//end

//get all slots for a vehicle
const getSlotsForVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;

    // Fetch all slots for the given vehicle and dealer
    const slots = await Slots.findAll({
      where: { vehicle_id: vehicleId, dealer_id: req.dealerId },
      order: [["created_at", "DESC"]],
      raw: true,
    });

    // If no slots found
    if (!slots.length) {
      return responses.success(res, `No slots found for vehicle`, []);
    }

    // Attach user name to each slot
    const updatedSlots = await Promise.all(
      slots.map(async (slot) => {
        try {
          // Find the event to get salesperson ID (sp_id)
          const event = await Events.findOne({
            where: { event_id: slot.event_id },
            attributes: ["sp_id"],
            raw: true,
          });

          let owner_name = null;

          if (event?.sp_id) {
            // Find the user name from Users table using sp_id
            const userData = await Users.findOne({
              where: { user_id: event.sp_id },
              attributes: ["name"],
              raw: true,
            });

            owner_name = userData ? userData.name : null;
          }

          return { ...slot, owner_name };
        } catch (err) {
          logger.warn(
            `Error fetching user for slot ${slot.id}: ${err.message}`
          );
          return { ...slot, owner_name: null };
        }
      })
    );
    return responses.success(res, `Slots fetched successfully`, updatedSlots);
  } catch (error) {
    logger.error(
      `Error getting slots for vehicle at ${req.originalUrl}: ${error.message}`
    );
    responses.serverError(res, error.message);
  }
};

module.exports = {
  bookSlot,
  getSlotsForVehicle,
};
