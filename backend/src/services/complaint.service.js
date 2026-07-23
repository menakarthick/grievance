'use strict';

// Business logic for the Complaint module (docs/complaint.yaml,
// API_SPECIFICATION.md Section 4). Orchestrates
// src/repositories/complaint.repository.js plus the shared admin
// repository/DTO for category/department lookups and the priority
// integer<->string mapping (Complaint uses the identical convention as
// complaint_category.default_priority — see src/dtos/admin.dto.js).
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const { ApiError } = require('../utils/apiError');
const env = require('../config/env');
const { recordAuditLog } = require('../audit');
const { buildTrackingId } = require('../utils/trackingId');
const { detectImageMimeType, detectAudioMimeType } = require('../utils/fileValidation');
const { decodeCursor, buildPaginationMeta } = require('../utils/cursorPagination');
const { priorityToInt } = require('../dtos/admin.dto');
const { findActiveCategory, findActiveDepartment } = require('../repositories/admin.repository');
const repo = require('../repositories/complaint.repository');
const { CitizenProfile, Tenant, StaffProfile } = require('../models');
const dto = require('../dtos/complaint.dto');

const STATUS = {
  REGISTERED: 'REGISTERED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
  REJECTED: 'REJECTED',
};

// "in-progress"-family: everything short of Resolved/Closed
// (API_SPECIFICATION.md §4.10's "not already Resolved/Closed").
const PRE_RESOLUTION_STATUSES = [STATUS.REGISTERED, STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.REOPENED];

const EVENT_TYPES = {
  COMPLAINT_CREATED: 'ComplaintCreated',
  COMPLAINT_ASSIGNED: 'ComplaintAssigned',
  COMPLAINT_RESOLVED: 'ComplaintResolved',
  COMPLAINT_CLOSED: 'ComplaintClosed',
  COMPLAINT_REOPENED: 'ComplaintReopened',
  CITIZEN_FEEDBACK_RECEIVED: 'CitizenFeedbackReceived',
};

// Phase-1 pilot simplification, same precedent as
// src/services/geo.service.js#resolveTenantId: a Super Admin's JWT carries
// no tenantId (cross-tenant by design), and the approved Complaint API
// contract has no `?tenantId=` override parameter, so a Super Admin
// operates against the platform's single active tenant in this Phase-1
// pilot.
async function tenantIdOf(user) {
  if (user.tenantId) return Number(user.tenantId);
  const tenants = await Tenant.findAll({ where: { status: 'active' }, limit: 2 });
  if (tenants.length !== 1) {
    throw ApiError.internal('Complaint administration requires exactly one active tenant in the current Phase-1 pilot configuration.');
  }
  return tenants[0].id;
}

async function audit(user, action, entityId, changeSummary) {
  await recordAuditLog({
    tenantId: await tenantIdOf(user),
    actorUserId: user.id,
    action,
    entityType: 'complaint',
    entityId,
    changeSummary,
  });
}

async function requireStatus(tenantId, code) {
  const status = await repo.getStatusByCode(tenantId, code);
  if (!status) {
    // The status catalog is tenant-seeded (src/seeders/...-seed-complaint-
    // statuses.js) — its absence means the tenant's seed data itself is
    // incomplete, a server-side configuration fault, not a client error.
    throw ApiError.internal(`Complaint status "${code}" is not configured for this tenant.`);
  }
  return status;
}

async function requireCitizenProfile(user) {
  const profile = await CitizenProfile.findOne({ where: { userId: user.id } });
  if (!profile) {
    throw ApiError.unprocessable('CITIZEN_PROFILE_NOT_FOUND', 'No citizen profile is associated with this account.');
  }
  return profile;
}

async function loadComplaintOr404(tenantId, id) {
  const complaint = await repo.findById(tenantId, id, {
    include: ['category', 'status', 'department', 'slaTracking'],
  });
  if (!complaint) throw ApiError.notFound('COMPLAINT_NOT_FOUND', 'Complaint not found.');
  return complaint;
}

