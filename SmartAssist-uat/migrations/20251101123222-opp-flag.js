"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "opp_flag", {
      type: Sequelize.ENUM("active", "inactive"),
      defaultValue: "inactive",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Leads", "opp_flag");
  },
};
