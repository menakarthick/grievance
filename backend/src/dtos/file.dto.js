'use strict';

// Response-shaping layer for the File Management module. Several fields
// docs/file-management.yaml documents (tags, GPS/EXIF, OCR, AI-generated
// flag, retention category, version chain, resource_share-backed sharing/
// access) have no backing column/table in the approved v1.0 schema —
// file_asset_metadata (DATABASE_DESIGN.md §30) and resource_share
// (proposed, pending Database Architecture v1.2 per
// 11-File-Management-APIs.md §11.0) are both unbuilt. This layer returns
// the closest honest value the real schema (file_asset only) supports and
// documents each gap inline — see CURRENT_STATE.md for the consolidated
// list.

function shapeUploadAck(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    assetCategory: fileAsset.assetCategory,
    mimeType: fileAsset.mimeType,
    sizeBytes: Number(fileAsset.sizeBytes),
    // The OpenAPI schema constrains these two fields to exactly
    // `pending`/`quarantine` for this response (FileUploadAck: enum:
    // [pending], enum: [quarantine]) — the upload-ack contract describes
    // the state immediately after creation, before any scan result is
    // known, by definition. src/services/file.service.js's virus-scan
    // *hook* is a synchronous placeholder (no real async scanner this
    // phase) and mutates the same fileAsset instance in place once it
    // runs, so reading fileAsset.virusScanStatus/lifecycleState here
    // (rather than these fixed values) would leak that implementation
    // detail into the documented response contract.
    virusScanStatus: 'pending',
    lifecycleState: 'quarantine',
    createdAt: fileAsset.createdAt,
  };
}

function shapeMultipartSession(session) {
  return {
    multipartUploadId: session.multipartUploadId,
    chunkSizeBytes: session.chunkSizeBytes,
    expiresAt: session.expiresAt,
  };
}

// file_asset_metadata (tags/GPS/OCR/isAiGenerated/retentionCategory) has no
// backing table — those fields are always empty/null/false this phase.
function shapeMetadata(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    assetCategory: fileAsset.assetCategory,
    tags: [],
    gpsLatitude: null,
    gpsLongitude: null,
    ocrStatus: 'not_applicable',
    isAiGenerated: false,
    retentionCategory: fileAsset.assetCategory,
    checksum: fileAsset.checksum,
    virusScanStatus: fileAsset.virusScanStatus,
  };
}

// Versioning (§11.5) is modeled on file_asset_metadata.previousVersionFileAssetId
// (DATABASE_DESIGN.md §30), which doesn't exist — every file is reported as
// its own sole, current version (no chain to walk); see
// src/services/file.service.js#listFileVersions.
function shapeVersionListItem(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    versionNumber: 1,
    uploadedBy: fileAsset.uploadedBy ? String(fileAsset.uploadedBy) : null,
    createdAt: fileAsset.createdAt,
    isCurrent: true,
  };
}

function shapeVersionDetail(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    versionNumber: 1,
    mimeType: fileAsset.mimeType,
    sizeBytes: Number(fileAsset.sizeBytes),
    checksum: fileAsset.checksum,
    uploadedBy: fileAsset.uploadedBy ? String(fileAsset.uploadedBy) : null,
    createdAt: fileAsset.createdAt,
  };
}

function shapeAccessListItem(entry) {
  return {
    userId: String(entry.userId),
    userName: entry.userName ?? null,
    accessBasis: entry.accessBasis,
    grantedAt: entry.grantedAt ?? null,
  };
}

function shapeArchivedListItem(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    assetCategory: fileAsset.assetCategory,
    // archivedAt: no dedicated column — updatedAt is the honest proxy
    // (archiving is itself the update that produced this row's current
    // state); see src/repositories/file.repository.js#listArchived.
    archivedAt: fileAsset.updatedAt,
    retentionExpiresAt: fileAsset.retentionExpiresAt,
  };
}

function shapeStorageUsageSummary(byLifecycle, quotaBytes) {
  const hotTierBytes = byLifecycle.hot || 0;
  const archiveTierBytes = byLifecycle.archived || 0;
  const quarantineBytes = byLifecycle.quarantine || 0;
  const totalBytesUsed = hotTierBytes + archiveTierBytes + quarantineBytes;
  return {
    totalBytesUsed,
    quotaBytes: quotaBytes ?? null,
    quotaUtilizationPercent: quotaBytes ? Math.round((totalBytesUsed / quotaBytes) * 10000) / 100 : null,
    hotTierBytes,
    archiveTierBytes,
  };
}

function shapeStorageUsageByCategoryRow(row) {
  return {
    assetCategory: row.assetCategory,
    bytesUsed: Number(row.bytes) || 0,
    fileCount: Number(row.count) || 0,
  };
}

function shapeAuditTrailItem(entry) {
  return {
    action: entry.action,
    actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
    // User has no display-name column (same v1.0 gap as Administration's
    // User DTO, src/dtos/admin.dto.js) — username stands in for name.
    actorName: entry.actorUser?.username ?? null,
    // audit_log has no ipAddress column (only auth_event_log does) —
    // always null this phase.
    ipAddress: null,
    createdAt: entry.createdAt,
  };
}

module.exports = {
  shapeUploadAck,
  shapeMultipartSession,
  shapeMetadata,
  shapeVersionListItem,
  shapeVersionDetail,
  shapeAccessListItem,
  shapeArchivedListItem,
  shapeStorageUsageSummary,
  shapeStorageUsageByCategoryRow,
  shapeAuditTrailItem,
};
