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
  const ApprovalWorkflowConfig = sequelize.define(
    'ApprovalWorkflowConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      categoryId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      requiredLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Config-effective-dating version (Section 22) — NOT an optimistic-locking column (Section 32).',
      },
      effectiveFrom: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      effectiveTo: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment:
          'Which categories/departments require multi-level approval, and at which hierarchy level, versioned (SRS §3.3, Section 7, 22).',
        paranoid: true,
      }),
      tableName: 'approval_workflow_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_awc_tenant' },
        { fields: ['category_id'], name: 'ix_awc_category' },
        { fields: ['required_level_id'], name: 'ix_awc_required_level' },
      ],
    },
  );

  ApprovalWorkflowConfig.associate = (models) => {
    ApprovalWorkflowConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    ApprovalWorkflowConfig.belongsTo(models.ComplaintCategory, { foreignKey: 'categoryId', as: 'category' });
    ApprovalWorkflowConfig.belongsTo(models.OfficerHierarchyLevel, {
      foreignKey: 'requiredLevelId',
      as: 'requiredLevel',
    });
    ApprovalWorkflowConfig.hasMany(models.ApprovalRequest, { foreignKey: 'workflowConfigId', as: 'approvalRequests' });
  };

  return ApprovalWorkflowConfig;
};
