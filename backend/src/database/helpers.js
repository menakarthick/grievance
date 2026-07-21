'use strict';

// Shared conventions applied consistently across every model/migration in
// backend/src/models and backend/src/migrations, per docs/DATABASE_DESIGN.md
// Section 2 (Naming Standards), Section 3 (Multi-Tenant Strategy), Section 4
// (Entity Identification), Section 21 (Soft Delete Strategy), and Section 32
// (Data Dictionary Standards, applied here by explicit instruction rather
// than retroactive mandate). Centralizing them here means each model file
// only states what is actually specific to that table.

const { DataTypes } = require('sequelize');

// Section 19 flags complaint, complaint_status_history, audit_log,
// notification_dispatch, ai_agent_invocation_log, voice_transcript as the
// high-volume, time-series-shaped tables. BIGINT UNSIGNED surrogate keys are
// used for those plus the rest of the Transaction/Workflow/AI/Audit/
// Notification/File/Reporting groups they belong to; every lower-volume
// Master/Configuration/Security table uses INTEGER UNSIGNED (Section 4).
const ID_TYPE = Object.freeze({
  INTEGER: 'INTEGER',
  BIGINT: 'BIGINT',
});

function refType(idType) {
  return idType === ID_TYPE.BIGINT ? DataTypes.BIGINT.UNSIGNED : DataTypes.INTEGER.UNSIGNED;
}

function idColumn(idType) {
  return {
    id: {
      type: refType(idType),
      autoIncrement: true,
      primaryKey: true,
    },
  };
}

// tenant_id — present only on tables docs/DATABASE_DESIGN.md explicitly
// lists it for (Section 3); always the first column in composite indexes.
function tenantIdColumn({ allowNull = false } = {}) {
  return {
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull,
      comment: 'FK to tenant.id — row-level multi-tenant isolation (Section 3).',
      references: { model: 'tenant', key: 'id' },
    },
  };
}

// created_by / updated_by — Section 32 "New standard", applied here across
// admin/system-writable tables per the explicit optimistic-locking/audit
// objective. Omitted on pure append-only log tables and junction tables,
// mirroring Section 32's own carve-outs ("there is no update to attribute",
// "a pure junction table ... needs none").
//
// Deliberately a *logical* reference to user.id (indexed, not a physical FK
// constraint): `user` itself carries tenant_id -> tenant.id, and `tenant`
// carries created_by/updated_by -> user.id, so a hard-constrained pair would
// be circular and unbootstrappable (no user can exist before the first
// tenant, no tenant-scoped audit actor can exist before the first tenant).
// This is standard practice for audit/actor columns.
function auditColumns(idType) {
  return {
    createdBy: {
      type: refType(idType),
      allowNull: true,
      comment: 'Logical FK to user.id — actor who created this row; null for system/scheduler-originated rows.',
    },
    updatedBy: {
      type: refType(idType),
      allowNull: true,
      comment: 'Logical FK to user.id — actor who last updated this row; null for system-originated updates.',
    },
  };
}

function deletedByColumn(idType) {
  return {
    deletedBy: {
      type: refType(idType),
      allowNull: true,
      comment:
        'Logical FK to user.id — admin who soft-deleted this row; stays null on the automated retention-expiry hard-delete path (Section 21).',
    },
  };
}

// Standard model options. `paranoid` follows Section 21: Master/Configuration
// /Transaction tables default to true; the explicit exceptions (audit_log,
// complaint_status_history) and every Workflow/AI/Audit/Notification/File/
// Security/Reporting table pass paranoid:false. `updatedAt: false` marks the
// append-only tables Section 17/21 describe as never updated in place.
function baseOptions({ comment, paranoid = false, updatedAt = true, freezeTableName = true } = {}) {
  return {
    comment,
    paranoid,
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: updatedAt ? 'updatedAt' : false,
    deletedAt: paranoid ? 'deletedAt' : undefined,
    underscored: true,
    freezeTableName,
  };
}

// Default scope excluding soft-deleted rows is already Sequelize's paranoid
// default; `withDeleted` gives admin/audit call sites an explicit opt-out.
function withDeletedScope() {
  return { withDeleted: { paranoid: false } };
}

module.exports = {
  ID_TYPE,
  refType,
  idColumn,
  tenantIdColumn,
  auditColumns,
  deletedByColumn,
  baseOptions,
  withDeletedScope,
};
