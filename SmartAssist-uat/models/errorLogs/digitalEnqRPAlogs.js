const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const DigitalEnq = sequelize.define(
  "DigitalEnq",
  {
    log_id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV1,
      allowNull: false,
      primaryKey: true,
    },
    error_req: {
      type: DataTypes.STRING,
    },
    error_type: {
      type: DataTypes.STRING(255),
    },
    error_message: {
      type: DataTypes.TEXT,
    },
    failed_record: {
      type: DataTypes.JSONB,
    },
    user_id: {
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
    tableName: "DigitalEnq",
    timestamps: false,
  }
);

DigitalEnq.beforeCreate((sfErrorLogs) => {
  sfErrorLogs.created_at = dateController.CurrentDate();
  sfErrorLogs.updated_at = dateController.CurrentDate();
});

DigitalEnq.beforeUpdate((sfErrorLogs) => {
  sfErrorLogs.updated_at = dateController.CurrentDate();
});

module.exports = DigitalEnq;
