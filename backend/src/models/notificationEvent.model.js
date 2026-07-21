'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const NotificationEvent = sequelize.define(
    'NotificationEvent',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      eventType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'ComplaintRegistered, StatusChanged, SLABreaching, etc. (ARCHITECTURE.md §10.1).',
        validate: { notEmpty: true },
      },
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      payloadSummary: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'The domain event that triggered a notification — source record for notification_dispatch (Section 11).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'notification_event',
      indexes: [
        { fields: ['tenant_id', 'created_at'], name: 'ix_notification_event_tenant_created' },
        { fields: ['complaint_id'], name: 'ix_notification_event_complaint' },
        { fields: ['event_type'], name: 'ix_notification_event_type' },
      ],
    },
  );

  NotificationEvent.associate = (models) => {
    NotificationEvent.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    NotificationEvent.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    NotificationEvent.hasMany(models.NotificationDispatch, { foreignKey: 'notificationEventId', as: 'dispatches' });
  };

  return NotificationEvent;
};
