require("dotenv").config();
const apiTriggers = require("../../utils/scheduler");

const triggerLeadsNew = async (req, res) => {
  try {
    await apiTriggers.checkAndSendLeads();
    res
      .status(200)
      .json({ message: "RPA Trigger for New Leads executed successfully." });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for New Leads.",
      error: error.message,
    });
  }
};

const triggerUpdatedLeads = async (req, res) => {
  try {
    await apiTriggers.checkAndSendUpLeads();
    res.status(200).json({
      message: "RPA Trigger for Updated Leads executed successfully.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for Updated Leads.",
      error: error.message,
    });
  }
};

const triggerTasksNew = async (req, res) => {
  try {
    await apiTriggers.checkAndSendTasks();
    res
      .status(200)
      .json({ message: "RPA Trigger for New Tasks executed successfully." });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for New Tasks.",
      error: error.message,
    });
  }
};
const triggerEventsNew = async (req, res) => {
  try {
    await apiTriggers.checkAndSendEvents();
    res
      .status(200)
      .json({ message: "RPA Trigger for New Events executed successfully." });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for New Events.",
      error: error.message,
    });
  }
};

const triggerOppsNew = async (req, res) => {
  try {
    await apiTriggers.checkAndSendOpps();
    res.status(200).json({
      message: "RPA Trigger for New Opportunities executed successfully.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for New Opportunities.",
      error: error.message,
    });
  }
};
const reassigned = async (req, res) => {
  try {
    await apiTriggers.checkAssignee();
    res.status(200).json({
      message: "RPA Trigger for Reassigned Leads executed successfully.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for Reassigned Leads.",
      error: error.message,
    });
  }
};
const triggerUpdatedTasks = async (req, res) => {
  try {
    await apiTriggers.checkAndSendUpTasks();
    res.status(200).json({
      message: "RPA Trigger for Updated Tasks executed successfully.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for Updated Tasks.",
      error: error.message,
    });
  }
};
const triggerUpdatedEvents = async (req, res) => {
  try {
    await apiTriggers.checkAndSendUpEvents();
    res.status(200).json({
      message: "RPA Trigger for Updated Events executed successfully.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error executing RPA Trigger for Updated Events.",
      error: error.message,
    });
  }
};

module.exports = {
  triggerLeadsNew,
  triggerTasksNew,
  triggerEventsNew,
  triggerOppsNew,
  reassigned,
  triggerUpdatedTasks,
  triggerUpdatedEvents,
  triggerUpdatedLeads,
};
