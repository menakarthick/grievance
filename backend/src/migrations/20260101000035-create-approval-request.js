'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'approval_request',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        workflow_config_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'approval_workflow_config', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        requested_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'pending' },
        requested_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'An instance of a required approval step for a specific complaint (Section 8).' },
    );
    await queryInterface.addIndex('approval_request', ['complaint_id'], { name: 'ix_approval_request_complaint' });
    await queryInterface.addIndex('approval_request', ['workflow_config_id'], {
      name: 'ix_approval_request_workflow_config',
    });
    await queryInterface.addIndex('approval_request', ['status'], { name: 'ix_approval_request_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('approval_request');
  },
};
