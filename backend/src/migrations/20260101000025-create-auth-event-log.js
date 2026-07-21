'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'auth_event_log',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        event_type: { type: Sequelize.STRING(32), allowNull: false },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        success: { type: Sequelize.BOOLEAN, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Login, logout, MFA challenge, failed-attempt, and password-reset events (INFRASTRUCTURE_DEVOPS.md §7, ARCHITECTURE.md §8.1, Section 10).',
      },
    );
    await queryInterface.addIndex('auth_event_log', ['user_id', 'created_at'], {
      name: 'ix_auth_event_log_user_created',
    });
    await queryInterface.addIndex('auth_event_log', ['event_type'], { name: 'ix_auth_event_log_event_type' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auth_event_log');
  },
};
