'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const MonthlyDistrictReport = sequelize.define(
    'MonthlyDistrictReport',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      month: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'First day of the reporting month.',
      },
      districtId: {
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
        comment: 'Monthly district-scope aggregates for Analytics Agent trend/prediction features (Section 14).',
        paranoid: false,
      }),
      tableName: 'monthly_district_report',
      indexes: [{ fields: ['tenant_id', 'month', 'district_id'], unique: true, name: 'uq_mdr2_tenant_month_district' }],
    },
  );

  MonthlyDistrictReport.associate = (models) => {
    MonthlyDistrictReport.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    MonthlyDistrictReport.belongsTo(models.District, { foreignKey: 'districtId', as: 'district' });
  };

  return MonthlyDistrictReport;
};
