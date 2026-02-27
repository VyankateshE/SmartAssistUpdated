const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");
const superAdmin = require("./superAdminModel");
const { Sequelize, DataTypes } = require("sequelize");

const Campaign = sequelize.define(
  "Campaign",
  {
    campaign_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    campaign_name: {
      type: DataTypes.STRING,
    },
    campaign_code: {
      type: DataTypes.STRING,
    },
    valid_from: {
      type: DataTypes.STRING,
    },
    valid_to: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Campaign",
    timestamps: false,
  }
);

Campaign.beforeCreate((color) => {
  color.created_at = dateController.CurrentDate();
  color.updated_at = dateController.CurrentDate();
});

Campaign.beforeUpdate((color) => {
  color.updated_at = dateController.CurrentDate();
});

//one superAdmin has multiple branches/distributors
Campaign.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Campaign, {
  foreignKey: "corporate_id",
  as: "Campaign",
});

module.exports = Campaign;
