'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  NotificationEvent,
  NotificationDispatch,
  NotificationPreference,
  NotificationTemplateConfig,
  ProviderConfig,
  User,
  CitizenProfile,
  StaffProfile,
  Complaint,
} = require('../models');

function transaction() {
  return sequelize.transaction();
}

// --- notification_event -----------------------------------------------------
function createEvent(data, options) {
  return NotificationEvent.create(data, options);
}

function findEventById(id) {
  return NotificationEvent.findOne({ where: { id } });
}

// Events with no dispatch rows yet — the fan-out cursor for
// src/services/notification.service.js#consumeDomainEvents, since
// notification_event (Section 11, already approved) has no `processedAt`
// column to track consumption state explicitly (documented interim
// approach, not a fabricated column).
async function findUnconsumedEvents(limit = 50) {
  return NotificationEvent.findAll({
    where: {
      id: {
        [Op.notIn]: sequelize.literal(
          '(SELECT DISTINCT notification_event_id FROM notification_dispatch)',
        ),
      },
    },
    order: [['id', 'ASC']],
    limit,
  });
}

// --- notification_dispatch ---------------------------------------------------
function createDispatch(data, options) {
  return NotificationDispatch.create(data, options);
}

function findDispatchById(id) {
  return NotificationDispatch.findOne({ where: { id }, include: ['notificationEvent', 'templateConfig'] });
}

function updateDispatch(instance, data, options) {
  return instance.update(data, options);
}

function countDispatchesForEvent(eventId) {
  return NotificationDispatch.count({ where: { notificationEventId: eventId } });
}

async function dispatchStatusCountsForEvent(eventId) {
  const rows = await NotificationDispatch.findAll({
    attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    where: { notificationEventId: eventId },
    group: ['status'],
    raw: true,
  });
  return rows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {});
}

function findDispatchesForRecipient(recipientUserId, { where = {}, limit, before } = {}) {
  const clause = { recipientUserId, ...where };
  if (before) clause.id = { [Op.lt]: before };
  return NotificationDispatch.findAll({
    where: clause,
    include: ['templateConfig'],
    order: [['id', 'DESC']],
    limit,
  });
}

function findDispatchesByChannelStatus({ where = {}, limit, before, order = [['id', 'DESC']] } = {}) {
  const clause = before ? { ...where, id: { [Op.lt]: before } } : where;
  return NotificationDispatch.findAll({ where: clause, order, limit, include: ['templateConfig', 'notificationEvent'] });
}

function findDispatchesMatchingFilter(where, limit) {
  return NotificationDispatch.findAll({ where, limit, order: [['id', 'ASC']] });
}

// --- notification_preference --------------------------------------------------
function findPreferencesForUser(userId) {
  return NotificationPreference.findAll({ where: { userId } });
}

async function upsertPreference(userId, channel, isEnabled) {
  const [pref] = await NotificationPreference.findOrCreate({
    where: { userId, channel },
    defaults: { isEnabled },
  });
  if (pref.isEnabled !== isEnabled) await pref.update({ isEnabled });
  return pref;
}

// --- notification_template_config --------------------------------------------
function findTemplate(tenantId, eventType, channel, language) {
  return NotificationTemplateConfig.findOne({
    where: { tenantId, eventType, channel, language },
    order: [['version', 'DESC']],
  });
}

function findTemplateById(tenantId, id) {
  return NotificationTemplateConfig.findOne({ where: { id, tenantId } });
}

function listTemplates(tenantId, where, { limit, offset } = {}) {
  return NotificationTemplateConfig.findAndCountAll({
    where: { tenantId, ...where },
    order: [
      ['eventType', 'ASC'],
      ['channel', 'ASC'],
      ['language', 'ASC'],
      ['version', 'DESC'],
    ],
    limit,
    offset,
  });
}

function listTemplateVersions(tenantId, eventType, channel, language) {
  return NotificationTemplateConfig.findAll({
    where: { tenantId, eventType, channel, language },
    order: [['version', 'DESC']],
  });
}

function createTemplate(data) {
  return NotificationTemplateConfig.create(data);
}

function destroyTemplate(instance, options) {
  return instance.destroy(options);
}

// --- provider_config (notification-scoped read view, §8.12) ------------------
function listNotificationProviders(tenantId, providerType) {
  const where = { tenantId, providerType: providerType || { [Op.in]: ['sms', 'email', 'whatsapp', 'push'] } };
  return ProviderConfig.findAll({ where });
}

function findProviderByType(tenantId, providerType) {
  return ProviderConfig.findOne({ where: { tenantId, providerType } });
}

// --- recipient resolution (read-only cross-module reads) ---------------------
function findUserById(userId) {
  return User.findOne({ where: { id: userId } });
}

function findCitizenProfileByUserId(userId) {
  return CitizenProfile.findOne({ where: { userId } });
}

function findStaffProfileById(staffProfileId) {
  return StaffProfile.findOne({ where: { id: staffProfileId }, include: ['user'] });
}

function findComplaintById(complaintId) {
  return Complaint.findOne({ where: { id: complaintId } });
}

module.exports = {
  transaction,
  createEvent,
  findEventById,
  findUnconsumedEvents,
  createDispatch,
  findDispatchById,
  updateDispatch,
  countDispatchesForEvent,
  dispatchStatusCountsForEvent,
  findDispatchesForRecipient,
  findDispatchesByChannelStatus,
  findDispatchesMatchingFilter,
  findPreferencesForUser,
  upsertPreference,
  findTemplate,
  findTemplateById,
  listTemplates,
  listTemplateVersions,
  createTemplate,
  destroyTemplate,
  listNotificationProviders,
  findProviderByType,
  findUserById,
  findCitizenProfileByUserId,
  findStaffProfileById,
  findComplaintById,
};
