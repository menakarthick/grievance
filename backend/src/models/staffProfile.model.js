'use strict';

const { ID_TYPE, idColumn, auditColumns, deletedByColumn, baseOptions } = require('../database/helpers');
const { ASSIGNMENT_SCOPE_TYPES } = require('../database/constants');

module.exports = (sequelize, DataTypes) => {
  const StaffProfile = sequelize.define(
    'StaffProfile',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
        comment: '1:1 with user where user_type != citizen (Section 5).',
      },
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'Null for a Super Admin, whose scope spans tenants/departments (Section 17).',
      },
      hierarchyLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      scopeType: {
        type: DataTypes.STRING(16),
        allowNull: true,
        validate: { isIn: [ASSIGNMENT_SCOPE_TYPES] },
      },
      scopeId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      employeeId: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment:
          'Shared profile for Officer, Department Admin, Corporation Admin, Super Admin — consolidation decision explained in Section 17.',
        paranoid: true,
      }),
      tableName: 'staff_profile',
      indexes: [
        { fields: ['user_id'], unique: true, name: 'uq_staff_profile_user' },
        { fields: ['department_id'], name: 'ix_staff_profile_department' },
        { fields: ['hierarchy_level_id'], name: 'ix_staff_profile_hierarchy_level' },
      ],
    },
  );

  StaffProfile.associate = (models) => {
    StaffProfile.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    StaffProfile.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    StaffProfile.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'hierarchyLevelId', as: 'hierarchyLevel' });
    StaffProfile.hasMany(models.ComplaintAssignment, { foreignKey: 'officerId', as: 'complaintAssignments' });
    StaffProfile.hasOne(models.OfficerWorkload, { foreignKey: 'officerId', as: 'officerWorkload' });
    StaffProfile.hasMany(models.ApprovalAction, { foreignKey: 'approverId', as: 'approvalActions' });
    StaffProfile.hasMany(models.OfficerAiQueryLog, { foreignKey: 'officerId', as: 'officerAiQueryLogs' });
    StaffProfile.hasMany(models.WeeklyOfficerPerformance, { foreignKey: 'officerId', as: 'weeklyPerformanceRecords' });
    StaffProfile.hasMany(models.Complaint, { foreignKey: 'currentOfficerId', as: 'currentlyAssignedComplaints' });
  };

  return StaffProfile;
};
