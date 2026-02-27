"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Roles", "role_name", {
      type: Sequelize.ENUM("PS", "SM", "CEO", "app-admin", "DP", "TL", "TCL"),
    });
  },
};
