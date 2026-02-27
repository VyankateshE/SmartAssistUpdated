const sequelize = require("../../dbConfig/dbConfig");
const superAdmin = require("./superAdminModel");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcrypt");
const dateController = require("../../utils/dateFilter");
const GeneralManager = require("./generalManagerModel");
const dpLogins = require("./dpLoginModel");
const Dealers = sequelize.define(
  "Dealers",
  {
    dealer_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    dealer_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    dealer_email: {
      type: DataTypes.STRING(100),
      validate: {
        isEmail: true,
      },
      // allowNull: false,
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
      allowNull: false,
      defaultValue: "CEO",
    },

    dealer_code: {
      type: DataTypes.INTEGER(5),
      unique: true,
    },
    generalManager_id: {
      type: DataTypes.UUID,
      references: {
        model: GeneralManager,
        key: "generalManager_id",
      },
    },
    dp_id: {
      type: DataTypes.UUID,
      references: {
        model: "dpLogins",
        key: "dp_id",
      },
    },

    location: {
      type: DataTypes.STRING(100),
    },
    mobile: {
      type: DataTypes.BIGINT,
    },
    phone: {
      type: DataTypes.BIGINT,
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    access_token: {
      type: DataTypes.STRING(1000),
    },
    created_at: {
      type: DataTypes.STRING,
    },
    updated_at: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "Dealers",
    timestamps: false,
  }
);

Dealers.beforeCreate((dealer) => {
  dealer.created_at = dateController.CurrentDate();
  dealer.updated_at = dateController.CurrentDate();
});

Dealers.beforeUpdate((dealer) => {
  dealer.updated_at = dateController.CurrentDate();
});

Dealers.prototype.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
//one superAdmin has multiple branches/distributors
Dealers.belongsTo(superAdmin, {
  foreignKey: "corporate_id",
  as: "corporate_code",
});

superAdmin.hasMany(Dealers, {
  foreignKey: "corporate_id",
  as: "Dealers",
});

GeneralManager.hasMany(Dealers, {
  foreignKey: "generalManager_id",
  as: "Dealers",
});
Dealers.belongsTo(GeneralManager, {
  foreignKey: "generalManager_id",
  as: "GeneralManager",
});

dpLogins.hasMany(Dealers, {
  foreignKey: "dp_id",
  as: "Dealers",
});
Dealers.belongsTo(dpLogins, {
  foreignKey: "dp_id",
  as: "dpLogins",
});
module.exports = Dealers;
