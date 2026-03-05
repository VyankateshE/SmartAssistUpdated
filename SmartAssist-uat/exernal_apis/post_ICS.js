require("dotenv").config();
const Leads = require("../models/transactions/leadsModel");
const logger = require("../middlewares/fileLogs/ICSLogger");
const axios = require("axios");
const FormData = require("form-data");
const dateController = require("../utils/dateFilter");
const ICSLogs = require("../models/auditLogs/ICSLogModel");
const moment = require("moment");

const postLeadToICS = async (lead, user) => {
  try {
    const form = new FormData();
    const dateFormat = moment(lead.created_at).local().format("YYYY-MM-DD");
    let cxp_mobile;
    if (lead.mobile.length > 10) {
      cxp_mobile = lead.mobile.trim().slice(3);
    }
    form.append("UserId", "USERKMIMumFeed");
    form.append("Pass", "%JLRKMIMumbai@Feed");
    form.append("brand", lead.brand);
    form.append("model", lead.PMI);
    form.append("first_name", lead.fname);
    form.append("last_name", lead.lname);
    form.append("gender", "Male");
    form.append("email", lead.email);
    form.append("mobile_no", cxp_mobile || lead.mobile);
    form.append("city", "Mumbai");
    form.append("source", lead.lead_source);
    form.append("retailer_id", user.excellence);
    form.append("platform", "API");
    form.append("lead_type", "R");
    form.append("retailer_name", user.excellence);
    form.append(
      "lead_version",
      lead.enquiry_type === "KMI" ? "KMI(more than 90 days)" : lead.enquiry_type
    );
    form.append("created_on", dateFormat);
    form.append("cxp_assigned_to", user.excellence);

    const icsResponse = await axios.post(process.env.ICS_URL, form, {
      headers: form.getHeaders(),
    });

    logger.info(
      `Lead sent to ICS API successfully============================================================>: ${JSON.stringify(
        icsResponse.data
      )}`
    );

    // Check if the response message indicates success (not "Synchronize failed" or "Duplicate Entry")
    if (icsResponse.data && icsResponse.data.message) {
      const message = icsResponse.data.message.toLowerCase();

      // Update lead model if the message doesn't contain failure indicators
      if (
        !message.includes("synchronize failed!") &&
        !message.includes("duplicate entry!")
      ) {
        try {
          await Leads.update(
            {
              ics_posted: true,
              ics_posted_at: dateController.todayDate,
            },
            { where: { lead_id: lead.lead_id } }
          );

          logger.info(
            `Lead model updated successfully for lead ID: ${lead.lead_id}`
          );
        } catch (updateError) {
          logger.error(
            `Failed to update lead model for lead ID ${lead.lead_id}: ${updateError.message}`
          );
        }
      } else {
        logger.warn(
          `ICS API returned failure message, not updating lead model: ${icsResponse.data.message}`
        );
      }
    }
    setImmediate(async () => {
      try {
        logger.info(`Storing ICS response to DB for lead ID: ${lead.lead_id}`);
        await ICSLogs.create({
          record_fname: lead.fname,
          record_lname: lead.lname,
          record_email: lead.email,
          record_mobile: cxp_mobile || lead.mobile,
          record_source: lead.lead_source,
          record_owner: user.excellence,
          record_version: lead.enquiry_type,
          record_created_at: lead.created_at,
          ics_response: JSON.stringify(icsResponse.data),
        });
      } catch (dbErr) {
        logger.error(
          `Failed to store ICS response to DB for lead ID ${lead.lead_id}: ${dbErr}`
        );
      }
    });
  } catch (err) {
    console.error("ICS API err:", err.response?.data || err.message);
    logger.error(
      `Failed to post lead to ICS API=========================================================================: ${
        err.response?.data?.message || err.message
      }`
    );
  }
};

module.exports = {
  postLeadToICS,
};
