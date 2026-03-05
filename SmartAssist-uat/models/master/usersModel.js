const sequelize = require("../../dbConfig/dbConfig");
const superAdmin = require("./superAdminModel");
const Teams = require("./teamMasterModel");
const TeamLead = require("./teamLeadModel");
const dealer = require("./dealerModel");
const Roles = require("./roleModel");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcrypt");
const dateController = require("../../utils/dateFilter");

const User = sequelize.define(
  "Users",
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    user_account_id: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    fname: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    lname: {
      type: DataTypes.STRING,
      // allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    initials: {
      type: DataTypes.STRING,
      get() {
        const f = this.getDataValue("fname")?.[0] || "";
        const l = this.getDataValue("lname")?.[0] || "";
        return f.toUpperCase() + l.toUpperCase();
      },
    },
    email: {
      type: DataTypes.STRING,
      validate: {
        isEmail: true,
      },
      allowNull: false,
    },
    phone: {
      type: DataTypes.BIGINT,
      // allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    user_role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
    },
    old_password: {
      type: DataTypes.STRING,
    },
    last_pwd_change: {
      type: DataTypes.DATE,
    },
    last_login: {
      type: DataTypes.DATE,
    },
    otp_validated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    otp: {
      type: DataTypes.INTEGER,
    },
    otp_expiration: {
      type: DataTypes.DATE,
    },
    dealer_name: {
      type: DataTypes.STRING,
    },
    dealer_code: {
      type: DataTypes.INTEGER,
    },
    dealer_location: {
      type: DataTypes.STRING,
    },
    evaluation: {
      type: DataTypes.JSONB,
    },
    ics_id: {
      type: DataTypes.STRING,
    },
    ics_pwd: {
      type: DataTypes.STRING,
    },
    device_token: {
      type: DataTypes.STRING,
    },
    team_name: {
      type: DataTypes.STRING,
    },
    team_role: {
      type: DataTypes.ENUM("Owner", "Lead", "Member"),
      defaultValue: "Member",
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    dealer_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Dealers",
        key: "dealer_id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    access_token: {
      type: DataTypes.STRING(1000),
    },
    refresh_token: {
      type: DataTypes.STRING(1000),
    },
    rating: {
      type: DataTypes.STRING,
    },
    profile_pic: {
      type: DataTypes.STRING,
    },
    reviews: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    feedback_submitted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    feedback_comments: {
      type: DataTypes.STRING,
    },
    excellence: {
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
    tableName: "Users",
    timestamps: false,
  }
);

User.beforeCreate((user) => {
  user.created_at = dateController.CurrentDate();
  user.updated_at = dateController.CurrentDate();
});

User.beforeUpdate((user) => {
  user.updated_at = dateController.CurrentDate();
});

User.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(User, {
  foreignKey: "corporate_id",
  as: "Users",
});

User.belongsTo(dealer, {
  foreignKey: "dealer_id",
  as: "dealer",
});

dealer.hasMany(User, {
  foreignKey: "dealer_id",
  as: "Users",
});

User.belongsTo(Roles, {
  foreignKey: "role_id",
  as: "role",
});

Roles.hasMany(User, {
  foreignKey: "role_id",
  as: "users",
});

User.belongsTo(Teams, {
  foreignKey: "team_id",
  as: "team",
});

Teams.hasMany(User, {
  foreignKey: "team_id",
  as: "users",
});
User.belongsTo(TeamLead, {
  foreignKey: "tl_id",
  as: "teamLead",
});
  
TeamLead.hasMany(User, {
  foreignKey: "tl_id",
  as: "users",
});

User.prototype.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = User;
