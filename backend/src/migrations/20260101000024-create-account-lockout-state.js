'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'account_lockout_state',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        failed_attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        locked_until: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Persisted mirror of the Redis-enforced lockout counter, for admin visibility/unlock action (Section 13).',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('account_lockout_state');
  },
};
