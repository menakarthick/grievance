'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      ...idColumn(ID_TYPE.INTEGER),
      roleId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      permissionId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    },
    {
      ...baseOptions({
        comment: 'Junction table — which permissions a role grants (Section 13).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'role_permission',
      indexes: [{ fields: ['role_id', 'permission_id'], unique: true, name: 'uq_role_permission' }],
    },
  );

  RolePermission.associate = (models) => {
    RolePermission.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    RolePermission.belongsTo(models.Permission, { foreignKey: 'permissionId', as: 'permission' });
  };

  return RolePermission;
};
