'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'activity_log',
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
        activity_type: { type: Sequelize.STRING(64), allowNull: false },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Broader activity/security monitoring, distinct from business-data-change audit (ARCHITECTURE.md §11 Activity Monitoring, Section 10).',
      },
    );
    await queryInterface.addIndex('activity_log', ['tenant_id', 'created_at'], {
      name: 'ix_activity_log_tenant_created',
    });
    await queryInterface.addIndex('activity_log', ['actor_user_id'], { name: 'ix_activity_log_actor' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('activity_log');
  },
};
