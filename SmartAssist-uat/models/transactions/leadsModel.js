const sequelize = require("../../dbConfig/dbConfig");
const superAdmin = require("../master/superAdminModel");
const User = require("../master/usersModel");
const Team = require("../master/teamMasterModel");
const TeamLead = require("../master/teamLeadModel");
const dealer = require("../master/dealerModel");
const { Sequelize, DataTypes } = require("sequelize");
const dateController = require("../../utils/dateFilter");

const Leads = sequelize.define(
  "Leads",
  {
    lead_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    cxp_lead_code: {
      type: DataTypes.STRING,
    },
    dealer_name: {
      type: DataTypes.STRING,
    },
    dealer_code: {
      type: DataTypes.INTEGER,
    },
    status: {
      type: DataTypes.ENUM("New", "Follow Up", "Qualified", "Lost"),
      allowNull: false,
      defaultValue: "New",
    },

    purchase_type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("New Vehicle", "Used Vehicle"),
      // allowNull: false,
      // defaultValue: "New Vehicle",
    },
    type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("Product", "Service", "Experience", "Offer"),
      // allowNull: false,
      // defaultValue: "Product",
    },
    sub_type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM(
      //   "Retail",
      //   "Fleet",
      //   "Approved Pre-Owned",
      //   "Service/Repair",
      //   "Branded Goods",
      //   "Parts",
      //   "Special Vehicle Ops",
      //   "Accessories",
      //   "EVHC"
      // ),
      // allowNull: false,
      // defaultValue: "Retail",
    },
    fuel_type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("Petrol", "Diesel", "EV"),
    },
    brand: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("Jaguar", "Land Rover"),
      // allowNull: false,
    },
    PMI: {
      type: DataTypes.STRING,
      // allowNull: false
    },
    houseOfBrand: {
      type: DataTypes.ENUM("JAGUAR", "DEFENDER", "RANGE_ROVER", "DISCOVERY"),
      // allowNull: false
    },
    vehicle_id: {
      type: DataTypes.STRING,
    },
    lead_source: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM(
      //   "Email",
      //   "Existing Customer",
      //   "Field Visit",
      //   "Phone-in",
      //   "Phone-out",
      //   "Purchased List",
      //   "Referral",
      //   "Retailer Experience",
      //   "SMS",
      //   "Social (Retailer)",
      //   "Walk-in",
      //   "Other"
      // ),
      allowNull: false,
    },
    lead_name: {
      type: DataTypes.STRING,
    },
    campaign: {
      type: DataTypes.STRING,
      // defaultValue: "LR - ICS Leads & KMIs",
    },
    fname: {
      type: DataTypes.STRING,

      // allowNull: false,
    },
    lname: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    description: {
      type: DataTypes.STRING(1000),
    },
    mobile: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    cxp_mobile: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    mobile_second: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    chat_id: {
      type: DataTypes.STRING,
    },
    location: {
      type: DataTypes.STRING(1000),
    },
    budget: {
      type: DataTypes.BIGINT,
    },
    email: {
      type: DataTypes.STRING,
      // allowNull: false,
      // validate: {
      //   isEmail: true,
      // },
    },
    lead_owner: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    owner_email: {
      type: DataTypes.STRING,
      validate: {
        isEmail: true,
      },
      defaultValue: "",
      // allowNull: false,
    },
    owner_acc_id: {
      type: DataTypes.BIGINT,
      // allowNull: false
    },
    enquiry_type: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM("KMI", "(Generic) Purchase intent within 90 days"),
      // allowNull: false,
      // defaultValue: "KMI",
    },
    expected_date_purchase: {
      type: DataTypes.DATEONLY,
    },
    vehicle_name: {
      type: DataTypes.STRING,
    },
    updated_by: {
      type: DataTypes.STRING,
    },
    favourite: {
      type: DataTypes.BOOLEAN,
    },
    flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
    update_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    ics_posted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    ics_posted_at: {
      type: DataTypes.DATE,
    },
    cxp_posted_at: {
      type: DataTypes.DATE,
    },
    reassign_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
    error_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    opp_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    converted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lead_age: {
      type: DataTypes.INTEGER,
      // defaultValue: 0,
    },
    consent: {
      type: DataTypes.BOOLEAN,
    },
    url: {
      type: DataTypes.STRING,
    },
    updated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_by: {
      type: DataTypes.STRING,
    },
    exterior_color: {
      type: DataTypes.STRING,
    },
    interior_color: {
      type: DataTypes.STRING,
    },
    lost_created_at: {
      type: DataTypes.DATE,
    },
    lead_created: {
      type: DataTypes.STRING,
    },
    lost_reason: {
      type: DataTypes.STRING(1000),
    },
    lost_remarks: {
      type: DataTypes.STRING(1000),
    },
    existingComp: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    from_cxp: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    rpa_name: {
      type: DataTypes.STRING,
    },
    company_name: {
      type: DataTypes.STRING,
    },
    for_company: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },

    //------------------opportunity ---------------------//

    opp_status: {
      type: DataTypes.ENUM(
        "Appraise",
        "Contacted",
        "Handover",
        "Lost",
        "Negotiate",
        "Negotiation",
        "Order",
        "Qualify",
        "Re-Opened",
        "Retailer Lost",
        "Take Order",
        "Select Vehicle",
        "Test Drive Demo",
        "Test Drive",
        "Won",
        "Closed"
      ),
      allowNull: true,
    },
    cxp_opp_code: {
      type: DataTypes.STRING,
    },
    opp_name: {
      type: DataTypes.STRING,
      // allowNull: false
    },
    opp_owner: {
      type: DataTypes.STRING,
    },
    opp_owner_email: {
      type: DataTypes.STRING,
    },
    calculated_model: {
      type: DataTypes.STRING,
    },
    account_name: {
      type: DataTypes.STRING,
      // allowNull: false
    },
    close_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false
    },
    opp_currency: {
      type: DataTypes.STRING,
    },
    VIN: {
      type: DataTypes.STRING,
      // allowNull: false
    },
    opp_record_type: {
      type: DataTypes.STRING,
    },
    //---------------------------------at negotiation stage---------------------//
    deposit_status: {
      type: DataTypes.STRING,
    },
    deposit_amount: {
      type: DataTypes.STRING,
    },
    deposit_date: {
      type: DataTypes.DATEONLY,
    },
    deposit_transact_id: {
      type: DataTypes.STRING,
    },
    deposit_cancelled_date: {
      type: DataTypes.DATEONLY,
    },
    retailer_loss_reason: {
      type: DataTypes.STRING,
    },
    retailer_loss_category: {
      type: DataTypes.STRING,
    },
    retailer_loss_notes: {
      type: DataTypes.STRING,
    },
    VME_trade_in_type: {
      type: DataTypes.STRING,
    },
    VME_segment: {
      type: DataTypes.STRING,
    },
    VME_sub_division: {
      type: DataTypes.STRING,
    },
    converted_to_retail: {
      type: DataTypes.BOOLEAN,
    },
    converted_at: {
      type: DataTypes.DATE,
    },
    opp_url: {
      type: DataTypes.STRING,
    },
    opp_create_date: {
      type: DataTypes.DATEONLY,
    },
  },
  {
    tableName: "Leads",

    timestamps: false,
  }
);

Leads.beforeCreate((lead) => {
  lead.created_at = dateController.CurrentDate();
  lead.updated_at = dateController.CurrentDate();
});

Leads.beforeUpdate((lead) => {
  lead.updated_at = dateController.CurrentDate();
});

Leads.belongsTo(User, {
  foreignKey: "sp_id",
  as: "salesperson",
});

User.hasMany(Leads, {
  foreignKey: "sp_id",
  as: "Leads",
});
Leads.belongsTo(TeamLead, {
  foreignKey: "tl_id",
  as: "teamLead",
});

TeamLead.hasMany(Leads, {
  foreignKey: "tl_id",
  as: "Leads",
});
Leads.belongsTo(Team, {
  foreignKey: "team_id",
  as: "team",
});

Team.hasMany(Leads, {
  foreignKey: "team_id",
  as: "Leads",
});

Leads.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Leads, {
  foreignKey: "corporate_id",
  as: "Leads",
});

Leads.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});

dealer.hasMany(Leads, {
  foreignKey: "dealer_id",
  as: "Leads",
});

module.exports = Leads;
