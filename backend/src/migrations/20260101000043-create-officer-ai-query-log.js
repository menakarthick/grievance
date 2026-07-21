'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'officer_ai_query_log',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        officer_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        query_text: { type: Sequelize.TEXT, allowNull: false },
        response_summary: { type: Sequelize.TEXT, allowNull: true },
        agent_type: { type: Sequelize.STRING(64), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Officer AI Agent conversational query + response, for audit/analytics (SRS §3.3, Section 9).' },
    );
    await queryInterface.addIndex('officer_ai_query_log', ['officer_id', 'created_at'], {
      name: 'ix_officer_ai_query_log_officer_created',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('officer_ai_query_log');
  },
};
