'use strict';

const { Op } = require('sequelize');
const { sequelize, FileAsset, AuditLog } = require('../models');

// Every "active file" query excludes soft-deleted rows via `deletedBy IS
// NULL` — file_asset has `paranoid: false` (no deleted_at column exists in
// the approved v1.0 migration), so Sequelize's automatic paranoid exclusion
// isn't available; deletedBy (which does exist —
// src/database/helpers.js#deletedByColumn) is the manual soft-delete
// marker instead (src/services/file.service.js#deleteFile).
const ACTIVE = { deletedBy: null };

function createFileAsset(data, options) {
  return FileAsset.create(data, options);
}

function findById(tenantId, id) {
  return FileAsset.findOne({ where: { id, tenantId, ...ACTIVE } });
}

function findByIdIncludingDeleted(tenantId, id) {
  return FileAsset.findOne({ where: { id, tenantId } });
}

function update(instance, data, options) {
  return instance.update(data, options);
}

function countForLinkedEntity(tenantId, linkedEntityType, linkedEntityId) {
  return FileAsset.count({ where: { tenantId, linkedEntityType, linkedEntityId, ...ACTIVE } });
}

function listForLinkedEntity(tenantId, linkedEntityType, linkedEntityId) {
  return FileAsset.findAll({ where: { tenantId, linkedEntityType, linkedEntityId, ...ACTIVE }, order: [['id', 'ASC']] });
}

async function search(tenantId, { q, assetCategory, linkedEntityType, linkedEntityId }, { limit, before } = {}) {
  const where = { tenantId, ...ACTIVE };
  if (assetCategory) where.assetCategory = assetCategory;
  if (linkedEntityType) where.linkedEntityType = linkedEntityType;
  if (linkedEntityId) where.linkedEntityId = linkedEntityId;
  if (q) where.storagePath = { [Op.like]: `%${q}%` };
  if (before) where.id = { [Op.lt]: before };
  return FileAsset.findAll({ where, order: [['id', 'DESC']], limit });
}

async function listArchived(tenantId, { assetCategory, archivedAtGte, archivedAtLte }, { limit, before } = {}) {
  const where = { tenantId, lifecycleState: 'archived', ...ACTIVE };
  if (assetCategory) where.assetCategory = assetCategory;
  if (archivedAtGte || archivedAtLte) {
    // archivedAt has no dedicated column (Section 12 has no such field) —
    // updatedAt is the closest honest proxy since archiving is itself an
    // update; see src/dtos/file.dto.js.
    where.updatedAt = {};
    if (archivedAtGte) where.updatedAt[Op.gte] = archivedAtGte;
    if (archivedAtLte) where.updatedAt[Op.lte] = archivedAtLte;
  }
  if (before) where.id = { [Op.lt]: before };
  return FileAsset.findAll({ where, order: [['id', 'DESC']], limit });
}

async function storageUsageSummary(tenantId) {
  const rows = await FileAsset.findAll({
    attributes: ['lifecycleState', [sequelize.fn('SUM', sequelize.col('size_bytes')), 'bytes']],
    where: { tenantId, ...ACTIVE },
    group: ['lifecycleState'],
    raw: true,
  });
  return rows.reduce((acc, r) => ({ ...acc, [r.lifecycleState]: Number(r.bytes) || 0 }), {});
}

async function storageUsageByCategory(tenantId) {
  return FileAsset.findAll({
    attributes: [
      'assetCategory',
      [sequelize.fn('SUM', sequelize.col('size_bytes')), 'bytes'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    where: { tenantId, ...ACTIVE },
    group: ['assetCategory'],
    raw: true,
  });
}

function findAuditTrail(fileAssetId, { limit, before } = {}) {
  const where = { entityType: 'file_asset', entityId: fileAssetId };
  if (before) where.id = { [Op.lt]: before };
  return AuditLog.findAll({ where, include: ['actorUser'], order: [['id', 'DESC']], limit });
}

module.exports = {
  createFileAsset,
  findById,
  findByIdIncludingDeleted,
  update,
  countForLinkedEntity,
  listForLinkedEntity,
  search,
  listArchived,
  storageUsageSummary,
  storageUsageByCategory,
  findAuditTrail,
};
