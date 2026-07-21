'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'audit_log',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        actor_user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        action: { type: Sequelize.STRING(64), allowNull: false },
        entity_type: { type: Sequelize.STRING(64), allowNull: false },
        entity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        change_summary: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Generic, immutable record of every state-changing action across the platform (ARCHITECTURE.md §11.5, Section 10).',
      },
    );
    await queryInterface.addIndex('audit_log', ['entity_type', 'entity_id', 'created_at'], {
      name: 'ix_audit_log_entity_created',
    });
    await queryInterface.addIndex('audit_log', ['tenant_id', 'created_at'], { name: 'ix_audit_log_tenant_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_log');
  },
};
