'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const EscalationInstance = sequelize.define(
    'EscalationInstance',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      escalationConfigId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      fromLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      toLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      triggeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      ...baseOptions({
        comment: 'A record of an actual escalation event that occurred on a complaint (Section 8).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'escalation_instance',
      indexes: [
        { fields: ['complaint_id'], name: 'ix_escalation_instance_complaint' },
        { fields: ['escalation_config_id'], name: 'ix_escalation_instance_config' },
      ],
    },
  );

  EscalationInstance.associate = (models) => {
    EscalationInstance.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    EscalationInstance.belongsTo(models.EscalationMatrixConfig, {
      foreignKey: 'escalationConfigId',
      as: 'escalationConfig',
    });
    EscalationInstance.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'fromLevelId', as: 'fromLevel' });
    EscalationInstance.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'toLevelId', as: 'toLevel' });
  };

  return EscalationInstance;
};
