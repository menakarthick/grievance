'use strict';

const { Router } = require('express');
const controller = require('../../controllers/notification.controller');
const validators = require('../../validators/notification.validators');
const { validate } = require('../../middleware/validate');
const { authenticate, requireRole, requireTenant } = require('../../middleware/auth');
const { idempotent } = require('../../middleware/idempotency');
const policy = require('../../policies/notification.policy');

// Notification module routes (docs/notification.yaml). Unlike most other
// modules, this one has FOUR distinct root prefixes with no shared parent
// (/notifications, /notification-templates, /notification-preferences,
// /notification-providers) — mounted at the router root by
// routes/v1/index.js, the same "no common path prefix" pattern already
// used for Administration.
const router = Router();

router.use(authenticate, requireTenant());

// docs/ROUTE-REGISTRATION-ORDER.md's Notification section: every literal/
// mixed route under /notifications/ before the two fully-generic
// {notificationDispatchId}/retry and /retries routes.

// --- 8.2 SMS -----------------------------------------------------------------
router.post('/notifications/sms', requireRole(...policy.send), idempotent(), validators.smsSend, validate, controller.sendSms);
router.get('/notifications/sms/:notificationDispatchId', requireRole(...policy.getStatus), validators.smsStatus, validate, controller.getSmsStatus);
router.post('/notifications/sms/test', requireRole(...policy.testSend), validators.smsTestSend, validate, controller.testSendSms);

// --- 8.3 Email ---------------------------------------------------------------
router.post('/notifications/email', requireRole(...policy.send), idempotent(), validators.emailSend, validate, controller.sendEmail);
router.get('/notifications/email/:notificationDispatchId', requireRole(...policy.getStatus), validators.emailStatus, validate, controller.getEmailStatus);
router.post('/notifications/email/test', requireRole(...policy.testSend), validators.emailTestSend, validate, controller.testSendEmail);

// --- 8.4 WhatsApp --------------------------------------------------------------
router.post('/notifications/whatsapp', requireRole(...policy.send), idempotent(), validators.whatsappSend, validate, controller.sendWhatsapp);
router.get('/notifications/whatsapp/:notificationDispatchId', requireRole(...policy.getStatus), validators.whatsappStatus, validate, controller.getWhatsappStatus);
router.post('/notifications/whatsapp/test', requireRole(...policy.testSend), validators.whatsappTestSend, validate, controller.testSendWhatsapp);

// --- 8.5 Push ------------------------------------------------------------------
router.post('/notifications/push', requireRole(...policy.send), idempotent(), validators.pushSend, validate, controller.sendPush);
router.get('/notifications/push/:notificationDispatchId', requireRole(...policy.getStatus), validators.pushStatus, validate, controller.getPushStatus);
router.post('/notifications/push/test', requireRole(...policy.testSend), validators.pushTestSend, validate, controller.testSendPush);

// --- 8.6 In-App ----------------------------------------------------------------
router.get('/notifications/in-app', requireRole(...policy.inApp), validators.inAppList, validate, controller.listInApp);
router.get('/notifications/in-app/unread-count', requireRole(...policy.inApp), controller.getUnreadCount);
router.post('/notifications/in-app/read-all', requireRole(...policy.inApp), idempotent(), controller.markAllInAppRead);
router.get('/notifications/in-app/:notificationDispatchId', requireRole(...policy.inApp), validators.inAppGet, validate, controller.getInApp);
router.patch('/notifications/in-app/:notificationDispatchId/read', requireRole(...policy.inApp), validators.inAppMarkRead, validate, controller.markInAppRead);

// --- 8.9 Queue (registered before /:notificationDispatchId/retry family) ----
router.get('/notifications/queue/dead-letter', requireRole(...policy.queue), validators.deadLetterList, validate, controller.listDeadLetter);
router.get('/notifications/queue/:notificationDispatchId', requireRole(...policy.queue), validators.queueItem, validate, controller.getQueueItem);
router.get('/notifications/queue', requireRole(...policy.queue), validators.queueList, validate, controller.listQueue);
router.post('/notifications/schedule', requireRole(...policy.queue), idempotent(), validators.schedule, validate, controller.scheduleNotification);
router.post(
  '/notifications/queue/:notificationDispatchId/cancel',
  requireRole(...policy.queue),
  validators.cancelQueued,
  validate,
  controller.cancelQueued,
);

// --- 8.10 History ------------------------------------------------------------
router.get('/notifications/history/export', requireRole(...policy.historyExport), validators.historyExport, validate, controller.exportHistory);
router.get(
  '/notifications/history/:notificationDispatchId',
  requireRole(...policy.historyRead),
  validators.historyDetail,
  validate,
  controller.getHistoryDetail,
);
router.get('/notifications/history', requireRole(...policy.historyRead), validators.historyList, validate, controller.listHistory);

