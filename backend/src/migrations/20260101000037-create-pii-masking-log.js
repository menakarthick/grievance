'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'pii_masking_log',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        pii_types_detected: { type: Sequelize.JSON, allowNull: false },
        masked_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment: 'Evidence that the mandatory masking gate ran, and which PII types were found (SRS §10, Section 9).',
      },
    );
    await queryInterface.addIndex('pii_masking_log', ['complaint_id'], { name: 'ix_pii_masking_log_complaint' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pii_masking_log');
  },
};
