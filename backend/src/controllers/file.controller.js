'use strict';

// HTTP-layer handlers for the File Management module: parse the request,
// call src/services/file.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/file-management.yaml
// operationId (scoped to this task's explicit 12-item list).
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const service = require('../services/file.service');

function parseLimit(req, fallback = 20) {
  const raw = parseInt(req.query.limit, 10);
  return Number.isNaN(raw) ? fallback : raw;
}

// --- 11.1 Upload / Multipart --------------------------------------------------
const upload = asyncHandler(async (req, res) => {
  const result = await service.uploadFileHttp(req.user, req.file, req.body);
  sendSuccess(res, { statusCode: 202, data: result });
});

const multipartInitiate = asyncHandler(async (req, res) => {
  const result = await service.initiateMultipartUpload(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});

const multipartComplete = asyncHandler(async (req, res) => {
  const result = await service.completeMultipartUpload(req.user, req.params.multipartUploadId, req.body, req.file);
  sendSuccess(res, { statusCode: 202, data: result });
});

// --- 11.2 Download -------------------------------------------------------------
const download = asyncHandler(async (req, res) => {
  const result = await service.getDownloadUrl(req.user, req.params.fileId);
  if (req.get('Accept') === 'application/json') {
    return sendSuccess(res, { data: result });
  }
  return res.redirect(302, result.downloadUrl);
});

// Unauthenticated (the token itself is the credential) — not mounted
// through the standard authenticate()/requireTenant() chain, see routes.
const downloadByToken = asyncHandler(async (req, res) => {
  const { buffer, mimeType, fileAsset } = await service.readFileByToken(req.params.token);
  res.set('Content-Type', mimeType);
  res.set('Content-Disposition', `attachment; filename="${fileAsset.id}"`);
  res.send(buffer);
});

// --- 11.4 Metadata -----------------------------------------------------------
const getMetadata = asyncHandler(async (req, res) => {
  const result = await service.getMetadata(req.user, req.params.fileId);
  sendSuccess(res, { data: result });
});
const updateMetadata = asyncHandler(async (req, res) => {
  const result = await service.updateMetadata(req.user, req.params.fileId, req.body);
  sendSuccess(res, { data: result });
});

// --- 11.5 Versioning ---------------------------------------------------------
const listVersions = asyncHandler(async (req, res) => {
  const result = await service.listFileVersions(req.user, req.params.fileId);
  sendSuccess(res, { data: result.data });
});
const getVersion = asyncHandler(async (req, res) => {
  const result = await service.getFileVersion(req.user, req.params.fileId, req.params.versionFileAssetId);
  sendSuccess(res, { data: result });
});
const restoreVersion = asyncHandler(async (req, res) => {
  const result = await service.restoreFileVersion(req.user, req.params.fileId, req.params.versionFileAssetId);
  sendSuccess(res, { data: result });
});

// --- 11.6 Sharing --------------------------------------------------------------
const createShareLink = asyncHandler(async (req, res) => {
  const result = await service.createShareLink(req.user, req.params.fileId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const listShareLinks = asyncHandler(async (req, res) => {
  const result = await service.listShareLinks(req.user, req.params.fileId);
  sendSuccess(res, { data: result.data });
});
const revokeShareLink = asyncHandler(async (req, res) => {
  await service.revokeShareLink(req.user, req.params.fileId, req.params.shareLinkId);
  res.status(204).end();
});

// --- 11.7 Access ---------------------------------------------------------------
const getAccessList = asyncHandler(async (req, res) => {
  const result = await service.getFileAccessList(req.user, req.params.fileId);
  sendSuccess(res, { data: result.data });
});
const grantAccess = asyncHandler(async (req, res) => {
  const result = await service.grantFileAccess(req.user, req.params.fileId, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const revokeAccess = asyncHandler(async (req, res) => {
  await service.revokeFileAccess(req.user, req.params.fileId, req.params.accessGrantId);
  res.status(204).end();
});

// --- 11.11 Search --------------------------------------------------------------
const search = asyncHandler(async (req, res) => {
  const result = await service.searchFiles(req.user, {
    q: req.query.q,
    assetCategory: req.query.assetCategory,
    linkedEntityType: req.query.linkedEntityType,
    linkedEntityId: req.query.linkedEntityId,
    limit: parseLimit(req),
    cursor: req.query.cursor,
  });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});

// --- 11.12 Archive & Restore -----------------------------------------------
const archiveFile = asyncHandler(async (req, res) => {
  const result = await service.archiveFile(req.user, req.params.fileId);
  sendSuccess(res, { data: result });
});
const listArchived = asyncHandler(async (req, res) => {
  const filter = req.query.filter || {};
  const result = await service.listArchivedFiles(req.user, {
    assetCategory: req.query.assetCategory,
    archivedAtGte: filter.archivedAt?.gte,
    archivedAtLte: filter.archivedAt?.lte,
    limit: parseLimit(req, 20),
    cursor: req.query.cursor,
  });
  sendSuccess(res, { data: result.data, pagination: result.meta });
});
const restoreFile = asyncHandler(async (req, res) => {
  const result = await service.restoreArchivedFile(req.user, req.params.fileId);
  sendSuccess(res, { data: result });
});

// --- 11.13 Delete --------------------------------------------------------------
const deleteFile = asyncHandler(async (req, res) => {
  const result = await service.deleteFile(req.user, req.params.fileId);
  sendSuccess(res, { data: result });
});

// --- 11.14 Storage Usage ------------------------------------------------------
const storageUsageSummary = asyncHandler(async (req, res) => {
  const result = await service.getStorageUsageSummary(req.user);
  sendSuccess(res, { data: result });
});
const storageUsageByCategory = asyncHandler(async (req, res) => {
  const result = await service.getStorageUsageByCategory(req.user);
  sendSuccess(res, { data: result.data });
});

module.exports = {
  upload,
  multipartInitiate,
  multipartComplete,
  download,
  downloadByToken,
  getMetadata,
  updateMetadata,
  listVersions,
  getVersion,
  restoreVersion,
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getAccessList,
  grantAccess,
  revokeAccess,
  search,
  archiveFile,
  listArchived,
  restoreFile,
  deleteFile,
  storageUsageSummary,
  storageUsageByCategory,
};
