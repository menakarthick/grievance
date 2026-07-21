'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ActivityLog = sequelize.define(
    'ActivityLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      actorUserId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment:
          'Nullable: SET NULL on user hard-delete so the compliance record survives (Section 23 10-year retention).',
      },
      activityType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Broader activity/security monitoring, distinct from business-data-change audit (ARCHITECTURE.md §11 Activity Monitoring, Section 10).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'activity_log',
      indexes: [
        { fields: ['tenant_id', 'created_at'], name: 'ix_activity_log_tenant_created' },
        { fields: ['actor_user_id'], name: 'ix_activity_log_actor' },
      ],
    },
  );

  ActivityLog.associate = (models) => {
    ActivityLog.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    ActivityLog.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actorUser' });
  };

  return ActivityLog;
};
