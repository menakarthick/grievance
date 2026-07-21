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
  const Zone = sequelize.define(
    'Zone',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      districtId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
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
        comment: 'Tenant-configurable geographic hierarchy, mid level, belongs to district (SRS §7, Section 5).',
        paranoid: true,
      }),
      tableName: 'zone',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_zone_tenant' },
        { fields: ['district_id'], name: 'ix_zone_district' },
        { fields: ['tenant_id', 'code'], unique: true, name: 'uq_zone_tenant_code' },
      ],
    },
  );

  Zone.associate = (models) => {
    Zone.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    Zone.belongsTo(models.District, { foreignKey: 'districtId', as: 'district' });
    Zone.hasMany(models.Ward, { foreignKey: 'zoneId', as: 'wards' });
  };

  return Zone;
};
