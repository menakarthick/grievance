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
  const OfficerHierarchyLevel = sequelize.define(
    'OfficerHierarchyLevel',
    {
      ...idColumn(ID_TYPE.INTEGER),
      ...tenantIdColumn(),
      levelOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Ordering of the hierarchy rung, lower = more junior (or per-tenant convention).',
        validate: { isInt: true },
      },
      title: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Tenant-configurable officer hierarchy (SRS §6.1, Section 5).',
        paranoid: true,
      }),
      tableName: 'officer_hierarchy_level',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_ohl_tenant' },
        { fields: ['tenant_id', 'level_order'], unique: true, name: 'uq_ohl_tenant_level_order' },
      ],
    },
  );

  OfficerHierarchyLevel.associate = (models) => {
    OfficerHierarchyLevel.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    OfficerHierarchyLevel.hasMany(models.StaffProfile, { foreignKey: 'hierarchyLevelId', as: 'staffProfiles' });
    OfficerHierarchyLevel.hasMany(models.EscalationMatrixConfig, { foreignKey: 'fromLevelId', as: 'escalationsFrom' });
    OfficerHierarchyLevel.hasMany(models.EscalationMatrixConfig, { foreignKey: 'toLevelId', as: 'escalationsTo' });
    OfficerHierarchyLevel.hasMany(models.ApprovalWorkflowConfig, {
      foreignKey: 'requiredLevelId',
      as: 'approvalWorkflowConfigs',
    });
    OfficerHierarchyLevel.hasMany(models.EscalationInstance, {
      foreignKey: 'fromLevelId',
      as: 'escalationInstancesFrom',
    });
    OfficerHierarchyLevel.hasMany(models.EscalationInstance, { foreignKey: 'toLevelId', as: 'escalationInstancesTo' });
    OfficerHierarchyLevel.hasMany(models.ApprovalRequest, { foreignKey: 'requestedLevelId', as: 'approvalRequests' });
  };

  return OfficerHierarchyLevel;
};
