'use strict';

// Per-tenant, per-channel, per-language message templates (SRS §3.4,
// Section 7), for the domain events documented in ARCHITECTURE.md §10.1.
const TEMPLATES = [
  {
    eventType: 'ComplaintRegistered',
    channel: 'sms',
    language: 'en',
    bodyTemplate: 'Your complaint {{trackingId}} has been registered. We will update you on its progress.',
  },
  {
    eventType: 'ComplaintRegistered',
    channel: 'sms',
    language: 'ta',
    bodyTemplate: 'உங்கள் புகார் {{trackingId}} பதிவு செய்யப்பட்டது.',
  },
  {
    eventType: 'StatusChanged',
    channel: 'email',
    language: 'en',
    bodyTemplate: 'Complaint {{trackingId}} status changed to {{status}}.',
  },
  {
    eventType: 'SLABreaching',
    channel: 'email',
    language: 'en',
    bodyTemplate: 'Complaint {{trackingId}} is approaching its SLA due date of {{slaDueAt}}.',
  },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    const now = new Date();
    await queryInterface.bulkInsert(
      'notification_template_config',
      TEMPLATES.map((t) => ({
        tenant_id: tenant.id,
        event_type: t.eventType,
        channel: t.channel,
        language: t.language,
        body_template: t.bodyTemplate,
        version: 1,
        created_at: now,
        updated_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('notification_template_config', {});
  },
};
