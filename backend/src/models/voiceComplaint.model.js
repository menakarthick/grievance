'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const VoiceComplaint = sequelize.define(
    'VoiceComplaint',
    {
      ...idColumn(ID_TYPE.BIGINT),
      complaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      fileAssetId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      detectedLanguage: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { isInt: true, min: 0 },
      },
    },
    {
      ...baseOptions({
        comment: 'Voice-channel metadata for a complaint originated by voice (SRS §3.6, Section 6).',
        paranoid: false,
      }),
      tableName: 'voice_complaint',
      indexes: [
        { fields: ['complaint_id'], name: 'ix_voice_complaint_complaint' },
        { fields: ['file_asset_id'], name: 'ix_voice_complaint_file_asset' },
      ],
    },
  );

  VoiceComplaint.associate = (models) => {
    VoiceComplaint.belongsTo(models.Complaint, { foreignKey: 'complaintId', as: 'complaint' });
    VoiceComplaint.belongsTo(models.FileAsset, { foreignKey: 'fileAssetId', as: 'fileAsset' });
    VoiceComplaint.hasOne(models.VoiceTranscript, { foreignKey: 'voiceComplaintId', as: 'transcript' });
  };

  return VoiceComplaint;
};
