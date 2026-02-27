const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
// const superAdmin = require("./superAdminModel");
// const Dealers = require("./dealerModel");
const dateController = require("../../utils/dateFilter");
const bcrypt = require("bcrypt");

const GeneralManager = sequelize.define(
  "GeneralManager",
  {
    generalManager_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },

    corporate_id: {
      type: DataTypes.UUID,
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
    },
    password: {
      type: DataTypes.STRING(255),
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
    role: {
      type: DataTypes.ENUM("DP"),
      allowNull: false,
      defaultValue: "DP",
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "GeneralManager",
    timestamps: false,
  }
);

GeneralManager.beforeCreate((manager) => {
  manager.created_at = dateController.CurrentDate();
  manager.updated_at = dateController.CurrentDate();
});

GeneralManager.beforeUpdate((manager) => {
  manager.updated_at = dateController.CurrentDate();
});

GeneralManager.prototype.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = GeneralManager;
