'use strict';

// Pilot tenant per docs/DATABASE_DESIGN.md header: "Pilot Deployment:
// Tambaram City Municipal Corporation, Tamil Nadu, India".
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('tenant', [
      {
        code: 'TAMBARAM',
        name: 'Tambaram City Municipal Corporation',
        tenant_type: 'ULB',
        state: 'Tamil Nadu',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('tenant', { code: 'TAMBARAM' });
  },
};
