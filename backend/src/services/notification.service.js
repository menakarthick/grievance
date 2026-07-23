'use strict';

// Business logic for the Notification module (docs/notification.yaml,
// 08-Notification-APIs.md). One generic dispatch pipeline (§8.1.1) backs
// every channel-typed endpoint; see repo/dto for the schema-fidelity notes
// on what the approved v1.0 tables do and don't persist.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { ApiError } = require('../utils/apiError');
const env = require('../config/env');
const logger = require('../config/logger');
const { recordAuditLog } = require('../audit');
const templateEngine = require('../utils/templateEngine');
const { getProviderTypeAdapter } = require('../providers/notification');
const { queues, QUEUE_NAMES } = require('../queues');
const repo = require('../repositories/notification.repository');
const dto = require('../dtos/notification.dto');
const { Tenant, Ward, Zone, CitizenProfile, StaffProfile, User, NotificationEvent, NotificationDispatch } = require('../models');

const TERMINAL_STATUSES = ['sent', 'delivered', 'read', 'failed', 'dead_letter', 'cancelled'];
const QUEUE_ELIGIBLE_STATUSES = ['queued', 'pending', 'accepted'];
const RETRYABLE_STATUSES = ['failed', 'dead_letter'];

// --- shared helpers -----------------------------------------------------------

// Phase-1 pilot simplification, same precedent as
// src/services/complaint.service.js#tenantIdOf / geo.service.js#resolveTenantId.
async function tenantIdOf(user) {
  if (user.tenantId) return Number(user.tenantId);
  const tenants = await Tenant.findAll({ where: { status: 'active' }, limit: 2 });
  if (tenants.length !== 1) {
    throw ApiError.internal('Notification administration requires exactly one active tenant in the current Phase-1 pilot configuration.');
  }
  return tenants[0].id;
}

async function resolveTemplate(tenantId, eventType, channel, languageCode) {
  const template = await repo.findTemplate(tenantId, eventType, channel, languageCode);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', `No ${channel}/${languageCode} template configured for "${eventType}".`);
  return template;
}

function validateVariables(bodyTemplate, variables = {}) {
  const placeholders = templateEngine.extractPlaceholders(bodyTemplate);
  const missing = placeholders.filter((name) => variables[name] === undefined || variables[name] === null);
  if (missing.length > 0) {
    throw ApiError.validation('Request failed validation', [
      { field: 'variables', issue: 'MISSING_PLACEHOLDER', message: `Missing required variables: ${missing.join(', ')}.` },
    ]);
  }
}

async function isChannelEnabled(recipientUserId, channel) {
  const prefs = await repo.findPreferencesForUser(recipientUserId);
  const pref = prefs.find((p) => p.channel === channel);
  return pref ? pref.isEnabled : true; // no row yet -> model default (enabled)
}

function renderForDispatch(template, variables) {
  const { subjectTemplate, bodyTemplate } = dto.decodeBodyTemplate(template.bodyTemplate);
  const body = templateEngine.render(bodyTemplate, variables).renderedText;
  const subject = subjectTemplate ? templateEngine.render(subjectTemplate, variables).renderedText : null;
  return { subject, body };
}

