require("dotenv").config();
const Roles = require("../../models/master/roleModel");
const responses = require("../../utils/globalResponse");

// Create Role
const createRole = async (req, res) => {
  try {
    const { role_name, description } = req.body;

    // Check if role already exists
    const existingRole = await Roles.findOne({ where: { role_name } });

    if (existingRole) {
      return responses.badRequest(res, `Role '${role_name}' already exists.`);
    }

    const role = await Roles.create({ role_name, description });
    return responses.created(res, `Role created ${process.env.ST201}`, role);
  } catch (error) {
    console.error("Unable to create role", error);
    return responses.badRequest(res, error.message);
  }
};

// Get All Unique Roles (without Sequelize.fn)
const getAllRoles = async (req, res) => {
  try {
    const roles = await Roles.findAll({
      attributes: ["role_id", "role_name", "description"],
      order: [["role_name", "ASC"]],
      raw: true
    });

   return responses.success(
      res,
      `Roles retrieved ${process.env.ST201}`,
      roles
    );
  } catch (error) {
    console.error("Unable to fetch roles", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = { createRole, getAllRoles };
