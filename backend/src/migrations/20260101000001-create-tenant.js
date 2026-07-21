'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'tenant',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        code: {
          type: Sequelize.STRING(32),
          allowNull: false,
          unique: true,
          comment: 'Unique tenant code (e.g. ULB code).',
        },
        name: { type: Sequelize.STRING(255), allowNull: false },
        tenant_type: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: 'ULB / Corporation / District / State Department, etc.',
        },
        state: { type: Sequelize.STRING(128), allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'active' },
        created_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          comment: 'Logical FK to user.id (not enforced, avoids circular bootstrap dependency).',
        },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'One row per onboarded ULB/Corporation/District/State Department (SRS §1.3, Section 5).' },
    );
    await queryInterface.addIndex('tenant', ['status'], { name: 'ix_tenant_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tenant');
  },
};
