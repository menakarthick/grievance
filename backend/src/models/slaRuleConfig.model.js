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
  const SlaRuleConfig = sequelize.define(
    'SlaRuleConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      resolutionHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { isInt: true, min: 1 },
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Config-effective-dating version (Section 22) — NOT an optimistic-locking column (Section 32).',
      },
      effectiveFrom: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      effectiveTo: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'SLA resolution-time targets per department/category/priority, versioned (SRS §3.4, Section 7, 22).',
        paranoid: true,
      }),
      tableName: 'sla_rule_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_sla_rule_config_tenant' },
        { fields: ['department_id'], name: 'ix_sla_rule_config_department' },
        { fields: ['category_id'], name: 'ix_sla_rule_config_category' },
        {
          fields: ['tenant_id', 'department_id', 'category_id', 'priority', 'version'],
          unique: true,
          name: 'uq_sla_rule_config_scope_version',
        },
      ],
    },
  );

  SlaRuleConfig.associate = (models) => {
    SlaRuleConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    SlaRuleConfig.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    SlaRuleConfig.belongsTo(models.ComplaintCategory, { foreignKey: 'categoryId', as: 'category' });
    SlaRuleConfig.hasMany(models.SlaTracking, { foreignKey: 'slaRuleConfigId', as: 'slaTrackings' });
  };

  return SlaRuleConfig;
};
