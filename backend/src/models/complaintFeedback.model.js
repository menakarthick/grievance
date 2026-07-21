'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ComplaintFeedback = sequelize.define(
    'ComplaintFeedback',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { isInt: true, min: 1, max: 5 },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      submittedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      ...baseOptions({
        comment: 'Citizen post-resolution feedback (SRS §3.2, Section 6).',
        paranoid: true,
      }),
      tableName: 'complaint_feedback',
      indexes: [{ fields: ['complaint_id'], unique: true, name: 'uq_complaint_feedback_complaint' }],
    },
  );

  ComplaintFeedback.associate = (models) => {
    ComplaintFeedback.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
  };

  return ComplaintFeedback;
};
