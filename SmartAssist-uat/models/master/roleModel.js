const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const Roles = sequelize.define(
  "Roles",
  {
    role_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    role_name: {
      type: DataTypes.ENUM("PS", "SM", "CEO", "app-admin", "DP", "TL", "TCL"),
      allowNull: false,
    },
    description: {
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
    tableName: "Roles",
    timestamps: false,
  }
);
Roles.beforeCreate((role) => {
  role.created_at = dateController.CurrentDate();
  role.updated_at = dateController.CurrentDate();
});

Roles.beforeUpdate((role) => {
  role.updated_at = dateController.CurrentDate();
});

module.exports = Roles;
