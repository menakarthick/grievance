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
  const ProviderConfig = sequelize.define(
    'ProviderConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      providerType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'AI / Voice / WhatsApp / SMS / SMTP (SRS §7).',
        validate: { notEmpty: true },
      },
      providerName: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: { notEmpty: true },
      },
      secretReference: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Secrets-manager reference — never a raw credential value (INFRASTRUCTURE_DEVOPS.md §7).',
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
        comment: 'Selected AI/Voice/WhatsApp/SMS/SMTP provider per tenant (SRS §7, Section 7).',
        paranoid: true,
      }),
      tableName: 'provider_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_provider_config_tenant' },
        { fields: ['tenant_id', 'provider_type'], unique: true, name: 'uq_provider_config_tenant_type' },
      ],
      scopes: {
        active: { where: { isActive: true } },
      },
    },
  );

  ProviderConfig.associate = (models) => {
    ProviderConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
  };

  return ProviderConfig;
};
