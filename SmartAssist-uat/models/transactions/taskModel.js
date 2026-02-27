const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const superAdmin = require("../master/superAdminModel");
const dealer = require("../master/dealerModel");
const User = require("../master/usersModel");
const dateController = require("../../utils/dateFilter");

const Tasks = sequelize.define(
  "Tasks",
  {
    task_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    subject: {
      type: DataTypes.ENUM(
        "Call",
        "Provide Quotation",
        "Send Email",
        "Vehicle Selection",
        "Send SMS",
        "Meeting",
        "Showroom appointment",
        "Service Appointment",
        "Trade in evaluation"
      ),
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "Not Started",
        "In Progress",
        "Completed",
        "Deferred"
      ),
      defaultValue: "Not Started",
      allowNull: false,
    },
    completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    brand: {
      type: DataTypes.STRING,
    },
    completed_at: {
      type: DataTypes.DATE,
    },
    priority: {
      type: DataTypes.ENUM("High", "Normal", "Low"),
      defaultValue: "High",
    },
    assigned_to: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    owner_email: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    due_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    overdue: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    comments: {
      type: DataTypes.STRING(1000),
    },
    remarks: {
      type: DataTypes.STRING(1000),
    },
    related_to: {
      type: DataTypes.STRING,
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    lead_email: {
      type: DataTypes.STRING,
    },
    opportunity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: "00000000-0000-0000-0000-000000000000",
    },
    cxp_lead_code: {
      type: DataTypes.STRING,
    },
    mobile: {
      type: DataTypes.STRING,
    },
    PMI: {
      type: DataTypes.STRING,
    },
    houseOfBrand: {
      type: DataTypes.ENUM("JAGUAR", "DEFENDER", "RANGE_ROVER", "DISCOVERY"),
    },
    vehicle_id: {
      type: DataTypes.STRING,
    },
    time: {
      type: DataTypes.TIME,
    },
    favourite: {
      type: DataTypes.BOOLEAN,
    },
    vehicle_name: {
      type: DataTypes.STRING,
    },
    flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
    update_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    error_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    updated_by: {
      type: DataTypes.STRING,
    },
    created_by: {
      type: DataTypes.STRING,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    updated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sfDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    url: {
      type: DataTypes.STRING,
    },
    lead_url: {
      type: DataTypes.STRING,
    },
    opp_url: {
      type: DataTypes.STRING,
    },
    notification_category: {
      type: DataTypes.STRING,
    },
    category: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("Appointment", "Follow-up"),
    },
    rpa_name: {
      type: DataTypes.STRING,
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Tasks",
    timestamps: false,
  }
);

Tasks.beforeCreate((task) => {
  task.created_at = dateController.CurrentDate();
  task.updated_at = dateController.CurrentDate();
});

Tasks.beforeUpdate((task) => {
  task.updated_at = dateController.CurrentDate();
});

Tasks.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Tasks, {
  foreignKey: "corporate_id",
  as: "Tasks",
});

Tasks.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});

dealer.hasMany(Tasks, {
  foreignKey: "dealer_id",
  as: "Tasks",
});

Tasks.belongsTo(User, {
  foreignKey: "sp_id",
  as: "user",
});

User.hasMany(Tasks, {
  foreignKey: "sp_id",
  as: "Tasks",
});

module.exports = Tasks;
