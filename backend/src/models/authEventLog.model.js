'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const AuthEventLog = sequelize.define(
    'AuthEventLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment:
          'Nullable: SET NULL on user hard-delete so the compliance record survives (Section 23 10-year retention).',
      },
      eventType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
    },
    {
      ...baseOptions({
        comment:
          'Login, logout, MFA challenge, failed-attempt, and password-reset events — persisted, auditable mirror of the ephemeral Redis lockout counter (INFRASTRUCTURE_DEVOPS.md §7, ARCHITECTURE.md §8.1, Section 10).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'auth_event_log',
      indexes: [
        { fields: ['user_id', 'created_at'], name: 'ix_auth_event_log_user_created' },
        { fields: ['event_type'], name: 'ix_auth_event_log_event_type' },
      ],
    },
  );

  AuthEventLog.associate = (models) => {
    AuthEventLog.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return AuthEventLog;
};
