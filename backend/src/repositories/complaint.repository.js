'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Complaint,
  ComplaintStatusDefinition,
  ComplaintStatusHistory,
  ComplaintAssignment,
  ComplaintFeedback,
  SlaRuleConfig,
  SlaTracking,
  OfficerWorkload,
  StaffProfile,
  FileAsset,
  Ward,
  NotificationEvent,
} = require('../models');

const DETAIL_INCLUDE = ['category', 'status'];

function complaintTransaction() {
  return sequelize.transaction();
}

function createComplaint(data, transaction) {
  return Complaint.create(data, { transaction });
}

function findById(tenantId, id, { include = DETAIL_INCLUDE, transaction } = {}) {
  return Complaint.findOne({ where: { id, tenantId }, include, transaction });
}

function findByTrackingId(tenantId, trackingId) {
  return Complaint.findOne({ where: { tenantId, trackingId }, include: DETAIL_INCLUDE });
}

function update(instance, data, transaction) {
  return instance.update(data, { transaction });
}

async function list({ tenantId, where, order, limit, offset }) {
  return Complaint.findAndCountAll({
    where: { tenantId, ...where },
    include: ['category', 'status', 'department'],
    order,
    limit,
    offset,
  });
}

// Tracking-ID sequence: count existing complaints for this tenant +
// department + calendar month, +1. A dedicated sequence/counter table
// would be the race-proof answer, but DATABASE_DESIGN.md §5/§6 defines no
// such table for this purpose, and inventing one is out of scope here —
// documented, accepted limitation for this phase (low collision risk at
// pilot volume; a genuine fix needs a new, separately-approved table).
async function countComplaintsForTenantDepartmentMonth(tenantId, departmentId, monthStart, monthEnd) {
  return Complaint.count({
    where: { tenantId, departmentId, createdAt: { [Op.gte]: monthStart, [Op.lt]: monthEnd } },
    paranoid: false,
  });
}

function getStatusByCode(tenantId, code) {
  return ComplaintStatusDefinition.findOne({ where: { tenantId, code } });
}

function createStatusHistory(data, transaction) {
  return ComplaintStatusHistory.create(data, { transaction });
}

function getTimeline(complaintId, { limit, before }) {
  const where = { complaintId };
  if (before) where.id = { [Op.lt]: before };
  return ComplaintStatusHistory.findAll({
    where,
    include: ['fromStatus', 'toStatus', 'changedByUser'],
    order: [['id', 'DESC']],
    limit,
  });
}

function getActiveAssignment(complaintId) {
  return ComplaintAssignment.findOne({ where: { complaintId, unassignedAt: null }, order: [['assignedAt', 'DESC']] });
}

function closeAssignment(assignment, transaction) {
  return assignment.update({ unassignedAt: new Date() }, { transaction });
}

function createAssignment(data, transaction) {
  return ComplaintAssignment.create(data, { transaction });
}

function findActiveStaffProfile(tenantId, officerId) {
  return StaffProfile.findOne({
    where: { id: officerId },
    include: [{ association: 'user', where: { tenantId, status: 'active' } }],
  });
}

async function adjustOfficerWorkload(officerId, delta, transaction) {
  const [workload] = await OfficerWorkload.findOrCreate({
    where: { officerId },
    defaults: { activeComplaintCount: 0 },
    transaction,
  });
  const next = Math.max(0, workload.activeComplaintCount + delta);
  await workload.update({ activeComplaintCount: next }, { transaction });
}

function findMatchingSlaRule(tenantId, departmentId, categoryId, priority) {
  return SlaRuleConfig.findOne({
    where: {
      tenantId,
      departmentId,
      categoryId,
      priority,
      effectiveFrom: { [Op.lte]: new Date() },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gt]: new Date() } }],
    },
    order: [['version', 'DESC']],
  });
}

async function upsertSlaTracking(complaintId, slaRuleConfigId, dueAt, transaction) {
  const existing = await SlaTracking.findOne({ where: { complaintId }, transaction });
  if (existing) {
    await existing.update({ slaRuleConfigId, dueAt }, { transaction });
    return existing;
  }
  return SlaTracking.create({ complaintId, slaRuleConfigId, dueAt }, { transaction });
}

function getSlaTracking(complaintId) {
  return SlaTracking.findOne({ where: { complaintId } });
}

function findFeedback(complaintId) {
  return ComplaintFeedback.findOne({ where: { complaintId } });
}

function createFeedback(data) {
  return ComplaintFeedback.create(data);
}

function createFileAsset(data) {
  return FileAsset.create(data);
}

function countAttachments(complaintId) {
  return FileAsset.count({ where: { linkedEntityType: 'complaint', linkedEntityId: complaintId } });
}

function listAttachments(complaintId) {
  return FileAsset.findAll({
    where: { linkedEntityType: 'complaint', linkedEntityId: complaintId },
    order: [['createdAt', 'ASC']],
  });
}

function findActiveWard(tenantId, wardId) {
  return Ward.findOne({ where: { id: wardId, tenantId, isActive: true } });
}

// "Publish internal domain events... consumed later by the Notification
// module" — implemented via notification_event (DATABASE_DESIGN.md
// Section 11: "The domain event that triggered a notification"), the
// exact, already-approved table for this purpose. No new events table or
// queue is invented.
function publishEvent({ tenantId, eventType, complaintId, payloadSummary }, transaction) {
  return NotificationEvent.create({ tenantId, eventType, complaintId, payloadSummary }, { transaction });
}

module.exports = {
  complaintTransaction,
  createComplaint,
  findById,
  findByTrackingId,
  update,
  list,
  countComplaintsForTenantDepartmentMonth,
  getStatusByCode,
  createStatusHistory,
  getTimeline,
  getActiveAssignment,
  closeAssignment,
  createAssignment,
  findActiveStaffProfile,
  adjustOfficerWorkload,
  findMatchingSlaRule,
  upsertSlaTracking,
  getSlaTracking,
  findFeedback,
  createFeedback,
  createFileAsset,
  countAttachments,
  listAttachments,
  findActiveWard,
  publishEvent,
};
