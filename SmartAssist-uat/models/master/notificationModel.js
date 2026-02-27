const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const Notifications = sequelize.define(
  "Notifications",
  {
    notification_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
    },
    body: {
      type: DataTypes.STRING,
    },
    content: {
      type: DataTypes.STRING,
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    user_id: {
      type: DataTypes.UUID,
    },
    category: {
      type: DataTypes.STRING,
    },
    recordId: {
      type: DataTypes.UUID,
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Notifications",
    timestamps: false,
  }
);

Notifications.beforeCreate((notification) => {
  notification.created_at = dateController.CurrentDate();
  notification.updated_at = dateController.CurrentDate();
});

Notifications.beforeUpdate((notification) => {
  notification.updated_at = dateController.CurrentDate();
});

module.exports = Notifications;
