'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'ai_classification_result',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        agent_type: { type: Sequelize.STRING(64), allowNull: false },
        detected_category_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'complaint_category', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        detected_priority: { type: Sequelize.INTEGER, allowNull: true },
        detected_severity: { type: Sequelize.STRING(32), allowNull: true },
        detected_language: { type: Sequelize.STRING(16), allowNull: true },
        confidence_score: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Complaint Agent output — category/priority/department/severity/location/language detected, with confidence (Section 9).',
      },
    );
    await queryInterface.addIndex('ai_classification_result', ['complaint_id'], { name: 'ix_acr_complaint' });
    await queryInterface.addIndex('ai_classification_result', ['detected_category_id'], {
      name: 'ix_acr_detected_category',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_classification_result');
  },
};
