const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const UserActivity = sequelize.define(
  "UserActivity",
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
    userName: {
      type: DataTypes.STRING(255),
    },
    last_login: {
      type: DataTypes.DATE,
    },
    userEmail: {
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
    tableName: "UserActivity",
    timestamps: false,
  }
);

UserActivity.beforeCreate((UserActivity) => {
  UserActivity.created_at = dateController.CurrentDate();
  UserActivity.updated_at = dateController.CurrentDate();
});

UserActivity.beforeUpdate((UserActivity) => {
  UserActivity.updated_at = dateController.CurrentDate();
});

module.exports = UserActivity;
