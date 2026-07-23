'use strict';

// src/seeders/20260101010011-seed-notification-templates.js seeded
// templates for ComplaintRegistered/StatusChanged/SLABreaching — the
// illustrative event names from ARCHITECTURE.md §10.1's example diagram.
// The Complaint module actually implemented and shipped (src/services
// /complaint.service.js#EVENT_TYPES) publishes different, real event type
// strings: ComplaintCreated, ComplaintAssigned, ComplaintResolved,
// ComplaintClosed, ComplaintReopened, CitizenFeedbackReceived. This seeder
// adds templates the Notification module's domain-event consumer
// (src/services/notification.service.js#consumeDomainEvents) can actually
// match against, without touching or renaming the earlier seeder (data
// only, not a schema/behavior change — CURRENT_STATE.md documents the
// naming inconsistency between the two seeders).
const EVENT_TYPES = [
  'ComplaintCreated',
  'ComplaintAssigned',
  'ComplaintResolved',
  'ComplaintClosed',
  'ComplaintReopened',
  'CitizenFeedbackReceived',
];

const BODY_EN = {
  ComplaintCreated: 'Your complaint {{trackingId}} has been registered. We will keep you updated on its progress.',
  ComplaintAssigned: 'Complaint {{trackingId}} has been assigned to an officer for resolution.',
  ComplaintResolved: 'Complaint {{trackingId}} has been marked Resolved. Please share your feedback.',
  ComplaintClosed: 'Complaint {{trackingId}} has been Closed.',
  ComplaintReopened: 'Complaint {{trackingId}} has been Reopened per your request.',
  CitizenFeedbackReceived: 'Citizen feedback (rating {{rating}}) has been received for complaint {{trackingId}}.',
};

const BODY_TA = {
  ComplaintCreated: 'உங்கள் புகார் {{trackingId}} பதிவு செய்யப்பட்டது.',
  ComplaintAssigned: 'புகார் {{trackingId}} ஒரு அதிகாரிக்கு ஒதுக்கப்பட்டது.',
  ComplaintResolved: 'புகார் {{trackingId}} தீர்க்கப்பட்டதாக குறிக்கப்பட்டது.',
  ComplaintClosed: 'புகார் {{trackingId}} முடிக்கப்பட்டது.',
  ComplaintReopened: 'புகார் {{trackingId}} மீண்டும் திறக்கப்பட்டது.',
  CitizenFeedbackReceived: 'புகார் {{trackingId}} க்கான கருத்து பெறப்பட்டது.',
};

const CHANNELS = ['sms', 'in_app'];
const LANGUAGES = [
  { code: 'en', body: BODY_EN },
  { code: 'ta', body: BODY_TA },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: Sequelize.QueryTypes.SELECT,
    });
    if (!tenant) return;
    const now = new Date();
    const rows = [];
    for (const eventType of EVENT_TYPES) {
      for (const channel of CHANNELS) {
        for (const { code, body } of LANGUAGES) {
          rows.push({
            tenant_id: tenant.id,
            event_type: eventType,
            channel,
            language: code,
            body_template: body[eventType],
            version: 1,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }
    await queryInterface.bulkInsert('notification_template_config', rows);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('notification_template_config', {
      event_type: { [Sequelize.Op.in]: EVENT_TYPES },
    });
  },
};
