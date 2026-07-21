'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const AccountLockoutState = sequelize.define(
    'AccountLockoutState',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      failedAttemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { isInt: true, min: 0 },
      },
      lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Persisted mirror of the Redis-enforced lockout counter, for admin visibility/unlock action (Section 13). Redis remains the real-time enforcement point (ARCHITECTURE.md §16).',
        paranoid: false,
      }),
      tableName: 'account_lockout_state',
      indexes: [{ fields: ['user_id'], unique: true, name: 'uq_account_lockout_state_user' }],
    },
  );

  AccountLockoutState.associate = (models) => {
    AccountLockoutState.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return AccountLockoutState;
};
