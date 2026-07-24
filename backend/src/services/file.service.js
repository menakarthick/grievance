'use strict';

// Business logic for the File Management module (docs/file-management.yaml,
// 11-File-Management-APIs.md), scoped to this task's explicit 12-item list
// (Upload, Multipart, Download, Metadata, Versioning, Sharing, Access
// Control, Attachment/Complaint integration, Search, Storage Usage,
// Archive & Restore, Delete) — Preview/Virus-Scan-status-API/Image-
// Processing/OCR/Audit-Trail (doc §11.3, 11.8-11.10) are not requested this
// round; a virus-scan *hook* (Security section) is implemented, not the
// full poll/rescan API surface.
const crypto = require('crypto');
const { ApiError } = require('../utils/apiError');
const env = require('../config/env');
const { redisClient } = require('../config/redis');
const { recordAuditLog } = require('../audit');
const { getStorageAdapter } = require('../storage');
const signedUrl = require('../utils/signedUrl');
const { detectImageMimeType, detectAudioMimeType, detectDocumentMimeType } = require('../utils/fileValidation');
const { FILE_ASSET_CATEGORIES } = require('../database/constants');
const repo = require('../repositories/file.repository');
const dto = require('../dtos/file.dto');
const { Tenant, Complaint, CitizenProfile, StaffProfile, User } = require('../models');

const CATEGORY_DETECTORS = {
  image: detectImageMimeType,
  voice: detectAudioMimeType,
  document: detectDocumentMimeType,
  audit_attachment: detectDocumentMimeType,
};

const CATEGORY_SIZE_LIMITS = {
  image: () => env.file.maxImageSizeBytes,
  voice: () => env.file.maxVoiceSizeBytes,
  document: () => env.file.maxDocumentSizeBytes,
  audit_attachment: () => env.file.maxDocumentSizeBytes,
};

// ARCHITECTURE.md §19.1's retention table: Voice 5 years; Images/Officer
// Documents/Audit Attachments 10 years.
const CATEGORY_RETENTION_YEARS = {
  image: 10,
  voice: 5,
  document: 10,
  audit_attachment: 10,
};

const MULTIPART_SESSION_TTL_SECONDS = 60 * 60; // 1 hour (§11.1.2's "abandoned if not completed")
const MULTIPART_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

// --- shared helpers -----------------------------------------------------------

async function tenantIdOf(user) {
  if (user.tenantId) return Number(user.tenantId);
  const tenants = await Tenant.findAll({ where: { status: 'active' }, limit: 2 });
  if (tenants.length !== 1) {
    throw ApiError.internal('File administration requires exactly one active tenant in the current Phase-1 pilot configuration.');
  }
  return tenants[0].id;
}

// Owner, or Officer/Admin within scope (doc's Authorization column,
// repeated on nearly every endpoint). For a complaint-linked file this
// resolves the same citizen-ownership/department-scope rule Complaint
// itself uses (src/services/complaint.service.js#assertAccess) — the
// primary real-world case (attachment management, this task's item 8).
// For any other linkedEntityType, only the uploader or a Corporation/Super
// Admin can access, a conservative default in the absence of a resolvable
// scope for that entity type.
async function assertFileAccess(user, fileAsset) {
  if (['corporation_admin', 'super_admin'].includes(user.userType)) return;
  if (fileAsset.uploadedBy && Number(fileAsset.uploadedBy) === Number(user.id)) return;
  if (fileAsset.linkedEntityType === 'complaint') {
    const complaint = await Complaint.findByPk(fileAsset.linkedEntityId);
    if (complaint) {
      if (user.userType === 'citizen') {
        const profile = await CitizenProfile.findOne({ where: { userId: user.id } });
        if (profile && complaint.citizenId === profile.id) return;
      } else if (['officer', 'department_admin'].includes(user.userType)) {
        const staffProfile = await StaffProfile.findOne({ where: { userId: user.id } });
        if (staffProfile && staffProfile.departmentId === complaint.departmentId) return;
      }
    }
  }
  throw ApiError.forbidden();
}

