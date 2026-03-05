const { Sequelize, DataTypes } = require("sequelize");

const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");
const CallLogs = sequelize.define(
  "CallLogs",
  {
    call_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    mobile: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    start_time: {
      type: DataTypes.STRING,
    },
    call_type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("incoming", "outgoing"),
      // allowNull: false,
    },
    call_status: {
      type: DataTypes.STRING,
      //  type: DataTypes.ENUM("connected", "missed", "rejected", "blocked"),
      // allowNull: false,
    },
    call_duration: {
      type: DataTypes.INTEGER,
      // allowNull: false,
      // defaultValue: 0,
      // allowNull: true,
    },
    call_date: {
      type: DataTypes.DATEONLY,
    },

    end_time: {
      type: DataTypes.TIME,
    },
    sp_id: {
      type: DataTypes.STRING,
    },
    unique_key: {
      type: DataTypes.STRING,
    },
    is_excluded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "CallLogs",
    timestamps: false,
  }
);

CallLogs.beforeCreate((callLogs) => {
  callLogs.created_at = dateController.CurrentDate();
  callLogs.updated_at = dateController.CurrentDate();
});

CallLogs.beforeUpdate((callLogs) => {
  callLogs.updated_at = dateController.CurrentDate();
});

module.exports = CallLogs;
