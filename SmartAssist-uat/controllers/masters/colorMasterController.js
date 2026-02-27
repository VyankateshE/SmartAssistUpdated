const Colors = require("../../models/master/colorModel");
require("dotenv").config();
const logger = require("../../middlewares/fileLogs/logger");
const responses = require("../../utils/globalResponse");

//create color
const createColor = async (req, res) => {
  try {
    const bodyObj = req.bodyObj;
    const isDuplicate = await Colors.findOne({ color_name: bodyObj.name });
    if (isDuplicate) {
      return responses.badRequest(res, 400, "Color already exists");
    }
    const color = await Colors.create({ ...bodyObj, corporate_id: req.userId });
    return responses.created(res, `Color created successfully`, color);
  } catch (err) {
    logger.error(`Failed to create color`, err);
    return responses.badRequest(res, `Failed to create color`);
  }
};
//end

const bulkInsertColors = async (req, res) => {
  try {
    const bodyObj = req.body;
    const colorsToInsert = bodyObj.map((item) => {
      return { ...item };
    });
    const colors = await Colors.bulkCreate(colorsToInsert);
    return responses.created(res, `Colors created successfully`, colors);
  } catch (err) {
    logger.error(`Failed to bulk insert colors`, err);
    return responses.badRequest(
      res,
      `Failed to bulk insert colors`,
      err.message
    );
  }
};

const getAllColors = async (req, res) => {
  try {
    const colors = await Colors.findAll();
    return responses.success(res, `Colors retrieved successfully`, colors);
  } catch (error) {
    logger.error(`Failed to get all colors`, error);
  }
};

module.exports = {
  createColor,
  bulkInsertColors,
  getAllColors,
};
