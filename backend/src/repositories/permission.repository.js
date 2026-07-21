'use strict';

const { Permission, RolePermission } = require('../models');

// Resolves the union of permissions granted to a set of role ids (ARCHITECTURE.md
// §11.2: "Permission sets are tenant-configurable ... resolved from the
// Tenant & Admin Config Service").
async function getPermissionsForRoleIds(roleIds) {
  if (!roleIds || roleIds.length === 0) return [];
  const rolePermissions = await RolePermission.findAll({
    where: { roleId: roleIds },
    include: [{ model: Permission, as: 'permission' }],
  });
  const seen = new Map();
  for (const rp of rolePermissions) {
    const permission = rp.permission;
    if (permission) seen.set(permission.id, permission);
  }
  return [...seen.values()];
}

function findByResourceAction(resource, action) {
  return Permission.findOne({ where: { resource, action } });
}

module.exports = { getPermissionsForRoleIds, findByResourceAction };
