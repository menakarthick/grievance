'use strict';

const {
  ID_TYPE,
  idColumn,
  tenantIdColumn,
  auditColumns,
  deletedByColumn,
  baseOptions,
} = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define(
    'Department',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: true },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Tenant-configurable department list (SRS §6.2, Section 5).',
        paranoid: true,
      }),
      tableName: 'department',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_department_tenant' },
        { fields: ['tenant_id', 'code'], unique: true, name: 'uq_department_tenant_code' },
        { fields: ['tenant_id', 'is_active'], name: 'ix_department_tenant_active' },
      ],
      scopes: {
        active: { where: { isActive: true } },
      },
    },
  );

  Department.associate = (models) => {
    Department.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    Department.hasMany(models.ComplaintCategory, { foreignKey: 'departmentId', as: 'complaintCategories' });
    Department.hasMany(models.StaffProfile, { foreignKey: 'departmentId', as: 'staffProfiles' });
    Department.hasMany(models.Complaint, { foreignKey: 'departmentId', as: 'complaints' });
    Department.hasMany(models.SlaRuleConfig, { foreignKey: 'departmentId', as: 'slaRuleConfigs' });
    Department.hasMany(models.EscalationMatrixConfig, { foreignKey: 'departmentId', as: 'escalationMatrixConfigs' });
    Department.hasMany(models.DailyComplaintSummary, { foreignKey: 'departmentId', as: 'dailyComplaintSummaries' });
    Department.hasMany(models.MonthlyDepartmentReport, { foreignKey: 'departmentId', as: 'monthlyDepartmentReports' });
  };

  return Department;
};
