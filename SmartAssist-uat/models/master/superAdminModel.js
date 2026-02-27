const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcrypt");
const dateController = require("../../utils/dateFilter");

const SuperAdmin = sequelize.define(
  "SuperAdmin",
  {
    corporate_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      validate: {
        isEmail: true,
      },
      unique: true,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("SuperAdmin"),
      allowNull: false,
      defaultValue: "SuperAdmin",
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    otp_validated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    otp: {
      type: DataTypes.INTEGER(6),
    },
    otp_expiration: {
      type: DataTypes.DATE,
    },
    access_token: {
      type: DataTypes.STRING(1000),
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
    tableName: "SuperAdmin",
    timestamps: false,
  }
);

SuperAdmin.beforeCreate((superAdmin) => {
  superAdmin.created_at = dateController.CurrentDate();
  superAdmin.updated_at = dateController.CurrentDate();
});

SuperAdmin.beforeUpdate((superAdmin) => {
  superAdmin.updated_at = dateController.CurrentDate();
});

SuperAdmin.prototype.comparePassword = function (candidatePassword) {
   const data =  bcrypt.compare(candidatePassword, this.password);
   console.log("bcrypt____"+bcrypt);
   return data;
};

module.exports = SuperAdmin;
