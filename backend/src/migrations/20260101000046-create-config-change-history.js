'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'config_change_history',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        config_table_name: { type: Sequelize.STRING(128), allowNull: false },
        config_row_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        previous_version: { type: Sequelize.JSON, allowNull: true },
        new_version: { type: Sequelize.JSON, allowNull: true },
        changed_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Specialization of audit_log scoped to Configuration Table changes — powers a "show history of this rule" view directly (Section 10).',
      },
    );
    await queryInterface.addIndex('config_change_history', ['config_table_name', 'config_row_id', 'created_at'], {
      name: 'ix_cch_table_row_created',
    });
    await queryInterface.addIndex('config_change_history', ['changed_by'], { name: 'ix_cch_changed_by' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('config_change_history');
  },
};