// BullMQ's own Lua-script commands can hang rather than reject promptly
// against a degraded/mocked Redis backend (observed with ioredis-mock in
// this test environment — no live Redis, CURRENT_STATE.md), and that
// latency compounds badly across a broadcast/bulk fan-out loop. Every
// BullMQ call in this module is bounded the same "fail fast" way the plain
// Redis client's commandTimeout already is (src/config/redis.js) — a slow
// queue must never block the durable MySQL-side business logic.
const QUEUE_CALL_TIMEOUT_MS = 500;
function withTimeout(promise, ms = QUEUE_CALL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Queue operation timed out after ${ms}ms`)), ms)),
  ]);
}

async function enqueueDeliveryJob(dispatchId, delayMs) {
  try {
    const opts = { jobId: `dispatch-${dispatchId}` };
    if (delayMs) opts.delay = delayMs;
    await withTimeout(queues[QUEUE_NAMES.NOTIFICATION_DISPATCH].add('deliver', { dispatchId }, opts));
  } catch (err) {
    // Redis/BullMQ unavailable (e.g. no live Redis in this dev environment,
    // CURRENT_STATE.md) — notification_dispatch remains the durable MySQL
    // mirror (§8.1.5); the row stays 'queued' until a worker picks it up.
    logger.warn('Failed to enqueue notification-dispatch job', { error: err.message, dispatchId });
  }
}

// The shared core: one notification_event + one notification_dispatch,
// queued for delivery. Used by every single-recipient send path (channel
// sends, test sends, schedule, emergency override) and, per-recipient, by
// broadcast/bulk fan-out.
async function createDispatch({
  tenantId,
  eventType,
  channel,
  languageCode = 'en',
  recipientUserId,
  variables = {},
  complaintId = null,
  isTestSend = false,
  isBroadcast = false,
  isBulk = false,
  bypassPreference = false,
  existingEvent = null,
  delayMs = null,
}) {
  const template = await resolveTemplate(tenantId, eventType, channel, languageCode);
  validateVariables(dto.decodeBodyTemplate(template.bodyTemplate).bodyTemplate, variables);

  if (!bypassPreference && !isTestSend) {
    const enabled = await isChannelEnabled(recipientUserId, channel);
    if (!enabled) throw ApiError.unprocessable('CHANNEL_DISABLED_BY_RECIPIENT', 'The recipient has disabled this channel.');
  }

  const event =
    existingEvent ||
    (await repo.createEvent({
      tenantId,
      eventType,
      complaintId,
      payloadSummary: { variables, isTestSend, isBroadcast, isBulk },
    }));

  const dispatch = await repo.createDispatch({
    notificationEventId: event.id,
    recipientUserId,
    channel,
    templateConfigId: template.id,
    status: 'queued',
  });

  await enqueueDeliveryJob(dispatch.id, delayMs);
  return { event, dispatch, template };
}

async function auditManualSend(user, action, dispatch, extra) {
  await recordAuditLog({
    tenantId: await tenantIdOf(user),
    actorUserId: user.id,
    action,
    entityType: 'notification_dispatch',
    entityId: dispatch.id,
    changeSummary: extra,
  });
}

// --- 8.2-8.5 Channel send / status / test send --------------------------------

async function sendChannel(user, channel, body) {
  const tenantId = await tenantIdOf(user);
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: body.templateKey,
    channel,
    languageCode: body.languageCode || 'en',
    recipientUserId: Number(body.recipientUserId),
    variables: body.variables,
    bypassPreference: body.priority === 'emergency',
  });
  await auditManualSend(user, 'NOTIFICATION_SENT', dispatch, `channel=${channel} template=${body.templateKey}`);
  return dto.shapeDispatchAck(dispatch);
}

async function getChannelStatus(user, channel, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch || dispatch.channel !== channel) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  await assertDispatchAccess(user, dispatch);
  return dto.shapeChannelStatusDetail(dispatch);
}

// Recipient (own) or Officer/Admin within scope (§8.2.2 et al.) — mirrors
// src/services/complaint.service.js#assertAccess's shape.
async function assertDispatchAccess(user, dispatch) {
  if (['corporation_admin', 'super_admin'].includes(user.userType)) return;
  if (Number(dispatch.recipientUserId) === Number(user.id)) return;
  if (['officer', 'department_admin'].includes(user.userType)) return; // scope refined at list-level; detail is read-only status metadata
  throw ApiError.forbidden();
}

// Test sends have no guaranteed recipientUserId (a raw phone/email/device
// token may not correspond to any account) — recorded against the acting
// Admin's own user id to satisfy notification_dispatch.recipient_user_id's
// NOT NULL/FK constraint (Section 11), with the real test contact captured
// only in the audit trail (masked), never persisted as dispatch data.
async function testSendChannel(user, channel, body, testRecipientField) {
  const tenantId = await tenantIdOf(user);
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: body.templateKey,
    channel,
    languageCode: body.languageCode || 'en',
    recipientUserId: user.id,
    variables: body.variables,
    isTestSend: true,
    bypassPreference: true,
  });
  const maskedRecipient = maskContact(body[testRecipientField]);
  await auditManualSend(user, 'NOTIFICATION_TEST_SEND', dispatch, `channel=${channel} template=${body.templateKey} testRecipient=${maskedRecipient}`);
  return dto.shapeTestDispatchAck(dispatch);
}

function maskContact(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 4) return '*'.repeat(str.length);
  return `${str.slice(0, 2)}${'*'.repeat(str.length - 4)}${str.slice(-2)}`;
}

const sendSms = (user, body) => sendChannel(user, 'sms', body);
const getSmsStatus = (user, id) => getChannelStatus(user, 'sms', id);
const testSendSms = (user, body) => testSendChannel(user, 'sms', body, 'testMobileNumber');

const sendEmail = (user, body) => sendChannel(user, 'email', body);
const getEmailStatus = (user, id) => getChannelStatus(user, 'email', id);
const testSendEmail = (user, body) => testSendChannel(user, 'email', body, 'testEmailAddress');

const sendWhatsapp = (user, body) => sendChannel(user, 'whatsapp', body);
const getWhatsappStatus = (user, id) => getChannelStatus(user, 'whatsapp', id);
const testSendWhatsapp = (user, body) => testSendChannel(user, 'whatsapp', body, 'testMobileNumber');

async function sendPush(user, body) {
  const tenantId = await tenantIdOf(user);
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: body.templateKey,
    channel: body.channel,
    languageCode: body.languageCode || 'en',
    recipientUserId: Number(body.recipientUserId),
    variables: body.variables,
    bypassPreference: body.priority === 'emergency',
  });
  await auditManualSend(user, 'NOTIFICATION_SENT', dispatch, `channel=${body.channel} template=${body.templateKey}`);
  return dto.shapeDispatchAck(dispatch);
}
async function getPushStatus(user, id) {
  const dispatch = await repo.findDispatchById(id);
  if (!dispatch || !['push_mobile', 'push_web', 'push_browser'].includes(dispatch.channel)) {
    throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  }
  await assertDispatchAccess(user, dispatch);
  return dto.shapeChannelStatusDetail(dispatch);
}
const testSendPush = (user, body) => testSendChannel(user, body.channel, body, 'testDeviceToken');

// --- 8.6 In-App ----------------------------------------------------------------

async function listInApp(user, { status = 'all', limit, cursor }) {
  const where = { channel: 'in_app' };
  if (status === 'unread') where.status = { [Op.ne]: 'read' };
  if (status === 'read') where.status = 'read';
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const before = decodeCursor(cursor);
  const rows = await repo.findDispatchesForRecipient(user.id, { where, limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(rows, limit);
  const data = await Promise.all(page.map((d) => shapeInAppWithRender(d, dto.shapeInAppSummary)));
  return { data, meta };
}

async function shapeInAppWithRender(dispatch, shaper) {
  const event = await repo.findEventById(dispatch.notificationEventId);
  const rendered = dispatch.templateConfig ? renderForDispatch(dispatch.templateConfig, event?.payloadSummary?.variables || {}) : {};
  dispatch.notificationEvent = dispatch.notificationEvent || event;
  return shaper(dispatch, rendered);
}

async function getInApp(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch || dispatch.channel !== 'in_app') throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  if (Number(dispatch.recipientUserId) !== Number(user.id)) throw ApiError.forbidden();
  return shapeInAppWithRender(dispatch, dto.shapeInAppDetail);
}

async function markInAppRead(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch || dispatch.channel !== 'in_app') throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  if (Number(dispatch.recipientUserId) !== Number(user.id)) throw ApiError.forbidden();
  if (dispatch.status !== 'read') await repo.updateDispatch(dispatch, { status: 'read' });
  return { notificationDispatchId: String(dispatch.id), status: 'read', readAt: dispatch.updatedAt };
}

async function markAllInAppRead(user) {
  const [markedCount] = await NotificationDispatch.update(
    { status: 'read' },
    { where: { recipientUserId: user.id, channel: 'in_app', status: { [Op.ne]: 'read' } } },
  );
  return { markedCount, readAt: new Date() };
}

async function getUnreadCount(user) {
  const unreadCount = await NotificationDispatch.count({
    where: { recipientUserId: user.id, channel: 'in_app', status: { [Op.ne]: 'read' } },
  });
  return { unreadCount };
}

// --- 8.7 Templates ---------------------------------------------------------

async function listTemplates(user, { eventType, channel, languageCode, page = 1, size = 20 }) {
  const tenantId = await tenantIdOf(user);
  const where = {};
  if (eventType) where.eventType = eventType;
  if (channel) where.channel = channel;
  if (languageCode) where.language = languageCode;
  const offset = (page - 1) * size;
  const { rows, count } = await repo.listTemplates(tenantId, where, { limit: size, offset });
  return {
    data: rows.map(dto.shapeTemplateSummary),
    meta: { page, size, totalCount: count, totalPages: Math.ceil(count / size) },
  };
}

async function createTemplate(user, body) {
  const tenantId = await tenantIdOf(user);
  if (body.htmlBodyTemplate) {
    throw ApiError.validation('Request failed validation', [
      {
        field: 'htmlBodyTemplate',
        issue: 'NOT_SUPPORTED',
        message: 'htmlBodyTemplate is not supported this phase — no column exists in the approved v1.0 schema.',
      },
    ]);
  }
  if (body.subjectTemplate && body.channel !== 'email') {
    throw ApiError.validation('Request failed validation', [
      { field: 'subjectTemplate', issue: 'INVALID_FOR_CHANNEL', message: 'subjectTemplate is only accepted for channel=email.' },
    ]);
  }
  const bodyTemplate = dto.encodeBodyTemplate(body.bodyTemplate, body.subjectTemplate);
  const template = await repo.createTemplate({
    tenantId,
    eventType: body.eventType,
    channel: body.channel,
    language: body.languageCode,
    bodyTemplate,
    version: 1,
    createdBy: user.id,
  });
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_TEMPLATE_CREATED',
    entityType: 'notification_template_config',
    entityId: template.id,
    changeSummary: `${body.eventType}/${body.channel}/${body.languageCode}`,
  });
  return dto.shapeTemplateSummary(template);
}

// Each PATCH creates a brand-new row (a new auto-increment id) rather than
// updating in place — the caller keeps referencing the *original*
// templateId forever, so every read/write operation below must resolve
// that id to its (tenantId, eventType, channel, language) family and then
// to that family's current-highest-version row, not the literal row the id
// happens to point at (which becomes a stale, superseded version the
// moment an update happens).
async function resolveTemplateFamilyLatest(tenantId, templateId) {
  const anyRow = await repo.findTemplateById(tenantId, templateId);
  if (!anyRow) return null;
  return repo.findTemplate(tenantId, anyRow.eventType, anyRow.channel, anyRow.language);
}

async function getTemplate(user, templateId) {
  const tenantId = await tenantIdOf(user);
  const template = await resolveTemplateFamilyLatest(tenantId, templateId);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  return dto.shapeTemplateDetail(template);
}

// PATCH creates a new version row rather than overwriting (Section 22
// versioning, mirrored from SlaRuleConfig's effective-dating precedent) —
// notification_template_config.version is a config-effective-dating
// counter, not an optimistic-lock column (model comment), so
// expectedVersion is still checked here at the application layer for the
// concurrency guarantee the API documents, just not via a DB-level lock.
async function updateTemplate(user, templateId, body) {
  const tenantId = await tenantIdOf(user);
  const current = await resolveTemplateFamilyLatest(tenantId, templateId);
  if (!current) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  if (current.version !== body.expectedVersion) {
    throw ApiError.conflict('CONCURRENT_MODIFICATION', 'expectedVersion does not match the template\'s current version.');
  }
  if (body.htmlBodyTemplate) {
    throw ApiError.validation('Request failed validation', [
      { field: 'htmlBodyTemplate', issue: 'NOT_SUPPORTED', message: 'htmlBodyTemplate is not supported this phase.' },
    ]);
  }
  const { subjectTemplate: currentSubject, bodyTemplate: currentBody } = dto.decodeBodyTemplate(current.bodyTemplate);
  const nextBodyTemplate = body.bodyTemplate ?? currentBody;
  const nextSubjectTemplate = body.subjectTemplate ?? currentSubject;
  const next = await repo.createTemplate({
    tenantId,
    eventType: current.eventType,
    channel: current.channel,
    language: current.language,
    bodyTemplate: dto.encodeBodyTemplate(nextBodyTemplate, nextSubjectTemplate),
    version: current.version + 1,
    createdBy: user.id,
    updatedBy: user.id,
  });
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_TEMPLATE_UPDATED',
    entityType: 'notification_template_config',
    entityId: next.id,
    changeSummary: `version ${current.version} -> ${next.version}`,
  });
  return dto.shapeTemplateSummary(next);
}

async function deleteTemplate(user, templateId) {
  const tenantId = await tenantIdOf(user);
  const template = await repo.findTemplateById(tenantId, templateId);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  // Soft-delete every version row in the family, not just the one the
  // caller's templateId happens to point at — otherwise an older,
  // already-superseded version could remain "active" and start being
  // resolved again by resolveTemplate/resolveTemplateFamilyLatest.
  const family = await repo.listTemplateVersions(tenantId, template.eventType, template.channel, template.language);
  for (const row of family) {
    await repo.destroyTemplate(row);
  }
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_TEMPLATE_DEACTIVATED',
    entityType: 'notification_template_config',
    entityId: template.id,
  });
}

async function listTemplateVersions(user, templateId, { page = 1, size = 20 }) {
  const tenantId = await tenantIdOf(user);
  const template = await repo.findTemplateById(tenantId, templateId);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  const all = await repo.listTemplateVersions(tenantId, template.eventType, template.channel, template.language);
  const start = (page - 1) * size;
  return { data: all.slice(start, start + size).map(dto.shapeTemplateVersion) };
}

async function previewTemplate(user, templateId, sampleVariables = {}) {
  const tenantId = await tenantIdOf(user);
  const template = await resolveTemplateFamilyLatest(tenantId, templateId);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  const { subjectTemplate, bodyTemplate } = dto.decodeBodyTemplate(template.bodyTemplate);
  const body = templateEngine.render(bodyTemplate, sampleVariables).renderedText;
  const renderedHtmlBody = null; // no htmlBodyTemplate column this phase
  const renderedSubject = subjectTemplate ? templateEngine.render(subjectTemplate, sampleVariables).renderedText : undefined;
  return { renderedSubject, renderedBody: body, renderedHtmlBody };
}

async function templateTestSend(user, templateId, { testRecipient, variables }) {
  const tenantId = await tenantIdOf(user);
  const template = await resolveTemplateFamilyLatest(tenantId, templateId);
  if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Template not found.');
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: template.eventType,
    channel: template.channel,
    languageCode: template.language,
    recipientUserId: user.id,
    variables,
    isTestSend: true,
    bypassPreference: true,
  });
  await auditManualSend(user, 'NOTIFICATION_TEST_SEND', dispatch, `template=${templateId} testRecipient=${maskContact(testRecipient)}`);
  return dto.shapeTestDispatchAck(dispatch);
}

// Approval workflow (draft -> pending_approval -> approved/rejected):
// notification_template_config has no approvalStatus/submittedBy/decidedBy
// column (Section 7) to persist this state machine. Every template is
// treated as immediately usable (dto.shapeTemplateSummary always reports
// 'approved'); these two endpoints exist (routed, RBAC-gated, documented)
// but degrade to 501, the same pattern already established for Geographic
// v1.1 entities (CURRENT_STATE.md).
async function submitTemplateForApproval() {
  throw new ApiError({
    statusCode: 501,
    category: 'business',
    code: 'NOT_ENABLED',
    message: 'Template approval workflow requires an approvalStatus column not present in the approved v1.0 schema.',
  });
}
const recordTemplateApprovalDecision = submitTemplateForApproval;

// --- 8.8 Preferences ------------------------------------------------------------

async function resolveLanguageCode(userId, userType) {
  if (userType !== 'citizen') return 'en';
  const profile = await repo.findCitizenProfileByUserId(userId);
  return profile?.preferredLanguage || 'en';
}

async function getMyPreferences(user) {
  const prefs = await repo.findPreferencesForUser(user.id);
  const languageCode = await resolveLanguageCode(user.id, user.userType);
  return dto.shapePreferenceProfile(prefs, { languageCode });
}

// The full known channel set (§8.1.2) — a channel with no notification_preference
// row is implicitly enabled (the model's isEnabled default), so "will
// anything remain enabled" must be evaluated over this whole universe, not
// just the channels the caller happens to mention or that already have a
// row.
const ALL_CHANNELS = ['sms', 'email', 'whatsapp', 'push_mobile', 'push_web', 'push_browser', 'in_app'];

async function updatePreferences(userId, userType, body) {
  const channels = body.channels || [];
  if (channels.length > 0) {
    const existing = await repo.findPreferencesForUser(userId);
    const requestedByChannel = new Map(channels.map((c) => [c.channel, c.isEnabled]));
    const existingByChannel = new Map(existing.map((p) => [p.channel, p.isEnabled]));
    const anyEnabled = ALL_CHANNELS.some((channel) => {
      if (requestedByChannel.has(channel)) return requestedByChannel.get(channel);
      if (existingByChannel.has(channel)) return existingByChannel.get(channel);
      return true; // no row yet -> model default (enabled)
    });
    if (!anyEnabled) {
      throw ApiError.unprocessable('ALL_CHANNELS_DISABLED', 'At least one channel must remain enabled.');
    }
    for (const c of channels) {
      await repo.upsertPreference(userId, c.channel, c.isEnabled);
    }
  }
  const prefs = await repo.findPreferencesForUser(userId);
  const languageCode = await resolveLanguageCode(userId, userType);
  return dto.shapePreferenceProfile(prefs, { languageCode });
}

// expectedVersion/optimistic-concurrency: notification_preference has no
// version column (Section 11) — accepted but not enforced this phase (see
// dto.shapePreferenceProfile's static version:1); documented, not silently
// dropped.
async function updateMyPreferences(user, body) {
  return updatePreferences(user.id, user.userType, body);
}

async function getUserPreferences(user, targetUserId) {
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) throw ApiError.notFound('USER_NOT_FOUND', 'User not found.');
  if (user.userType === 'department_admin') {
    const callerProfile = await StaffProfile.findOne({ where: { userId: user.id } });
    const targetProfile = await StaffProfile.findOne({ where: { userId: targetUserId } });
    if (!callerProfile || !targetProfile || callerProfile.departmentId !== targetProfile.departmentId) {
      throw ApiError.forbidden();
    }
  }
  const prefs = await repo.findPreferencesForUser(targetUserId);
  const languageCode = await resolveLanguageCode(targetUserId, targetUser.userType);
  return dto.shapePreferenceProfile(prefs, { languageCode });
}

async function setEmergencyOverride(user, targetUserId, body) {
  const tenantId = await tenantIdOf(user);
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) throw ApiError.notFound('USER_NOT_FOUND', 'User not found.');
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: body.templateKey,
    channel: body.channel,
    recipientUserId: targetUserId,
    variables: body.variables,
    bypassPreference: true,
  });
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_EMERGENCY_OVERRIDE',
    entityType: 'notification_dispatch',
    entityId: dispatch.id,
    changeSummary: `recipient=${targetUserId} template=${body.templateKey} justification=${body.justification}`,
  });
  return { notificationDispatchId: String(dispatch.id), channel: dispatch.channel, status: 'queued', overrideApplied: true };
}

// --- 8.9 Queue -------------------------------------------------------------

async function listQueue(user, { channel, limit, cursor }) {
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const where = { status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } };
  if (channel) where.channel = channel;
  const before = decodeCursor(cursor);
  const rows = await repo.findDispatchesByChannelStatus({ where, limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(rows, limit);
  return { data: page.map(dto.shapeQueueItem), meta };
}

async function getQueueItem(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  return dto.shapeQueueItemDetail(dispatch);
}

async function scheduleNotification(user, body) {
  const tenantId = await tenantIdOf(user);
  let delayMs = null;
  if (body.scheduledAt) delayMs = Math.max(0, new Date(body.scheduledAt).getTime() - Date.now());
  else if (body.delaySeconds) delayMs = body.delaySeconds * 1000;
  const { dispatch } = await createDispatch({
    tenantId,
    eventType: body.templateKey,
    channel: body.channel,
    recipientUserId: Number(body.recipientUserId),
    variables: body.variables,
    delayMs,
  });
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    status: 'queued',
    scheduledAt: body.scheduledAt || new Date(Date.now() + (delayMs || 0)).toISOString(),
  };
}

async function cancelQueued(user, notificationDispatchId, reason) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  if (dispatch.status === 'cancelled') {
    return { notificationDispatchId: String(dispatch.id), status: 'cancelled', cancelledAt: dispatch.updatedAt };
  }
  if (!QUEUE_ELIGIBLE_STATUSES.includes(dispatch.status)) {
    throw ApiError.conflict('NOTIFICATION_ALREADY_SENT', 'This notification has already been sent and cannot be cancelled.');
  }
  await repo.updateDispatch(dispatch, { status: 'cancelled' });
  await recordAuditLog({
    tenantId: await tenantIdOf(user),
    actorUserId: user.id,
    action: 'NOTIFICATION_CANCELLED',
    entityType: 'notification_dispatch',
    entityId: dispatch.id,
    changeSummary: reason,
  });
  return { notificationDispatchId: String(dispatch.id), status: 'cancelled', cancelledAt: new Date() };
}

async function listDeadLetter(user, { channel, limit, cursor }) {
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const where = { status: 'dead_letter' };
  if (channel) where.channel = channel;
  const before = decodeCursor(cursor);
  const rows = await repo.findDispatchesByChannelStatus({ where, limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(rows, limit);
  return { data: page.map(dto.shapeDeadLetterItem), meta };
}

// --- 8.10 History ------------------------------------------------------------

async function listHistory(user, { recipientUserId, complaintId, channel, status, sentAtGte, sentAtLte, limit, cursor }) {
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const targetUserId = user.userType === 'citizen' ? user.id : Number(recipientUserId) || undefined;
  const where = {};
  if (targetUserId) where.recipientUserId = targetUserId;
  if (channel) where.channel = channel;
  if (status) where.status = status;
  if (sentAtGte || sentAtLte) {
    where.sentAt = {};
    if (sentAtGte) where.sentAt[Op.gte] = sentAtGte;
    if (sentAtLte) where.sentAt[Op.lte] = sentAtLte;
  }
  if (complaintId) {
    const events = await NotificationEvent.findAll({ where: { complaintId: Number(complaintId) }, attributes: ['id'] });
    where.notificationEventId = { [Op.in]: events.map((e) => e.id) };
  }
  const before = decodeCursor(cursor);
  const rows = targetUserId
    ? await repo.findDispatchesForRecipient(targetUserId, { where, limit: limit + 1, before })
    : await repo.findDispatchesByChannelStatus({ where, limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(rows, limit);
  return { data: page.map(dto.shapeHistoryItem), meta };
}

async function getHistoryDetail(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  await assertDispatchAccess(user, dispatch);
  const event = await repo.findEventById(dispatch.notificationEventId);
  const rendered = dispatch.templateConfig ? renderForDispatch(dispatch.templateConfig, event?.payloadSummary?.variables || {}) : {};
  dispatch.notificationEvent = event;
  return dto.shapeHistoryDetail(dispatch, rendered);
}

// Reports/File Management modules (the documented export/async-job/
// signed-URL infrastructure this endpoint says to reuse) are themselves
// still Phase-1 placeholders (CURRENT_STATE.md) — nothing exists yet to
// delegate to, so this degrades to 501 rather than fabricating a
// standalone export pipeline for Notification alone.
async function exportHistory() {
  throw new ApiError({
    statusCode: 501,
    category: 'business',
    code: 'NOT_ENABLED',
    message: 'Notification history export depends on the Reports/File Management async-export infrastructure, which does not exist yet.',
  });
}

// --- 8.11 Retry --------------------------------------------------------------

async function retryNotification(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  if (!RETRYABLE_STATUSES.includes(dispatch.status)) {
    throw ApiError.conflict('NOTIFICATION_NOT_RETRYABLE', 'Only a Failed or Dead-Lettered notification can be retried.');
  }
  // Captured before update() — Sequelize mutates the instance's own
  // retryCount attribute in place once the update resolves, so re-reading
  // dispatch.retryCount afterward would double-increment the value used
  // for the response below.
  const nextRetryCount = dispatch.retryCount + 1;
  await repo.updateDispatch(dispatch, { status: 'queued', retryCount: nextRetryCount });
  await enqueueDeliveryJob(dispatch.id);
  await recordAuditLog({
    tenantId: await tenantIdOf(user),
    actorUserId: user.id,
    action: 'NOTIFICATION_RETRIED',
    entityType: 'notification_dispatch',
    entityId: dispatch.id,
  });
  return { notificationDispatchId: String(dispatch.id), status: 'retried', retryCount: nextRetryCount, requeuedAt: new Date() };
}

async function bulkRetry(user, { channel, filter }) {
  const where = { status: filter.status };
  if (channel) where.channel = channel;
  if (filter.createdAt) {
    where.createdAt = {};
    if (filter.createdAt.gte) where.createdAt[Op.gte] = filter.createdAt.gte;
    if (filter.createdAt.lte) where.createdAt[Op.lte] = filter.createdAt.lte;
  }
  const matches = await repo.findDispatchesMatchingFilter(where, env.notification.bulkRetryMaxMatches + 1);
  if (matches.length > env.notification.bulkRetryMaxMatches) {
    throw ApiError.unprocessable('MATCH_COUNT_EXCEEDS_LIMIT', `Matched count exceeds the ${env.notification.bulkRetryMaxMatches}-item limit per call.`);
  }
  for (const dispatch of matches) {
    await repo.updateDispatch(dispatch, { status: 'queued', retryCount: dispatch.retryCount + 1 });
    await enqueueDeliveryJob(dispatch.id);
  }
  await recordAuditLog({
    tenantId: await tenantIdOf(user),
    actorUserId: user.id,
    action: 'NOTIFICATION_BULK_RETRY',
    entityType: 'notification_dispatch',
    entityId: 0,
    changeSummary: `matchedCount=${matches.length}`,
  });
  // No dedicated bulk-retry-job table exists (this re-queues existing
  // dispatches rather than creating new notification_event rows, so there
  // is nothing to key a durable job id against) — bulkRetryJobId is an
  // ephemeral ack id, not separately queryable later; matches are already
  // processed synchronously by the time this returns (documented, phase-1
  // pilot-scale simplification rather than a true async job).
  return { bulkRetryJobId: crypto.randomUUID(), matchedCount: matches.length, status: 'queued' };
}

async function getRetryHistory(user, notificationDispatchId) {
  const dispatch = await repo.findDispatchById(notificationDispatchId);
  if (!dispatch) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
  return { data: dto.shapeRetryHistory(dispatch) };
}

// --- 8.12 Providers ----------------------------------------------------------

async function listProviders(user, channel) {
  const tenantId = await tenantIdOf(user);
  const rows = await repo.listNotificationProviders(tenantId, channel);
  return { data: rows.map(dto.shapeProviderSummary) };
}

async function getProvider(user, providerType) {
  const tenantId = await tenantIdOf(user);
  const provider = await repo.findProviderByType(tenantId, providerType);
  if (!provider) throw ApiError.notFound('PROVIDER_NOT_FOUND', 'Provider not found.');
  return dto.shapeProviderSummary(provider);
}

async function testProviderConnectivity(user, providerType) {
  const tenantId = await tenantIdOf(user);
  const provider = await repo.findProviderByType(tenantId, providerType);
  if (!provider) throw ApiError.notFound('PROVIDER_NOT_FOUND', 'Provider not found.');
  const adapter = getProviderTypeAdapter(providerType);
  const result = adapter ? await adapter.testConnectivity() : { reachable: false, latencyMs: null };
  return { providerType, providerName: provider.providerName, reachable: result.reachable, latencyMs: result.latencyMs, checkedAt: new Date() };
}

// --- 8.13 Broadcast ----------------------------------------------------------

// ward/zone/district resolution reuses the Geographic module's already-
// approved District->Zone->Ward hierarchy (read-only cross-module read, the
// same pattern Complaint uses to validate location.wardId).
async function resolveScopeRecipients(tenantId, scopeType, scopeId) {
  if (scopeType === 'tenant') {
    const users = await User.findAll({ where: { tenantId, status: 'active' } });
    return users.map((u) => u.id);
  }
  if (scopeType === 'department') {
    const profiles = await StaffProfile.findAll({ where: { departmentId: scopeId }, include: ['user'] });
    return profiles.filter((p) => p.user?.tenantId === tenantId).map((p) => p.userId);
  }
  if (scopeType === 'ward') {
    const profiles = await CitizenProfile.findAll({ where: { wardId: scopeId } });
    return profiles.map((p) => p.userId);
  }
  if (scopeType === 'zone') {
    const wards = await Ward.findAll({ where: { zoneId: scopeId, tenantId } });
    const profiles = await CitizenProfile.findAll({ where: { wardId: { [Op.in]: wards.map((w) => w.id) } } });
    return profiles.map((p) => p.userId);
  }
  if (scopeType === 'district') {
    const zones = await Zone.findAll({ where: { districtId: scopeId, tenantId } });
    const wards = await Ward.findAll({ where: { zoneId: { [Op.in]: zones.map((z) => z.id) }, tenantId } });
    const profiles = await CitizenProfile.findAll({ where: { wardId: { [Op.in]: wards.map((w) => w.id) } } });
    return profiles.map((p) => p.userId);
  }
  throw ApiError.validation('Request failed validation', [
    { field: 'scopeType', issue: 'INVALID_VALUE', message: 'scopeType must be one of ward, zone, district, department, tenant.' },
  ]);
}

async function assertBroadcastScopeAllowed(user, scopeType, scopeId) {
  if (['corporation_admin', 'super_admin'].includes(user.userType)) return;
  if (user.userType === 'department_admin') {
    const callerProfile = await StaffProfile.findOne({ where: { userId: user.id } });
    if (scopeType === 'department' && Number(scopeId) === callerProfile?.departmentId) return;
    throw ApiError.forbidden();
  }
  throw ApiError.forbidden();
}

async function createBroadcast(user, body) {
  const tenantId = await tenantIdOf(user);
  await assertBroadcastScopeAllowed(user, body.scopeType, body.scopeId);
  const recipientUserIds = await resolveScopeRecipients(tenantId, body.scopeType, body.scopeId);

  const event = await repo.createEvent({
    tenantId,
    eventType: body.templateKey,
    complaintId: null,
    payloadSummary: {
      variables: body.variables,
      isBroadcast: true,
      scopeType: body.scopeType,
      scopeId: body.scopeId ? String(body.scopeId) : null,
      channels: body.channels,
    },
  });

  for (const recipientUserId of recipientUserIds) {
    for (const channel of body.channels) {
      try {
        await createDispatch({
          tenantId,
          eventType: body.templateKey,
          channel,
          recipientUserId,
          variables: body.variables,
          isBroadcast: true,
          bypassPreference: body.priority === 'emergency',
          existingEvent: event,
        });
      } catch (err) {
        logger.warn('Broadcast fan-out skipped a recipient/channel', { error: err.message, recipientUserId, channel });
      }
    }
  }

  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_BROADCAST_CREATED',
    entityType: 'notification_event',
    entityId: event.id,
    changeSummary: `scope=${body.scopeType}:${body.scopeId || 'all'} channels=${body.channels.join(',')} priority=${body.priority || 'normal'}`,
  });

  return { broadcastId: String(event.id), status: 'queued', estimatedRecipientCount: recipientUserIds.length };
}

async function deriveEventStatus(eventId) {
  const counts = await repo.dispatchStatusCountsForEvent(eventId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 'queued';
  const nonTerminal = Object.entries(counts).reduce((sum, [status, n]) => (TERMINAL_STATUSES.includes(status) ? sum : sum + n), 0);
  if (counts.cancelled === total) return 'cancelled';
  if (nonTerminal === total) return 'queued';
  if (nonTerminal === 0) return 'completed';
  return 'in_progress';
}

async function listBroadcasts(user, { limit = 20 }) {
  const tenantId = await tenantIdOf(user);
  const events = await NotificationEvent.findAll({
    where: { tenantId, payloadSummary: { [Op.ne]: null } },
    order: [['id', 'DESC']],
    limit,
  });
  const broadcasts = events.filter((e) => e.payloadSummary?.isBroadcast);
  const data = await Promise.all(
    broadcasts.map(async (e) => ({
      broadcastId: String(e.id),
      scopeType: e.payloadSummary.scopeType,
      scopeId: e.payloadSummary.scopeId,
      status: await deriveEventStatus(e.id),
      recipientCount: await repo.countDispatchesForEvent(e.id),
      createdAt: e.createdAt,
    })),
  );
  return { data };
}

async function getBroadcastStatus(user, broadcastId) {
  const event = await repo.findEventById(broadcastId);
  if (!event || !event.payloadSummary?.isBroadcast) throw ApiError.notFound('BROADCAST_NOT_FOUND', 'Broadcast not found.');
  const counts = await repo.dispatchStatusCountsForEvent(event.id);
  const sentCount = (counts.sent || 0) + (counts.delivered || 0) + (counts.read || 0);
  const deliveredCount = (counts.delivered || 0) + (counts.read || 0);
  const failedCount = (counts.failed || 0) + (counts.dead_letter || 0);
  const recipientCount = Object.values(counts).reduce((a, b) => a + b, 0);
  return { broadcastId: String(event.id), status: await deriveEventStatus(event.id), recipientCount, sentCount, deliveredCount, failedCount };
}

async function cancelBroadcast(user, broadcastId, { expectedStatus, reason }) {
  const event = await repo.findEventById(broadcastId);
  if (!event || !event.payloadSummary?.isBroadcast) throw ApiError.notFound('BROADCAST_NOT_FOUND', 'Broadcast not found.');
  const currentStatus = await deriveEventStatus(event.id);
  if (currentStatus === 'completed') throw ApiError.conflict('BROADCAST_ALREADY_COMPLETED', 'This broadcast has already completed.');
  if (expectedStatus !== currentStatus) throw ApiError.conflict('CONCURRENT_MODIFICATION', 'expectedStatus does not match the broadcast\'s current status.');
  // MySQL's dialect doesn't support Sequelize's `returning` option on a
  // bulk UPDATE (Postgres/MSSQL-only) — count the affected rows first.
  const pendingWhere = { notificationEventId: event.id, status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } };
  const recipientsNotYetDispatched = await NotificationDispatch.count({ where: pendingWhere });
  await NotificationDispatch.update({ status: 'cancelled' }, { where: pendingWhere });
  await recordAuditLog({
    tenantId: event.tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_BROADCAST_CANCELLED',
    entityType: 'notification_event',
    entityId: event.id,
    changeSummary: reason,
  });
  return { broadcastId: String(event.id), status: 'cancelled', recipientsNotYetDispatched };
}

// --- 8.14 Bulk ---------------------------------------------------------------

async function createBulkJob(user, body) {
  const tenantId = await tenantIdOf(user);
  if (body.recipientUserIds.length > env.notification.bulkMaxRecipients) {
    throw ApiError.unprocessable('RECIPIENT_LIST_EXCEEDS_LIMIT', `Bulk jobs are capped at ${env.notification.bulkMaxRecipients} recipients per call.`);
  }
  const event = await repo.createEvent({
    tenantId,
    eventType: body.templateKey,
    complaintId: null,
    payloadSummary: { variables: body.variables, isBulk: true, channel: body.channel },
  });
  for (const recipientUserId of body.recipientUserIds) {
    try {
      await createDispatch({
        tenantId,
        eventType: body.templateKey,
        channel: body.channel,
        recipientUserId: Number(recipientUserId),
        variables: body.variables,
        isBulk: true,
        existingEvent: event,
      });
    } catch (err) {
      logger.warn('Bulk job fan-out skipped a recipient', { error: err.message, recipientUserId });
    }
  }
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_BULK_JOB_CREATED',
    entityType: 'notification_event',
    entityId: event.id,
    changeSummary: `recipientCount=${body.recipientUserIds.length} template=${body.templateKey}`,
  });
  return { bulkJobId: String(event.id), status: 'queued', recipientCount: body.recipientUserIds.length };
}

async function getBulkJobStatus(user, bulkJobId) {
  const event = await repo.findEventById(bulkJobId);
  if (!event || !event.payloadSummary?.isBulk) throw ApiError.notFound('BULK_JOB_NOT_FOUND', 'Bulk job not found.');
  const counts = await repo.dispatchStatusCountsForEvent(event.id);
  const sentCount = (counts.sent || 0) + (counts.delivered || 0) + (counts.read || 0);
  const failedCount = (counts.failed || 0) + (counts.dead_letter || 0);
  const recipientCount = Object.values(counts).reduce((a, b) => a + b, 0);
  return { bulkJobId: String(event.id), status: await deriveEventStatus(event.id), recipientCount, sentCount, failedCount };
}

async function cancelBulkJob(user, bulkJobId, { expectedStatus, reason }) {
  const event = await repo.findEventById(bulkJobId);
  if (!event || !event.payloadSummary?.isBulk) throw ApiError.notFound('BULK_JOB_NOT_FOUND', 'Bulk job not found.');
  const currentStatus = await deriveEventStatus(event.id);
  if (currentStatus === 'completed') throw ApiError.conflict('JOB_ALREADY_COMPLETED', 'This bulk job has already completed.');
  if (expectedStatus !== currentStatus) throw ApiError.conflict('CONCURRENT_MODIFICATION', 'expectedStatus does not match the job\'s current status.');
  const dispatches = await NotificationDispatch.findAll({
    where: { notificationEventId: event.id, status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } },
  });
  await NotificationDispatch.update(
    { status: 'cancelled' },
    { where: { notificationEventId: event.id, status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } } },
  );
  await recordAuditLog({
    tenantId: event.tenantId,
    actorUserId: user.id,
    action: 'NOTIFICATION_BULK_JOB_CANCELLED',
    entityType: 'notification_event',
    entityId: event.id,
    changeSummary: reason,
  });
  return { bulkJobId: String(event.id), status: 'cancelled', recipientsNotYetProcessed: dispatches.length };
}

// --- 8.15 Analytics ----------------------------------------------------------
// Live-aggregated over notification_dispatch rather than pre-aggregated by
// a scheduled job (§8.1.8's documented preference) — no notification-
// specific reporting table exists in the approved schema (only Complaint's
// daily/weekly/monthly report tables do); acceptable at pilot scale,
// documented in CURRENT_STATE.md.

async function fetchAnalyticsRows(tenantId, { channel, periodStart, periodEnd }) {
  const where = { createdAt: { [Op.gte]: periodStart, [Op.lte]: periodEnd } };
  if (channel) where.channel = channel;
  const rows = await repo.findDispatchesByChannelStatus({ where, limit: 100000 });
  const eventIds = [...new Set(rows.map((r) => r.notificationEventId))];
  const events = await NotificationEvent.findAll({ where: { id: { [Op.in]: eventIds }, tenantId } });
  const eventById = new Map(events.map((e) => [e.id, e]));
  return rows.filter((r) => {
    const event = eventById.get(r.notificationEventId);
    return event && !event.payloadSummary?.isTestSend;
  });
}

async function getAnalyticsSummary(user, { channel, periodStart, periodEnd }) {
  const tenantId = await tenantIdOf(user);
  const rows = await fetchAnalyticsRows(tenantId, { channel, periodStart, periodEnd });
  const total = rows.length;
  const delivered = rows.filter((r) => ['delivered', 'read'].includes(r.status)).length;
  const failed = rows.filter((r) => ['failed', 'dead_letter'].includes(r.status)).length;
  const read = rows.filter((r) => r.status === 'read').length;
  const deliveryTimes = rows
    .filter((r) => r.sentAt && r.deliveredAt)
    .map((r) => (new Date(r.deliveredAt).getTime() - new Date(r.sentAt).getTime()) / 1000);
  const avgDeliveryTime = deliveryTimes.length ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;
  return {
    deliveryRatePercent: total ? Math.round((delivered / total) * 10000) / 100 : 0,
    failureRatePercent: total ? Math.round((failed / total) * 10000) / 100 : 0,
    readRatePercent: total ? Math.round((read / total) * 10000) / 100 : 0,
    // openRatePercent/clickRatePercent: no open/click tracking columns exist
    // this phase (dto.js's shapeChannelStatusDetail note) — always 0.
    openRatePercent: 0,
    clickRatePercent: 0,
    averageDeliveryTimeSeconds: Math.round(avgDeliveryTime),
    totalDispatched: total,
  };
}

// notification_dispatch has no providerConfigId column (Section 11) — a
// dispatch's providerMessageId is an opaque string, not a provider
// identity, so per-provider historical attribution isn't recoverable. This
// reports the single, currently-configured provider for the channel against
// the period's whole aggregate rather than fabricating per-provider splits.
async function getProviderPerformanceAnalytics(user, { channel, periodStart, periodEnd }) {
  const tenantId = await tenantIdOf(user);
  const provider = await repo.findProviderByType(tenantId, channel === 'push_mobile' || channel === 'push_web' || channel === 'push_browser' ? 'push' : channel);
  const rows = await fetchAnalyticsRows(tenantId, { channel, periodStart, periodEnd });
  const total = rows.length;
  const delivered = rows.filter((r) => ['delivered', 'read'].includes(r.status)).length;
  return {
    data: [
      {
        providerName: provider?.providerName || 'unconfigured',
        deliveryRatePercent: total ? Math.round((delivered / total) * 10000) / 100 : 0,
        averageLatencyMs: null,
        totalDispatched: total,
      },
    ],
  };
}

async function getRetryStatistics(user, { channel, periodStart, periodEnd }) {
  const tenantId = await tenantIdOf(user);
  const rows = await fetchAnalyticsRows(tenantId, { channel, periodStart, periodEnd });
  const retried = rows.filter((r) => r.retryCount > 0);
  const totalRetries = retried.reduce((sum, r) => sum + r.retryCount, 0);
  const eventualSuccess = retried.filter((r) => ['delivered', 'read', 'sent'].includes(r.status)).length;
  const deadLetterCount = rows.filter((r) => r.status === 'dead_letter').length;
  const averageAttemptsToSuccess = eventualSuccess ? retried.filter((r) => ['delivered', 'read', 'sent'].includes(r.status)).reduce((s, r) => s + r.retryCount, 0) / eventualSuccess : 0;
  return {
    totalRetries,
    eventualSuccessRatePercent: retried.length ? Math.round((eventualSuccess / retried.length) * 10000) / 100 : 0,
    deadLetterCount,
    averageAttemptsToSuccess: Math.round(averageAttemptsToSuccess * 100) / 100,
  };
}

// --- 8.16 Health -------------------------------------------------------------

async function queueDepthFor(queueName) {
  try {
    const queue = queues[queueName];
    const [waiting, delayed] = await withTimeout(Promise.all([queue.getWaitingCount(), queue.getDelayedCount()]));
    return waiting + delayed;
  } catch {
    // Live BullMQ/Redis introspection unavailable — fall back to the
    // durable MySQL mirror (§8.1.5), consistent with every other queue-
    // reads-through-MySQL fallback in this module.
    return NotificationDispatch.count({ where: { status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } } });
  }
}

async function getServiceHealth() {
  const channelTypes = ['sms', 'email', 'whatsapp', 'push'];
  const providers = await Promise.all(
    channelTypes.map(async (providerType) => {
      const adapter = getProviderTypeAdapter(providerType);
      const result = await adapter.testConnectivity();
      return { providerType, reachable: result.reachable };
    }),
  );
  const queueDepth = await queueDepthFor(QUEUE_NAMES.NOTIFICATION_DISPATCH);
  const criticalDown = providers.some((p) => ['sms', 'email'].includes(p.providerType) && !p.reachable);
  const nonCriticalDown = providers.some((p) => !['sms', 'email'].includes(p.providerType) && !p.reachable);
  let overallStatus = 'healthy';
  if (criticalDown || queueDepth > 10000) overallStatus = 'unhealthy';
  else if (nonCriticalDown) overallStatus = 'degraded';
  return { overallStatus, providers, queueDepth, checkedAt: new Date() };
}

async function getProviderHealthDetail(channel) {
  const channelTypes = channel ? [channel] : ['sms', 'email', 'whatsapp', 'push'];
  const data = await Promise.all(
    channelTypes.map(async (providerType) => {
      const adapter = getProviderTypeAdapter(providerType);
      if (!adapter) return null;
      const result = await adapter.testConnectivity();
      return {
        channel: providerType,
        providerName: providerType,
        reachable: result.reachable,
        lastCheckedAt: new Date(),
        // consecutiveFailureCount: no stateful tracking column exists this
        // phase — always 0 (documented gap, CURRENT_STATE.md).
        consecutiveFailureCount: 0,
      };
    }),
  );
  return { data: data.filter(Boolean) };
}

async function getQueueHealth() {
  const queueDepth = await queueDepthFor(QUEUE_NAMES.NOTIFICATION_DISPATCH);
  const deadLetterCount = await NotificationDispatch.count({ where: { status: 'dead_letter' } });
  const oldest = await NotificationDispatch.findOne({
    where: { status: { [Op.in]: QUEUE_ELIGIBLE_STATUSES } },
    order: [['createdAt', 'ASC']],
  });
  const oldestQueuedItemAgeSeconds = oldest ? Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 1000) : 0;
  return {
    queueDepth,
    // consumerLagSeconds: not tracked (no worker-heartbeat mechanism this
    // phase) — always 0, documented gap.
    consumerLagSeconds: 0,
    deadLetterCount,
    oldestQueuedItemAgeSeconds,
  };
}

// --- Domain event consumption (Complaint -> Notification) --------------------

// Complaint's own EVENT_TYPES (src/services/complaint.service.js) — the
// actual eventType strings already published into notification_event by
// complaint.repository.js#publishEvent. See CURRENT_STATE.md re: the
// pre-existing seed-notification-templates.js seeder using illustrative
// names (ComplaintRegistered/StatusChanged/SLABreaching) that don't match
// these; this module's own seeder targets the real values below.
const COMPLAINT_EVENT_RECIPIENTS = {
  ComplaintCreated: ['citizen'],
  ComplaintAssigned: ['citizen', 'officer'],
  ComplaintResolved: ['citizen'],
  ComplaintClosed: ['citizen'],
  ComplaintReopened: ['citizen'],
  CitizenFeedbackReceived: ['officer'],
};

async function resolveComplaintRecipients(complaint, roles) {
  const recipients = [];
  if (roles.includes('citizen') && complaint.citizenId) {
    const profile = await CitizenProfile.findByPk(complaint.citizenId);
    if (profile) recipients.push({ userId: profile.userId, languageCode: profile.preferredLanguage || 'en', channels: ['in_app', 'sms'] });
  }
  if (roles.includes('officer') && complaint.currentOfficerId) {
    const profile = await StaffProfile.findByPk(complaint.currentOfficerId);
    if (profile) recipients.push({ userId: profile.userId, languageCode: 'en', channels: ['in_app'] });
  }
  return recipients;
}

// Fans out unconsumed notification_event rows (published by
// src/repositories/complaint.repository.js#publishEvent) into
// notification_dispatch rows — "Create notification jobs from these
// events." Idempotent: repo.findUnconsumedEvents only returns events with
// zero existing dispatch rows, so a repeated call is a no-op for
// already-processed events. Invoked by src/jobs/eventConsumer.job.js's
// repeatable BullMQ job, and callable directly (as here) for tests/manual
// triggers.
async function consumeDomainEvents(limit = 50) {
  const events = await repo.findUnconsumedEvents(limit);
  let dispatchCount = 0;
  for (const event of events) {
    const roles = COMPLAINT_EVENT_RECIPIENTS[event.eventType];
    if (!roles) continue; // not a Complaint lifecycle event this module knows how to fan out
    const complaint = event.complaintId ? await repo.findComplaintById(event.complaintId) : null;
    if (!complaint) continue;
    const recipients = await resolveComplaintRecipients(complaint, roles);
    const variables = { trackingId: complaint.trackingId, ...event.payloadSummary };
    for (const recipient of recipients) {
      for (const channel of recipient.channels) {
        try {
          await createDispatch({
            tenantId: event.tenantId,
            eventType: event.eventType,
            channel,
            languageCode: recipient.languageCode,
            recipientUserId: recipient.userId,
            variables,
            complaintId: complaint.id,
            existingEvent: event,
          });
          dispatchCount += 1;
        } catch (err) {
          // No template configured for this (eventType, channel, language)
          // combination yet, or the recipient disabled the channel — skip
          // this one dispatch, not the whole event (other recipients/
          // channels for the same event still proceed).
          logger.warn('Domain-event fan-out skipped one channel/recipient', {
            error: err.message,
            eventId: event.id,
            eventType: event.eventType,
            channel,
          });
        }
      }
    }
  }
  return { eventsProcessed: events.length, dispatchesCreated: dispatchCount };
}

module.exports = {
  sendSms,
  getSmsStatus,
  testSendSms,
  sendEmail,
  getEmailStatus,
  testSendEmail,
  sendWhatsapp,
  getWhatsappStatus,
  testSendWhatsapp,
  sendPush,
  getPushStatus,
  testSendPush,
  listInApp,
  getInApp,
  markInAppRead,
  markAllInAppRead,
  getUnreadCount,
  listTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplateVersions,
  previewTemplate,
  templateTestSend,
  submitTemplateForApproval,
  recordTemplateApprovalDecision,
  getMyPreferences,
  updateMyPreferences,
  getUserPreferences,
  setEmergencyOverride,
  listQueue,
  getQueueItem,
  scheduleNotification,
  cancelQueued,
  listDeadLetter,
  listHistory,
  getHistoryDetail,
  exportHistory,
  retryNotification,
  bulkRetry,
  getRetryHistory,
  listProviders,
  getProvider,
  testProviderConnectivity,
  createBroadcast,
  listBroadcasts,
  getBroadcastStatus,
  cancelBroadcast,
  createBulkJob,
  getBulkJobStatus,
  cancelBulkJob,
  getAnalyticsSummary,
  getProviderPerformanceAnalytics,
  getRetryStatistics,
  getServiceHealth,
  getProviderHealthDetail,
  getQueueHealth,
  consumeDomainEvents,
  renderForDispatch,
  tenantIdOf,
};
