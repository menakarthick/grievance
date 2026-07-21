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
  const ComplaintStatusDefinition = sequelize.define(
    'ComplaintStatusDefinition',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true },
      },
      label: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Tenant-configurable status values and allowed transitions (SRS §3.4, Section 7).',
        paranoid: true,
      }),
      tableName: 'complaint_status_definition',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_csd_tenant' },
        { fields: ['tenant_id', 'code'], unique: true, name: 'uq_csd_tenant_code' },
      ],
    },
  );

  ComplaintStatusDefinition.associate = (models) => {
    ComplaintStatusDefinition.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    ComplaintStatusDefinition.hasMany(models.Complaint, { foreignKey: 'statusId', as: 'complaints' });
    ComplaintStatusDefinition.hasMany(models.ComplaintStatusHistory, { foreignKey: 'fromStatusId', as: 'historyFrom' });
    ComplaintStatusDefinition.hasMany(models.ComplaintStatusHistory, { foreignKey: 'toStatusId', as: 'historyTo' });
  };

  return ComplaintStatusDefinition;
};
