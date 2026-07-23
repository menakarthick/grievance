'use strict';

// Response-shaping layer for the Notification module. Several fields the
// approved 08-Notification-APIs.md/notification.yaml document
// (approvalStatus, htmlBodyTemplate, quietHours, categoryOptOuts,
// preference version, dispatch priority/scheduledAt/lastFailureReason) have
// no backing column in the approved v1.0 schema
// (notification_template_config / notification_dispatch /
// notification_preference — DATABASE_DESIGN.md §7/§11). Rather than
// inventing columns, this layer returns the closest honest value the real
// schema supports and documents each gap inline — see CURRENT_STATE.md for
// the consolidated list.

const SUBJECT_PREFIX = 'SUBJECT::';

// notification_template_config.bodyTemplate is the only text column
// available (Section 7) — an email template's subject is packed into the
// same column behind a documented marker rather than inventing a
// subjectTemplate column, the same "reuse an existing column with a
// documented convention" precedent as Complaint's closureReasonId
// (src/services/complaint.service.js#createClosure).
function encodeBodyTemplate(bodyTemplate, subjectTemplate) {
  if (!subjectTemplate) return bodyTemplate;
  return `${SUBJECT_PREFIX}${subjectTemplate}\n${bodyTemplate}`;
}

function decodeBodyTemplate(stored) {
  if (!stored || !stored.startsWith(SUBJECT_PREFIX)) return { subjectTemplate: null, bodyTemplate: stored };
  const newlineIndex = stored.indexOf('\n');
  if (newlineIndex === -1) return { subjectTemplate: stored.slice(SUBJECT_PREFIX.length), bodyTemplate: '' };
  return {
    subjectTemplate: stored.slice(SUBJECT_PREFIX.length, newlineIndex),
    bodyTemplate: stored.slice(newlineIndex + 1),
  };
}

function shapeDispatchAck(dispatch) {
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    status: dispatch.status,
    providerMessageId: dispatch.providerMessageId ?? undefined,
  };
}

function shapeTestDispatchAck(dispatch) {
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    status: dispatch.status,
    isTestSend: true,
  };
}

function shapeChannelStatusDetail(dispatch) {
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    status: dispatch.status,
    providerMessageId: dispatch.providerMessageId,
    sentAt: dispatch.sentAt,
    deliveredAt: dispatch.deliveredAt,
    // openedAt/readAt/clickedAt: no distinct columns exist beyond
    // sentAt/deliveredAt (Section 11) — read-receipt granularity finer than
    // "delivered" isn't persisted this phase.
    openedAt: null,
    readAt: null,
    clickedAt: null,
  };
}

// `rendered` ({ subject, body }) is computed by the service layer from the
// template's bodyTemplate + the parent notification_event.payloadSummary's
// stored `variables` (reused JSON column, not a new "rendered content"
// column — see src/services/notification.service.js#renderForDispatch).
function shapeInAppSummary(dispatch, rendered = {}) {
  return {
    notificationDispatchId: String(dispatch.id),
    templateKey: dispatch.templateConfig?.eventType ?? null,
    renderedTitle: rendered.subject ?? dispatch.templateConfig?.eventType ?? null,
    renderedBody: rendered.body ?? null,
    status: dispatch.status,
    createdAt: dispatch.createdAt,
    readAt: dispatch.status === 'read' ? dispatch.updatedAt : null,
  };
}

function shapeInAppDetail(dispatch, rendered = {}) {
  return {
    ...shapeInAppSummary(dispatch, rendered),
    linkedEntityType: dispatch.notificationEvent?.complaintId ? 'complaint' : null,
    linkedEntityId: dispatch.notificationEvent?.complaintId ? String(dispatch.notificationEvent.complaintId) : null,
  };
}

function shapeTemplateSummary(template) {
  return {
    id: String(template.id),
    eventType: template.eventType,
    channel: template.channel,
    languageCode: template.language,
    version: template.version,
    // approvalStatus: notification_template_config has no approvalStatus
    // column (Section 7) — every template is immediately usable in this
    // phase (no draft/pending gate persisted); see
    // src/services/notification.service.js#submitTemplateForApproval.
    approvalStatus: 'approved',
    isActive: template.deletedAt == null,
    createdAt: template.createdAt,
  };
}

function shapeTemplateDetail(template) {
  const { subjectTemplate, bodyTemplate } = decodeBodyTemplate(template.bodyTemplate);
  return {
    ...shapeTemplateSummary(template),
    bodyTemplate,
    subjectTemplate,
    // htmlBodyTemplate: no column exists this phase — always null.
    htmlBodyTemplate: null,
    updatedAt: template.updatedAt,
  };
}

