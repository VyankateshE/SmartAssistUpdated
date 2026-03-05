const SuperAdminLoginAccounts = require("../../models/master/superAdminLoginModel");
const SuperAdmins = require("../../models/master/superAdminModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const responses = require("../../utils/globalResponse");

const superAdminLoginHandler = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check in SuperAdminLoginAccounts (extra emails)
    const loginRecord = await SuperAdminLoginAccounts.findOne({
      where: { email },
      include: {
        model: SuperAdmins,
        as: "superadmin", 
      },
    });

    if (!loginRecord) {
      return responses.unauthorized(res, "Invalid email");
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, loginRecord.password);
    if (!isMatch) {
      return responses.unauthorized(res, "Invalid password");
    }

    const superadmin = loginRecord.superadmin;

    // Generate JWT
    const token = jwt.sign(
      {
        superadminId: superadmin.superadmin_id,
        role: superadmin.role,
        superadminEmail: email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Store token in SuperAdmins table (same as Dealer flow)
    await superadmin.update({ access_token: token });

    return responses.success(res, "Login successful", { token, superadmin });
  } catch (err) {
    console.error("SuperAdmin login failed:", err);
    return responses.serverError(res, "Something went wrong");
  }
};

module.exports = {
  superAdminLoginHandler,
};
