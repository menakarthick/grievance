'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'approval_workflow_config',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        category_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint_category', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        required_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        effective_from: { type: Sequelize.DATE, allowNull: false },
        effective_to: { type: Sequelize.DATE, allowNull: true },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      {
        comment:
          'Which categories/departments require multi-level approval, and at which hierarchy level, versioned (SRS §3.3, Section 7, 22).',
      },
    );
    await queryInterface.addIndex('approval_workflow_config', ['tenant_id'], { name: 'ix_awc_tenant' });
    await queryInterface.addIndex('approval_workflow_config', ['category_id'], { name: 'ix_awc_category' });
    await queryInterface.addIndex('approval_workflow_config', ['required_level_id'], { name: 'ix_awc_required_level' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('approval_workflow_config');
  },
};
