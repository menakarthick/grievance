'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const VoiceTranscript = sequelize.define(
    'VoiceTranscript',
    {
      ...idColumn(ID_TYPE.BIGINT),
      voiceComplaintId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      transcriptText: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Stored unmasked — lives inside government infrastructure (Principle 7, Section 1).',
      },
      detectedLanguage: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      confidenceScore: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        validate: { min: 0, max: 1 },
      },
    },
    {
      ...baseOptions({
        comment: 'Whisper output — transcript text, detected language, confidence (ARCHITECTURE.md §9, Section 9).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'voice_transcript',
      indexes: [{ fields: ['voice_complaint_id'], unique: true, name: 'uq_voice_transcript_voice_complaint' }],
    },
  );

  VoiceTranscript.associate = (models) => {
    VoiceTranscript.belongsTo(models.VoiceComplaint, { foreignKey: 'voiceComplaintId', as: 'voiceComplaint' });
  };

  return VoiceTranscript;
};
