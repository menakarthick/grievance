'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notification_event',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        event_type: { type: Sequelize.STRING(64), allowNull: false },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        payload_summary: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'The domain event that triggered a notification — source record for notification_dispatch (Section 11).',
      },
    );
    await queryInterface.addIndex('notification_event', ['tenant_id', 'created_at'], {
      name: 'ix_notification_event_tenant_created',
    });
    await queryInterface.addIndex('notification_event', ['complaint_id'], { name: 'ix_notification_event_complaint' });
    await queryInterface.addIndex('notification_event', ['event_type'], { name: 'ix_notification_event_type' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_event');
  },
};
