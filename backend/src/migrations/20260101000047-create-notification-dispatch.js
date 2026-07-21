'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notification_dispatch',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        notification_event_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'notification_event', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        recipient_user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        channel: { type: Sequelize.STRING(32), allowNull: false },
        template_config_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'notification_template_config', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'pending' },
        provider_message_id: { type: Sequelize.STRING(255), allowNull: true },
        retry_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sent_at: { type: Sequelize.DATE, allowNull: true },
        delivered_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'One row per channel-delivery attempt (Section 11).' },
    );
    await queryInterface.addIndex('notification_dispatch', ['notification_event_id'], {
      name: 'ix_notification_dispatch_event',
    });
    await queryInterface.addIndex('notification_dispatch', ['recipient_user_id', 'created_at'], {
      name: 'ix_notification_dispatch_recipient_created',
    });
    await queryInterface.addIndex('notification_dispatch', ['status'], { name: 'ix_notification_dispatch_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_dispatch');
  },
};
