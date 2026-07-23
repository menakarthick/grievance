'use strict';

// 20260101010012-seed-system-configuration.js seeded sms/email/ai
// provider_config rows but not whatsapp, needed for the Notification
// module's Provider APIs (08-Notification-APIs.md §8.12) to have a real
// row to read for that channel. providerType 'whatsapp' is already in
// administration.yaml's approved provider_config.providerType enum
// (06-Administration-APIs.md §6.11) — not a new value.
//
// Note: notification.yaml's own providerType enum for §8.12 also lists
// 'push', which is NOT in administration.yaml's approved enum — no
// provider_config row is seeded for 'push' here or anywhere; see
// CURRENT_STATE.md for that cross-document conflict.
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    if (!tenant) return;
    const now = new Date();
    await queryInterface.bulkInsert('provider_config', [
      {
        tenant_id: tenant.id,
        provider_type: 'whatsapp',
        provider_name: 'whatsapp_business_platform',
        secret_reference: 'secrets/tambaram/whatsapp-provider',
        is_active: false,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('provider_config', { provider_type: 'whatsapp' });
  },
};
