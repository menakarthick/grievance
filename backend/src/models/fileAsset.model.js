'use strict';

const {
  ID_TYPE,
  idColumn,
  tenantIdColumn,
  auditColumns,
  deletedByColumn,
  baseOptions,
} = require('../database/helpers');
const { FILE_ASSET_CATEGORIES, FILE_LIFECYCLE_STATES } = require('../database/constants');

module.exports = (sequelize, DataTypes) => {
  const FileAsset = sequelize.define(
    'FileAsset',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      assetCategory: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true, isIn: [FILE_ASSET_CATEGORIES] },
      },
      storagePath: {
        type: DataTypes.STRING(1024),
        allowNull: false,
        validate: { notEmpty: true },
      },
      mimeType: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      sizeBytes: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        validate: { isInt: true, min: 0 },
      },
      checksum: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      uploadedBy: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to user.id; null for system-generated files.',
      },
      virusScanStatus: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
      },
      lifecycleState: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'quarantine',
        validate: { isIn: [FILE_LIFECYCLE_STATES] },
      },
      linkedEntityType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Polymorphic reference target type, e.g. complaint, voice_complaint, approval_action (Section 12).',
      },
      linkedEntityId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      retentionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Populated per SRS §4.3 at insert time based on asset_category (Section 12).',
      },
      ...auditColumns(ID_TYPE.BIGINT),
      ...deletedByColumn(ID_TYPE.BIGINT),
    },
    {
      ...baseOptions({
        comment: 'Metadata for every uploaded/generated file — single generic table (Section 12, 17).',
        paranoid: false,
      }),
      tableName: 'file_asset',
      indexes: [
        { fields: ['tenant_id', 'created_at'], name: 'ix_file_asset_tenant_created' },
        { fields: ['linked_entity_type', 'linked_entity_id'], name: 'ix_file_asset_linked_entity' },
        { fields: ['uploaded_by'], name: 'ix_file_asset_uploaded_by' },
        { fields: ['lifecycle_state'], name: 'ix_file_asset_lifecycle_state' },
      ],
    },
  );

  FileAsset.associate = (models) => {
    FileAsset.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    FileAsset.belongsTo(models.User, { foreignKey: 'uploadedBy', as: 'uploader' });
    FileAsset.hasOne(models.VoiceComplaint, { foreignKey: 'fileAssetId', as: 'voiceComplaint' });
  };

  return FileAsset;
};