function shapeTemplateVersion(template) {
  return {
    version: template.version,
    approvalStatus: 'approved',
    changedBy: template.updatedBy ? { id: String(template.updatedBy), name: null } : null,
    effectiveFrom: template.createdAt,
    effectiveTo: null,
  };
}

function shapePreferenceProfile(preferences, { languageCode = 'en' } = {}) {
  return {
    channels: preferences.map((p) => ({ channel: p.channel, isEnabled: p.isEnabled })),
    // quietHours/categoryOptOuts: no backing columns on notification_preference
    // (Section 11) — always empty/null this phase.
    quietHours: null,
    languageCode,
    categoryOptOuts: [],
    // version: no optimistic-locking column exists; a static placeholder —
    // see src/services/notification.service.js#updateMyPreferences.
    version: 1,
  };
}

function shapeQueueItem(dispatch) {
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    // priority: no column exists (Section 11) — every dispatch is
    // reported at 'normal' this phase; see CURRENT_STATE.md.
    priority: 'normal',
    status: dispatch.status,
    queuedAt: dispatch.createdAt,
    // scheduledAt: genuinely Redis/BullMQ-resident by the spec's own design
    // (§8.1.5 "Queue state itself is Redis-resident") — not persisted to
    // MySQL, so a read after creation cannot recover it here.
    scheduledAt: null,
  };
}

function shapeQueueItemDetail(dispatch) {
  return { ...shapeQueueItem(dispatch), retryCount: dispatch.retryCount };
}

function shapeDeadLetterItem(dispatch) {
  return {
    notificationDispatchId: String(dispatch.id),
    channel: dispatch.channel,
    retryCount: dispatch.retryCount,
    // lastFailureReason: no column exists on notification_dispatch (Section
    // 11) to persist a free-text failure reason — always null this phase.
    lastFailureReason: null,
    lastAttemptAt: dispatch.updatedAt,
  };
}

function shapeHistoryItem(dispatch) {
  return {
    id: String(dispatch.id),
    channel: dispatch.channel,
    templateKey: dispatch.templateConfig?.eventType ?? null,
    status: dispatch.status,
    providerMessageId: dispatch.providerMessageId,
    sentAt: dispatch.sentAt,
    deliveredAt: dispatch.deliveredAt,
  };
}

function shapeHistoryDetail(dispatch, rendered = {}) {
  return {
    id: String(dispatch.id),
    channel: dispatch.channel,
    templateKey: dispatch.templateConfig?.eventType ?? null,
    renderedSubject: rendered.subject ?? null,
    renderedBody: rendered.body ?? null,
    status: dispatch.status,
    retryCount: dispatch.retryCount,
    sentAt: dispatch.sentAt,
    deliveredAt: dispatch.deliveredAt,
    readAt: dispatch.status === 'read' ? dispatch.updatedAt : null,
    linkedComplaintId: dispatch.notificationEvent?.complaintId ? String(dispatch.notificationEvent.complaintId) : null,
  };
}

// Retry attempts: notification_dispatch has only a single retry_count
// integer (Section 11), not a per-attempt history table — this synthesizes
// a one-entry-per-current-state list rather than a true audit trail; see
// CURRENT_STATE.md.
function shapeRetryHistory(dispatch) {
  if (dispatch.retryCount === 0) return [];
  return [
    {
      attemptNumber: dispatch.retryCount,
      attemptedAt: dispatch.updatedAt,
      outcome: dispatch.status,
      failureReason: dispatch.status === 'failed' || dispatch.status === 'dead_letter' ? 'Provider delivery failed.' : null,
    },
  ];
}

function shapeProviderSummary(provider) {
  return {
    providerType: provider.providerType,
    providerName: provider.providerName,
    isActive: provider.isActive,
    updatedAt: provider.updatedAt,
  };
}

module.exports = {
  encodeBodyTemplate,
  decodeBodyTemplate,
  shapeDispatchAck,
  shapeTestDispatchAck,
  shapeChannelStatusDetail,
  shapeInAppSummary,
  shapeInAppDetail,
  shapeTemplateSummary,
  shapeTemplateDetail,
  shapeTemplateVersion,
  shapePreferenceProfile,
  shapeQueueItem,
  shapeQueueItemDetail,
  shapeDeadLetterItem,
  shapeHistoryItem,
  shapeHistoryDetail,
  shapeRetryHistory,
  shapeProviderSummary,
};
