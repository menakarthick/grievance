'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'escalation_instance',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        escalation_config_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'escalation_matrix_config', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        from_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        to_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        triggered_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'A record of an actual escalation event that occurred on a complaint (Section 8).' },
    );
    await queryInterface.addIndex('escalation_instance', ['complaint_id'], {
      name: 'ix_escalation_instance_complaint',
    });
    await queryInterface.addIndex('escalation_instance', ['escalation_config_id'], {
      name: 'ix_escalation_instance_config',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('escalation_instance');
  },
};
