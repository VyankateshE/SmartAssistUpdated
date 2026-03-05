"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("TeamLead", {
      tl_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
      },
      team_name: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false,
      },
      team_lead_id: {
        type: Sequelize.UUID,
        // allowNull: false,
      },
      team_lead_email: {
        type: Sequelize.STRING,
        // validate: {
        //   isEmail: true,
        // },
        // allowNull: false,
      },
      created_by: {
        type: Sequelize.UUID,
      },
      updated_by: {
        type: Sequelize.UUID,
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

  async down(queryInterface) {
    await queryInterface.dropTable("TeamLead");
  },
};
