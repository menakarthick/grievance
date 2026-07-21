'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const SlaTracking = sequelize.define(
    'SlaTracking',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      slaRuleConfigId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'The specific sla_rule_config version in effect at assignment time (Section 22).',
      },
      dueAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      breachedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Computed, complaint-specific SLA due date and breach status, derived from sla_rule_config at assignment time (Section 8).',
        paranoid: false,
      }),
      tableName: 'sla_tracking',
      indexes: [
        { fields: ['complaint_id'], unique: true, name: 'uq_sla_tracking_complaint' },
        { fields: ['sla_rule_config_id'], name: 'ix_sla_tracking_config' },
        { fields: ['due_at'], name: 'ix_sla_tracking_due_at' },
      ],
    },
  );

  SlaTracking.associate = (models) => {
    SlaTracking.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    SlaTracking.belongsTo(models.SlaRuleConfig, { foreignKey: 'slaRuleConfigId', as: 'slaRuleConfig' });
  };

  return SlaTracking;
};
