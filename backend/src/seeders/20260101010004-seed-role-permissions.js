'use strict';

// Grants for the system role catalog (Section 13 role_permission). Super
// Admin gets the full permission catalog; other staff roles get a
// reasonable operational subset; Citizen holds no RBAC permissions (citizen
// access is scoped by complaint ownership, not the admin permission model).
const GRANTS = {
  department_admin: [
    ['complaint', 'read'],
    ['complaint', 'assign'],
    ['complaint', 'update'],
    ['complaint', 'approve'],
    ['category', 'read'],
    ['category', 'create'],
    ['category', 'update'],
    ['report', 'read'],
    ['report', 'export'],
  ],
  corporation_admin: [
    ['complaint', 'read'],
    ['complaint', 'assign'],
    ['complaint', 'update'],
    ['complaint', 'approve'],
    ['department', 'read'],
    ['department', 'create'],
    ['department', 'update'],
    ['category', 'read'],
    ['category', 'create'],
    ['category', 'update'],
    ['config', 'read'],
    ['config', 'update'],
    ['report', 'read'],
    ['report', 'export'],
    ['audit', 'read'],
  ],
  officer: [
    ['complaint', 'read'],
    ['complaint', 'update'],
  ],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;

    const roles = await queryInterface.sequelize.query(`SELECT id, name FROM role WHERE tenant_id IS NULL`, {
      type: QueryTypes.SELECT,
    });
    const permissions = await queryInterface.sequelize.query(`SELECT id, resource, action FROM permission`, {
      type: QueryTypes.SELECT,
    });
    const roleByName = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    const now = new Date();
    const rows = [];

    if (roleByName.super_admin) {
      for (const permission of permissions) {
        rows.push({ role_id: roleByName.super_admin, permission_id: permission.id, created_at: now });
      }
    }

    for (const [roleName, pairs] of Object.entries(GRANTS)) {
      const roleId = roleByName[roleName];
      if (!roleId) continue;
      for (const [resource, action] of pairs) {
        const permission = permissions.find((p) => p.resource === resource && p.action === action);
        if (permission) {
          rows.push({ role_id: roleId, permission_id: permission.id, created_at: now });
        }
      }
    }

    if (rows.length > 0) {
      await queryInterface.bulkInsert('role_permission', rows);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permission', {});
  },
};
