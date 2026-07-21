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
  const EscalationMatrixConfig = sequelize.define(
    'EscalationMatrixConfig',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      departmentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      fromLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      toLevelId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      triggerCondition: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      escalateAfterHours: {
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
        comment: 'Escalation rules — from/to hierarchy level, trigger condition, versioned (SRS §3.4, Section 7, 22).',
        paranoid: true,
      }),
      tableName: 'escalation_matrix_config',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_emc_tenant' },
        { fields: ['department_id'], name: 'ix_emc_department' },
        { fields: ['from_level_id'], name: 'ix_emc_from_level' },
        { fields: ['to_level_id'], name: 'ix_emc_to_level' },
      ],
    },
  );

  EscalationMatrixConfig.associate = (models) => {
    EscalationMatrixConfig.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    EscalationMatrixConfig.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    EscalationMatrixConfig.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'fromLevelId', as: 'fromLevel' });
    EscalationMatrixConfig.belongsTo(models.OfficerHierarchyLevel, { foreignKey: 'toLevelId', as: 'toLevel' });
    EscalationMatrixConfig.hasMany(models.EscalationInstance, {
      foreignKey: 'escalationConfigId',
      as: 'escalationInstances',
    });
  };

  return EscalationMatrixConfig;
};
