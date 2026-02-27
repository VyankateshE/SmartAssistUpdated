"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("LeadActivity", {
      activity_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV1,
        allowNull: false,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
      },
      userEmail: {
        type: Sequelize.STRING(255),
      },
      userRole: {
        type: Sequelize.STRING,
      },
      recordId: {
        type: Sequelize.UUID,
      },
      action: {
        type: Sequelize.STRING,
      },
      original_value: {
        type: Sequelize.STRING(10000),
      },
      new_value: {
        type: Sequelize.STRING(10000),
      },
      modiified_at: {
        type: Sequelize.DATE,
      },
      created_at: {
        type: Sequelize.STRING,
      },
      updated_at: {
        type: Sequelize.STRING,
      },
    });
    await queryInterface.createTable("EventActivity", {
      activity_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV1,
        allowNull: false,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
      },
      userEmail: {
        type: Sequelize.STRING(255),
      },
      userRole: {
        type: Sequelize.STRING,
      },
      recordId: {
        type: Sequelize.UUID,
      },
      action: {
        type: Sequelize.STRING,
      },
      original_value: {
        type: Sequelize.STRING(10000),
      },
      new_value: {
        type: Sequelize.STRING(10000),
      },
      modiified_at: {
        type: Sequelize.DATE,
      },
      created_at: {
        type: Sequelize.STRING,
      },
      updated_at: {
        type: Sequelize.STRING,
      },
    });
    await queryInterface.createTable("TaskActivity", {
      activity_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV1,
        allowNull: false,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
      },
      userEmail: {
        type: Sequelize.STRING(255),
      },
      userRole: {
        type: Sequelize.STRING,
      },
      recordId: {
        type: Sequelize.UUID,
      },
      action: {
        type: Sequelize.STRING,
      },
      original_value: {
        type: Sequelize.STRING(10000),
      },
      new_value: {
        type: Sequelize.STRING(10000),
      },
      modiified_at: {
        type: Sequelize.DATE,
      },
      created_at: {
        type: Sequelize.STRING,
      },
      updated_at: {
        type: Sequelize.STRING,
      },
    });
    await queryInterface.addColumn("Leads", "existingComp", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.addColumn("Vehicles", "identity", {
      type: Sequelize.STRING,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("LeadActivity");
    await queryInterface.dropTable("EventActivity");
    await queryInterface.dropTable("TaskActivity");
  },
};
