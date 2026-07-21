'use strict';

const {
  ID_TYPE,
  idColumn,
  tenantIdColumn,
  auditColumns,
  deletedByColumn,
  baseOptions,
} = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const NotificationTemplateConfig = sequelize.define(
    'NotificationTemplateConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      eventType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      language: {
        type: DataTypes.STRING(16),
        allowNull: false,
        validate: { notEmpty: true },
      },
      bodyTemplate: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { notEmpty: true },
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Config-effective-dating version (Section 22) — NOT an optimistic-locking column (Section 32).',
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Per-tenant, per-channel, per-language message templates, versioned (SRS §3.4, Section 7, 22).',
        paranoid: true,
      }),
      tableName: 'notification_template_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_ntc_tenant' },
        {
          fields: ['tenant_id', 'event_type', 'channel', 'language', 'version'],
          unique: true,
          name: 'uq_ntc_scope_version',
        },
      ],
    },
  );

  NotificationTemplateConfig.associate = (models) => {
    NotificationTemplateConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    NotificationTemplateConfig.hasMany(models.NotificationDispatch, {
      foreignKey: 'templateConfigId',
      as: 'notificationDispatches',
    });
  };

  return NotificationTemplateConfig;
};
