const sequelize = require("../../dbConfig/dbConfig");
const dateController = require("../../utils/dateFilter");
const superAdmin = require("./superAdminModel");
const { Sequelize, DataTypes } = require("sequelize");

const Colors = sequelize.define(
  "Colors",
  {
    color_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    color_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    image_url: {
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
    tableName: "Colors",
    timestamps: false,
  }
);

Colors.beforeCreate((color) => {
  color.created_at = dateController.CurrentDate();
  color.updated_at = dateController.CurrentDate();
});

Colors.beforeUpdate((color) => {
  color.updated_at = dateController.CurrentDate();
});

//one superAdmin has multiple branches/distributors
Colors.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Colors, {
  foreignKey: "corporate_id",
  as: "Colors",
});

module.exports = Colors;
