'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('../../controllers/file.controller');
const validators = require('../../validators/file.validators');
const { validate } = require('../../middleware/validate');
const { authenticate, requireRole, requireTenant } = require('../../middleware/auth');
const { idempotent } = require('../../middleware/idempotency');
const policy = require('../../policies/file.policy');
const env = require('../../config/env');

// File Management module routes (docs/file-management.yaml). Mounted at
// /files under the versioned API prefix by routes/v1/index.js.
// docs/ROUTE-REGISTRATION-ORDER.md's File Management section: every
// literal/mixed route under /files/ before the generic /:fileId family.
const router = Router();

const maxUploadBytes = Math.max(env.file.maxImageSizeBytes, env.file.maxVoiceSizeBytes, env.file.maxDocumentSizeBytes);
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes } }).single('file');

// --- Signed download token (unauthenticated by design — the token itself
// is the credential, src/utils/signedUrl.js) — mounted before the
// authenticate() gate below applies to the rest of this router.
router.get('/download-token/:token', controller.downloadByToken);

router.use(authenticate, requireTenant());

// --- 11.12.2 List Archived Files (before /:fileId) --------------------------
router.get('/archived', requireRole(...policy.archive), validators.archivedList, validate, controller.listArchived);

// --- 11.1.2/11.1.3 Multipart (before /:fileId) -------------------------------
router.post(
  '/multipart',
  requireRole(...policy.multipart),
  idempotent(),
  validators.multipartInitiate,
  validate,
  controller.multipartInitiate,
);
router.post(
  '/multipart/:multipartUploadId/complete',
  requireRole(...policy.multipart),
  fileUpload,
  validators.multipartComplete,
  validate,
  controller.multipartComplete,
);

// --- 11.11 Search (before /:fileId) ------------------------------------------
router.get('/search', requireRole(...policy.search), validators.search, validate, controller.search);

// --- 11.14 Storage Usage (before /:fileId) -----------------------------------
router.get('/storage-usage', requireRole(...policy.storageUsage), controller.storageUsageSummary);
router.get('/storage-usage/by-category', requireRole(...policy.storageUsage), controller.storageUsageByCategory);

// --- 11.1.1 Upload ------------------------------------------------------------
router.post('/', requireRole(...policy.upload), idempotent(), fileUpload, validators.upload, validate, controller.upload);

// --- /:fileId and nested routes ----------------------------------------------
router.get('/:fileId/download', requireRole(...policy.download), validators.fileIdParam, validate, controller.download);
router.get('/:fileId/metadata', requireRole(...policy.metadataRead), validators.fileIdParam, validate, controller.getMetadata);
router.patch('/:fileId/metadata', requireRole(...policy.metadataWrite), validators.metadataUpdate, validate, controller.updateMetadata);

router.get('/:fileId/versions', requireRole(...policy.versions), validators.fileIdParam, validate, controller.listVersions);
router.get(
  '/:fileId/versions/:versionFileAssetId',
  requireRole(...policy.versions),
  validators.versionParam,
  validate,
  controller.getVersion,
);
router.post(
  '/:fileId/versions/:versionFileAssetId/restore',
  requireRole(...policy.restoreVersion),
  validators.versionParam,
  validate,
  controller.restoreVersion,
);

router.post(
  '/:fileId/share-links',
  requireRole(...policy.sharing),
  idempotent(),
  validators.shareLinkCreate,
  validate,
  controller.createShareLink,
);
router.get('/:fileId/share-links', requireRole(...policy.sharing), validators.fileIdParam, validate, controller.listShareLinks);
router.delete(
  '/:fileId/share-links/:shareLinkId',
  requireRole(...policy.sharing),
  validators.shareLinkParam,
  validate,
  controller.revokeShareLink,
);

router.get('/:fileId/access', requireRole(...policy.access), validators.fileIdParam, validate, controller.getAccessList);
router.post(
  '/:fileId/access',
  requireRole(...policy.access),
  idempotent(),
  validators.accessGrantCreate,
  validate,
  controller.grantAccess,
);
router.delete(
  '/:fileId/access/:accessGrantId',
  requireRole(...policy.access),
  validators.accessGrantParam,
  validate,
  controller.revokeAccess,
);

router.post('/:fileId/archive', requireRole(...policy.archive), validators.fileIdParam, validate, controller.archiveFile);
router.post('/:fileId/restore', requireRole(...policy.archive), validators.fileIdParam, validate, controller.restoreFile);

router.delete('/:fileId', requireRole(...policy.deleteFile), validators.fileIdParam, validate, controller.deleteFile);

module.exports = router;
