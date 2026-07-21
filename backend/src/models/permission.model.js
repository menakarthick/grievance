'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    'Permission',
    {
      ...idColumn(ID_TYPE.INTEGER),
      resource: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      action: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Global RBAC permission catalog (resource + action pairs). Not tenant-scoped — the deliberate global exception documented in Section 3.',
        paranoid: true,
      }),
      tableName: 'permission',
      indexes: [{ fields: ['resource', 'action'], unique: true, name: 'uq_permission_resource_action' }],
    },
  );

  Permission.associate = (models) => {
    Permission.belongsToMany(models.Role, {
      through: models.RolePermission,
      foreignKey: 'permissionId',
      otherKey: 'roleId',
      as: 'roles',
    });
    Permission.hasMany(models.RolePermission, { foreignKey: 'permissionId', as: 'rolePermissions' });
  };

  return Permission;
};
