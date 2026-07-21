'use strict';

const { ID_TYPE, idColumn, auditColumns, deletedByColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      ...idColumn(ID_TYPE.INTEGER),
      tenantId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to tenant.id; null for global system-defined roles (Section 5).',
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      isSystemRole: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          'True for the system-defined catalog (Citizen, Officer, Dept Admin, Corp Admin, Super Admin, SRS §6.4).',
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'RBAC role catalog — system-defined and tenant-defined roles (Section 5).',
        paranoid: true,
      }),
      tableName: 'role',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_role_tenant' },
        { fields: ['tenant_id', 'name'], unique: true, name: 'uq_role_tenant_name' },
      ],
      scopes: {
        systemRoles: { where: { isSystemRole: true } },
      },
    },
  );

  Role.associate = (models) => {
    Role.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    Role.belongsToMany(models.Permission, {
      through: models.RolePermission,
      foreignKey: 'roleId',
      otherKey: 'permissionId',
      as: 'permissions',
    });
    Role.hasMany(models.RolePermission, { foreignKey: 'roleId', as: 'rolePermissions' });
    Role.hasMany(models.UserRoleAssignment, { foreignKey: 'roleId', as: 'userRoleAssignments' });
  };

  return Role;
};
