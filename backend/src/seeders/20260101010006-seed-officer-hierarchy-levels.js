'use strict';

// Tenant-configurable officer hierarchy (SRS §6.1, Section 5). Super Admin
// is intentionally excluded — its scope spans tenants (staff_profile
// .hierarchy_level_id stays null for that tier, Section 17).
const LEVELS = [
  { levelOrder: 1, title: 'Officer' },
  { levelOrder: 2, title: 'Department Admin' },
  { levelOrder: 3, title: 'Corporation Admin' },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();
    await queryInterface.bulkInsert(
      'officer_hierarchy_level',
      LEVELS.map((l) => ({
        tenant_id: tenant.id,
        level_order: l.levelOrder,
        title: l.title,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('officer_hierarchy_level', { title: LEVELS.map((l) => l.title) });
  },
};
