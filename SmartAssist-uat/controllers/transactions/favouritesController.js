require("dotenv").config();
const Leads = require("../../models/transactions/leadsModel");
const Tasks = require("../../models/transactions/taskModel");
const Events = require("../../models/transactions/eventModel");
const { Op } = require("sequelize");
const dateController = require("../../utils/dateFilter");
const responses = require("../../utils/globalResponse");

//mark leads as favourite
const toggleFavLead = async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const lead = await Leads.findByPk(leadId);

    if (!lead) {
      return responses.badRequest(res, `${process.env.NO_LEAD}`);
    }
    const favouriteStatus = !lead.favourite;
    const favourite = await Leads.update(
      { favourite: favouriteStatus },
      { where: { lead_id: leadId } }
    );
    if (favourite > 0) {
      return responses.success(
        res,
        `Lead marked as favourite : ${favouriteStatus}`
      );
    }
    return responses.notFound(res, `${process.env.NO_LEAD}`);
  } catch (error) {
    console.error("Error while modifying lead", error);
    return responses.badRequest(res, error.message);
  }
};
//end

//mark Events as favourite
const toggleFavEvents = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Events.findByPk(eventId);
    if (!event) {
      return responses.notFound(res, `Event not found`);
    }
    const favouriteStatus = !event.favourite;
    const favourite = await Events.update(
      { favourite: favouriteStatus },
      { where: { event_id: eventId } }
    );
    if (favourite > 0) {
      return responses.success(
        res,
        `Event marked as favourite : ${favouriteStatus}`
      );
    }
    return responses.notFound(res, `Event not found`);
  } catch (error) {
    console.error("Error while marking Event as favourite", error);
    return responses.badRequest(res, error.message);
  }
};
//end

//mark Tasks as favourite
const toggleFavTasks = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const task = await Tasks.findByPk(taskId);
    if (!task) {
      return responses.notFound(res, "Task not found");
    }
    const favouriteStatus = !task.favourite;
    const favourite = await Tasks.update(
      { favourite: favouriteStatus },
      { where: { task_id: taskId } }
    );
    if (favourite > 0) {
      return responses.success(
        res,
        `Task marked as favourite : ${favouriteStatus}`
      );
    }
    return responses.notFound(res, `Task not found`);
  } catch (error) {
    console.error("Error while marking Task as favourite", error);
    return responses.badRequest(res, error.message);
  }
};
//end

//get all fav leads
const getAllFavLeads = async (req, res) => {
  try {
    const leads = await Leads.findAndCountAll({
      where: { favourite: true, sp_id: req.userId },
      order: [["updated_at", "DESC"]],
    });

    return responses.success(
      res,
      `Favourite leads fetched ${process.env.ST201}`,
      leads
    );
  } catch (error) {
    console.error("Error fetching favourite leads", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all fav Appointments
const getAllFavAppointments = async (req, res) => {
  try {
    const events = await Promise.all([
      //upcoming appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //overdue appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //all appointments
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: {
            [Op.notIn]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);
    return responses.success(
      res,
      `Favourite Appointments fetched ${process.env.ST201}`,
      {
        upcomingAppointments: events[0],
        overdueAppointments: events[1],
        allAppointments: events[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite Appointments", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all fav Test-drives
const getAllFavTestDrives = async (req, res) => {
  try {
    const events = await Promise.all([
      //upcoming test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: "Test Drive",
          start_date: {
            [Op.between]: [
              dateController.todayDate,
              dateController.oneWeekLaterDate,
            ],
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //overdue test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: "Test Drive",
          start_date: {
            [Op.between]: [
              dateController.oneWeekBeforeDate,
              dateController.yesterdayDate,
            ],
          },
        },
        order: [["updated_at", "DESC"]],
      }),

      //all test-drives
      Events.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: "Test Drive",
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);

    return responses.success(
      res,
      `Favourite test drives fetched ${process.env.ST201}`,
      {
        upcomingDrives: events[0],
        overdueDrives: events[1],
        allDrives: events[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite Test Drives", error);
    return responses.serverError(res, error.message);
  }
};
//end

//get all fav tasks
const getAllFavFollowUps = async (req, res) => {
  try {
    const tasks = await Promise.all([
      //upcoming tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.gte]: dateController.todayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),
      //overdue tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          sp_id: req.userId,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          due_date: {
            [Op.lt]: dateController.yesterdayDate,
          },
        },
        order: [["updated_at", "DESC"]],
      }),
      //all tasks
      Tasks.findAndCountAll({
        where: {
          favourite: true,
          deleted: false,
          subject: {
            [Op.in]: ["Call", "Send Email", "Send SMS", "Provide Quotation"],
          },
          sp_id: req.userId,
        },
        order: [["updated_at", "DESC"]],
      }),
    ]);

    return responses.success(
      res,
      `Favourite Follow-ups fetched ${process.env.ST201}`,
      {
        upcomingTasks: tasks[0],
        overdueTasks: tasks[1],
        allTasks: tasks[2],
      }
    );
  } catch (error) {
    console.error("Error fetching favourite tasks", error);
    return responses.serverError(res, error.message);
  }
};
//end

module.exports = {
  toggleFavLead,
  toggleFavEvents,
  toggleFavTasks,
  getAllFavLeads,
  getAllFavAppointments,
  getAllFavTestDrives,
  getAllFavFollowUps,
};
