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
  const ComplaintCategory = sequelize.define(
    'ComplaintCategory',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: true },
      },
      defaultPriority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: 'Default priority applied at registration for this category (SRS §3.4).',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Tenant-configurable complaint categories (SRS §3.4, Section 5).',
        paranoid: true,
      }),
      tableName: 'complaint_category',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_complaint_category_tenant' },
        { fields: ['department_id'], name: 'ix_complaint_category_department' },
        { fields: ['tenant_id', 'is_active'], name: 'ix_complaint_category_tenant_active' },
      ],
      scopes: {
        active: { where: { isActive: true } },
      },
    },
  );

  ComplaintCategory.associate = (models) => {
    ComplaintCategory.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    ComplaintCategory.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    ComplaintCategory.hasMany(models.Complaint, { foreignKey: 'categoryId', as: 'complaints' });
    ComplaintCategory.hasMany(models.SlaRuleConfig, { foreignKey: 'categoryId', as: 'slaRuleConfigs' });
    ComplaintCategory.hasMany(models.ApprovalWorkflowConfig, {
      foreignKey: 'categoryId',
      as: 'approvalWorkflowConfigs',
    });
    ComplaintCategory.hasMany(models.AiClassificationResult, {
      foreignKey: 'detectedCategoryId',
      as: 'aiClassificationResults',
    });
    ComplaintCategory.hasMany(models.DailyComplaintSummary, {
      foreignKey: 'categoryId',
      as: 'dailyComplaintSummaries',
    });
  };

  return ComplaintCategory;
};
