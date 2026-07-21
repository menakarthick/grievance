'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'voice_complaint',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        file_asset_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'file_asset', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        detected_language: { type: Sequelize.STRING(16), allowNull: true },
        duration_seconds: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Voice-channel metadata for a complaint originated by voice (SRS §3.6, Section 6).' },
    );
    await queryInterface.addIndex('voice_complaint', ['complaint_id'], { name: 'ix_voice_complaint_complaint' });
    await queryInterface.addIndex('voice_complaint', ['file_asset_id'], { name: 'ix_voice_complaint_file_asset' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('voice_complaint');
  },
};
