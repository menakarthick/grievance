'use strict';

// Global RBAC permission catalog (resource + action pairs), Section 13.
const RESOURCES = ['complaint', 'department', 'category', 'user', 'role', 'config', 'report', 'audit'];
const ACTIONS = ['create', 'read', 'update', 'delete', 'assign', 'approve', 'export'];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [];
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        rows.push({
          resource,
          action,
          description: `Permission to ${action} ${resource}`,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('permission', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permission', { resource: RESOURCES });
  },
};
