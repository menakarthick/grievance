'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const MonthlyDepartmentReport = sequelize.define(
    'MonthlyDepartmentReport',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      month: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'First day of the reporting month.',
      },
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      metrics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Key metrics for Analytics Agent trend/prediction features (Section 14).',
      },
    },
    {
      ...baseOptions({
        comment: 'Monthly department aggregates for Analytics Agent trend/prediction features (Section 14).',
        paranoid: false,
      }),
      tableName: 'monthly_department_report',
      indexes: [
        { fields: ['tenant_id', 'month', 'department_id'], unique: true, name: 'uq_mdr_tenant_month_department' },
      ],
    },
  );

  MonthlyDepartmentReport.associate = (models) => {
    MonthlyDepartmentReport.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    MonthlyDepartmentReport.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
  };

  return MonthlyDepartmentReport;
};
