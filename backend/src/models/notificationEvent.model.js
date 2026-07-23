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
        // The already-migrated column (20260101000040-create-notification-
        // event.js) physically ended up as MySQL longtext rather than a
        // native JSON column in this environment (verified via DESCRIBE),
        // so mysql2/Sequelize doesn't auto-parse it back into an object on
        // read the way DataTypes.JSON normally would — a fresh SELECT
        // returns the raw JSON *string*. Complaint (the only prior writer)
        // never read this field back structurally, so this never surfaced
        // until the Notification module's domain-event consumer needed to.
        // Fixed at the application layer (a read-side getter only — the
        // write side already serializes correctly via Sequelize's own JSON
        // type handling; verified by inspecting the raw stored value), not
        // by altering the already-approved table's column type.
        get() {
          const raw = this.getDataValue('payloadSummary');
          if (typeof raw !== 'string') return raw;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
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
