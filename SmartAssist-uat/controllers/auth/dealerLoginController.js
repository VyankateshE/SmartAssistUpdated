const DealerLoginAccounts = require("../../models/master/dealerLoginModel");
const Dealers = require("../../models/master/dealerModel");
const jwt = require("jsonwebtoken");
const responses = require("../../utils/globalResponse");

const dealerLoginHandler = async (req, res) => {
  try {
    const { dealer_email, password } = req.body;

    const loginRecord = await DealerLoginAccounts.findOne({
      where: { dealer_email },
      include: {
        model: Dealers,
        as: "dealer",
      },
    });

    if (!loginRecord) {
      return responses.unauthorized(res, "Invalid email");
    }

    const isMatch = await loginRecord.comparePassword(password);

    if (!isMatch) {
      return responses.unauthorized(res, "Invalid password");
    }

    const dealer = loginRecord.dealer;

    const token = jwt.sign(
      {
        dealerId: dealer.dealer_id,
        role: dealer.role,
        dealerEmail: dealer_email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await dealer.update({ access_token: token });

    return responses.success(res, "Login successful", { token, dealer });
  } catch (err) {
    console.error("Dealer login failed:", err);
    return responses.serverError(res, "Something went wrong");
  }
};

module.exports = {
  dealerLoginHandler,
};
