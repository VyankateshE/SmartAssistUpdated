const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");
const Dealer = require("./dealerModel");
const Users = require("./usersModel");
const { Sequelize, DataTypes } = require("sequelize");

const Targets = sequelize.define(
  "Targets",
  {
    target_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    dealer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Dealers",
        key: "dealer_id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Users",
        key: "user_id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    user_email: {
      type: DataTypes.STRING,
    },
    user_name: {
      type: DataTypes.STRING,
    },
    enquiries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    orders: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    testDrives: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    range: {
      type: DataTypes.ENUM("MTD", "QTD", "YTD"),
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Targets",
    timestamps: false,
  }
);

Targets.beforeCreate((target) => {
  target.created_at = dateController.CurrentDate();
  target.updated_at = dateController.CurrentDate();
});

Targets.beforeUpdate((target) => {
  target.updated_at = dateController.CurrentDate();
});

Dealer.hasOne(Targets, { foreignKey: "dealer_id" });
Targets.belongsTo(Dealer, { foreignKey: "dealer_id" });
Users.hasOne(Targets, { foreignKey: "user_id" });
Targets.belongsTo(Users, { foreignKey: "user_id" });

module.exports = Targets;
