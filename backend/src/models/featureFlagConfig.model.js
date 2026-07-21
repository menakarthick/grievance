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
  const FeatureFlagConfig = sequelize.define(
    'FeatureFlagConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      flagKey: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      flagType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'boolean',
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Tenant-scoped feature flags (INFRASTRUCTURE_DEVOPS.md §16, Section 7).',
        paranoid: true,
      }),
      tableName: 'feature_flag_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_ffc_tenant' },
        { fields: ['tenant_id', 'flag_key'], unique: true, name: 'uq_ffc_tenant_flag_key' },
      ],
    },
  );

  FeatureFlagConfig.associate = (models) => {
    FeatureFlagConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
  };

  return FeatureFlagConfig;
};
