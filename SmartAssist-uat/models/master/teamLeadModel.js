const Dealers = require("./dealerModel");
const SuperAdmin = require("./superAdminModel");
const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const TeamLead = sequelize.define(
  "TeamLead",
  {
    tl_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    team_name: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    team_lead_id: {
      type: DataTypes.UUID,
      // allowNull: false,
    },
    team_lead_email: {
      type: DataTypes.STRING,
      // validate: {
      //   isEmail: true,
      // },
      // allowNull: false,
    },
    created_by: {
      type: DataTypes.UUID,
    },
    updated_by: {
      type: DataTypes.UUID,
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
    tableName: "TeamLead",
    timestamps: false,
  }
);

TeamLead.beforeCreate((teamMaster) => {
  teamMaster.created_at = dateController.CurrentDate();
  teamMaster.updated_at = dateController.CurrentDate();
});

TeamLead.beforeUpdate((teamMaster) => {
  teamMaster.updated_at = dateController.CurrentDate();
});

TeamLead.belongsTo(Dealers, { foreignKey: "dealer_id", as: "dealer" });
Dealers.hasMany(TeamLead, { foreignKey: "dealer_id", as: "teamLead" });

TeamLead.belongsTo(SuperAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});
SuperAdmin.hasMany(TeamLead, { foreignKey: "corporate_id", as: "teamLead" });

module.exports = TeamLead;
