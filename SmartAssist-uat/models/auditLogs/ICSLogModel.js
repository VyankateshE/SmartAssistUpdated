const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const ics_logs = sequelize.define(
  "ICSLogs",
  {
    log_id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV1,
      allowNull: false,
      primaryKey: true,
    },
    record_fname: {
      type: DataTypes.STRING,
    },
    record_lname: {
      type: DataTypes.STRING,
    },
    record_email: {
      type: DataTypes.STRING,
    },
    record_mobile: {
      type: DataTypes.STRING,
    },
    record_source: {
      type: DataTypes.STRING,
    },
    record_owner: {
      type: DataTypes.STRING,
    },
    record_version: {
      type: DataTypes.STRING,
    },
    record_created_at: {
      type: DataTypes.STRING,
    },
    ics_response: {
      type: DataTypes.STRING(2000),
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "ICSLogs",
    timestamps: false,
  }
);

ics_logs.beforeCreate((ics_logs) => {
  ics_logs.created_at = dateController.CurrentDate();
  ics_logs.updated_at = dateController.CurrentDate();
});

ics_logs.beforeUpdate((ics_logs) => {
  ics_logs.updated_at = dateController.CurrentDate();
});

module.exports = ics_logs;
