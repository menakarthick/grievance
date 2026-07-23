'use strict';

// HTTP-layer handlers for the Notification module: parse the request, call
// src/services/notification.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/notification.yaml
// operationId.
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const service = require('../services/notification.service');

function parseLimit(req, fallback = 20) {
  const raw = parseInt(req.query.limit, 10);
  return Number.isNaN(raw) ? fallback : raw;
}

// --- 8.2 SMS -----------------------------------------------------------------
const sendSms = asyncHandler(async (req, res) => {
  const result = await service.sendSms(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getSmsStatus = asyncHandler(async (req, res) => {
  const result = await service.getSmsStatus(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const testSendSms = asyncHandler(async (req, res) => {
  const result = await service.testSendSms(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.3 Email ---------------------------------------------------------------
const sendEmail = asyncHandler(async (req, res) => {
  const result = await service.sendEmail(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getEmailStatus = asyncHandler(async (req, res) => {
  const result = await service.getEmailStatus(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const testSendEmail = asyncHandler(async (req, res) => {
  const result = await service.testSendEmail(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.4 WhatsApp --------------------------------------------------------------
const sendWhatsapp = asyncHandler(async (req, res) => {
  const result = await service.sendWhatsapp(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getWhatsappStatus = asyncHandler(async (req, res) => {
  const result = await service.getWhatsappStatus(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const testSendWhatsapp = asyncHandler(async (req, res) => {
  const result = await service.testSendWhatsapp(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.5 Push ------------------------------------------------------------------
const sendPush = asyncHandler(async (req, res) => {
  const result = await service.sendPush(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getPushStatus = asyncHandler(async (req, res) => {
  const result = await service.getPushStatus(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const testSendPush = asyncHandler(async (req, res) => {
  const result = await service.testSendPush(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.6 In-App ------------------------------------------------------------
const listInApp = asyncHandler(async (req, res) => {
  const result = await service.listInApp(req.user, {
    status: req.query.status || 'all',
    limit: parseLimit(req),
    cursor: req.query.cursor,
  });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});
const getInApp = asyncHandler(async (req, res) => {
  const result = await service.getInApp(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const markInAppRead = asyncHandler(async (req, res) => {
  const result = await service.markInAppRead(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const markAllInAppRead = asyncHandler(async (req, res) => {
  const result = await service.markAllInAppRead(req.user);
  sendSuccess(res, { data: result });
});
const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await service.getUnreadCount(req.user);
  sendSuccess(res, { data: result });
});

// --- 8.7 Templates -----------------------------------------------------------
const listTemplates = asyncHandler(async (req, res) => {
  const result = await service.listTemplates(req.user, {
    eventType: req.query.eventType,
    channel: req.query.channel,
    languageCode: req.query.languageCode,
    page: parseInt(req.query.page, 10) || 1,
    size: parseInt(req.query.size, 10) || 20,
  });
  sendSuccess(res, { data: result.data, meta: { pagination: result.meta } });
});
const createTemplate = asyncHandler(async (req, res) => {
  const result = await service.createTemplate(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getTemplate = asyncHandler(async (req, res) => {
  const result = await service.getTemplate(req.user, req.params.templateId);
  sendSuccess(res, { data: result });
});
const updateTemplate = asyncHandler(async (req, res) => {
  const result = await service.updateTemplate(req.user, req.params.templateId, req.body);
  sendSuccess(res, { data: result });
});
const deleteTemplate = asyncHandler(async (req, res) => {
  await service.deleteTemplate(req.user, req.params.templateId);
  res.status(204).end();
});
const listTemplateVersions = asyncHandler(async (req, res) => {
  const result = await service.listTemplateVersions(req.user, req.params.templateId, {
    page: parseInt(req.query.page, 10) || 1,
    size: parseInt(req.query.size, 10) || 20,
  });
  sendSuccess(res, { data: result.data });
});
const previewTemplate = asyncHandler(async (req, res) => {
  const result = await service.previewTemplate(req.user, req.params.templateId, req.body.sampleVariables);
  sendSuccess(res, { data: result });
});
const templateTestSend = asyncHandler(async (req, res) => {
  const result = await service.templateTestSend(req.user, req.params.templateId, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const submitTemplateForApproval = asyncHandler(async (req, res) => {
  const result = await service.submitTemplateForApproval(req.user, req.params.templateId, req.body);
  sendSuccess(res, { data: result });
});
const recordTemplateApprovalDecision = asyncHandler(async (req, res) => {
  const result = await service.recordTemplateApprovalDecision(req.user, req.params.templateId, req.body);
  sendSuccess(res, { data: result });
});

// --- 8.8 Preferences -----------------------------------------------------------
const getMyPreferences = asyncHandler(async (req, res) => {
  const result = await service.getMyPreferences(req.user);
  sendSuccess(res, { data: result });
});
const updateMyPreferences = asyncHandler(async (req, res) => {
  const result = await service.updateMyPreferences(req.user, req.body);
  sendSuccess(res, { data: result });
});
const getUserPreferences = asyncHandler(async (req, res) => {
  const result = await service.getUserPreferences(req.user, req.params.userId);
  sendSuccess(res, { data: result });
});
const setEmergencyOverride = asyncHandler(async (req, res) => {
  const result = await service.setEmergencyOverride(req.user, req.params.userId, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.9 Queue -----------------------------------------------------------------
const listQueue = asyncHandler(async (req, res) => {
  const result = await service.listQueue(req.user, { channel: req.query.channel, limit: parseLimit(req, 50), cursor: req.query.cursor });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});
const getQueueItem = asyncHandler(async (req, res) => {
  const result = await service.getQueueItem(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const scheduleNotification = asyncHandler(async (req, res) => {
  const result = await service.scheduleNotification(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const cancelQueued = asyncHandler(async (req, res) => {
  const result = await service.cancelQueued(req.user, req.params.notificationDispatchId, req.body?.reason);
  sendSuccess(res, { data: result });
});
const listDeadLetter = asyncHandler(async (req, res) => {
  const result = await service.listDeadLetter(req.user, { channel: req.query.channel, limit: parseLimit(req, 50), cursor: req.query.cursor });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});

// --- 8.10 History --------------------------------------------------------------
const listHistory = asyncHandler(async (req, res) => {
  const filter = req.query.filter || {};
  const result = await service.listHistory(req.user, {
    recipientUserId: req.query.recipientUserId,
    complaintId: req.query.complaintId,
    channel: req.query.channel,
    status: req.query.status,
    sentAtGte: filter.sentAt?.gte,
    sentAtLte: filter.sentAt?.lte,
    limit: parseLimit(req),
    cursor: req.query.cursor,
  });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});
const getHistoryDetail = asyncHandler(async (req, res) => {
  const result = await service.getHistoryDetail(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result });
});
const exportHistory = asyncHandler(async (req, res) => {
  const result = await service.exportHistory(req.user, req.query);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 8.11 Retry ------------------------------------------------------------
const retryNotification = asyncHandler(async (req, res) => {
  const result = await service.retryNotification(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { statusCode: 202, data: result });
});
const bulkRetry = asyncHandler(async (req, res) => {
  const result = await service.bulkRetry(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getRetryHistory = asyncHandler(async (req, res) => {
  const result = await service.getRetryHistory(req.user, req.params.notificationDispatchId);
  sendSuccess(res, { data: result.data });
});

// --- 8.12 Providers --------------------------------------------------------
const listProviders = asyncHandler(async (req, res) => {
  const result = await service.listProviders(req.user, req.query.channel);
  sendSuccess(res, { data: result.data });
});
const getProvider = asyncHandler(async (req, res) => {
  const result = await service.getProvider(req.user, req.params.providerType);
  sendSuccess(res, { data: result });
});
const testProviderConnectivity = asyncHandler(async (req, res) => {
  const result = await service.testProviderConnectivity(req.user, req.params.providerType);
  sendSuccess(res, { data: result });
});

// --- 8.13 Broadcast --------------------------------------------------------
const createBroadcast = asyncHandler(async (req, res) => {
  const result = await service.createBroadcast(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const listBroadcasts = asyncHandler(async (req, res) => {
  const result = await service.listBroadcasts(req.user, { limit: parseLimit(req) });
  sendSuccess(res, { data: result.data });
});
const getBroadcastStatus = asyncHandler(async (req, res) => {
  const result = await service.getBroadcastStatus(req.user, req.params.broadcastId);
  sendSuccess(res, { data: result });
});
const cancelBroadcast = asyncHandler(async (req, res) => {
  const result = await service.cancelBroadcast(req.user, req.params.broadcastId, req.body);
  sendSuccess(res, { data: result });
});

// --- 8.14 Bulk -------------------------------------------------------------
const createBulkJob = asyncHandler(async (req, res) => {
  const result = await service.createBulkJob(req.user, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});
const getBulkJobStatus = asyncHandler(async (req, res) => {
  const result = await service.getBulkJobStatus(req.user, req.params.bulkJobId);
  sendSuccess(res, { data: result });
});
const cancelBulkJob = asyncHandler(async (req, res) => {
  const result = await service.cancelBulkJob(req.user, req.params.bulkJobId, req.body);
  sendSuccess(res, { data: result });
});

// --- 8.15 Analytics --------------------------------------------------------
const getAnalyticsSummary = asyncHandler(async (req, res) => {
  const result = await service.getAnalyticsSummary(req.user, {
    channel: req.query.channel,
    periodStart: req.query.periodStart,
    periodEnd: req.query.periodEnd,
  });
  sendSuccess(res, { data: result });
});
const getProviderPerformanceAnalytics = asyncHandler(async (req, res) => {
  const result = await service.getProviderPerformanceAnalytics(req.user, {
    channel: req.query.channel,
    periodStart: req.query.periodStart,
    periodEnd: req.query.periodEnd,
  });
  sendSuccess(res, { data: result.data });
});
const getRetryStatistics = asyncHandler(async (req, res) => {
  const result = await service.getRetryStatistics(req.user, {
    channel: req.query.channel,
    periodStart: req.query.periodStart,
    periodEnd: req.query.periodEnd,
  });
  sendSuccess(res, { data: result });
});

// --- 8.16 Health -------------------------------------------------------------
const getServiceHealth = asyncHandler(async (req, res) => {
  const result = await service.getServiceHealth();
  sendSuccess(res, { data: result });
});
const getProviderHealthDetail = asyncHandler(async (req, res) => {
  const result = await service.getProviderHealthDetail(req.query.channel);
  sendSuccess(res, { data: result.data });
});
const getQueueHealth = asyncHandler(async (req, res) => {
  const result = await service.getQueueHealth();
  sendSuccess(res, { data: result });
});

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
};
