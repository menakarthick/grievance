'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'officer_workload',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        officer_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        active_complaint_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Optimistic-locking row version (Sequelize-managed).',
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Current active-assignment count per officer — a materialized counter read/written by the Assignment Engine (Section 8).',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('officer_workload');
  },
};
