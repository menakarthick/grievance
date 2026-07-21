'use strict';

// Tenant-configurable geographic hierarchy district -> zone -> ward (SRS
// §7, Section 5), for the Tambaram pilot (Chengalpattu district, Tamil
// Nadu).
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();

    await queryInterface.bulkInsert('district', [
      {
        tenant_id: tenant.id,
        code: 'CGP',
        name: 'Chengalpattu',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    const [district] = await queryInterface.sequelize.query(
      `SELECT id FROM district WHERE tenant_id = :tenantId AND code = 'CGP'`,
      { replacements: { tenantId: tenant.id }, type: Sequelize.QueryTypes.SELECT },
    );

    await queryInterface.bulkInsert('zone', [
      {
        tenant_id: tenant.id,
        district_id: district.id,
        code: 'TBM-Z1',
        name: 'Tambaram Zone 1',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        tenant_id: tenant.id,
        district_id: district.id,
        code: 'TBM-Z2',
        name: 'Tambaram Zone 2',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    const zones = await queryInterface.sequelize.query(
      `SELECT id, code FROM zone WHERE tenant_id = :tenantId AND code IN ('TBM-Z1', 'TBM-Z2')`,
      { replacements: { tenantId: tenant.id }, type: Sequelize.QueryTypes.SELECT },
    );
    const zoneByCode = Object.fromEntries(zones.map((z) => [z.code, z.id]));

    await queryInterface.bulkInsert(
      'ward',
      [
        { code: 'WARD-01', name: 'Ward 1', zoneCode: 'TBM-Z1' },
        { code: 'WARD-02', name: 'Ward 2', zoneCode: 'TBM-Z1' },
        { code: 'WARD-03', name: 'Ward 3', zoneCode: 'TBM-Z2' },
        { code: 'WARD-04', name: 'Ward 4', zoneCode: 'TBM-Z2' },
      ].map((w) => ({
        tenant_id: tenant.id,
        zone_id: zoneByCode[w.zoneCode],
        code: w.code,
        name: w.name,
        is_active: true,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ward', {});
    await queryInterface.bulkDelete('zone', {});
    await queryInterface.bulkDelete('district', { code: 'CGP' });
  },
};
