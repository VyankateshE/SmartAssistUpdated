const getNotificationTemplate = (type, data) => {
  const templates = {
    meeting: {
      title: `📅 Meeting Scheduled!`,
      body: `You have a scheduled meeting with ${data.name} in the next 30 minutes.`,
      // body: `Heads up! You’ve got a meeting with (${data.name}). Bring your A-game and make waves! 💼🔥`,
    },

    "showroom appointment": {
      title: `🏬 Showroom Experience Confirmed!`,
      body: `${data.name} is visiting - time to deliver an exceptional experience.`,
    },

    "provide quotation": {
      title: `📜 Quotation Request`,
      body: `${data.name} is awaiting your quotation - present it with precision to close the deal.`,
    },

    leads: {
      title: `New Lead assigned!`,
      body: `${data.lead_name} is now your lead. Please add a follow-up for next steps.`,
    },

    opportunities: {
      title: `🔥 New Opportunity Assigned!`,
      body: `A promising opportunity with ${data.lead_name} is now yours.`,
    },

    call: {
      title: `📞 Follow-up call set up`,
      body: `A conversation with ${data.name} is scheduled. Shall remind you before time.`,
    },
    call_due: {
      title: `📞 Follow-up call due`,
      body: `You have a scheduled call with  ${data.name} in next 30 minutes.`,
    },

    "send email": {
      title: `📧 Deliver a follow-up email`,
      body: `Follow-up email to ${data.name} Is needed for ${data.PMI}.`,
    },

    "send sms": {
      title: `💬 Deliver a follow-up SMS`,
      body: `Time to send a follow-up message to ${data.name} for ${data.PMI}.`,
    },

    "test drive": {
      title: `🚗 Test Drive Confirmed!`,
      body: `${data.name} is scheduled for a test drive today - ensure vehicle is ready and available`,
    },
    "existingCustomer"  :{
      title:`Your Client made a visit `,
      body:`${data.name}`
    }
  };

  module.exports = templates;

  return templates[type] || null;
};

module.exports = getNotificationTemplate;
