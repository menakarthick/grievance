'use strict';

const { ID_TYPE, idColumn, auditColumns, deletedByColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const Tenant = sequelize.define(
    'Tenant',
    {
      ...idColumn(ID_TYPE.INTEGER),
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: 'Unique tenant code (e.g. ULB code).',
        validate: { notEmpty: true, len: [1, 32] },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: true },
      },
      tenantType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'ULB / Corporation / District / State Department, etc. (SRS §1.3).',
        validate: { notEmpty: true },
      },
      state: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'active',
        validate: { notEmpty: true },
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment:
          'One row per onboarded ULB/Corporation/District/State Department (SRS §1.3, Section 5). Root of all tenant-scoped data.',
        paranoid: true,
      }),
      tableName: 'tenant',
      indexes: [{ fields: ['status'], name: 'ix_tenant_status' }],
      scopes: {
        active: { where: { status: 'active' } },
      },
    },
  );

  Tenant.associate = (models) => {
    Tenant.hasMany(models.Department, { foreignKey: 'tenantId', as: 'departments' });
    Tenant.hasMany(models.OfficerHierarchyLevel, { foreignKey: 'tenantId', as: 'officerHierarchyLevels' });
    Tenant.hasMany(models.District, { foreignKey: 'tenantId', as: 'districts' });
    Tenant.hasMany(models.Zone, { foreignKey: 'tenantId', as: 'zones' });
    Tenant.hasMany(models.Ward, { foreignKey: 'tenantId', as: 'wards' });
    Tenant.hasMany(models.ComplaintCategory, { foreignKey: 'tenantId', as: 'complaintCategories' });
    Tenant.hasMany(models.User, { foreignKey: 'tenantId', as: 'users' });
    Tenant.hasMany(models.Role, { foreignKey: 'tenantId', as: 'roles' });
    Tenant.hasMany(models.ComplaintStatusDefinition, { foreignKey: 'tenantId', as: 'complaintStatusDefinitions' });
    Tenant.hasMany(models.SlaRuleConfig, { foreignKey: 'tenantId', as: 'slaRuleConfigs' });
    Tenant.hasMany(models.EscalationMatrixConfig, { foreignKey: 'tenantId', as: 'escalationMatrixConfigs' });
    Tenant.hasMany(models.ApprovalWorkflowConfig, { foreignKey: 'tenantId', as: 'approvalWorkflowConfigs' });
    Tenant.hasMany(models.NotificationTemplateConfig, { foreignKey: 'tenantId', as: 'notificationTemplateConfigs' });
    Tenant.hasMany(models.ProviderConfig, { foreignKey: 'tenantId', as: 'providerConfigs' });
    Tenant.hasMany(models.FeatureFlagConfig, { foreignKey: 'tenantId', as: 'featureFlagConfigs' });
    Tenant.hasMany(models.Complaint, { foreignKey: 'tenantId', as: 'complaints' });
    Tenant.hasMany(models.AuditLog, { foreignKey: 'tenantId', as: 'auditLogs' });
    Tenant.hasMany(models.ActivityLog, { foreignKey: 'tenantId', as: 'activityLogs' });
    Tenant.hasMany(models.NotificationEvent, { foreignKey: 'tenantId', as: 'notificationEvents' });
    Tenant.hasMany(models.FileAsset, { foreignKey: 'tenantId', as: 'fileAssets' });
    Tenant.hasMany(models.AiAgentInvocationLog, { foreignKey: 'tenantId', as: 'aiAgentInvocationLogs' });
    Tenant.hasMany(models.DailyComplaintSummary, { foreignKey: 'tenantId', as: 'dailyComplaintSummaries' });
    Tenant.hasMany(models.MonthlyDepartmentReport, { foreignKey: 'tenantId', as: 'monthlyDepartmentReports' });
    Tenant.hasMany(models.MonthlyDistrictReport, { foreignKey: 'tenantId', as: 'monthlyDistrictReports' });
    Tenant.hasMany(models.TrendSnapshot, { foreignKey: 'tenantId', as: 'trendSnapshots' });
  };

  return Tenant;
};
