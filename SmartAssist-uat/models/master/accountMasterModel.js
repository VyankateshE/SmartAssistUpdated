const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");
const superAdmin = require("./superAdminModel");
const Dealers = require("./dealerModel");
const { Sequelize, DataTypes } = require("sequelize");

const Accounts = sequelize.define(
  "Accounts",
  {
    account_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    cxp_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    acc_name: {
      type: DataTypes.STRING,
    },
    acc_owner: {
      type: DataTypes.STRING,
    },
    dealer_code: {
      type: DataTypes.INTEGER,
      references: {
        model: Dealers,
        key: "dealer_code",
      },
    },
    dealer_name: {
      type: DataTypes.STRING,
      references: {
        model: Dealers,
        key: "dealer_name",
      },
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Accounts",
    timestamps: false,
  }
);

Accounts.beforeCreate((acc) => {
  acc.created_at = dateController.CurrentDate();
  acc.updated_at = dateController.CurrentDate();
});

Accounts.beforeUpdate((acc) => {
  acc.updated_at = dateController.CurrentDate();
});

Accounts.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Accounts, {
  foreignKey: "corporate_id",
  as: "Accounts",
});
Accounts.belongsTo(Dealers, {
  foreignKey: "dealer_id",
  as: "dealer_code",
});

Dealers.hasMany(Accounts, {
  foreignKey: "dealer_id",
  as: "Accounts",
});

module.exports = Accounts;
