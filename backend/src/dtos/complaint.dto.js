'use strict';

// Response-shaping layer for the Complaint module, matching the shapes
// documented in docs/complaint.yaml's components/schemas (ComplaintListItem,
// ComplaintDetail, timeline entries, etc.).
const { intToPriority } = require('./admin.dto');

function shapeComplaintListItem(complaint) {
  return {
    id: String(complaint.id),
    trackingId: complaint.trackingId,
    statusLabel: complaint.status?.label ?? null,
    priority: intToPriority(complaint.priority),
    departmentName: complaint.currentDepartmentName ?? complaint.department?.name ?? null,
    slaDueAt: complaint.slaDueAt,
    createdAt: complaint.createdAt,
  };
}

function shapeComplaintDetail(complaint, { attachments = [] } = {}) {
  return {
    id: String(complaint.id),
    trackingId: complaint.trackingId,
    description: complaint.description,
    categoryName: complaint.category?.name ?? null,
    statusLabel: complaint.status?.label ?? null,
    priority: intToPriority(complaint.priority),
    severity: complaint.severity,
    location: {
      latitude: complaint.locationLatitude !== null ? Number(complaint.locationLatitude) : null,
      longitude: complaint.locationLongitude !== null ? Number(complaint.locationLongitude) : null,
      addressText: complaint.locationAddress,
    },
    currentOfficer: complaint.currentOfficerId
      ? { id: String(complaint.currentOfficerId), name: complaint.currentOfficerName ?? null }
      : null,
    slaDueAt: complaint.slaTracking?.dueAt ?? complaint.slaDueAt ?? null,
    createdAt: complaint.createdAt,
    resolvedAt: complaint.resolvedAt,
    closedAt: complaint.closedAt,
    attachments: attachments.map((a) => ({ fileAssetId: String(a.id), assetCategory: a.assetCategory })),
  };
}

function shapeTimelineEntry(entry) {
  return {
    fromStatusLabel: entry.fromStatus?.label ?? null,
    toStatusLabel: entry.toStatus?.label ?? null,
    // `user` has no display-name column (v1.0 gap, src/dtos/admin.dto.js) —
    // falls back to username, null for system-driven transitions.
    changedBy: entry.changedBy
      ? { id: String(entry.changedBy), name: entry.changedByUser?.username ?? null }
      : null,
    note: entry.note,
    createdAt: entry.createdAt,
  };
}

function shapeTrackingSummary(complaint) {
  return {
    trackingId: complaint.trackingId,
    statusLabel: complaint.status?.label ?? null,
    categoryName: complaint.category?.name ?? null,
    currentOfficerName: complaint.currentOfficerName ?? null,
    lastUpdatedAt: complaint.updatedAt,
  };
}

function shapeAssignment(assignment) {
  return {
    id: String(assignment.id),
    complaintId: String(assignment.complaintId),
    officerId: String(assignment.officerId),
    assignedBy: assignment.assignedBy ? String(assignment.assignedBy) : null,
    assignedAt: assignment.assignedAt,
  };
}

function shapeAttachment(fileAsset) {
  return {
    fileAssetId: String(fileAsset.id),
    assetCategory: fileAsset.assetCategory,
    // Documented as the state immediately after upload (complaint.yaml:
    // virusScanStatus enum: [pending]) — src/services/file.service.js's
    // virus-scan hook (which src/services/complaint.service.js#uploadAttachment
    // now delegates to) is a synchronous placeholder this phase and mutates
    // the same fileAsset instance in place once it runs, so reading
    // fileAsset.virusScanStatus here would leak that implementation detail
    // into the documented response contract — same fix as
    // src/dtos/file.dto.js#shapeUploadAck.
    virusScanStatus: 'pending',
    uploadedAt: fileAsset.createdAt,
  };
}

module.exports = {
  shapeComplaintListItem,
  shapeComplaintDetail,
  shapeTimelineEntry,
  shapeTrackingSummary,
  shapeAssignment,
  shapeAttachment,
};
