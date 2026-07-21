'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'approval_action',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        approval_request_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'approval_request', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        approver_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        decision: { type: Sequelize.STRING(32), allowNull: false },
        comment: { type: Sequelize.TEXT, allowNull: true },
        decided_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: "An individual approver's decision on an approval_request (Section 8)." },
    );
    await queryInterface.addIndex('approval_action', ['approval_request_id'], { name: 'ix_approval_action_request' });
    await queryInterface.addIndex('approval_action', ['approver_id'], { name: 'ix_approval_action_approver' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('approval_action');
  },
};
