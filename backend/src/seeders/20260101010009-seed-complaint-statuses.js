'use strict';

// Tenant-configurable status values and allowed transitions (SRS §3.4,
// Section 7) — standard grievance lifecycle.
const STATUSES = [
  { code: 'REGISTERED', label: 'Registered', sortOrder: 1 },
  { code: 'ASSIGNED', label: 'Assigned', sortOrder: 2 },
  { code: 'IN_PROGRESS', label: 'In Progress', sortOrder: 3 },
  { code: 'RESOLVED', label: 'Resolved', sortOrder: 4 },
  { code: 'CLOSED', label: 'Closed', sortOrder: 5 },
  { code: 'REOPENED', label: 'Reopened', sortOrder: 6 },
  { code: 'REJECTED', label: 'Rejected', sortOrder: 7 },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();
    await queryInterface.bulkInsert(
      'complaint_status_definition',
      STATUSES.map((s) => ({
        tenant_id: tenant.id,
        code: s.code,
        label: s.label,
        sort_order: s.sortOrder,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('complaint_status_definition', { code: STATUSES.map((s) => s.code) });
  },
};
