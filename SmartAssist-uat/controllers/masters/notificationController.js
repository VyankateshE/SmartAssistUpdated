require("dotenv").config();
const Notifications = require("../../models/master/notificationModel");
const logger = require("../../middlewares/fileLogs/logger");
const responses = require("../../utils/globalResponse");

//all notifications for user
const allNotifications = async (req, res) => {
  try {
    const { category } = req.query;

    const whereCondition = { user_id: req.userId };
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
//end

const readNotification = async (req, res) => {
  try {
    const whereCondition = { user_id: req.userId, read: true };
    const notifications = await Notifications.findAndCountAll({
      where: whereCondition,
      order: [["created_at", "DESC"]],
    });
    return responses.success(
      res,
      `Notification fetched ${process.env.ST201}`,
      notifications
    );
  } catch (error) {
    logger.error("Error fetching notifications", error.message);
    console.error("Error fetching notifications", error);
    return responses.serverError(res, error.message);
  }
};

//mark notification as read
const markRead = async (req, res) => {
  try {
    const notiId = req.params.notiId;
    const updateNotification = await Notifications.update(
      { read: true },
      { where: { notification_id: notiId } }
    );
    if (updateNotification > 0) {
      return responses.success(res, `Notification marked as read`);
    } else {
      return responses.notFound(res, `No notifications to read`);
    }
  } catch (error) {
    logger.error("Error marking notification as read", error.message);
    console.error("Error marking notification as read", error);
    return responses.serverError(res, error.message);
  }
};
//end

//mark all read
const markAllRead = async (req, res) => {
  try {
    const updateNotification = await Notifications.update(
      { read: true },
      { where: { user_id: req.userId } }
    );
    if (updateNotification > 0) {
      return responses.success(res, `All notifications marked as read`);
    } else {
      return responses.notFound(res, `No notifications to read`);
    }
  } catch (error) {
    logger.error("Error marking all notifications as read", error.message);
    console.error("Error marking all notifications as read", error);
    return responses.badRequest(res, error.message);
  }
};
//end

module.exports = { allNotifications, markRead, markAllRead, readNotification };
