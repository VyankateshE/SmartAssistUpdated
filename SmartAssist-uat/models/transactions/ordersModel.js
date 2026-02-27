const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const superAdmin = require("../master/superAdminModel");
const dealer = require("../master/dealerModel");
const User = require("../master/usersModel");
const dateController = require("../../utils/dateFilter");

const Orders = sequelize.define(
  "Orders",
  {
    order_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    account_name: {
      type: DataTypes.STRING,
    },
    mobile: {
      type: DataTypes.STRING,
    },
    email: {
      type: DataTypes.STRING,
      // allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    lead_source: {
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
    tableName: "Orders",
    timestamps: false,
  }
);

Orders.beforeCreate((order) => {
  order.created_at = dateController.CurrentDate();
  order.updated_at = dateController.CurrentDate();
});

Orders.beforeUpdate((order) => {
  order.updated_at = dateController.CurrentDate();
});

Orders.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Orders, {
  foreignKey: "corporate_id",
  as: "Orders",
});

Orders.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});

dealer.hasMany(Orders, {
  foreignKey: "dealer_id",
  as: "Orders",
});

Orders.belongsTo(User, {
  foreignKey: "sp_id",
  as: "user",
});

User.hasMany(Orders, {
  foreignKey: "sp_id",
  as: "Orders",
});

module.exports = Orders;
