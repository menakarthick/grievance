'use strict';

// System Configuration: feature_flag_config and provider_config (Section 7).
// secret_reference values are secrets-manager references, never raw
// credentials (INFRASTRUCTURE_DEVOPS.md §7) — these are placeholder
// reference strings for the pilot environment to be pointed at real
// secrets-manager entries during deployment.
const FEATURE_FLAGS = [
  { flagKey: 'ai_classification_enabled', isEnabled: false, flagType: 'boolean' },
  { flagKey: 'voice_complaints_enabled', isEnabled: false, flagType: 'boolean' },
  { flagKey: 'whatsapp_notifications_enabled', isEnabled: false, flagType: 'boolean' },
];

// providerType/providerName values match the system-supported-adapter
// catalog in src/services/admin.service.js's SUPPORTED_PROVIDERS
// (docs/06-Administration-APIs.md §6.11's providerType enum: ai, voice,
// sms, whatsapp, email, maps — "smtp" is not one of the documented values).
const PROVIDERS = [
  { providerType: 'sms', providerName: 'dlt_sms_gateway', secretReference: 'secrets/tambaram/sms-provider' },
  { providerType: 'email', providerName: 'smtp_relay', secretReference: 'secrets/tambaram/smtp-provider' },
  { providerType: 'ai', providerName: 'claude', secretReference: 'secrets/tambaram/ai-provider' },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();

    await queryInterface.bulkInsert(
      'feature_flag_config',
      FEATURE_FLAGS.map((f) => ({
        tenant_id: tenant.id,
        flag_key: f.flagKey,
        is_enabled: f.isEnabled,
        flag_type: f.flagType,
        created_at: now,
        updated_at: now,
      })),
    );

    await queryInterface.bulkInsert(
      'provider_config',
      PROVIDERS.map((p) => ({
        tenant_id: tenant.id,
        provider_type: p.providerType,
        provider_name: p.providerName,
        secret_reference: p.secretReference,
        is_active: false,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('provider_config', {});
    await queryInterface.bulkDelete('feature_flag_config', {});
  },
};
