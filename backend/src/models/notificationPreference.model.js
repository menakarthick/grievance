'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const NotificationPreference = sequelize.define(
    'NotificationPreference',
    {
      ...idColumn(ID_TYPE.BIGINT),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      ...baseOptions({
        comment: 'Citizen/officer channel preference — which channels they want notified on (Section 11).',
        paranoid: false,
      }),
      tableName: 'notification_preference',
      indexes: [
        { fields: ['user_id'], name: 'ix_notification_preference_user' },
        { fields: ['user_id', 'channel'], unique: true, name: 'uq_notification_preference_user_channel' },
      ],
    },
  );

  NotificationPreference.associate = (models) => {
    NotificationPreference.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return NotificationPreference;
};
