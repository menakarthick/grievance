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
  const Ward = sequelize.define(
    'Ward',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      zoneId: {
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
        comment: 'Tenant-configurable geographic hierarchy, leaf level, belongs to zone (SRS §7, Section 5).',
        paranoid: true,
      }),
      tableName: 'ward',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_ward_tenant' },
        { fields: ['zone_id'], name: 'ix_ward_zone' },
        { fields: ['tenant_id', 'code'], unique: true, name: 'uq_ward_tenant_code' },
      ],
    },
  );

  Ward.associate = (models) => {
    Ward.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    Ward.belongsTo(models.Zone, { foreignKey: 'zoneId', as: 'zone' });
    Ward.hasMany(models.CitizenProfile, { foreignKey: 'wardId', as: 'citizenProfiles' });
  };

  return Ward;
};
