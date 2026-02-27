const version = require("../../models/master/versionModel");
const responses = require("../../utils/globalResponse");

const getVersion = async (req, res) => {
  try {
    const appV = await version.findAll();
    return responses.success(res, "Version fetched successfully", appV);
  } catch (error) {
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  getVersion,
};
