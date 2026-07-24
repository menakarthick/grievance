'use strict';

// express-validator chains for the File Management module (docs/file-management.yaml),
// one named export per operationId, run through src/middleware/validate.js.
const { body, param, query } = require('express-validator');
const { FILE_ASSET_CATEGORIES } = require('../database/constants');

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

// --- 11.1 Upload / Multipart --------------------------------------------------
const upload = [
  body('assetCategory').exists().isIn(FILE_ASSET_CATEGORIES),
  body('linkedEntityType').exists().isString(),
  body('linkedEntityId').exists().isInt({ min: 1 }),
];

const multipartInitiate = [
  body('fileName').exists().isString(),
  body('mimeType').exists().isString(),
  body('totalSizeBytes').exists().isInt({ min: 1 }).toInt(),
  body('assetCategory').exists().isIn(FILE_ASSET_CATEGORIES),
  body('linkedEntityType').exists().isString(),
  body('linkedEntityId').exists().isInt({ min: 1 }),
];

// This endpoint is multipart/form-data (it also carries the file itself,
// see src/services/file.service.js#completeMultipartUpload's comment on
// why chunk-transfer is out of scope) — form fields arrive as strings, not
// JSON arrays, so chunkChecksums is validated as a required string here
// and parsed/array-checked in the service layer.
const multipartComplete = [
  param('multipartUploadId').exists().isString(),
  body('chunkChecksums').exists().withMessage({ issue: 'REQUIRED', message: 'chunkChecksums is required.' }),
];

// --- 11.2 Download -------------------------------------------------------------
const fileIdParam = [idParam('fileId')];

// --- 11.4 Metadata -----------------------------------------------------------
const metadataUpdate = [
  idParam('fileId'),
  body('tags').optional().isArray(),
  body('assetCategory').optional().isIn(FILE_ASSET_CATEGORIES),
];

// --- 11.5 Versioning ---------------------------------------------------------
const versionParam = [idParam('fileId'), idParam('versionFileAssetId')];

// --- 11.6 Sharing --------------------------------------------------------------
const shareLinkCreate = [
  idParam('fileId'),
  body('expiresAt').exists().isISO8601(),
  body('requiresAuthentication').optional().isBoolean(),
];
const shareLinkParam = [idParam('fileId'), idParam('shareLinkId')];

// --- 11.7 Access ---------------------------------------------------------------
const accessGrantCreate = [
  idParam('fileId'),
  body('grantedToUserId').exists().isInt({ min: 1 }),
  body('expiresAt').optional().isISO8601(),
];
const accessGrantParam = [idParam('fileId'), idParam('accessGrantId')];

// --- 11.11 Search --------------------------------------------------------------
const search = [
  query('q').optional().isString(),
  query('assetCategory').optional().isIn(FILE_ASSET_CATEGORIES),
  query('linkedEntityType').optional().isString(),
  query('linkedEntityId').optional().isInt({ min: 1 }),
  cursorQuery(),
  limitQuery(),
];

// --- 11.12 Archive -------------------------------------------------------------
const archivedList = [
  query('assetCategory').optional().isIn(FILE_ASSET_CATEGORIES),
  cursorQuery(),
  limitQuery(200, 20),
];

module.exports = {
  upload,
  multipartInitiate,
  multipartComplete,
  fileIdParam,
  metadataUpdate,
  versionParam,
  shareLinkCreate,
  shareLinkParam,
  accessGrantCreate,
  accessGrantParam,
  search,
  archivedList,
};
