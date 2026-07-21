'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'role_permission',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        role_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'role', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        permission_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'permission', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Junction table — which permissions a role grants (Section 13).' },
    );
    await queryInterface.addIndex('role_permission', ['role_id', 'permission_id'], {
      unique: true,
      name: 'uq_role_permission',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('role_permission');
  },
};
