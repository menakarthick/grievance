'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ApprovalAction = sequelize.define(
    'ApprovalAction',
    {
      ...idColumn(ID_TYPE.BIGINT),
      approvalRequestId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      approverId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'FK to staff_profile.id.',
      },
      decision: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      decidedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      ...baseOptions({
        comment: "An individual approver's decision on an approval_request (Section 8).",
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'approval_action',
      indexes: [
        { fields: ['approval_request_id'], name: 'ix_approval_action_request' },
        { fields: ['approver_id'], name: 'ix_approval_action_approver' },
      ],
    },
  );

  ApprovalAction.associate = (models) => {
    ApprovalAction.belongsTo(models.ApprovalRequest, { foreignKey: 'approvalRequestId', as: 'approvalRequest' });
    ApprovalAction.belongsTo(models.StaffProfile, { foreignKey: 'approverId', as: 'approver' });
    ApprovalAction.hasMany(models.FileAsset, {
      foreignKey: 'linkedEntityId',
      constraints: false,
      scope: { linkedEntityType: 'approval_action' },
      as: 'fileAssets',
    });
  };

  return ApprovalAction;
};