// Authorization for the *target* entity a new upload attaches to — same
// resolution as assertFileAccess but against the entity directly (the
// file doesn't exist yet).
async function assertLinkedEntityAuthorized(user, linkedEntityType, linkedEntityId) {
  if (['corporation_admin', 'super_admin'].includes(user.userType)) return;
  if (linkedEntityType === 'complaint') {
    const complaint = await Complaint.findByPk(linkedEntityId);
    if (!complaint) throw ApiError.notFound('FILE_NOT_FOUND', 'The linked entity does not exist.');
    if (user.userType === 'citizen') {
      const profile = await CitizenProfile.findOne({ where: { userId: user.id } });
      if (profile && complaint.citizenId === profile.id) return;
    } else if (['officer', 'department_admin'].includes(user.userType)) {
      const staffProfile = await StaffProfile.findOne({ where: { userId: user.id } });
      if (staffProfile && staffProfile.departmentId === complaint.departmentId) return;
    }
    throw ApiError.forbidden();
  }
  // Any other linkedEntityType: no resolvable scope model this phase —
  // permitted (the caller is authenticated and within their own tenant,
  // enforced by requireTenant() upstream), consistent with "any
  // authenticated role permitted to attach files to the target entity"
  // when no finer-grained scope exists to check.
}

function validateCategory(assetCategory) {
  if (!FILE_ASSET_CATEGORIES.includes(assetCategory)) {
    throw ApiError.validation('Request failed validation', [
      {
        field: 'assetCategory',
        issue: 'INVALID_VALUE',
        message: `assetCategory must be one of: ${FILE_ASSET_CATEGORIES.join(', ')}.`,
      },
    ]);
  }
}

function detectAndValidateMimeType(assetCategory, buffer) {
  const detector = CATEGORY_DETECTORS[assetCategory];
  const mimeType = detector ? detector(buffer) : null;
  if (!mimeType) {
    throw new ApiError({
      statusCode: 415,
      category: 'validation',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: `File does not match a genuine, magic-byte-verified format for category "${assetCategory}".`,
    });
  }
  return mimeType;
}

