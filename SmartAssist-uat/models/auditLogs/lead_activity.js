const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const LeadActivity = sequelize.define(
  "LeadActivity",
  {
    activity_id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV1,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
    },
    userEmail: {
      type: DataTypes.STRING(255),
    },
    userRole: {
      type: DataTypes.STRING,
    },
    recordId: {
      type: DataTypes.UUID,
    },
    action: {
      type: DataTypes.STRING,
    },
    original_value: {
      type: DataTypes.STRING(10000),
    },
    new_value: {
      type: DataTypes.STRING(10000),
    },
    modiified_at: {
      type: DataTypes.DATE,
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "LeadActivity",
    timestamps: false,
  }
);

LeadActivity.beforeCreate((LeadActivity) => {
  LeadActivity.created_at = dateController.CurrentDate();
  LeadActivity.updated_at = dateController.CurrentDate();
});

LeadActivity.beforeUpdate((LeadActivity) => {
  LeadActivity.updated_at = dateController.CurrentDate();
});

module.exports = LeadActivity;
