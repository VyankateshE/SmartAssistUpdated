const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const TaskActivity = sequelize.define(
  "TaskActivity",
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
    tableName: "TaskActivity",
    timestamps: false,
  }
);

TaskActivity.beforeCreate((TaskActivity) => {
  TaskActivity.created_at = dateController.CurrentDate();
  TaskActivity.updated_at = dateController.CurrentDate();
});

TaskActivity.beforeUpdate((TaskActivity) => {
  TaskActivity.updated_at = dateController.CurrentDate();
});

module.exports = TaskActivity;
