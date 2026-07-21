'use strict';

// Tenant-configurable department list (SRS §6.2, Section 5) — typical ULB
// departments for the Tambaram pilot.
const DEPARTMENTS = [
  { code: 'WATER', name: 'Water Supply' },
  { code: 'SANITATION', name: 'Sanitation & Solid Waste Management' },
  { code: 'ROADS', name: 'Roads & Infrastructure' },
  { code: 'ELECTRICAL', name: 'Electrical & Street Lighting' },
  { code: 'HEALTH', name: 'Public Health' },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();
    await queryInterface.bulkInsert(
      'department',
      DEPARTMENTS.map((d) => ({
        tenant_id: tenant.id,
        code: d.code,
        name: d.name,
        is_active: true,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('department', { code: DEPARTMENTS.map((d) => d.code) });
  },
};
