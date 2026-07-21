'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ComplaintStatusHistory = sequelize.define(
    'ComplaintStatusHistory',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      fromStatusId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'Null for the initial registration event (no prior status).',
      },
      toStatusId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      changedBy: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to user.id; null for system-driven transitions.',
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment:
          'Append-only timeline of every status change (SRS §3.2 Timeline, Section 6). Never updated, only inserted; never soft-deleted (Section 21 exception).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'complaint_status_history',
      indexes: [
        { fields: ['complaint_id', 'created_at'], name: 'ix_csh_complaint_created' },
        { fields: ['to_status_id'], name: 'ix_csh_to_status' },
      ],
    },
  );

  ComplaintStatusHistory.associate = (models) => {
    ComplaintStatusHistory.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    ComplaintStatusHistory.belongsTo(models.ComplaintStatusDefinition, {
      foreignKey: 'fromStatusId',
      as: 'fromStatus',
    });
    ComplaintStatusHistory.belongsTo(models.ComplaintStatusDefinition, { foreignKey: 'toStatusId', as: 'toStatus' });
    ComplaintStatusHistory.belongsTo(models.User, { foreignKey: 'changedBy', as: 'changedByUser' });
  };

  return ComplaintStatusHistory;
};