// --- 8.13 Broadcast ----------------------------------------------------------
router.post('/notifications/broadcast', requireRole(...policy.broadcastCreate), idempotent(), validators.broadcastCreate, validate, controller.createBroadcast);
router.get('/notifications/broadcast', requireRole(...policy.broadcastRead), validators.broadcastList, validate, controller.listBroadcasts);
router.get('/notifications/broadcast/:broadcastId', requireRole(...policy.broadcastRead), validators.broadcastGet, validate, controller.getBroadcastStatus);
router.post(
  '/notifications/broadcast/:broadcastId/cancel',
  requireRole(...policy.broadcastCancel),
  validators.broadcastCancel,
  validate,
  controller.cancelBroadcast,
);

// --- 8.14 Bulk ---------------------------------------------------------------
router.post('/notifications/bulk', requireRole(...policy.bulk), idempotent(), validators.bulkCreate, validate, controller.createBulkJob);
router.get('/notifications/bulk/:bulkJobId', requireRole(...policy.bulk), validators.bulkGet, validate, controller.getBulkJobStatus);
router.post('/notifications/bulk/:bulkJobId/cancel', requireRole(...policy.bulk), validators.bulkCancel, validate, controller.cancelBulkJob);

// --- 8.11 Retry (bulk before the generic :notificationDispatchId family) ----
router.post('/notifications/retry/bulk', requireRole(...policy.retry), idempotent(), validators.bulkRetryValidator, validate, controller.bulkRetry);

// --- 8.15 Analytics (registered before the generic family too) -------------
router.get('/notifications/analytics/providers', requireRole(...policy.analyticsAdvanced), validators.analyticsProviders, validate, controller.getProviderPerformanceAnalytics);
router.get('/notifications/analytics/retries', requireRole(...policy.analyticsAdvanced), validators.analyticsRetries, validate, controller.getRetryStatistics);
router.get('/notifications/analytics', requireRole(...policy.analyticsSummary), validators.analyticsSummary, validate, controller.getAnalyticsSummary);

// --- 8.16 Health -------------------------------------------------------------
router.get('/notifications/health/providers', requireRole(...policy.healthService), validators.healthProviders, validate, controller.getProviderHealthDetail);
router.get('/notifications/health/queue', requireRole(...policy.healthQueue), controller.getQueueHealth);
router.get('/notifications/health', requireRole(...policy.healthService), controller.getServiceHealth);

// --- 8.11 Retry — the fully-generic {notificationDispatchId} family, last --
router.get('/notifications/:notificationDispatchId/retries', requireRole(...policy.retry), validators.retryHistory, validate, controller.getRetryHistory);
router.post('/notifications/:notificationDispatchId/retry', requireRole(...policy.retry), idempotent(), validators.retry, validate, controller.retryNotification);

// --- 8.7 Templates -----------------------------------------------------------
router.get('/notification-templates', requireRole(...policy.templateRead), validators.templatesList, validate, controller.listTemplates);
router.post('/notification-templates', requireRole(...policy.templateWrite), idempotent(), validators.templateCreate, validate, controller.createTemplate);
router.get('/notification-templates/:templateId/versions', requireRole(...policy.templateRead), validators.templateVersions, validate, controller.listTemplateVersions);
router.post('/notification-templates/:templateId/preview', requireRole(...policy.templateRead), validators.templatePreview, validate, controller.previewTemplate);
router.post('/notification-templates/:templateId/test-send', requireRole(...policy.templateWrite), validators.templateTestSend, validate, controller.templateTestSend);
router.post(
  '/notification-templates/:templateId/submit-for-approval',
  requireRole(...policy.templateRead),
  validators.templateSubmitForApproval,
  validate,
  controller.submitTemplateForApproval,
);
router.post(
  '/notification-templates/:templateId/approval-decision',
  requireRole(...policy.templateWrite),
  validators.templateApprovalDecision,
  validate,
  controller.recordTemplateApprovalDecision,
);
router.get('/notification-templates/:templateId', requireRole(...policy.templateRead), validators.templateGet, validate, controller.getTemplate);
router.patch('/notification-templates/:templateId', requireRole(...policy.templateWrite), validators.templateUpdate, validate, controller.updateTemplate);
router.delete('/notification-templates/:templateId', requireRole(...policy.templateWrite), validators.templateDelete, validate, controller.deleteTemplate);

// --- 8.8 Preferences ("me" before the generic {userId} family) -------------
router.get('/notification-preferences/me', requireRole(...policy.preferenceSelf), controller.getMyPreferences);
router.patch('/notification-preferences/me', requireRole(...policy.preferenceSelf), validators.preferencesUpdate, validate, controller.updateMyPreferences);
router.post(
  '/notification-preferences/:userId/emergency-override',
  requireRole(...policy.emergencyOverride),
  idempotent(),
  validators.emergencyOverride,
  validate,
  controller.setEmergencyOverride,
);
router.get('/notification-preferences/:userId', requireRole(...policy.preferenceAdminView), validators.userIdParam, validate, controller.getUserPreferences);

// --- 8.12 Providers ----------------------------------------------------------
router.get('/notification-providers', requireRole(...policy.providers), validators.providersList, validate, controller.listProviders);
router.get('/notification-providers/:providerType', requireRole(...policy.providers), validators.providerGet, validate, controller.getProvider);
router.post('/notification-providers/:providerType/test', requireRole(...policy.providers), validators.providerTest, validate, controller.testProviderConnectivity);

module.exports = router;
