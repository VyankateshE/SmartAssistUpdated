const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const vehicles = require("../master/vehicleModel");
const Dealer = require("../master/dealerModel");
const dateController = require("../../utils/dateFilter");

const VehicleSlots = sequelize.define(
  "VehicleSlots",
  {
    booking_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },

    start_time_slot: {
      type: DataTypes.TIME,
    },
    end_time_slot: {
      type: DataTypes.TIME,
    },

    date_of_booking: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    time_of_booking: {
      type: DataTypes.RANGE,
      // allowNull: false,
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Events",
        key: "event_id",
      },
      onDelete: "CASCADE",
    },

    vehicle_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chasis_number: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    VIN: {
      type: DataTypes.STRING,
      // allowNull: false,
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
    tableName: "VehicleSlots",
    timestamps: false,
  }
);

VehicleSlots.beforeCreate((vehicleSlots) => {
  vehicleSlots.created_at = dateController.CurrentDate();
  vehicleSlots.updated_at = dateController.CurrentDate();
});

VehicleSlots.beforeUpdate((vehicleSlots) => {
  vehicleSlots.updated_at = dateController.CurrentDate();
});

VehicleSlots.belongsTo(vehicles, {
  foreignKey: "vehicle_id",
  as: "vehicle_code",
});
vehicles.hasMany(VehicleSlots, {
  foreignKey: "vehicle_id",
  as: "slots",
});
VehicleSlots.belongsTo(Dealer, {
  foreignKey: "dealer_id",
  as: "dealer_code",
});
Dealer.hasMany(VehicleSlots, {
  foreignKey: "dealer_id",
  as: "slots",
});

module.exports = VehicleSlots;