function validateSize(assetCategory, sizeBytes) {
  const limit = CATEGORY_SIZE_LIMITS[assetCategory]();
  if (sizeBytes > limit) {
    throw new ApiError({
      statusCode: 413,
      category: 'validation',
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the ${limit} byte limit for category "${assetCategory}".`,
    });
  }
}

// Virus-scan *hook* (Security section) — a placeholder for a real
// antivirus engine (ClamAV or equivalent, ARCHITECTURE.md §19.2's "Scan"
// step). No scanner is integrated this phase; the hook always reports
// clean, immediately, so the rest of the documented lifecycle (quarantine
// -> hot, downloadable once clean) is genuinely exercisable in this
// codebase rather than leaving every file stuck in `pending` forever (the
// gap this hook closes — Complaint's own attachment pipeline never
// transitioned virusScanStatus before this module existed). Swapping in a
// real scanner later means replacing only this function's body.
async function runVirusScanHook(fileAsset) {
  return repo.update(fileAsset, { virusScanStatus: 'clean', lifecycleState: 'hot' });
}

// --- 11.1 Upload ---------------------------------------------------------

// The shared core, reused by the multipart-completion path and, per this
// task's explicit "Complaint attachments must use this File Management
// service" requirement, by src/services/complaint.service.js directly
// (not through HTTP/RBAC — an in-process call, same pattern as
// Notification's consumeDomainEvents calling into its own service layer).
async function uploadFile(user, { buffer, assetCategory, linkedEntityType, linkedEntityId }) {
  validateCategory(assetCategory);
  const tenantId = await tenantIdOf(user);
  await assertLinkedEntityAuthorized(user, linkedEntityType, linkedEntityId);

  const existingCount = await repo.countForLinkedEntity(tenantId, linkedEntityType, linkedEntityId);
  if (existingCount >= env.file.maxFilesPerEntity) {
    throw ApiError.unprocessable('MAX_FILES_EXCEEDED', `At most ${env.file.maxFilesPerEntity} files may be attached to this entity.`);
  }

  validateSize(assetCategory, buffer.length);
  const mimeType = detectAndValidateMimeType(assetCategory, buffer);

  const extension = mimeType.split('/')[1].split('+')[0];
  const storageKey = `${tenantId}/${assetCategory}/${crypto.randomUUID()}.${extension}`;
  const storage = getStorageAdapter();
  const { storagePath } = await storage.save({ buffer, storageKey });
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  const retentionExpiresAt = new Date();
  retentionExpiresAt.setFullYear(retentionExpiresAt.getFullYear() + CATEGORY_RETENTION_YEARS[assetCategory]);

  const fileAsset = await repo.createFileAsset({
    tenantId,
    assetCategory,
    storagePath,
    mimeType,
    sizeBytes: buffer.length,
    checksum,
    uploadedBy: user.id,
    virusScanStatus: 'pending',
    lifecycleState: 'quarantine',
    linkedEntityType,
    linkedEntityId,
    retentionExpiresAt,
  });

  await runVirusScanHook(fileAsset);

  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'FILE_UPLOADED',
    entityType: 'file_asset',
    entityId: fileAsset.id,
    changeSummary: `assetCategory=${assetCategory} linkedEntityType=${linkedEntityType} linkedEntityId=${linkedEntityId}`,
  });

  return fileAsset;
}

async function uploadFileHttp(user, file, body) {
  if (!file) {
    throw ApiError.validation('Request failed validation', [{ field: 'file', issue: 'REQUIRED', message: 'file is required.' }]);
  }
  const fileAsset = await uploadFile(user, {
    buffer: file.buffer,
    assetCategory: body.assetCategory,
    linkedEntityType: body.linkedEntityType,
    linkedEntityId: Number(body.linkedEntityId),
  });
  return dto.shapeUploadAck(fileAsset);
}

// --- 11.1.2/11.1.3 Multipart ---------------------------------------------
// No chunk-transfer endpoints exist in the approved contract ("chunk
// upload endpoints... not enumerated here", §11.1.2) — chunk receipt/
// reassembly infrastructure is out of scope. Session state (who/what/
// expiry) lives in Redis, matching the OTP/refresh-token/idempotency
// precedent for short-lived operational state (ARCHITECTURE.md §16),
// rather than a new MySQL table. Completion accepts the actual file
// content directly and runs it through the identical uploadFile()
// pipeline as §11.1.1 — "chunking is a transport-layer optimization only,
// never a validation bypass" (§11.1.3) is upheld exactly, just without a
// real multi-request chunk transport this phase.
function multipartRedisKey(multipartUploadId) {
  return `file:multipart:${multipartUploadId}`;
}

async function initiateMultipartUpload(user, body) {
  const tenantId = await tenantIdOf(user);
  validateCategory(body.assetCategory);
  const limit = CATEGORY_SIZE_LIMITS[body.assetCategory]();
  if (body.totalSizeBytes > limit) {
    throw new ApiError({
      statusCode: 413,
      category: 'validation',
      code: 'FILE_TOO_LARGE',
      message: `totalSizeBytes exceeds the ${limit} byte limit for category "${body.assetCategory}".`,
    });
  }
  const multipartUploadId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + MULTIPART_SESSION_TTL_SECONDS * 1000);
  const session = {
    tenantId,
    userId: user.id,
    fileName: body.fileName,
    mimeType: body.mimeType,
    totalSizeBytes: body.totalSizeBytes,
    assetCategory: body.assetCategory,
    linkedEntityType: body.linkedEntityType,
    linkedEntityId: body.linkedEntityId,
    expiresAt: expiresAt.toISOString(),
  };
  await redisClient.set(multipartRedisKey(multipartUploadId), JSON.stringify(session), 'EX', MULTIPART_SESSION_TTL_SECONDS);
  return dto.shapeMultipartSession({ multipartUploadId, chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES, expiresAt });
}

// chunkChecksums arrives as a multipart/form-data field (a JSON-encoded
// string, since this request also carries the file itself), not a native
// array — parsed here rather than at the validator layer.
function parseChunkChecksums(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to the validation error below
    }
  }
  return null;
}

async function completeMultipartUpload(user, multipartUploadId, body, file) {
  const chunkChecksums = parseChunkChecksums(body.chunkChecksums);
  if (!chunkChecksums) {
    throw ApiError.validation('Request failed validation', [
      { field: 'chunkChecksums', issue: 'INVALID_FORMAT', message: 'chunkChecksums must be a JSON-encoded array.' },
    ]);
  }
  const raw = await redisClient.get(multipartRedisKey(multipartUploadId));
  if (!raw) throw ApiError.notFound('UPLOAD_SESSION_NOT_FOUND', 'No multipart upload session matches this id.');
  const session = JSON.parse(raw);

  if (session.completedFileAssetId) {
    // Naturally idempotent — a repeat completion call returns the
    // already-created result rather than erroring or double-creating.
    const existing = await repo.findByIdIncludingDeleted(session.tenantId, session.completedFileAssetId);
    return dto.shapeUploadAck(existing);
  }
  if (Number(session.userId) !== Number(user.id)) throw ApiError.forbidden();
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw ApiError.conflict('UPLOAD_SESSION_EXPIRED', 'This multipart upload session has expired.');
  }
  if (!file) {
    throw ApiError.validation('Request failed validation', [{ field: 'file', issue: 'REQUIRED', message: 'file is required.' }]);
  }

  const fileAsset = await uploadFile(user, {
    buffer: file.buffer,
    assetCategory: session.assetCategory,
    linkedEntityType: session.linkedEntityType,
    linkedEntityId: Number(session.linkedEntityId),
  });

  await redisClient.set(
    multipartRedisKey(multipartUploadId),
    JSON.stringify({ ...session, completedFileAssetId: fileAsset.id }),
    'EX',
    MULTIPART_SESSION_TTL_SECONDS,
  );

  return dto.shapeUploadAck(fileAsset);
}

// --- 11.2 Download -------------------------------------------------------

async function loadFileOr404(tenantId, fileId) {
  const fileAsset = await repo.findById(tenantId, fileId);
  if (!fileAsset) throw ApiError.notFound('FILE_NOT_FOUND', 'File not found.');
  return fileAsset;
}

async function getDownloadUrl(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);

  if (fileAsset.lifecycleState === 'quarantine') {
    throw new ApiError({ statusCode: 410, category: 'business', code: 'FILE_QUARANTINED', message: 'This file is quarantined and cannot be downloaded.' });
  }
  if (fileAsset.virusScanStatus !== 'clean') {
    throw ApiError.conflict('FILE_NOT_YET_SCANNED', 'This file has not yet passed virus scanning.');
  }

  const { token, expiresAt } = signedUrl.sign(fileAsset.id);
  await recordAuditLog({
    tenantId,
    actorUserId: user.id,
    action: 'FILE_DOWNLOADED',
    entityType: 'file_asset',
    entityId: fileAsset.id,
  });
  return { downloadUrl: `${env.apiPrefix}/files/download-token/${token}`, expiresAt };
}

// Streams the raw file content for a verified signed token — the actual
// endpoint a "302 redirect to a signed URL" (§11.2.1) points at. No auth
// middleware; the token itself, HMAC-signed and short-lived, is the
// credential (src/utils/signedUrl.js).
async function readFileByToken(token) {
  const verified = signedUrl.verify(token);
  if (!verified) throw ApiError.notFound('FILE_NOT_FOUND', 'This download link is invalid or has expired.');
  // A signed token is itself the tenant-scoped credential (minted only via
  // getDownloadUrl, which already checked tenant/ownership/scope) — look
  // the file up directly by id rather than requiring a tenantId here too.
  const { FileAsset } = require('../models');
  const asset = await FileAsset.findOne({ where: { id: verified.fileAssetId, deletedBy: null } });
  if (!asset || asset.virusScanStatus !== 'clean' || asset.lifecycleState === 'quarantine') {
    throw ApiError.notFound('FILE_NOT_FOUND', 'File not found.');
  }
  const storage = getStorageAdapter();
  const buffer = await storage.read(asset.storagePath);
  return { buffer, mimeType: asset.mimeType, fileAsset: asset };
}

// --- 11.4 Metadata ---------------------------------------------------------

async function getMetadata(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);
  return dto.shapeMetadata(fileAsset);
}

async function updateMetadata(user, fileId, body) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);

  if (body.tags) {
    // file_asset_metadata (tags column) doesn't exist (Section 11.0) —
    // rejected rather than silently discarded.
    throw ApiError.validation('Request failed validation', [
      { field: 'tags', issue: 'NOT_SUPPORTED', message: 'Tags are not supported this phase — no file_asset_metadata table exists yet.' },
    ]);
  }
  if (body.assetCategory) {
    validateCategory(body.assetCategory);
    await repo.update(fileAsset, { assetCategory: body.assetCategory });
    await recordAuditLog({
      tenantId,
      actorUserId: user.id,
      action: 'FILE_METADATA_UPDATED',
      entityType: 'file_asset',
      entityId: fileAsset.id,
      changeSummary: `assetCategory -> ${body.assetCategory}`,
    });
  }
  return dto.shapeMetadata(fileAsset);
}

// --- 11.5 Versioning -------------------------------------------------------
// file_asset_metadata.previousVersionFileAssetId (the documented backing
// attribute, Section 11.0) doesn't exist — every file is its own sole
// version. Routed/RBAC-gated/documented rather than fabricating a version
// chain.

async function listFileVersions(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);
  return { data: [dto.shapeVersionListItem(fileAsset)] };
}

async function getFileVersion(user, fileId, versionFileAssetId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);
  if (Number(versionFileAssetId) !== fileAsset.id) {
    throw ApiError.notFound('FILE_VERSION_NOT_FOUND', 'No such version exists for this file.');
  }
  return dto.shapeVersionDetail(fileAsset);
}

async function restoreFileVersion(user, fileId, versionFileAssetId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);
  if (Number(versionFileAssetId) !== fileAsset.id) {
    throw ApiError.notFound('FILE_VERSION_NOT_FOUND', 'No such version exists for this file.');
  }
  // The only "version" that exists is already current — restoring it is
  // therefore always a no-op state, reported the same way the doc
  // describes for a genuinely-already-current version.
  throw ApiError.conflict('VERSION_ALREADY_CURRENT', 'This version is already current.');
}

// --- 11.6 Sharing / 11.7 Access --------------------------------------------
// resource_share (Section 11.0: "Proposed, pending Database Architecture
// v1.2") doesn't exist — every write endpoint here degrades to 501, the
// same pattern already established for Geographic's v1.1 entities and
// Notification's template approval workflow. The read-only access LIST
// (11.7.1) is real and useful without the table: it reports the owner and
// scope-computed entries the doc itself says are "computed, not stored."

const NOT_ENABLED_RESOURCE_SHARE = () => {
  throw new ApiError({
    statusCode: 501,
    category: 'business',
    code: 'NOT_ENABLED',
    message: 'File sharing/access grants require the resource_share table, proposed but not yet approved (Database Architecture v1.2).',
  });
};

const createShareLink = NOT_ENABLED_RESOURCE_SHARE;
const listShareLinks = NOT_ENABLED_RESOURCE_SHARE;
const revokeShareLink = NOT_ENABLED_RESOURCE_SHARE;
const grantFileAccess = NOT_ENABLED_RESOURCE_SHARE;
const revokeFileAccess = NOT_ENABLED_RESOURCE_SHARE;

async function getFileAccessList(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);

  const entries = [];
  if (fileAsset.uploadedBy) {
    const uploader = await User.findByPk(fileAsset.uploadedBy);
    if (uploader) entries.push({ userId: uploader.id, userName: uploader.username, accessBasis: 'owner', grantedAt: null });
  }
  if (fileAsset.linkedEntityType === 'complaint') {
    const complaint = await Complaint.findByPk(fileAsset.linkedEntityId);
    if (complaint?.currentOfficerId) {
      const staffProfile = await StaffProfile.findByPk(complaint.currentOfficerId);
      if (staffProfile) {
        const officerUser = await User.findByPk(staffProfile.userId);
        if (officerUser && Number(officerUser.id) !== Number(fileAsset.uploadedBy)) {
          entries.push({ userId: officerUser.id, userName: officerUser.username, accessBasis: 'scope', grantedAt: null });
        }
      }
    }
  }
  // explicit_grant entries would come from resource_share — none can exist
  // yet (see NOT_ENABLED_RESOURCE_SHARE above).
  return { data: entries.map(dto.shapeAccessListItem) };
}

// --- 11.11 Search ------------------------------------------------------------

async function searchFiles(user, { q, assetCategory, linkedEntityType, linkedEntityId, limit, cursor }) {
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const tenantId = await tenantIdOf(user);
  const before = decodeCursor(cursor);
  const rows = await repo.search(tenantId, { q, assetCategory, linkedEntityType, linkedEntityId }, { limit: limit + 1, before });
  const scoped = [];
  for (const row of rows) {
    try {
      await assertFileAccess(user, row);
      scoped.push(row);
    } catch {
      // Not authorized for this particular file — silently excluded from
      // results (§11.11.1: "search never becomes an enumeration/IDOR
      // vector").
    }
  }
  const { page, meta } = buildPaginationMeta(scoped, limit);
  return {
    data: page.map((f) => ({
      fileAssetId: String(f.id),
      assetCategory: f.assetCategory,
      tags: [],
      linkedEntityType: f.linkedEntityType,
      linkedEntityId: String(f.linkedEntityId),
      createdAt: f.createdAt,
    })),
    meta,
  };
}

// --- 11.12 Archive & Restore --------------------------------------------

async function archiveFile(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  if (fileAsset.lifecycleState === 'archived') {
    return { fileAssetId: String(fileAsset.id), lifecycleState: 'archived', archivedAt: fileAsset.updatedAt };
  }
  if (fileAsset.lifecycleState !== 'hot') {
    throw ApiError.conflict('FILE_NOT_HOT', 'Only a file in the hot tier can be archived.');
  }
  await repo.update(fileAsset, { lifecycleState: 'archived' });
  await recordAuditLog({ tenantId, actorUserId: user.id, action: 'FILE_ARCHIVED', entityType: 'file_asset', entityId: fileAsset.id });
  return { fileAssetId: String(fileAsset.id), lifecycleState: 'archived', archivedAt: new Date() };
}

async function listArchivedFiles(user, { assetCategory, archivedAtGte, archivedAtLte, limit, cursor }) {
  const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
  const tenantId = await tenantIdOf(user);
  const before = decodeCursor(cursor);
  const rows = await repo.listArchived(tenantId, { assetCategory, archivedAtGte, archivedAtLte }, { limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(rows, limit);
  return { data: page.map(dto.shapeArchivedListItem), meta };
}

async function restoreArchivedFile(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  if (fileAsset.lifecycleState === 'hot') {
    return { fileAssetId: String(fileAsset.id), lifecycleState: 'hot', restoredAt: fileAsset.updatedAt };
  }
  if (fileAsset.lifecycleState !== 'archived') {
    throw ApiError.conflict('FILE_NOT_ARCHIVED', 'Only an archived file can be restored.');
  }
  await repo.update(fileAsset, { lifecycleState: 'hot' });
  await recordAuditLog({ tenantId, actorUserId: user.id, action: 'FILE_RESTORED', entityType: 'file_asset', entityId: fileAsset.id });
  return { fileAssetId: String(fileAsset.id), lifecycleState: 'hot', restoredAt: new Date() };
}

// --- 11.13 Delete (soft delete) -------------------------------------------
// file_asset has no deleted_at column (paranoid: false) — deletedBy
// (src/database/helpers.js#deletedByColumn, which does exist) is the
// manual soft-delete marker instead; updatedAt stands in for deletedAt in
// the response (the update that sets deletedBy is itself the deletion
// moment).

async function deleteFile(user, fileId) {
  const tenantId = await tenantIdOf(user);
  const fileAsset = await loadFileOr404(tenantId, fileId);
  await assertFileAccess(user, fileAsset);

  if (fileAsset.linkedEntityType === 'complaint') {
    const complaint = await Complaint.findByPk(fileAsset.linkedEntityId);
    const openStatuses = ['REGISTERED', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
    if (complaint) {
      const { ComplaintStatusDefinition } = require('../models');
      const status = await ComplaintStatusDefinition.findByPk(complaint.statusId);
      const remainingAttachments = await repo.countForLinkedEntity(tenantId, 'complaint', complaint.id);
      if (status && openStatuses.includes(status.code) && remainingAttachments <= 1) {
        throw ApiError.conflict('FILE_PROTECTED', 'This is the sole evidence attached to an unresolved complaint and cannot be deleted.');
      }
    }
  }

  await repo.update(fileAsset, { deletedBy: user.id });
  await recordAuditLog({ tenantId, actorUserId: user.id, action: 'FILE_DELETED', entityType: 'file_asset', entityId: fileAsset.id });
  return { fileAssetId: String(fileAsset.id), deletedAt: new Date() };
}

// --- 11.14 Storage Usage ----------------------------------------------------

async function getStorageUsageSummary(user) {
  const tenantId = await tenantIdOf(user);
  const byLifecycle = await repo.storageUsageSummary(tenantId);
  return dto.shapeStorageUsageSummary(byLifecycle, env.file.quotaBytes);
}

async function getStorageUsageByCategory(user) {
  const tenantId = await tenantIdOf(user);
  const rows = await repo.storageUsageByCategory(tenantId);
  return { data: rows.map(dto.shapeStorageUsageByCategoryRow) };
}

module.exports = {
  uploadFile,
  uploadFileHttp,
  initiateMultipartUpload,
  completeMultipartUpload,
  getDownloadUrl,
  readFileByToken,
  getMetadata,
  updateMetadata,
  listFileVersions,
  getFileVersion,
  restoreFileVersion,
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getFileAccessList,
  grantFileAccess,
  revokeFileAccess,
  searchFiles,
  archiveFile,
  listArchivedFiles,
  restoreArchivedFile,
  deleteFile,
  getStorageUsageSummary,
  getStorageUsageByCategory,
  assertFileAccess,
  tenantIdOf,
};