// Access rule shared by Get Details / Timeline / Update (API_SPECIFICATION.md
// §4.4-4.6): the owning citizen, the currently assigned officer, or an
// Admin whose department scope covers the complaint's department.
// Resolves the caller's own staff_profile row (officer/admin tiers only —
// a citizen has no staff_profile). Looked up from user.id rather than
// trusting any client-suppliable id, mirroring
// src/services/admin.service.js#resolveCallerDepartmentId's precedent.
async function findOwnStaffProfile(user) {
  return StaffProfile.findOne({ where: { userId: user.id } });
}

async function assertAccess(user, complaint) {
  if (user.userType === 'citizen') {
    const profile = await requireCitizenProfile(user);
    if (complaint.citizenId !== profile.id) throw ApiError.forbidden();
    return;
  }
  if (user.userType === 'officer') {
    const staffProfile = await findOwnStaffProfile(user);
    if (!staffProfile || complaint.currentOfficerId !== staffProfile.id) throw ApiError.forbidden();
    return;
  }
  if (user.userType === 'department_admin') {
    const staffProfile = await findOwnStaffProfile(user);
    if (!staffProfile || staffProfile.departmentId !== complaint.departmentId) throw ApiError.forbidden();
    return;
  }
  // corporation_admin / super_admin: whole-tenant scope, already enforced by
  // the tenantId filter in loadComplaintOr404.
}

