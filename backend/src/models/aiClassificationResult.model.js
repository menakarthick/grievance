'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const AiClassificationResult = sequelize.define(
    'AiClassificationResult',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      agentType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      detectedCategoryId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      detectedPriority: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      detectedSeverity: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      detectedLanguage: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      confidenceScore: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        validate: { min: 0, max: 1 },
      },
    },
    {
      ...baseOptions({
        comment:
          'Complaint Agent output — category/priority/department/severity/location/language detected, with confidence (Section 9).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'ai_classification_result',
      indexes: [
        { fields: ['complaint_id'], name: 'ix_acr_complaint' },
        { fields: ['detected_category_id'], name: 'ix_acr_detected_category' },
      ],
    },
  );

  AiClassificationResult.associate = (models) => {
    AiClassificationResult.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    AiClassificationResult.belongsTo(models.ComplaintCategory, {
      foreignKey: 'detectedCategoryId',
      as: 'detectedCategory',
    });
  };

  return AiClassificationResult;
};
