// models/master/superAdminLoginModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");

const SuperAdminLogins = sequelize.define(
  "SuperAdminLogins",
  {
    login_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    corporate_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    otp: {
      type: DataTypes.INTEGER(6),
      allowNull: true,
    },
    otp_expiration: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    otp_validated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    role: {
      type: DataTypes.ENUM("SuperAdmin"),
      allowNull: false,
      defaultValue: "SuperAdmin",
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deleted: {
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
    tableName: "SuperAdminLogins",
    timestamps: true,
    underscored: true,
  }
);

SuperAdminLogins.beforeCreate((superAdmin) => {
  superAdmin.created_at = dateController.CurrentDate();
  superAdmin.updated_at = dateController.CurrentDate();
});

SuperAdminLogins.beforeUpdate((superAdmin) => {
  superAdmin.updated_at = dateController.CurrentDate();
});

module.exports = SuperAdminLogins;
