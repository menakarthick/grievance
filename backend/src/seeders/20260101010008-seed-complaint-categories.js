'use strict';

// Tenant-configurable complaint categories (SRS §3.4, Section 5).
const CATEGORIES_BY_DEPARTMENT = {
  WATER: [
    { name: 'No Water Supply', defaultPriority: 1 },
    { name: 'Pipeline Leakage', defaultPriority: 2 },
  ],
  SANITATION: [
    { name: 'Garbage Not Collected', defaultPriority: 2 },
    { name: 'Public Toilet Maintenance', defaultPriority: 3 },
  ],
  ROADS: [
    { name: 'Pothole', defaultPriority: 2 },
    { name: 'Damaged Footpath', defaultPriority: 3 },
  ],
  ELECTRICAL: [
    { name: 'Streetlight Not Working', defaultPriority: 3 },
    { name: 'Exposed Electrical Wiring', defaultPriority: 1 },
  ],
  HEALTH: [
    { name: 'Mosquito Breeding / Fogging Request', defaultPriority: 2 },
    { name: 'Stray Animal Menace', defaultPriority: 3 },
  ],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const departments = await queryInterface.sequelize.query(
      `SELECT id, code FROM department WHERE tenant_id = :tenantId`,
      { replacements: { tenantId: tenant.id }, type: Sequelize.QueryTypes.SELECT },
    );
    const departmentByCode = Object.fromEntries(departments.map((d) => [d.code, d.id]));

    const now = new Date();
    const rows = [];
    for (const [deptCode, categories] of Object.entries(CATEGORIES_BY_DEPARTMENT)) {
      const departmentId = departmentByCode[deptCode];
      if (!departmentId) continue;
      for (const category of categories) {
        rows.push({
          tenant_id: tenant.id,
          department_id: departmentId,
          name: category.name,
          default_priority: category.defaultPriority,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('complaint_category', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('complaint_category', {});
  },
};
