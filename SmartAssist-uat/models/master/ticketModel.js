const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");

const Issues = sequelize.define(
  "Issues",
  {
    ticket_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    issue_no: {
      type: DataTypes.INTEGER,
      // defaultValue: 1,
      autoIncrement: true,
      //   allowNull: false,
    },
    date_reported: {
      type: DataTypes.DATEONLY,
      //   allowNull: false,
    },
    time_reported: {
      type: DataTypes.TIME,
      //   allowNull: false,
    },
    reported_by: {
      type: DataTypes.STRING(1000),
      //   allowNull: false,
    },
    dealer_name: {
      type: DataTypes.STRING(1000),
    },
    dealer_code: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.ENUM("open", "in_progress", "closed"),
      defaultValue: "open",
      //   allowNull: false,
    },
    category: {
      type: DataTypes.STRING(1000),
      // allowNull: false,
    },
    description: {
      type: DataTypes.STRING(1000),
    },
    subject: {
      type: DataTypes.STRING(1000),
    },
    media: {
      type: DataTypes.STRING(1000),
    },
    resolution: {
      type: DataTypes.STRING(1000),
    },
    assigned_to: {
      type: DataTypes.STRING(1000),
    },
    priority: {
      type: DataTypes.ENUM("Low", "Medium", "High"),
      defaultValue: "Medium",
    },
    internal_creator: {
      type: DataTypes.STRING(1000),
    },
    subcategory: {
      type: DataTypes.STRING(1000),
    },
    type: {
      type: DataTypes.ENUM(
        "Bug",
        "Clarification",
        "Feedback",
        "Enhancement",
        "Training"
      ),
      defaultValue: "Feedback",
    },
  },
  {
    tableName: "Issues",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Issues;
