const sequelize = require("../../dbConfig/dbConfig");
const { Sequelize, DataTypes } = require("sequelize");
const superAdmin = require("../master/superAdminModel");
const dealer = require("../master/dealerModel");
const User = require("../master/usersModel");
const dateController = require("../../utils/dateFilter");

const Events = sequelize.define(
  "Events",
  {
    event_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },

    priority: {
      type: DataTypes.ENUM("High", "Normal", "Low"),
      defaultValue: "High",
    },

    subject: {
      type: DataTypes.ENUM("Test Drive"),
      allowNull: false,
    },

    assigned_to: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    description: {
      type: DataTypes.STRING(1000),
    },
    remarks: {
      type: DataTypes.STRING(1000),
    },
    start_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    start_time: {
      type: DataTypes.TIME,
      // allowNull: false,
    },
    end_time: {
      type: DataTypes.TIME,
      // allowNull: false,
    },
    actual_start_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    owner_email: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    actual_end_date: {
      type: DataTypes.DATEONLY,
      // allowNull: false,
    },
    actual_start_time: {
      type: DataTypes.TIME,
      // allowNull: false,
    },
    actual_end_time: {
      type: DataTypes.TIME,
      // allowNull: false,
    },

    due_date: {
      type: DataTypes.DATEONLY,
    },
    duration: {
      type: DataTypes.STRING,
    },
    distance: {
      type: DataTypes.STRING,
    },
    VIN: {
      type: DataTypes.STRING,
    },
    status: {
      type: DataTypes.ENUM("Planned", "In Progress", "Finished", "No Show"),
      defaultValue: "Planned",
    },
    completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    completed_at: {
      type: DataTypes.DATE,
    },
    name: {
      type: DataTypes.STRING,
    },
    related_to: {
      type: DataTypes.STRING,
    },
    location: {
      type: DataTypes.STRING,
    },
    driving_license_no: {
      type: DataTypes.STRING,
    },
    date_of_expiry: {
      type: DataTypes.DATEONLY,
    },

    license_plate: {
      type: DataTypes.STRING,
    },
    mileage_before: {
      type: DataTypes.STRING,
    },
    mileage_after: {
      type: DataTypes.STRING,
    },
    directions: {
      type: DataTypes.JSONB,
    },
    engine: {
      type: DataTypes.STRING,
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    opportunity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: "00000000-0000-0000-0000-000000000000",
    },
    cxp_lead_code: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    lead_email: {
      type: DataTypes.STRING,
    },
    mobile: {
      type: DataTypes.STRING,
    },
    brand: {
      type: DataTypes.STRING,
    },
    PMI: {
      type: DataTypes.STRING,
    },
    houseOfBrand: {
      type: DataTypes.ENUM("JAGUAR", "DEFENDER", "RANGE_ROVER", "DISCOVERY"),
    },
    vehicle_id: {
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
    error_flag: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "inactive",
    },
    updated_by: {
      type: DataTypes.STRING,
    },
    model: {
      type: DataTypes.STRING,
      // type: DataTypes.ENUM(
      //   "All New Range Rover Evoque",
      //   "Discovery",
      //   "Discovery Sport",
      //   "New Defender",
      //   "Range Rover",
      //   "Range Rover Evoque",
      //   "Range Rover Sport",
      //   "Range Rover Velar"
      // ),
    },
    created_by: {
      type: DataTypes.STRING,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    updated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sfDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    url: {
      type: DataTypes.STRING,
    },
    lead_url: {
      type: DataTypes.STRING,
    },
    opp_url: {
      type: DataTypes.STRING,
    },
    overdue: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notification_category: {
      type: DataTypes.STRING,
    },
    category: {
      type: DataTypes.STRING,
    },
    skip_license: {
      type: DataTypes.STRING,
    },
    drive_feedback: {
      type: DataTypes.JSONB,
    },
    declaration_img: {
      type: DataTypes.STRING,
    },
    consent_otp: {
      type: DataTypes.INTEGER,
    },
    consent_otp_expiration: {
      type: DataTypes.DATE,
    },
    avg_rating: {
      type: DataTypes.DECIMAL,
    },
    purchase_potential: {
      type: DataTypes.ENUM("Definitely", "Very Likely", "Likely", "Not Likely"),
    },
    time_frame: {
      type: DataTypes.STRING,
    },
    feedback_comments: {
      type: DataTypes.STRING(1000),
    },
    feedback_submitted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    map_img: {
      type: DataTypes.STRING,
    },
    license_img: {
      type: DataTypes.STRING,
    },
    rpa_name: {
      type: DataTypes.STRING,
    },
    start_location: {
      type: DataTypes.JSONB,
    },
    end_location: {
      type: DataTypes.JSONB,
    },
    created_at: {
      type: DataTypes.STRING,
    },

    updated_at: {
      type: DataTypes.STRING,
    },
  },

  {
    tableName: "Events",
    timestamps: false,
  }
);

Events.beforeCreate((event) => {
  event.created_at = dateController.CurrentDate();
  event.updated_at = dateController.CurrentDate();
});

Events.beforeUpdate((event) => {
  event.updated_at = dateController.CurrentDate();
});

Events.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Events, {
  foreignKey: "corporate_id",
  as: "Events",
});

Events.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "distributor_code",
});

dealer.hasMany(Events, {
  foreignKey: "dealer_id",
  as: "Events",
});

Events.belongsTo(User, {
  foreignKey: "sp_id",
  as: "user",
});

User.hasMany(Events, {
  foreignKey: "sp_id",
  as: "Events",
});

module.exports = Events;
