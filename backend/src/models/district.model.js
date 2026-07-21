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
  // Top level of the tenant's configurable geographic tree (Section 5:
  // "district / zone / ward ... self-referential geographic tree per
  // tenant"). Modeled as district -> zone -> ward.
  const District = sequelize.define(
    'District',
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
        comment: 'Tenant-configurable geographic hierarchy, top level (SRS §7, Section 5).',
        paranoid: true,
      }),
      tableName: 'district',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_district_tenant' },
        { fields: ['tenant_id', 'code'], unique: true, name: 'uq_district_tenant_code' },
      ],
    },
  );

  District.associate = (models) => {
    District.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    District.hasMany(models.Zone, { foreignKey: 'districtId', as: 'zones' });
    District.hasMany(models.MonthlyDistrictReport, { foreignKey: 'districtId', as: 'monthlyDistrictReports' });
  };

  return District;
};
