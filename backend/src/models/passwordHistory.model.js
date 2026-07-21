'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const PasswordHistory = sequelize.define(
    'PasswordHistory',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: true },
      },
    },
    {
      ...baseOptions({
        comment: 'Last-5-password hash history, enforcing no-reuse (ARCHITECTURE.md §8.1, Section 13).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'password_history',
      indexes: [{ fields: ['user_id', 'created_at'], name: 'ix_password_history_user_created' }],
    },
  );

  PasswordHistory.associate = (models) => {
    PasswordHistory.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return PasswordHistory;
};
