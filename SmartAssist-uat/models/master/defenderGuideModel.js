const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const superAdmin = require("./superAdminModel");
const dealer = require("../master/dealerModel");

const defenderGuideModel = sequelize.define(
  "DefenderGuide",
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey:   true,
      allowNull: false,
    },
    lead_id: {
      type:       DataTypes.UUID,
      allowNull:  false,
      unique:     true,
      references: { model: "Leads", key: "lead_id" },
    },

    name:     { type: DataTypes.STRING(255), allowNull: true },
    contact:  { type: DataTypes.STRING(20),  allowNull: true },
    email:    { type: DataTypes.STRING(255), allowNull: true },
    address:  { type: DataTypes.TEXT,        allowNull: true },
    city:     { type: DataTypes.STRING(100), allowNull: true },
    state:    { type: DataTypes.STRING(100), allowNull: true },
    pin_code: { type: DataTypes.STRING(10),  allowNull: true },

    end_user_name:     { type: DataTypes.STRING(255), allowNull: true },
    end_user_contact:  { type: DataTypes.STRING(20),  allowNull: true },
    end_user_email:    { type: DataTypes.STRING(255), allowNull: true },
    end_user_address:  { type: DataTypes.TEXT,        allowNull: true },
    end_user_city:     { type: DataTypes.STRING(100), allowNull: true },
    end_user_state:    { type: DataTypes.STRING(100), allowNull: true },
    end_user_pin_code: { type: DataTypes.STRING(10),  allowNull: true },

    model:            { type: DataTypes.STRING(255),   allowNull: true },
    model_year:       { type: DataTypes.STRING(10),    allowNull: true },
    mfg_year:         { type: DataTypes.STRING(10),    allowNull: true },
    engine_no:        { type: DataTypes.STRING(100),   allowNull: true },
    chassis_no:       { type: DataTypes.STRING(100),   allowNull: true },
    fuel_type:        { type: DataTypes.STRING(50),    allowNull: true },
    exterior:         { type: DataTypes.STRING(100),   allowNull: true },
    upholstery:       { type: DataTypes.STRING(100),   allowNull: true },
    insurance_date:   { type: DataTypes.DATEONLY,      allowNull: true },
    invoice_date:     { type: DataTypes.DATEONLY,      allowNull: true },
    pdi_date:         { type: DataTypes.DATEONLY,      allowNull: true },
    delivery_date:    { type: DataTypes.DATEONLY,      allowNull: true },

    vc_spare_dummy_keys:      { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_floor_carpet_mats:     { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_first_aid_kit:         { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_front_tyre_pressure:   { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_rear_tyre_pressure:    { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_invoice_debit_note:    { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_rto_tax_receipt:       { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_insurance_policy:      { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_defender_care:         { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_digital_owners_manual: { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_service_warranty:      { type: DataTypes.BOOLEAN, defaultValue: false },
    vc_connected_car_service: { type: DataTypes.BOOLEAN, defaultValue: false },
    fuel_reading:             { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    odometer_reading:         { type: DataTypes.INTEGER,       allowNull: true },

    tk_screwdriver:             { type: DataTypes.BOOLEAN, defaultValue: false },
    tk_wheel_key:               { type: DataTypes.BOOLEAN, defaultValue: false },
    tk_spare_wheel:             { type: DataTypes.BOOLEAN, defaultValue: false },
    tk_hazard_warning_triangle: { type: DataTypes.BOOLEAN, defaultValue: false },
    tk_tow_away_hook:           { type: DataTypes.BOOLEAN, defaultValue: false },
    tk_jack_and_handle:         { type: DataTypes.BOOLEAN, defaultValue: false },

  collector_type: {
  type: DataTypes.ENUM("OWNER", "REPRESENTATIVE"),
  allowNull: true
},

collector_present: {
  type: DataTypes.BOOLEAN,
  allowNull: true
},

collector_signature: {
  type: DataTypes.TEXT,
  allowNull: true
},
  
    status:            { type: DataTypes.STRING(20),  defaultValue: "Draft" },
    generated_pdf_url: { type: DataTypes.TEXT,        allowNull: true },
    created_by:        { type: DataTypes.STRING(255), allowNull: true },
  },
 {
    tableName:  "defender_guides",
    timestamps: false,
  }
);


defenderGuideModel.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

defenderGuideModel.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});





module.exports = defenderGuideModel;