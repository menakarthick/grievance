'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const NotificationDispatch = sequelize.define(
    'NotificationDispatch',
    {
      ...idColumn(ID_TYPE.BIGINT),
      notificationEventId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      recipientUserId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      templateConfigId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
      },
      providerMessageId: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      retryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { isInt: true, min: 0 },
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment: 'One row per channel-delivery attempt (Section 11).',
        paranoid: false,
      }),
      tableName: 'notification_dispatch',
      indexes: [
        { fields: ['notification_event_id'], name: 'ix_notification_dispatch_event' },
        { fields: ['recipient_user_id', 'created_at'], name: 'ix_notification_dispatch_recipient_created' },
        { fields: ['status'], name: 'ix_notification_dispatch_status' },
      ],
    },
  );

  NotificationDispatch.associate = (models) => {
    NotificationDispatch.belongsTo(models.NotificationEvent, {
      foreignKey: 'notificationEventId',
      as: 'notificationEvent',
    });
    NotificationDispatch.belongsTo(models.User, { foreignKey: 'recipientUserId', as: 'recipient' });
    NotificationDispatch.belongsTo(models.NotificationTemplateConfig, {
      foreignKey: 'templateConfigId',
      as: 'templateConfig',
    });
  };

  return NotificationDispatch;
};
