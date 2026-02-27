require("dotenv").config();
const Notifications = require("../models/master/notificationModel");
const logger = require("../middlewares/fileLogs/logger");
const responses = require("../utils/globalResponse");

const allNotifications = async (req, res) => {
  try {
    const { category, userId } = req.query;

    const whereCondition = { user_id: userId };
    if (category) {
      whereCondition.category = category;
    }
    const notifications = await Promise.all([
      //unread notifications
      Notifications.findAndCountAll({
        where: { ...whereCondition, read: false },
        order: [["created_at", "ASC"]],
      }),
      //read notifications
      Notifications.findAndCountAll({
        where: { ...whereCondition, read: true },
        order: [["created_at", "ASC"]],
      }),
    ]);
    return responses.success(res, `Notification fetched ${process.env.ST201}`, {
      unread: notifications[0],
      read: notifications[1],
    });
  } catch (error) {
    logger.error("Error fetching notifications", error.message);
    console.error("Error fetching notifications", error);
    return responses.serverError(res, error.message);
  }
};

module.exports = { allNotifications };
