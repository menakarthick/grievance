'use strict';

const {
  ID_TYPE,
  idColumn,
  tenantIdColumn,
  auditColumns,
  deletedByColumn,
  baseOptions,
} = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const Complaint = sequelize.define(
    'Complaint',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      trackingId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Citizen-facing Tracking ID {TenantCode}-{DeptCode}-{YYYYMM}-{SequenceNumber} (SRS §3.8, Section 4).',
        validate: { notEmpty: true },
      },
      citizenId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'FK to citizen_profile.id.',
      },
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      statusId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { isInt: true },
      },
      severity: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      language: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Unmasked complaint text — only masked copies ever leave the DB boundary (Principle 7, Section 1).',
      },
      locationAddress: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Physical decomposition of the conceptual "location (structured)" attribute (Section 6).',
      },
      locationLatitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      locationLongitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      currentOfficerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to staff_profile.id — the presently assigned officer.',
      },
      currentDepartmentName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Denormalized snapshot field to avoid join-heavy list/dashboard queries (Section 17).',
      },
      currentOfficerName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Denormalized snapshot field to avoid join-heavy list/dashboard queries (Section 17).',
      },
      slaDueAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ...auditColumns(ID_TYPE.BIGINT),
      ...deletedByColumn(ID_TYPE.BIGINT),
    },
    {
      ...baseOptions({
        comment: 'Core grievance record — central entity referenced by nearly every other table (Section 6).',
        paranoid: true,
      }),
      tableName: 'complaint',
      // Optimistic locking: complaint is the single hottest, most-concurrently
      // -written table in the system (Section 17/19) — an officer's status
      // update and the SLA Monitor scheduler's write can race. Sequelize
      // manages the added `version` column automatically (infra metadata,
      // Section 2's own treatment of created_at/updated_at as universal,
      // non-business columns).
      version: true,
      indexes: [
        { fields: ['tenant_id', 'status_id'], name: 'ix_complaint_tenant_status' },
        { fields: ['tenant_id', 'department_id', 'status_id'], name: 'ix_complaint_tenant_department_status' },
        { fields: ['tenant_id', 'current_officer_id', 'status_id'], name: 'ix_complaint_tenant_officer_status' },
        { fields: ['tenant_id', 'tracking_id'], unique: true, name: 'uq_complaint_tenant_tracking_id' },
        { fields: ['tenant_id', 'created_at'], name: 'ix_complaint_tenant_created' },
        { fields: ['tenant_id', 'sla_due_at'], name: 'ix_complaint_tenant_sla_due' },
      ],
      scopes: {
        open: { where: { closedAt: null } },
      },
    },
  );

  Complaint.associate = (models) => {
    Complaint.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    Complaint.belongsTo(models.CitizenProfile, { foreignKey: 'citizenId', as: 'citizen' });
    Complaint.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    Complaint.belongsTo(models.ComplaintCategory, { foreignKey: 'categoryId', as: 'category' });
    Complaint.belongsTo(models.ComplaintStatusDefinition, { foreignKey: 'statusId', as: 'status' });
    Complaint.belongsTo(models.StaffProfile, { foreignKey: 'currentOfficerId', as: 'currentOfficer' });
    Complaint.hasMany(models.ComplaintStatusHistory, { foreignKey: 'complaintId', as: 'statusHistory' });
    Complaint.hasMany(models.ComplaintAssignment, { foreignKey: 'complaintId', as: 'assignments' });
    Complaint.hasOne(models.VoiceComplaint, { foreignKey: 'complaintId', as: 'voiceComplaint' });
    Complaint.hasMany(models.FileAsset, {
      foreignKey: 'linkedEntityId',
      constraints: false,
      scope: { linkedEntityType: 'complaint' },
      as: 'fileAssets',
    });
    Complaint.hasOne(models.SlaTracking, { foreignKey: 'complaintId', as: 'slaTracking' });
    Complaint.hasMany(models.EscalationInstance, { foreignKey: 'complaintId', as: 'escalationInstances' });
    Complaint.hasMany(models.ApprovalRequest, { foreignKey: 'complaintId', as: 'approvalRequests' });
    Complaint.hasOne(models.ComplaintFeedback, { foreignKey: 'complaintId', as: 'feedback' });
    Complaint.hasMany(models.AiClassificationResult, { foreignKey: 'complaintId', as: 'aiClassificationResults' });
    Complaint.hasMany(models.PiiMaskingLog, { foreignKey: 'complaintId', as: 'piiMaskingLogs' });
    Complaint.hasMany(models.NotificationEvent, { foreignKey: 'complaintId', as: 'notificationEvents' });
  };

  return Complaint;
};
