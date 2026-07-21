'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notification_preference',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        channel: { type: Sequelize.STRING(32), allowNull: false },
        is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Citizen/officer channel preference — which channels they want notified on (Section 11).' },
    );
    await queryInterface.addIndex('notification_preference', ['user_id'], { name: 'ix_notification_preference_user' });
    await queryInterface.addIndex('notification_preference', ['user_id', 'channel'], {
      unique: true,
      name: 'uq_notification_preference_user_channel',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_preference');
  },
};
