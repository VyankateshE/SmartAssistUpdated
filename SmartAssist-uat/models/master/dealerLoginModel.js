const { DataTypes, Sequelize } = require("sequelize");
const sequelize = require("../../dbConfig/dbConfig");
const Dealers = require("./dealerModel");
const dateController = require("../../utils/dateFilter");
const bcrypt = require("bcrypt");

const DealerLogins = sequelize.define(
  "DealerLogins",
  {
    login_id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    dealer_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dealer_email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(100),
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
    role: {
      type: DataTypes.ENUM("CEO"),
      defaultValue: "CEO",
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
    tableName: "DealerLogins",
    timestamps: false,
  }
);

DealerLogins.beforeCreate((login) => {
  login.created_at = dateController.CurrentDate();
  login.updated_at = dateController.CurrentDate();
});

DealerLogins.beforeUpdate((login) => {
  login.updated_at = dateController.CurrentDate();
});

DealerLogins.prototype.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Relations
DealerLogins.belongsTo(Dealers, {
  foreignKey: "dealer_id",
  as: "dealer",
});

Dealers.hasMany(DealerLogins, {
  foreignKey: "dealer_id",
  as: "login_users",
});

module.exports = DealerLogins;
