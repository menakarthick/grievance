'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const OfficerAiQueryLog = sequelize.define(
    'OfficerAiQueryLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      officerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      queryText: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      responseSummary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      agentType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
    },
    {
      ...baseOptions({
        comment: 'Officer AI Agent conversational query + response, for audit/analytics (SRS §3.3, Section 9).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'officer_ai_query_log',
      indexes: [{ fields: ['officer_id', 'created_at'], name: 'ix_officer_ai_query_log_officer_created' }],
    },
  );

  OfficerAiQueryLog.associate = (models) => {
    OfficerAiQueryLog.belongsTo(models.StaffProfile, { foreignKey: 'officerId', as: 'officer' });
  };

  return OfficerAiQueryLog;
};
