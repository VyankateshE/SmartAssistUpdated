"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Issues", "subcategory", {
      type: Sequelize.STRING(1000),
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Issues", "subcategory");
  },
};
