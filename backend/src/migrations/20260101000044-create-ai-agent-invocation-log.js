'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'ai_agent_invocation_log',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        agent_type: { type: Sequelize.STRING(64), allowNull: false },
        provider_name: { type: Sequelize.STRING(64), allowNull: false },
        prompt_token_count: { type: Sequelize.INTEGER, allowNull: true },
        response_token_count: { type: Sequelize.INTEGER, allowNull: true },
        latency_ms: { type: Sequelize.INTEGER, allowNull: true },
        status: { type: Sequelize.STRING(32), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Every call to the AI provider — for cost/latency/failure governance (ARCHITECTURE.md §8.3, Section 9).',
      },
    );
    await queryInterface.addIndex('ai_agent_invocation_log', ['tenant_id', 'created_at'], {
      name: 'ix_aail_tenant_created',
    });
    await queryInterface.addIndex('ai_agent_invocation_log', ['agent_type'], { name: 'ix_aail_agent_type' });
    await queryInterface.addIndex('ai_agent_invocation_log', ['status'], { name: 'ix_aail_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_agent_invocation_log');
  },
};
