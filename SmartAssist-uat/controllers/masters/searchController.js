require("dotenv").config();
const Leads = require("../../models/transactions/leadsModel");
const Vehicles = require("../../models/master/vehicleModel");
const Colors = require("../../models/master/colorModel");
const Users = require("../../models/master/usersModel");
const { Op } = require("sequelize");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");

const globalSearch = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    // Define search criteria
    const searchFields = ["lead_name", "email", "PMI", "mobile"];

    // Perform the search
    const leads = await Leads.findAll({
      where: {
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${query}%` },
        })),
        sp_id: req.userId,
      },
      attributes: [
        "lead_id",
        "lead_name",
        "email",
        "PMI",
        "mobile",
        "vehicle_id",
      ],
    });

    if (!leads.length) {
      return responses.notFound(res, `No matching records found.`);
    }

    // Format suggestions
    const suggestions = leads.map((lead) => ({
      lead_id: lead.lead_id,
      lead_name: lead.lead_name,
      email: lead.email,
      PMI: lead.PMI,
    }));

    return responses.success(
      res,
      `Suggestions and results fetched ${process.env.ST201}`,
      {
        suggestions: suggestions,
        results: leads,
      }
    );
  } catch (error) {
    logger.error("Global search error:", error);
    return responses.serverError(res, error.message);
  }
};

//vehicle search
const vehicleSearch = async (req, res) => {
  try {
    const { vehicle } = req.query;

    if (!vehicle || vehicle.trim() === "") {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    // Define search criteria
    const searchFields = ["vehicle_name", "brand"];

    // Perform the search
    const vehicles = await Vehicles.findAll({
      where: {
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${vehicle}%` },
        })),
      },
      attributes: [
        "vehicle_id",
        "vehicle_name",
        "VIN",
        "brand",
        "chasis_number",
      ],
    });

    if (!vehicles.length) {
      return responses.notFound(res, `No matching records found.`);
    }

    // Format suggestions
    const suggestions = vehicles.map((vehicle) => ({
      vehicle_id: vehicle.vehicle_id,
      vehicle_name: vehicle.vehicle_name,
    }));

    return responses.success(
      res,
      `Suggestions and results fetched ${process.env.ST201}`,
      {
        suggestions: suggestions,
        results: vehicles,
      }
    );
  } catch (error) {
    logger.error("Vehicle search error:", error);
    return responses.serverError(res, error.message);
  }
};

//user search
const userSearch = async (req, res) => {
  try {
    const { user } = req.query;

    if (!user || user.trim() === "") {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    // Define search criteria
    const searchFields = ["name"];

    // Perform the search
    const users = await Users.findAll({
      where: {
        dealer_id: req.dealerId,
        user_role: { [Op.notIn]: ["SM", "GM", "CEO"] },
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${user}%` },
        })),
      },
      attributes: ["user_id", "name", "email", "user_role", "profile_pic"],
    });

    if (!users.length) {
      return responses.notFound(res, `No matching records found.`);
    }

    // Format suggestions
    const suggestions = users.map((user) => ({
      user_id: user.user_id,
      name: user.name,
    }));

    return responses.success(
      res,
      `Suggestions and results fetched ${process.env.ST201}`,
      {
        suggestions: suggestions,
        results: users,
      }
    );
  } catch (error) {
    logger.error("User search error:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//user search
const colorSearch = async (req, res) => {
  try {
    const { color } = req.query;

    if (!color || color.trim() === "") {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    // Define search criteria
    const searchFields = ["color_name"];

    // Perform the search
    const colors = await Colors.findAll({
      where: {
        [Op.or]: searchFields.map((field) => ({
          [field]: { [Op.iLike]: `%${color}%` },
        })),
      },
      attributes: ["color_id", "color_name", "image_url"],
    });

    if (!colors.length) {
      return responses.notFound(res, `No matching records found.`);
    }

    // Format suggestions
    const suggestions = colors.map((color) => ({
      color_id: color.color_id,
      name: color.color_name,
      url: color.image_url,
    }));

    return responses.success(
      res,
      `Suggestions and results fetched ${process.env.ST201}`,
      {
        suggestions: suggestions,
        results: colors,
      }
    );
  } catch (error) {
    logger.error("Colors search error:", error);
    return responses.serverError(res, error.message);
  }
};
//end
module.exports = { globalSearch, vehicleSearch, userSearch, colorSearch };
