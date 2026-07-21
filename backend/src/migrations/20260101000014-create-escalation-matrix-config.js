'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'escalation_matrix_config',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        department_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'department', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        from_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        to_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        trigger_condition: { type: Sequelize.STRING(128), allowNull: false },
        escalate_after_hours: { type: Sequelize.INTEGER, allowNull: false },
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
        comment: 'Escalation rules — from/to hierarchy level, trigger condition, versioned (SRS §3.4, Section 7, 22).',
      },
    );
    await queryInterface.addIndex('escalation_matrix_config', ['tenant_id'], { name: 'ix_emc_tenant' });
    await queryInterface.addIndex('escalation_matrix_config', ['department_id'], { name: 'ix_emc_department' });
    await queryInterface.addIndex('escalation_matrix_config', ['from_level_id'], { name: 'ix_emc_from_level' });
    await queryInterface.addIndex('escalation_matrix_config', ['to_level_id'], { name: 'ix_emc_to_level' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('escalation_matrix_config');
  },
};
