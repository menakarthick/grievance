'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const DailyComplaintSummary = sequelize.define(
    'DailyComplaintSummary',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      summaryDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      categoryId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      registeredCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      resolvedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      breachedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      ...baseOptions({
        comment:
          'Per tenant/department/ward/category daily counts by status, SLA breach count — populated by scheduled jobs, not live (Section 14, 17).',
        paranoid: false,
      }),
      tableName: 'daily_complaint_summary',
      indexes: [
        {
          fields: ['tenant_id', 'summary_date', 'department_id', 'category_id'],
          unique: true,
          name: 'uq_dcs_tenant_date_department_category',
        },
      ],
    },
  );

  DailyComplaintSummary.associate = (models) => {
    DailyComplaintSummary.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    DailyComplaintSummary.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    DailyComplaintSummary.belongsTo(models.ComplaintCategory, { foreignKey: 'categoryId', as: 'category' });
  };

  return DailyComplaintSummary;
};
