'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'voice_transcript',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        voice_complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'voice_complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        transcript_text: { type: Sequelize.TEXT, allowNull: false },
        detected_language: { type: Sequelize.STRING(16), allowNull: true },
        confidence_score: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Whisper output — transcript text, detected language, confidence (ARCHITECTURE.md §9, Section 9).' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('voice_transcript');
  },
};
