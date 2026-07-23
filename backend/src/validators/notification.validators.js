'use strict';

// express-validator chains for the Notification module (docs/notification.yaml),
// one named export per operationId, run through src/middleware/validate.js.
const { body, param, query } = require('express-validator');

const LANGUAGE_CODES = ['ta', 'en'];
const PRIORITIES = ['normal', 'high', 'emergency'];
const PUSH_CHANNELS = ['push_mobile', 'push_web', 'push_browser'];
const TEMPLATE_CHANNELS = ['sms', 'email', 'whatsapp', 'push_mobile', 'push_web', 'push_browser', 'in_app'];
const PROVIDER_TYPES = ['sms', 'email', 'whatsapp', 'push'];

const idParam = (name) =>
  param(name)
    .exists()
    .withMessage({ issue: 'REQUIRED', message: `${name} is required.` })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` })
    .toInt();

const limitQuery = (max = 100, def = 20) =>
  query('limit')
    .optional()
    .isInt({ min: 1, max })
    .withMessage({ issue: 'INVALID_RANGE', message: `limit must be between 1 and ${max}.` })
    .toInt()
    .default(def);

const cursorQuery = () => query('cursor').optional().isString();

const variablesBody = () =>
  body('variables')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'variables is required.' })
    .bail()
    .isObject()
    .withMessage({ issue: 'INVALID_TYPE', message: 'variables must be an object.' });

const recipientUserIdBody = () =>
  body('recipientUserId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'recipientUserId is required.' })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'recipientUserId must be a positive integer id.' });

const templateKeyBody = () =>
  body('templateKey')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'templateKey is required.' })
    .bail()
    .isString();

// --- 8.2-8.4 SMS/Email/WhatsApp send ------------------------------------------
const channelSend = [
  recipientUserIdBody(),
  templateKeyBody(),
  body('languageCode').optional().isIn(LANGUAGE_CODES),
  variablesBody(),
  body('priority').optional().isIn(PRIORITIES),
];
const channelStatus = [idParam('notificationDispatchId')];

const smsSend = channelSend;
const smsStatus = channelStatus;
const smsTestSend = [
  templateKeyBody(),
  body('languageCode').exists().isIn(LANGUAGE_CODES),
  body('testMobileNumber').exists().isString().withMessage({ issue: 'REQUIRED', message: 'testMobileNumber is required.' }),
  variablesBody(),
];

const emailSend = [
  recipientUserIdBody(),
  templateKeyBody(),
  body('languageCode').optional().isIn(LANGUAGE_CODES),
  variablesBody(),
  body('attachmentFileAssetIds').optional().isArray(),
  body('priority').optional().isIn(PRIORITIES),
];
const emailStatus = channelStatus;
const emailTestSend = [
  templateKeyBody(),
  body('languageCode').exists().isIn(LANGUAGE_CODES),
  body('testEmailAddress').exists().isEmail().withMessage({ issue: 'INVALID_FORMAT', message: 'testEmailAddress must be a valid email address.' }),
  variablesBody(),
];

const whatsappSend = channelSend;
const whatsappStatus = channelStatus;
const whatsappTestSend = smsTestSend;

// --- 8.5 Push ------------------------------------------------------------------
const pushSend = [
  recipientUserIdBody(),
  body('channel').exists().isIn(PUSH_CHANNELS),
  templateKeyBody(),
  body('languageCode').optional().isIn(LANGUAGE_CODES),
  variablesBody(),
  body('deepLinkUrl').optional().isString(),
  body('priority').optional().isIn(PRIORITIES),
];
const pushStatus = channelStatus;
const pushTestSend = [
  templateKeyBody(),
  body('languageCode').exists().isIn(LANGUAGE_CODES),
  body('testDeviceToken').exists().isString(),
  body('channel').exists().isIn(PUSH_CHANNELS),
  variablesBody(),
];

// --- 8.6 In-App --------------------------------------------------------------
const inAppList = [
  query('status').optional().isIn(['unread', 'read', 'all']),
  cursorQuery(),
  limitQuery(),
];
const inAppGet = [idParam('notificationDispatchId')];
const inAppMarkRead = [idParam('notificationDispatchId')];

// --- 8.7 Templates -------------------------------------------------------------
const templatesList = [
  query('eventType').optional().isString(),
  query('channel').optional().isIn(TEMPLATE_CHANNELS),
  query('languageCode').optional().isIn(LANGUAGE_CODES),
  query('approvalStatus').optional().isIn(['draft', 'pending_approval', 'approved', 'rejected']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('size').optional().isInt({ min: 1, max: 100 }).toInt(),
];
const templateCreate = [
  body('eventType').exists().isString(),
  body('channel').exists().isIn(TEMPLATE_CHANNELS),
  body('languageCode').exists().isIn(LANGUAGE_CODES),
  body('bodyTemplate').exists().isString().isLength({ min: 1 }),
  body('htmlBodyTemplate').optional().isString(),
  body('subjectTemplate').optional().isString(),
];
const templateGet = [idParam('templateId')];
const templateUpdate = [
  idParam('templateId'),
  body('expectedVersion').exists().isInt({ min: 1 }).withMessage({ issue: 'REQUIRED', message: 'expectedVersion is required.' }).toInt(),
  body('bodyTemplate').optional().isString(),
  body('htmlBodyTemplate').optional().isString(),
  body('subjectTemplate').optional().isString(),
];
const templateDelete = [idParam('templateId')];
const templateVersions = [
  idParam('templateId'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('size').optional().isInt({ min: 1, max: 100 }).toInt(),
];
const templatePreview = [
  idParam('templateId'),
  body('sampleVariables').exists().isObject(),
];
const templateTestSend = [
  idParam('templateId'),
  body('testRecipient').exists().isString(),
  variablesBody(),
];
const templateSubmitForApproval = [idParam('templateId'), body('submissionNote').optional().isString()];
const templateApprovalDecision = [
  idParam('templateId'),
  body('decision').exists().isIn(['approved', 'rejected']),
  body('reviewNote').optional().isString(),
];

// --- 8.8 Preferences ------------------------------------------------------------
const preferencesUpdate = [
  body('expectedVersion').exists().isInt({ min: 1 }).withMessage({ issue: 'REQUIRED', message: 'expectedVersion is required.' }).toInt(),
  body('channels').optional().isArray(),
  body('quietHours').optional().isObject(),
  body('languageCode').optional().isIn(LANGUAGE_CODES),
  body('categoryOptOuts').optional().isArray(),
];
const userIdParam = [idParam('userId')];
const emergencyOverride = [
  idParam('userId'),
  templateKeyBody(),
  body('channel').exists().isIn(['sms', 'email', 'whatsapp', 'push_mobile', 'push_web', 'push_browser']),
  variablesBody(),
  body('justification').exists().isString().isLength({ min: 10 }).withMessage({ issue: 'INVALID_LENGTH', message: 'justification must be at least 10 characters.' }),
];

// --- 8.9 Queue -------------------------------------------------------------
const queueList = [query('channel').optional().isString(), query('priority').optional().isIn(PRIORITIES), cursorQuery(), limitQuery(200, 50)];
const queueItem = [idParam('notificationDispatchId')];
const schedule = [
  recipientUserIdBody(),
  body('channel').exists().isString(),
  templateKeyBody(),
  variablesBody(),
  body('scheduledAt').optional().isISO8601(),
  body('delaySeconds').optional().isInt({ min: 1 }),
];
const cancelQueued = [idParam('notificationDispatchId'), body('reason').optional().isString()];
const deadLetterList = [query('channel').optional().isString(), cursorQuery(), limitQuery(200, 50)];

// --- 8.10 History ------------------------------------------------------------
const historyList = [
  query('recipientUserId').optional().isInt({ min: 1 }),
  query('complaintId').optional().isInt({ min: 1 }),
  query('channel').optional().isString(),
  query('status').optional().isString(),
  cursorQuery(),
  limitQuery(),
];
const historyDetail = [idParam('notificationDispatchId')];
const historyExport = [query('format').exists().isIn(['csv', 'pdf'])];

// --- 8.11 Retry --------------------------------------------------------------
const retry = [idParam('notificationDispatchId')];
const bulkRetryValidator = [
  body('channel').optional().isString(),
  body('filter').exists().isObject(),
  body('filter.status').exists().isIn(['failed', 'dead_letter']),
];
const retryHistory = [idParam('notificationDispatchId')];

// --- 8.12 Providers ----------------------------------------------------------
const providersList = [query('channel').optional().isIn(PROVIDER_TYPES)];
const providerGet = [param('providerType').exists().isIn(PROVIDER_TYPES)];
const providerTest = [param('providerType').exists().isIn(PROVIDER_TYPES)];

// --- 8.13 Broadcast ----------------------------------------------------------
const broadcastCreate = [
  body('scopeType').exists().isIn(['ward', 'zone', 'district', 'department', 'tenant']),
  body('scopeId').optional().isInt({ min: 1 }),
  body('channels').exists().isArray({ min: 1 }),
  templateKeyBody(),
  variablesBody(),
  body('priority').optional().isIn(PRIORITIES),
];
const broadcastList = [query('scopeType').optional().isString(), query('status').optional().isString(), cursorQuery(), limitQuery()];
const broadcastGet = [idParam('broadcastId')];
const broadcastCancel = [
  idParam('broadcastId'),
  body('reason').exists().isString(),
  body('expectedStatus').exists().isIn(['queued', 'in_progress']),
];

// --- 8.14 Bulk ---------------------------------------------------------------
const bulkCreate = [
  body('recipientUserIds').exists().isArray({ min: 1, max: 5000 }),
  body('channel').exists().isString(),
  templateKeyBody(),
  variablesBody(),
];
const bulkGet = [idParam('bulkJobId')];
const bulkCancel = [
  idParam('bulkJobId'),
  body('reason').exists().isString(),
  body('expectedStatus').exists().isIn(['queued', 'in_progress']),
];

// --- 8.15 Analytics ----------------------------------------------------------
const analyticsSummary = [
  query('channel').optional().isString(),
  query('departmentId').optional().isInt({ min: 1 }),
  query('periodStart').exists().isISO8601(),
  query('periodEnd').exists().isISO8601(),
];
const analyticsProviders = [
  query('channel').exists().isString(),
  query('periodStart').exists().isISO8601(),
  query('periodEnd').exists().isISO8601(),
];
const analyticsRetries = [
  query('channel').optional().isString(),
  query('periodStart').exists().isISO8601(),
  query('periodEnd').exists().isISO8601(),
];

// --- 8.16 Health -------------------------------------------------------------
const healthProviders = [query('channel').optional().isIn(PROVIDER_TYPES)];

module.exports = {
  smsSend,
  smsStatus,
  smsTestSend,
  emailSend,
  emailStatus,
  emailTestSend,
  whatsappSend,
  whatsappStatus,
  whatsappTestSend,
  pushSend,
  pushStatus,
  pushTestSend,
  inAppList,
  inAppGet,
  inAppMarkRead,
  templatesList,
  templateCreate,
  templateGet,
  templateUpdate,
  templateDelete,
  templateVersions,
  templatePreview,
  templateTestSend,
  templateSubmitForApproval,
  templateApprovalDecision,
  preferencesUpdate,
  userIdParam,
  emergencyOverride,
  queueList,
  queueItem,
  schedule,
  cancelQueued,
  deadLetterList,
  historyList,
  historyDetail,
  historyExport,
  retry,
  bulkRetryValidator,
  retryHistory,
  providersList,
  providerGet,
  providerTest,
  broadcastCreate,
  broadcastList,
  broadcastGet,
  broadcastCancel,
  bulkCreate,
  bulkGet,
  bulkCancel,
  analyticsSummary,
  analyticsProviders,
  analyticsRetries,
  healthProviders,
};
