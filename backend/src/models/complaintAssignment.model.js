'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ComplaintAssignment = sequelize.define(
    'ComplaintAssignment',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      officerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'FK to staff_profile.id.',
      },
      assignedBy: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to user.id — system/Assignment Engine or manual; null for system-originated assignment.',
      },
      assignedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      unassignedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      ...baseOptions({
        comment: 'Officer assignment record — a new row per (re)assignment, not an update-in-place (Section 6).',
        paranoid: true,
      }),
      tableName: 'complaint_assignment',
      indexes: [
        { fields: ['complaint_id'], name: 'ix_complaint_assignment_complaint' },
        { fields: ['officer_id'], name: 'ix_complaint_assignment_officer' },
        { fields: ['complaint_id', 'unassigned_at'], name: 'ix_complaint_assignment_active' },
      ],
      scopes: {
        active: { where: { unassignedAt: null } },
      },
    },
  );

  ComplaintAssignment.associate = (models) => {
    ComplaintAssignment.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    ComplaintAssignment.belongsTo(models.StaffProfile, { foreignKey: 'officerId', as: 'officer' });
    ComplaintAssignment.belongsTo(models.User, { foreignKey: 'assignedBy', as: 'assignedByUser' });
  };

  return ComplaintAssignment;
};
