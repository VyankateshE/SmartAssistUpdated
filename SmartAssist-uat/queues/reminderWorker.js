const reminderQueue = require("./reminderQueue");
const Users = require("../models/master/usersModel");
const { sendNotification } = require("../utils/notification");
const getNotificationTemplate = require("../utils/notificationTemplate");

console.log("🚀 Reminder queue worker started");
reminderQueue.process("sendReminder", async (job) => {
  const task = job.data.task;

  console.log(`📥 Received task in reminderQueue: ${task.task_id}`);

  const user = await Users.findByPk(task.sp_id);

  if (!user?.device_token) {
    console.warn(`⚠️ User ${task.sp_id} has no device token`);
    throw new Error(`User ${task.sp_id} has no device token`);
  }

  const notificationData = getNotificationTemplate(
    task.subject.toLowerCase(),
    task
  );

  console.log(`📨 Sending notification to user ${user.user_id}`);

  await sendNotification({
    category: task.notification_category,
    userId: task.sp_id,
    deviceToken: user.device_token,
    title: notificationData.title,
    body: notificationData.body,
    content: notificationData.content || null,
  });

  console.log(`✅ Notification sent to ${user.user_id}`);

  return { status: "Notification sent" };
});