// --- 4.1 Register Complaint (Text) ------------------------------------------
// categoryId is documented as optional ("AI-assisted classification if
// omitted" — API_SPECIFICATION.md §4.1), but that AI classification path
// (Complaint Agent, Section 5) is explicitly out of scope for this phase,
// and complaint.category_id is a NOT-NULL column (DATABASE_DESIGN.md §6).
// Requiring it here is a documented, interim tightening — not schema
// invention — until the AI module exists to fill it in asynchronously.
async function register(user, body) {
  const tenantId = await tenantIdOf(user);
  const citizenProfile = await requireCitizenProfile(user);

  if (!body.categoryId) {
    throw ApiError.validation('Request failed validation', [
      {
        field: 'categoryId',
        issue: 'REQUIRED',
        message: 'categoryId is required until the AI classification module is available.',
      },
    ]);
  }
  const category = await findActiveCategory(tenantId, body.categoryId);
  if (!category) throw ApiError.unprocessable('CATEGORY_NOT_FOUND', 'The specified category does not exist.');

  const department = await findActiveDepartment(tenantId, category.departmentId);
  if (!department) throw ApiError.unprocessable('CATEGORY_NOT_FOUND', 'The category has no active department.');

  const location = body.location || {};
  let locationAddress = location.addressText || null;
  if (location.wardId) {
    const ward = await repo.findActiveWard(tenantId, location.wardId);
    if (!ward) {
      throw ApiError.validation('Request failed validation', [
        { field: 'location.wardId', issue: 'NOT_FOUND', message: 'wardId does not exist or is inactive.' },
      ]);
    }
    // complaint has no wardId column (v1.0 schema) — the ward is validated
    // for real but only ever persisted through the existing
    // location_address/latitude/longitude columns, falling back to the
    // ward's name as address text when no addressText was supplied.
    locationAddress = locationAddress || ward.name;
  }

  const registeredStatus = await requireStatus(tenantId, STATUS.REGISTERED);
  const tenant = await Tenant.findByPk(tenantId);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const transaction = await repo.complaintTransaction();
  try {
    // Sequence numbering: count(*)+1 for this tenant/department/month — no
    // dedicated sequence table exists in the approved v1.0 schema
    // (DATABASE_DESIGN.md §4/§6). Documented, accepted limitation: not
    // race-proof under concurrent registrations in the same
    // tenant/department/month; a genuine fix needs a separately-approved
    // sequence table.
    const existingCount = await repo.countComplaintsForTenantDepartmentMonth(
      tenantId,
      department.id,
      monthStart,
      monthEnd,
    );
    const trackingId = buildTrackingId({
      tenantCode: tenant.code,
      departmentCode: department.code,
      sequenceNumber: existingCount + 1,
      date: now,
    });

    const complaint = await repo.createComplaint(
      {
        tenantId,
        trackingId,
        citizenId: citizenProfile.id,
        departmentId: department.id,
        categoryId: category.id,
        statusId: registeredStatus.id,
        priority: category.defaultPriority,
        severity: null,
        language: body.languageCode,
        description: body.description,
        locationAddress,
        locationLatitude: location.latitude ?? null,
        locationLongitude: location.longitude ?? null,
        currentDepartmentName: department.name,
      },
      transaction,
    );

    await repo.createStatusHistory(
      {
        complaintId: complaint.id,
        fromStatusId: null,
        toStatusId: registeredStatus.id,
        changedBy: user.id,
        note: 'Complaint registered.',
      },
      transaction,
    );

    await repo.publishEvent(
      {
        tenantId,
        eventType: EVENT_TYPES.COMPLAINT_CREATED,
        complaintId: complaint.id,
        payloadSummary: { trackingId, categoryId: category.id, departmentId: department.id },
      },
      transaction,
    );

    await transaction.commit();
    await audit(user, 'COMPLAINT_CREATED', complaint.id, `Registered ${trackingId}`);

    return {
      id: String(complaint.id),
      trackingId,
      statusLabel: registeredStatus.label,
      createdAt: complaint.createdAt,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// --- 4.2 Register Voice Complaint --------------------------------------------
// The Voice Agent (speech-to-text, Tamil detection, classification hand-off
// — SRS §3.6, Section 5's AI APIs) is explicitly out of scope this phase,
// and there is no non-AI path to derive a category/department from an
// audio file alone. File format/size are validated for real (the same
// upload pipeline as attachments); the actual complaint-creation step
// responds 501 rather than fabricating a classification result.
async function registerVoice(user, audioFile) {
  if (!audioFile) {
    throw ApiError.validation('Request failed validation', [
      { field: 'audioFile', issue: 'REQUIRED', message: 'audioFile is required.' },
    ]);
  }
  if (audioFile.size > env.complaint.maxVoiceFileSizeBytes) {
    throw new ApiError({
      statusCode: 413,
      category: 'validation',
      code: 'FILE_TOO_LARGE',
      message: `Audio file exceeds the ${env.complaint.maxVoiceFileSizeBytes} byte limit.`,
    });
  }
  const mimeType = detectAudioMimeType(audioFile.buffer);
  if (!mimeType) {
    throw new ApiError({
      statusCode: 415,
      category: 'validation',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'audioFile must be a genuine WAV, MP3, or OGG recording (magic-byte verified).',
    });
  }

  throw new ApiError({
    statusCode: 501,
    category: 'business',
    code: 'NOT_ENABLED',
    message:
      'The audio file passed format/size validation, but transcription and classification require the AI Voice ' +
      'Agent (SRS §3.6), which is out of scope for this phase. Submit a text complaint via POST /api/v1/complaints instead.',
  });
}

// --- 4.3 Upload Complaint Attachment -----------------------------------------
async function uploadAttachment(user, complaintId, file, assetCategory) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);

  if (!file) {
    throw ApiError.validation('Request failed validation', [
      { field: 'file', issue: 'REQUIRED', message: 'file is required.' },
    ]);
  }
  if (!assetCategory) {
    throw ApiError.validation('Request failed validation', [
      { field: 'assetCategory', issue: 'REQUIRED', message: 'assetCategory is required.' },
    ]);
  }

  if (file.size > env.complaint.maxAttachmentSizeBytes) {
    throw new ApiError({
      statusCode: 413,
      category: 'validation',
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the ${env.complaint.maxAttachmentSizeBytes} byte limit.`,
    });
  }

  const mimeType = detectImageMimeType(file.buffer);
  if (!mimeType) {
    throw new ApiError({
      statusCode: 415,
      category: 'validation',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'File must be a genuine JPEG, PNG, or WEBP image (magic-byte verified).',
    });
  }

  const attachmentCount = await repo.countAttachments(complaint.id);
  if (attachmentCount >= env.complaint.maxAttachmentsPerComplaint) {
    throw ApiError.unprocessable(
      'MAX_ATTACHMENTS_EXCEEDED',
      `A complaint may have at most ${env.complaint.maxAttachmentsPerComplaint} attachments.`,
    );
  }

  const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.webp';
  const storageFilename = `${crypto.randomUUID()}${extension}`;
  const storageDir = path.join(process.cwd(), env.upload.tmpDir);
  await fs.mkdir(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, storageFilename);
  await fs.writeFile(storagePath, file.buffer);

  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const retentionYears = assetCategory === 'voice' ? 5 : 10;
  const retentionExpiresAt = new Date();
  retentionExpiresAt.setFullYear(retentionExpiresAt.getFullYear() + retentionYears);

  const fileAsset = await repo.createFileAsset({
    tenantId,
    assetCategory,
    storagePath,
    mimeType,
    sizeBytes: file.size,
    checksum,
    uploadedBy: user.id,
    virusScanStatus: 'pending',
    lifecycleState: 'quarantine',
    linkedEntityType: 'complaint',
    linkedEntityId: complaint.id,
    retentionExpiresAt,
  });

  await audit(user, 'COMPLAINT_ATTACHMENT_UPLOADED', complaint.id, `Uploaded file_asset ${fileAsset.id}`);

  return dto.shapeAttachment(fileAsset);
}

// --- 4.4 Update Complaint -----------------------------------------------------
async function update(user, complaintId, body) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);

  if (complaint.status.code === STATUS.CLOSED) {
    throw ApiError.conflict('COMPLAINT_ALREADY_CLOSED', 'A closed complaint cannot be updated.');
  }

  const updates = {};
  let categoryChanged = false;
  let priorityChanged = false;

  if (body.categoryId !== undefined) {
    const category = await findActiveCategory(tenantId, body.categoryId);
    if (!category) {
      throw ApiError.validation('Request failed validation', [
        { field: 'categoryId', issue: 'NOT_FOUND', message: 'categoryId does not belong to this tenant.' },
      ]);
    }
    updates.categoryId = category.id;
    categoryChanged = true;
  }
  if (body.priority !== undefined) {
    updates.priority = priorityToInt(body.priority);
    priorityChanged = true;
  }
  if (body.severity !== undefined) {
    updates.severity = body.severity;
  }

  await complaint.update(updates);

  if (categoryChanged || priorityChanged) {
    const rule = await repo.findMatchingSlaRule(
      tenantId,
      complaint.departmentId,
      complaint.categoryId,
      complaint.priority,
    );
    if (rule) {
      const dueAt = new Date(Date.now() + rule.resolutionHours * 60 * 60 * 1000);
      await repo.upsertSlaTracking(complaint.id, rule.id, dueAt);
    }
  }

  await audit(user, 'COMPLAINT_UPDATED', complaint.id, JSON.stringify(body));

  const refreshed = await loadComplaintOr404(tenantId, complaintId);
  const attachments = await repo.listAttachments(complaint.id);
  return dto.shapeComplaintDetail(refreshed, { attachments });
}

// --- 4.5 Complaint Details -----------------------------------------------------
async function getDetails(user, complaintId) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);
  const attachments = await repo.listAttachments(complaint.id);
  return dto.shapeComplaintDetail(complaint, { attachments });
}

// --- 4.6 Complaint Timeline ----------------------------------------------------
async function getTimeline(user, complaintId, { limit, cursor }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);

  const before = decodeCursor(cursor);
  const entries = await repo.getTimeline(complaint.id, { limit: limit + 1, before });
  const { page, meta } = buildPaginationMeta(entries, limit);
  return { data: page.map(dto.shapeTimelineEntry), meta };
}

// --- 4.7 Complaint Tracking ------------------------------------------------
async function track(user, trackingId) {
  const tenantId = await tenantIdOf(user);
  const complaint = await repo.findByTrackingId(tenantId, trackingId);
  if (!complaint) throw ApiError.notFound('TRACKING_ID_NOT_FOUND', 'No complaint matches this tracking ID.');

  const citizenProfile = await requireCitizenProfile(user);
  if (complaint.citizenId !== citizenProfile.id) throw ApiError.forbidden();

  return dto.shapeTrackingSummary(complaint);
}

// --- 4.8 Complaint List ---------------------------------------------------
async function list(user, { q, statusId, departmentId, categoryId, priority, createdAtGte, createdAtLte, slaDueAtLte, order, limit, cursor }) {
  const tenantId = await tenantIdOf(user);
  const where = {};

  if (statusId) where.statusId = statusId;
  if (categoryId) where.categoryId = categoryId;
  if (priority) where.priority = priorityToInt(priority);
  if (createdAtGte || createdAtLte) {
    where.createdAt = {};
    if (createdAtGte) where.createdAt[Op.gte] = createdAtGte;
    if (createdAtLte) where.createdAt[Op.lte] = createdAtLte;
  }
  if (slaDueAtLte) {
    where.slaDueAt = { [Op.lte]: slaDueAtLte };
  }
  if (q) {
    where.description = { [Op.like]: `%${q}%` };
  }

  // Scope: Officer -> own department queue; Department Admin -> own
  // department; Corporation/Super Admin -> whole tenant (SRS §3.3 "Pending/
  // Assigned Complaints Queue").
  if (user.userType === 'officer' || user.userType === 'department_admin') {
    const staffProfile = await findOwnStaffProfile(user);
    where.departmentId = staffProfile?.departmentId ?? -1;
  } else if (departmentId) {
    where.departmentId = departmentId;
  }

  const before = decodeCursor(cursor);
  if (before) {
    where.id = { [Op.lt]: before };
  }

  const rows = await repo.list({ tenantId, where, order, limit: limit + 1 });
  const { page, meta } = buildPaginationMeta(rows.rows ?? rows, limit);
  return { data: page.map(dto.shapeComplaintListItem), meta };
}

// --- 4.9 Complaint Assignment (also serves Reassignment) ---------------------
async function createAssignment(user, complaintId, { officerId, reason }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);

  if (complaint.status.code === STATUS.CLOSED) {
    throw ApiError.conflict('COMPLAINT_ALREADY_CLOSED', 'A closed complaint cannot be (re)assigned.');
  }

  // A Department Admin's manual-override reach is bounded to their own
  // department (SRS §3.4's "Department Admin (own department only)",
  // mirrored from src/services/admin.service.js#assertDepartmentScope) —
  // Corporation/Super Admin act tenant-wide.
  if (user.userType === 'department_admin') {
    const callerProfile = await findOwnStaffProfile(user);
    if (!callerProfile || callerProfile.departmentId !== complaint.departmentId) {
      throw ApiError.forbidden();
    }
  }

  const officerProfile = await repo.findActiveStaffProfile(tenantId, officerId);
  if (!officerProfile || officerProfile.departmentId !== complaint.departmentId) {
    throw ApiError.unprocessable('OFFICER_OUT_OF_SCOPE', 'officerId must be an active officer within this department.');
  }

  const assignedStatus = await requireStatus(tenantId, STATUS.ASSIGNED);
  const previousStatusId = complaint.statusId;

  const transaction = await repo.complaintTransaction();
  try {
    const previousAssignment = await repo.getActiveAssignment(complaint.id);
    if (previousAssignment) {
      await repo.closeAssignment(previousAssignment, transaction);
      await repo.adjustOfficerWorkload(previousAssignment.officerId, -1, transaction);
    }

    const assignment = await repo.createAssignment(
      {
        complaintId: complaint.id,
        officerId: officerProfile.id,
        assignedBy: user.id,
        assignedAt: new Date(),
      },
      transaction,
    );
    await repo.adjustOfficerWorkload(officerProfile.id, 1, transaction);

    await complaint.update(
      {
        statusId: assignedStatus.id,
        currentOfficerId: officerProfile.id,
        // staff_profile has no display-name column (same v1.0 gap as
        // Administration's user shape, src/dtos/admin.dto.js) — falls back
        // to the linked user's username.
        currentOfficerName: officerProfile.user?.username || officerProfile.employeeId || null,
      },
      { transaction },
    );

    await repo.createStatusHistory(
      {
        complaintId: complaint.id,
        fromStatusId: previousStatusId,
        toStatusId: assignedStatus.id,
        changedBy: user.id,
        note: reason || `Assigned to officer ${officerProfile.id}.`,
      },
      transaction,
    );

    const rule = await repo.findMatchingSlaRule(tenantId, complaint.departmentId, complaint.categoryId, complaint.priority);
    if (rule) {
      const dueAt = new Date(Date.now() + rule.resolutionHours * 60 * 60 * 1000);
      await repo.upsertSlaTracking(complaint.id, rule.id, dueAt, transaction);
      await complaint.update({ slaDueAt: dueAt }, { transaction });
    }

    await repo.publishEvent(
      {
        tenantId,
        eventType: EVENT_TYPES.COMPLAINT_ASSIGNED,
        complaintId: complaint.id,
        payloadSummary: { officerId: officerProfile.id, assignedBy: user.id },
      },
      transaction,
    );

    await transaction.commit();
    await audit(user, 'COMPLAINT_ASSIGNED', complaint.id, reason || `Assigned to officer ${officerProfile.id}`);

    return dto.shapeAssignment(assignment);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// --- 4.10 Complaint Resolution -----------------------------------------------
async function createResolution(user, complaintId, { resolutionNote, resolutionFileAssetIds }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);

  if (!PRE_RESOLUTION_STATUSES.includes(complaint.status.code)) {
    throw ApiError.conflict('INVALID_STATUS_TRANSITION', 'Complaint is already Resolved or Closed.');
  }

  if (Array.isArray(resolutionFileAssetIds) && resolutionFileAssetIds.length > 0) {
    const attachments = await repo.listAttachments(complaint.id);
    const ownedIds = new Set(attachments.map((a) => String(a.id)));
    const unknown = resolutionFileAssetIds.filter((id) => !ownedIds.has(String(id)));
    if (unknown.length > 0) {
      throw ApiError.validation('Request failed validation', [
        {
          field: 'resolutionFileAssetIds',
          issue: 'NOT_FOUND',
          message: 'One or more resolutionFileAssetIds are not attachments of this complaint.',
        },
      ]);
    }
  }

  const resolvedStatus = await requireStatus(tenantId, STATUS.RESOLVED);
  const previousStatusId = complaint.statusId;
  const resolvedAt = new Date();

  const transaction = await repo.complaintTransaction();
  try {
    await complaint.update({ statusId: resolvedStatus.id, resolvedAt }, { transaction });
    await repo.createStatusHistory(
      {
        complaintId: complaint.id,
        fromStatusId: previousStatusId,
        toStatusId: resolvedStatus.id,
        changedBy: user.id,
        note: resolutionNote,
      },
      transaction,
    );
    await repo.publishEvent(
      {
        tenantId,
        eventType: EVENT_TYPES.COMPLAINT_RESOLVED,
        complaintId: complaint.id,
        payloadSummary: { resolvedBy: user.id },
      },
      transaction,
    );
    await transaction.commit();
    await audit(user, 'COMPLAINT_RESOLVED', complaint.id, resolutionNote);

    return { complaintId: String(complaint.id), statusLabel: resolvedStatus.label, resolvedAt };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// --- 4.11 Complaint Closure ----------------------------------------------------
async function createClosure(user, complaintId, { closureReasonId, remarks }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  await assertAccess(user, complaint);

  if (complaint.status.code !== STATUS.RESOLVED) {
    throw ApiError.conflict('INVALID_STATUS_TRANSITION', 'Only a Resolved complaint may be closed.');
  }

  const closedStatus = await requireStatus(tenantId, STATUS.CLOSED);
  const previousStatusId = complaint.statusId;
  const closedAt = new Date();

  // closureReasonId is documented as a reference_value (CLOSURE_REASON
  // domain, DATABASE_DESIGN.md §29) — a v1.1, not-yet-approved table
  // (DATABASE_DESIGN.md §36). Rather than inventing that table/column, the
  // caller-supplied reason id/remarks are recorded as descriptive text in
  // the already-existing complaint_status_history.note column.
  const note = remarks ? `Closure reason: ${closureReasonId}. Remarks: ${remarks}` : `Closure reason: ${closureReasonId}.`;

  const transaction = await repo.complaintTransaction();
  try {
    await complaint.update({ statusId: closedStatus.id, closedAt }, { transaction });
    await repo.createStatusHistory(
      {
        complaintId: complaint.id,
        fromStatusId: previousStatusId,
        toStatusId: closedStatus.id,
        changedBy: user.id,
        note,
      },
      transaction,
    );
    await repo.publishEvent(
      {
        tenantId,
        eventType: EVENT_TYPES.COMPLAINT_CLOSED,
        complaintId: complaint.id,
        payloadSummary: { closureReasonId },
      },
      transaction,
    );
    await transaction.commit();
    await audit(user, 'COMPLAINT_CLOSED', complaint.id, note);

    return { complaintId: String(complaint.id), statusLabel: closedStatus.label, closedAt };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// --- 4.12 Citizen Feedback -----------------------------------------------------
async function submitFeedback(user, complaintId, { rating, comment }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  const citizenProfile = await requireCitizenProfile(user);
  if (complaint.citizenId !== citizenProfile.id) throw ApiError.forbidden();

  if (![STATUS.RESOLVED, STATUS.CLOSED].includes(complaint.status.code)) {
    throw ApiError.conflict('COMPLAINT_NOT_YET_RESOLVED', 'Feedback may only be submitted after resolution.');
  }

  const existing = await repo.findFeedback(complaint.id);
  if (existing) {
    throw ApiError.conflict('FEEDBACK_ALREADY_SUBMITTED', 'Feedback has already been submitted for this complaint.');
  }

  const submittedAt = new Date();
  await repo.createFeedback({ complaintId: complaint.id, rating, comment: comment ?? null, submittedAt });
  await repo.publishEvent({
    tenantId,
    eventType: EVENT_TYPES.CITIZEN_FEEDBACK_RECEIVED,
    complaintId: complaint.id,
    payloadSummary: { rating },
  });
  await audit(user, 'COMPLAINT_FEEDBACK_SUBMITTED', complaint.id, `rating=${rating}`);

  return { complaintId: String(complaint.id), rating, comment: comment ?? null, submittedAt };
}

// --- 4.13 Complaint Reopen -----------------------------------------------------
async function reopen(user, complaintId, { reason }) {
  const tenantId = await tenantIdOf(user);
  const complaint = await loadComplaintOr404(tenantId, complaintId);
  const citizenProfile = await requireCitizenProfile(user);
  if (complaint.citizenId !== citizenProfile.id) throw ApiError.forbidden();

  if (complaint.status.code !== STATUS.CLOSED) {
    throw ApiError.conflict('COMPLAINT_NOT_CLOSED', 'Only a Closed complaint may be reopened.');
  }

  const windowMs = env.complaint.reopenWindowDays * 24 * 60 * 60 * 1000;
  if (complaint.closedAt && Date.now() - new Date(complaint.closedAt).getTime() > windowMs) {
    throw ApiError.conflict('REOPEN_WINDOW_EXPIRED', `The ${env.complaint.reopenWindowDays}-day reopen window has passed.`);
  }

  const reopenedStatus = await requireStatus(tenantId, STATUS.REOPENED);
  const previousStatusId = complaint.statusId;

  const transaction = await repo.complaintTransaction();
  try {
    // "Reopening creates a new complaint_assignment/sla_tracking cycle
    // rather than mutating the original resolution record"
    // (API_SPECIFICATION.md §4.13): the prior assignment is closed and the
    // officer cleared so the next Assignment call starts a fresh cycle;
    // sla_tracking is left as historical record until re-assignment
    // recomputes it (upsertSlaTracking is idempotent 1:1 per complaint).
    const previousAssignment = await repo.getActiveAssignment(complaint.id);
    if (previousAssignment) {
      await repo.closeAssignment(previousAssignment, transaction);
      await repo.adjustOfficerWorkload(previousAssignment.officerId, -1, transaction);
    }

    await complaint.update({ statusId: reopenedStatus.id, currentOfficerId: null, currentOfficerName: null }, { transaction });

    const historyEntry = await repo.createStatusHistory(
      {
        complaintId: complaint.id,
        fromStatusId: previousStatusId,
        toStatusId: reopenedStatus.id,
        changedBy: user.id,
        note: reason,
      },
      transaction,
    );

    await repo.publishEvent(
      {
        tenantId,
        eventType: EVENT_TYPES.COMPLAINT_REOPENED,
        complaintId: complaint.id,
        payloadSummary: { reason },
      },
      transaction,
    );

    await transaction.commit();
    await audit(user, 'COMPLAINT_REOPENED', complaint.id, reason);

    // complaint has no dedicated reopenedAt column (v1.0 schema) — the
    // status_history row's own createdAt is the genuine, accurate moment
    // the reopen was recorded, so it is used as the response's
    // "reopenedAt" rather than inventing a column.
    return { complaintId: String(complaint.id), statusLabel: reopenedStatus.label, reopenedAt: historyEntry.createdAt };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  STATUS,
  PRE_RESOLUTION_STATUSES,
  EVENT_TYPES,
  register,
  registerVoice,
  uploadAttachment,
  update,
  getDetails,
  getTimeline,
  track,
  list,
  createAssignment,
  createResolution,
  createClosure,
  submitFeedback,
  reopen,
};
