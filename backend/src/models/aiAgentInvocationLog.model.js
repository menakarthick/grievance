'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const AiAgentInvocationLog = sequelize.define(
    'AiAgentInvocationLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      agentType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      providerName: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      promptTokenCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { isInt: true, min: 0 },
      },
      responseTokenCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { isInt: true, min: 0 },
      },
      latencyMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { isInt: true, min: 0 },
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
    },
    {
      ...baseOptions({
        comment:
          'Every call to the AI provider — for cost/latency/failure governance (ARCHITECTURE.md §8.3, Section 9).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'ai_agent_invocation_log',
      indexes: [
        { fields: ['tenant_id', 'created_at'], name: 'ix_aail_tenant_created' },
        { fields: ['agent_type'], name: 'ix_aail_agent_type' },
        { fields: ['status'], name: 'ix_aail_status' },
      ],
    },
  );

  AiAgentInvocationLog.associate = (models) => {
    AiAgentInvocationLog.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
  };

  return AiAgentInvocationLog;
};
