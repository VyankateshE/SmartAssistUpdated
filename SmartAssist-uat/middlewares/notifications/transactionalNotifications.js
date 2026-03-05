const getNotificationTemplate = require("../../utils/notificationTemplate");
const { sendNotification } = require("../../utils/notification");

// const newLeadNotification = async (assignee) => {
//   const notificationData = getNotificationTemplate("leads", leadsData);

//   await sendNotification({
//     category: "leads",
//     userId: assignee.user_id,
//     recordId: leadsData.lead_id,
//     deviceToken: assignee.device_token,
//     title: notificationData.title,
//     body: notificationData.body,
//     content: notificationData.content || null,
//   });
// };
const newOppNotification = async (oppsData, assignee) => {
  // const oppsData = opportunity.toJSON();
  const notificationData = getNotificationTemplate("opportunities", oppsData);

  await sendNotification({
    category: "opportunities",
    userId: assignee.user_id,
    recordId: oppsData.opportunity_id,
    deviceToken: assignee.device_token,
    title: notificationData.title,
    body: notificationData.body,
    content: notificationData.content || null,
  });
};

module.exports = {
  newOppNotification,
};
