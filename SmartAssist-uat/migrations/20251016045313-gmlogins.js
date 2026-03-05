"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DealerLogins", {
      login_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      dealer_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      dealer_email: {
        type: Sequelize.STRING(100),
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: Sequelize.STRING(100),
      },
      otp_validated: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      otp: {
        type: Sequelize.INTEGER,
      },
      otp_expiration: {
        type: Sequelize.DATE,
      },
      role: {
        type: Sequelize.ENUM("CEO"),
        defaultValue: "CEO",
      },
      deleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.STRING,
      },
      updated_at: {
        type: Sequelize.STRING,
      },
    });
  },
};
