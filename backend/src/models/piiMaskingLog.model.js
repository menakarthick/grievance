'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const PiiMaskingLog = sequelize.define(
    'PiiMaskingLog',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      piiTypesDetected: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: 'List of PII type codes found (e.g. Aadhaar/PAN/Mobile) — never the values themselves (SRS §10).',
      },
      maskedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      ...baseOptions({
        comment:
          'Evidence that the mandatory masking gate ran, and which PII types were found (SRS §10, Section 9) — the compliance artifact proving the masking pipeline is not bypassable.',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'pii_masking_log',
      indexes: [{ fields: ['complaint_id'], name: 'ix_pii_masking_log_complaint' }],
    },
  );

  PiiMaskingLog.associate = (models) => {
    PiiMaskingLog.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
  };

  return PiiMaskingLog;
};
