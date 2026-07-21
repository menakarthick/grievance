'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'complaint_assignment',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        officer_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        assigned_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        assigned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        unassigned_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Officer assignment record — a new row per (re)assignment, not an update-in-place (Section 6).' },
    );
    await queryInterface.addIndex('complaint_assignment', ['complaint_id'], {
      name: 'ix_complaint_assignment_complaint',
    });
    await queryInterface.addIndex('complaint_assignment', ['officer_id'], { name: 'ix_complaint_assignment_officer' });
    await queryInterface.addIndex('complaint_assignment', ['complaint_id', 'unassigned_at'], {
      name: 'ix_complaint_assignment_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint_assignment');
  },
};
