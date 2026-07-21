'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const MfaDevice = sequelize.define(
    'MfaDevice',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      deviceType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'totp',
        validate: { notEmpty: true },
      },
      secretReference: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment:
          'Secrets-manager reference — the secret itself lives in the secrets store (INFRASTRUCTURE_DEVOPS.md §7).',
        validate: { notEmpty: true },
      },
      verifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'TOTP device registration for mandatory Corporation/Super Admin MFA (ARCHITECTURE.md §8.1, Section 13).',
        paranoid: false,
      }),
      tableName: 'mfa_device',
      indexes: [{ fields: ['user_id'], name: 'ix_mfa_device_user' }],
    },
  );

  MfaDevice.associate = (models) => {
    MfaDevice.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return MfaDevice;
};
