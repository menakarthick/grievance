'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sla_tracking',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        sla_rule_config_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'sla_rule_config', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        due_at: { type: Sequelize.DATE, allowNull: false },
        breached_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Computed, complaint-specific SLA due date and breach status, derived from sla_rule_config at assignment time (Section 8).',
      },
    );
    await queryInterface.addIndex('sla_tracking', ['sla_rule_config_id'], { name: 'ix_sla_tracking_config' });
    await queryInterface.addIndex('sla_tracking', ['due_at'], { name: 'ix_sla_tracking_due_at' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sla_tracking');
  },
};
