const admin = require("../config/firebaseConfig");
const Notifications = require("../models/master/notificationModel");

const sendNotification = async ({
  userId,
  deviceToken,
  title,
  category,
  body,
  content,
  recordId,
}) => {
  try {
    if (!deviceToken) {
      throw new Error(`No device token found for user ${userId}`);
    }

    // Universal FCM message
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        category: category?.toString() || "",
        recordId: recordId?.toString() || "",
        content: JSON.stringify(content || {}),
      },
      token: deviceToken,

      // Android specific settings
      android: {
        priority: "high",
        notification: {
          sound: "default",
        },
      },

      // iOS specific settings
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "content-available": 1, // must be 1, not true
          },
        },
      },
    };

    // Store notification in DB (you can keep raw content here, no need to stringify)
    await Notifications.create({
      user_id: userId,
      content,
      title,
      body,
      category,
      recordId,
    });
    // Send notification
    await admin.messaging().send(message);
  } catch (error) {
    console.error(`Error sending notification: ${error.message}`);
    throw new Error("Failed to send notification");
  }
};

module.exports = { sendNotification };
