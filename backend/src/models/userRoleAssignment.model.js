'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');
const { ASSIGNMENT_SCOPE_TYPES } = require('../database/constants');

module.exports = (sequelize, DataTypes) => {
  const UserRoleAssignment = sequelize.define(
    'UserRoleAssignment',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      roleId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      scopeType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        validate: { isIn: [ASSIGNMENT_SCOPE_TYPES] },
      },
      scopeId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment: 'Which role(s) a user holds, and at what scope (ARCHITECTURE.md §11.2, Section 13).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'user_role_assignment',
      indexes: [
        { fields: ['user_id'], name: 'ix_ura_user' },
        { fields: ['role_id'], name: 'ix_ura_role' },
        { fields: ['user_id', 'role_id', 'scope_type', 'scope_id'], unique: true, name: 'uq_ura_user_role_scope' },
      ],
    },
  );

  UserRoleAssignment.associate = (models) => {
    UserRoleAssignment.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    UserRoleAssignment.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
  };

  return UserRoleAssignment;
};
