"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("dpLogins", "role", {
      type: Sequelize.ENUM("DP"),
      allowNull: false,
      defaultValue: "DP",
    });
  },
};
