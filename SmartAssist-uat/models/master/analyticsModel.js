const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");
const Corporate = require("../master/superAdminModel");
const Dealers = require("../master/dealerModel");

const Analytics = sequelize.define(
  "Analytics",
  {
    record_id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
    },
    user_email: {
      type: DataTypes.STRING,
    },

    user_name: {
      type: DataTypes.STRING,
    },
    range: {
      type: DataTypes.ENUM("MTD", "QTD", "YTD"),
      defaultValue: "MTD",
      allowNull: true,
    },
    enquiry: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    testDrives: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    retail: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    net_orders: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    unique_td: {
      type: DataTypes.STRING,

      defaultValue: "0",
    },
    enquiry_to_UTD: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    enquiry_to_TD: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    new_orders: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    td_to_retail: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    utd_to_retail: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },

    cancellations: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    cancellation_contro: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    avg_enq_to_ord_days: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    avg_td_to_ord_days: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },
    dig_enq_to_ord_days: {
      type: DataTypes.STRING,
      defaultValue: "0",
    },

    team_id: {
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
    tableName: "Analytics",
    timestamps: false,
  }
);

Analytics.beforeCreate((analytics) => {
  analytics.created_at = dateController.CurrentDate();
  analytics.updated_at = dateController.CurrentDate();
});

Analytics.beforeUpdate((analytics) => {
  analytics.updated_at = dateController.CurrentDate();
});

Analytics.belongsTo(Corporate, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

Corporate.hasMany(Analytics, {
  foreignKey: "corporate_id",
  as: "Analytics",
});

Analytics.belongsTo(Dealers, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});

Dealers.hasMany(Analytics, {
  foreignKey: "dealer_id",
  as: "Analytics",
});

module.exports = Analytics;
