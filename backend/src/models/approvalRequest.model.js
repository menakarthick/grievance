'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ApprovalRequest = sequelize.define(
    'ApprovalRequest',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      workflowConfigId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'FK to approval_workflow_config.id.',
      },
      requestedLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
        validate: { notEmpty: true },
      },
      requestedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      ...baseOptions({
        comment: 'An instance of a required approval step for a specific complaint (Section 8).',
        paranoid: false,
      }),
      tableName: 'approval_request',
      indexes: [
        { fields: ['complaint_id'], name: 'ix_approval_request_complaint' },
        { fields: ['workflow_config_id'], name: 'ix_approval_request_workflow_config' },
        { fields: ['status'], name: 'ix_approval_request_status' },
      ],
    },
  );

  ApprovalRequest.associate = (models) => {
    ApprovalRequest.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    ApprovalRequest.belongsTo(models.ApprovalWorkflowConfig, { foreignKey: 'workflowConfigId', as: 'workflowConfig' });
    ApprovalRequest.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'requestedLevelId', as: 'requestedLevel' });
    ApprovalRequest.hasMany(models.ApprovalAction, { foreignKey: 'approvalRequestId', as: 'approvalActions' });
  };

  return ApprovalRequest;
};
