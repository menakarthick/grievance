'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      actorUserId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment:
          'Nullable: SET NULL on user hard-delete so the compliance record survives (Section 23 10-year retention).',
      },
      action: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      entityType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Polymorphic reference type (entity_type + entity_id) to any auditable entity (Section 10).',
      },
      entityId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      changeSummary: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Generic, immutable record of every state-changing action across the platform (ARCHITECTURE.md §11.5, Section 10). Never edited, only appended; never soft-deleted (Section 21 exception).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'audit_log',
      indexes: [
        { fields: ['entity_type', 'entity_id', 'created_at'], name: 'ix_audit_log_entity_created' },
        { fields: ['tenant_id', 'created_at'], name: 'ix_audit_log_tenant_created' },
      ],
    },
  );

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    AuditLog.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actorUser' });
  };

  return AuditLog;
};
