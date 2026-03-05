require("dotenv").config();
const vehicles = require("../../models/master/vehicleModel");
const SuperAdmin = require("../../models/master/superAdminModel");
const User = require("../../models/master/usersModel");
const logErrorToDB = require("../../middlewares/dbLogs/masterDbLogs");
const {
  validateInput,
} = require("../../middlewares/validators/validatorMiddleware");
const moment = require("moment");
const responses = require("../../utils/globalResponse");
const Dealers = require("../../models/master/dealerModel");
const { Op } = require("sequelize");
const dateController = require("../../utils/dateFilter");
// Create a new vehicle
const createVehicle = async (req, res) => {
  try {
    const { userId } = req;
    const { dealerId } = req;
    const bodyObj = req.body;
    const formattedDate = moment(bodyObj.YOM, "YYYY-MM-DD")
      .local()
      .format("YYYY-MM-DD");

    const findUser = await SuperAdmin.findByPk(userId);
    const findDealer = await Dealers.findByPk(dealerId);
    const corporate = findUser
      ? findUser.corporate_id
      : findDealer
      ? findDealer.corporate_id
      : (await User.findByPk(req.userId)).corporate_id;
    const current = dateController.CurrentDate();
    const today = moment(current, "YYYY-MM-DD").local().format("YYYY-MM-DD");

    // validate input
    validateInput([bodyObj.vehicle_name]);

    if (formattedDate > today) {
      return responses.badRequest(res, `${process.env.YOM_VALIDATE}`);
    }
    const isDuplicate = await vehicles.findOne({
      where: { VIN: bodyObj.VIN },
    });
    if (isDuplicate) {
      return responses.badRequest(res, `Vehicle ${process.env.IS_DUPLICATE}`);
    }
    const vehicle = await vehicles.create({
      ...bodyObj,
      YOM: formattedDate,
      corporate_id: corporate,
      dealer_id: dealerId || null,
    });

    return responses.created(
      res,
      `Vehicle created ${process.env.ST201} `,
      vehicle
    );
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });

    console.error("Error creating vehicle", error);
    return responses.badRequest(res, error.message);
  }
};
//end

// Get all vehicles
const getAllVehicles = async (req, res) => {
  try {
    const { vehicle_name } = req.query;
    const whereCondition = {
      deleted: false,
      dealer_id: req.dealerId,
      vehicle_name: {
        [Op.ne]: "Range Rover",
      },
    };
    if (vehicle_name) {
      whereCondition.vehicle_name = vehicle_name;
    }
    const vehicle = await vehicles.findAndCountAll({
      where: whereCondition,
      order: [["updated_at", "DESC"]],
    });
    return responses.success(
      res,
      `Vehicles fetched ${process.env.ST201}`,
      vehicle
    );
  } catch (error) {
    console.error("Error getting Vehicles", error);
    return responses.serverError(res, error.message);
  }
};

// Get vehicle by id
const getVehicleById = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;
    const vehicle = await vehicles.findByPk(vehicleId);

    return responses.success(
      res,
      `Vehicle data fetched ${process.env.ST201}`,
      vehicle
    );
  } catch (error) {
    console.error("Error getting vehicle", error);
    return responses.serverError(res, error.message);
  }
};
//end

// Get vehicle by id
const updateVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;
    const bodyObj = req.body;

    const vehicle = await vehicles.update(
      { ...bodyObj },
      { where: { vehicle_id: vehicleId }, returning: true }
    );

    return responses.success(
      res,
      `Vehicle updated ${process.env.ST201}`,
      vehicle
    );
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    console.error("Error getting vehicle", error);
    return responses.serverError(res, error.message);
  }
};
//end

//delete vehicle
const deleteVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;
    const deletedVehicle = await vehicles.update(
      {
        deleted: true,
      },
      {
        where: { vehicle_id: vehicleId },
      }
    );

    if (deletedVehicle > 0) {
      return responses.success(res, `Vehicle ${process.env.DELETE}`);
    }
    return responses.notFound(res, `Vehicle ${process.env.ST404}`);
  } catch (error) {
    // Log error to database
    const failedRecord = req.body;
    await logErrorToDB({
      reqUrl: req.originalUrl,
      errorType: error.name,
      errorMessage: error.message,
      failedRecord,
      userId: req.userId || null,
    });
    console.error("Error deleting vehicle", error);
    return responses.serverError(res, error.message);
  }
};
//end

//bulk create vehicles
const bulkCreateVehicles = async (req, res) => {
  try {
    const vehicleData = req.body;
    const dealer_id = req.query.dealer_id;
    const findUser = await Dealers.findByPk(dealer_id);
    const corporate = findUser ? findUser.corporate_id : null;

    const formattedVehicles = vehicleData.map((vehicle) => ({
      ...vehicle,
      corporate_id: corporate,
      dealer_id: dealer_id || null,
      YOM: moment(vehicle.YOM, "YYYY-MM-DD").local().format("YYYY-MM-DD"),
    }));

    const createdVehicles = await vehicles.bulkCreate(formattedVehicles);

    return responses.created(
      res,
      `Vehicles created ${process.env.ST201}`,
      createdVehicles
    );
  } catch (error) {
    console.error("Error bulk creating vehicles", error);
    return responses.serverError(res, error.message);
  }
};
module.exports = {
  createVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  bulkCreateVehicles,
};
