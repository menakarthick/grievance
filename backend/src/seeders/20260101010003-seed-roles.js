'use strict';

// System-defined RBAC roles (SRS §6.4, Section 5): Citizen, Officer,
// Department Admin, Corporation Admin, Super Admin. Global (tenant_id null)
// — the deliberate exception documented in Section 5's user/role rows.
const SYSTEM_ROLES = ['citizen', 'officer', 'department_admin', 'corporation_admin', 'super_admin'];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'role',
      SYSTEM_ROLES.map((name) => ({
        tenant_id: null,
        name,
        is_system_role: true,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('role', { name: SYSTEM_ROLES, tenant_id: null });
  },
};
