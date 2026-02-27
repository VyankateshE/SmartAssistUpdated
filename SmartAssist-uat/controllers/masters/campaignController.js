const campaignModel = require("../../models/master/campaignModel");
const responses = require("../../utils/globalResponse");

const getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await campaignModel.findAll();

    if (campaigns.length === 0) {
      return responses.notFound(res, "No campaigns found");
    }

    return responses.success(res, "Campaigns fetched successfully", campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = {
  getAllCampaigns,
};
