const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const superAdmin = require("./superAdminModel");
const Dealer = require("./dealerModel");
const dateController = require("../../utils/dateFilter");

const Vehicles = sequelize.define(
  "Vehicles",
  {
    vehicle_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    YOM: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    vehicle_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    brand: {
      type: DataTypes.ENUM("Jaguar", "Land Rover"),
      allowNull: true,
    },
    houseOfBrand: {
      type: DataTypes.ENUM("JAGUAR", "DEFENDER", "RANGE_ROVER", "DISCOVERY"),
    },
    asset_name: {
      type: DataTypes.STRING,
    },
    license_plate: {
      type: DataTypes.STRING,
    },
    type: {
      type: DataTypes.ENUM("petrol", "diesel", "EV"),
      allowNull: false,
    },
    VIN: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    demo_start_date: {
      type: DataTypes.DATEONLY,
    },
    demo_end_date: {
      type: DataTypes.DATEONLY,
    },
    warranty_start_date: {
      type: DataTypes.DATEONLY,
    },
    warranty_end_date: {
      type: DataTypes.DATEONLY,
    },
    retailer_name: {
      type: DataTypes.STRING,
    },
    chasis_number: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    wheelbase: {
      type: DataTypes.STRING,
    },
    body_style: {
      type: DataTypes.STRING,
    },
    exterior_color_group: {
      type: DataTypes.STRING,
    },
    exterior_color: {
      type: DataTypes.STRING,
    },
    exterior_color_code: {
      type: DataTypes.STRING,
    },
    interior_color: {
      type: DataTypes.STRING,
    },
    engine: {
      type: DataTypes.STRING,
    },
    identity: {
      type: DataTypes.STRING,
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
    tableName: "Vehicles",
    timestamps: false,
  }
);

Vehicles.beforeCreate((vehicles) => {
  vehicles.created_at = dateController.CurrentDate();
  vehicles.updated_at = dateController.CurrentDate();
});

Vehicles.beforeUpdate((vehicles) => {
  vehicles.updated_at = dateController.CurrentDate();
});

Vehicles.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Vehicles, {
  foreignKey: "corporate_id",
  as: "Vehicles",
});

Vehicles.belongsTo(Dealer, {
  foreignKey: "dealer_id",
  as: "dealer_code",
});

Dealer.hasMany(Vehicles, {
  foreignKey: "dealer_id",
  as: "Vehicles",
});

module.exports = Vehicles;
