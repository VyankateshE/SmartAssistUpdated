const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");

const Version = sequelize.define(
  "Version",
  {
    version_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    version_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    version_description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    version_release_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
  },
  {
    tableName: "Version",
    timestamps: false,
  }
);

module.exports = Version;
