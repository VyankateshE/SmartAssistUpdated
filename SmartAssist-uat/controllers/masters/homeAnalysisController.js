const User = require("../../models/master/usersModel");
const responses = require("../../utils/globalResponse");

const dealerHome = async (req, res) => {
  const { dealerId } = req;

  const smData = await User.findAll({
    attributes: ["user_id", "fname", "lname", "team_id"],
    where: {
      dealer_id: dealerId,
      user_role: "SM",
      deleted: false,
    },
  });

  return responses.success(
    res,
    "Dealer Sales Managers fetched successfully",
    smData
  );
};

module.exports = { dealerHome };
