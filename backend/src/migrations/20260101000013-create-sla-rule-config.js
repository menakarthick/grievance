'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sla_rule_config',
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
        category_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint_category', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        priority: { type: Sequelize.INTEGER, allowNull: false },
        resolution_hours: { type: Sequelize.INTEGER, allowNull: false },
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
      { comment: 'SLA resolution-time targets per department/category/priority, versioned (SRS §3.4, Section 7, 22).' },
    );
    await queryInterface.addIndex('sla_rule_config', ['tenant_id'], { name: 'ix_sla_rule_config_tenant' });
    await queryInterface.addIndex('sla_rule_config', ['department_id'], { name: 'ix_sla_rule_config_department' });
    await queryInterface.addIndex('sla_rule_config', ['category_id'], { name: 'ix_sla_rule_config_category' });
    await queryInterface.addIndex(
      'sla_rule_config',
      ['tenant_id', 'department_id', 'category_id', 'priority', 'version'],
      {
        unique: true,
        name: 'uq_sla_rule_config_scope_version',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sla_rule_config');
  },
};
