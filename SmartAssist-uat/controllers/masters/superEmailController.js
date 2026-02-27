const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const responses = require("../../utils/globalResponse");
const logger = require("../../middlewares/fileLogs/logger");

const SuperAdmins = require("../../models/master/superAdminModel");
const SuperAdminLogins = require("../../models/master/superAdminLoginModel");

const addSuperAdminEmail = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { corporate_id } = req;

    if (!email || !password) {
      return responses.badRequest(res, "Email and Password are required");
    }

    // check if already exists
    const existingEmail = await SuperAdminLogins.findOne({ where: { email } });
    if (existingEmail) {
      return responses.badRequest(res, "Email already exists");
    }

    const superAdmin = await SuperAdmins.findByPk(corporate_id);
    if (!superAdmin) {
      return responses.badRequest(res, "SuperAdmin not found");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newEmail = await SuperAdminLogins.create({
      login_id: uuidv4(),
      corporate_id,
      email,
      password: hashedPassword,
      role: "SuperAdmin",
      deleted: false,
    });

    logger.info(`New SuperAdmin email added: ${email}`);
    return responses.success(
      res,
      "SuperAdmin email added successfully",
      newEmail
    );
  } catch (error) {
    logger.error("Error adding superadmin email", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = { addSuperAdminEmail };
