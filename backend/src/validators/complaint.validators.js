'use strict';

// express-validator chains for the Complaint module (docs/complaint.yaml),
// one named export per operationId, run through src/middleware/validate.js.
const { body, param, query } = require('express-validator');

const LANGUAGE_CODES = ['ta', 'en'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const TRACKING_ID_PATTERN = /^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$/;

const idParam = (name) =>
  param(name)
    .exists()
    .withMessage({ issue: 'REQUIRED', message: `${name} is required.` })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` })
    .toInt();

const idQuery = (name) =>
  query(name)
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` });

const limitQuery = () =>
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage({ issue: 'INVALID_RANGE', message: 'limit must be between 1 and 100.' })
    .toInt();

const cursorQuery = () => query('cursor').optional().isString();

// --- 4.1 Register Complaint ---
const complaintRegister = [
  body('description')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'description is required.' })
    .bail()
    .isString()
    .isLength({ min: 10, max: 5000 })
    .withMessage({ issue: 'INVALID_LENGTH', message: 'description must be 10-5000 characters.' }),
  body('categoryId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'categoryId is required.' })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'categoryId must be a positive integer id.' })
    .toInt(),
  body('location')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'location is required.' })
    .bail()
    .isObject()
    .custom((location) => Boolean(location.wardId || location.addressText))
    .withMessage({ issue: 'REQUIRED', message: 'location.wardId or location.addressText is required.' }),
  body('location.latitude').optional().isFloat(),
  body('location.longitude').optional().isFloat(),
  body('location.wardId').optional().isInt({ min: 1 }).toInt(),
  body('location.addressText').optional().isString(),
  body('languageCode')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'languageCode is required.' })
    .bail()
    .isIn(LANGUAGE_CODES)
    .withMessage({ issue: 'INVALID_VALUE', message: `languageCode must be one of: ${LANGUAGE_CODES.join(', ')}.` }),
];

// --- 4.2 Register Voice Complaint --- (multipart; no JSON body to validate)
const complaintRegisterVoice = [];

// --- 4.3 Upload Complaint Attachment --- (multipart; file itself is
// validated in the service layer via magic-byte inspection)
const complaintUploadAttachment = [
  idParam('complaintId'),
  body('assetCategory')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'assetCategory is required.' })
    .bail()
    .isString(),
];

// --- 4.4 Update Complaint ---
const complaintUpdate = [
  idParam('complaintId'),
  body('categoryId').optional().isInt({ min: 1 }).toInt(),
  body('priority').optional().isIn(PRIORITIES).withMessage({ issue: 'INVALID_VALUE', message: `priority must be one of: ${PRIORITIES.join(', ')}.` }),
  body('severity').optional().isString(),
];

// --- 4.5 Complaint Details ---
const complaintGetDetails = [idParam('complaintId')];

// --- 4.6 Complaint Timeline ---
const complaintGetTimeline = [idParam('complaintId'), cursorQuery(), limitQuery()];

// --- 4.7 Complaint Tracking ---
const complaintTrack = [
  param('trackingId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'trackingId is required.' })
    .bail()
    .matches(TRACKING_ID_PATTERN)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'trackingId is malformed.' }),
];

// --- 4.8 Complaint List ---
const complaintList = [
  query('q').optional().isString(),
  idQuery('statusId'),
  idQuery('departmentId'),
  idQuery('categoryId'),
  query('priority').optional().isIn(PRIORITIES),
  query('filter[createdAt][gte]').optional().isISO8601(),
  query('filter[createdAt][lte]').optional().isISO8601(),
  query('filter[slaDueAt][lte]').optional().isISO8601(),
  cursorQuery(),
  limitQuery(),
];

// --- 4.9 Complaint Assignment ---
const complaintCreateAssignment = [
  idParam('complaintId'),
  body('officerId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'officerId is required.' })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'officerId must be a positive integer id.' })
    .toInt(),
  body('reason').optional().isString(),
];

// --- 4.10 Complaint Resolution ---
const complaintCreateResolution = [
  idParam('complaintId'),
  body('resolutionNote')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'resolutionNote is required.' })
    .bail()
    .isString()
    .isLength({ min: 10, max: 2000 })
    .withMessage({ issue: 'INVALID_LENGTH', message: 'resolutionNote must be 10-2000 characters.' }),
  body('resolutionFileAssetIds').optional().isArray(),
];

// --- 4.11 Complaint Closure ---
const complaintCreateClosure = [
  idParam('complaintId'),
  body('closureReasonId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'closureReasonId is required.' })
    .bail()
    .isString(),
  body('remarks').optional().isString(),
];

// --- 4.12 Citizen Feedback ---
const complaintSubmitFeedback = [
  idParam('complaintId'),
  body('rating')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'rating is required.' })
    .bail()
    .isInt({ min: 1, max: 5 })
    .withMessage({ issue: 'INVALID_RANGE', message: 'rating must be an integer 1-5.' })
    .toInt(),
  body('comment').optional().isString(),
];

// --- 4.13 Complaint Reopen ---
const complaintReopen = [
  idParam('complaintId'),
  body('reason')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'reason is required.' })
    .bail()
    .isString()
    .isLength({ min: 10, max: 1000 })
    .withMessage({ issue: 'INVALID_LENGTH', message: 'reason must be 10-1000 characters.' }),
];

module.exports = {
  complaintRegister,
  complaintRegisterVoice,
  complaintUploadAttachment,
  complaintUpdate,
  complaintGetDetails,
  complaintGetTimeline,
  complaintTrack,
  complaintList,
  complaintCreateAssignment,
  complaintCreateResolution,
  complaintCreateClosure,
  complaintSubmitFeedback,
  complaintReopen,
};
