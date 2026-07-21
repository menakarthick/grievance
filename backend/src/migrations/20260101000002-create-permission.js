'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'permission',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        resource: { type: Sequelize.STRING(128), allowNull: false },
        action: { type: Sequelize.STRING(64), allowNull: false },
        description: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Global RBAC permission catalog (resource + action pairs). Not tenant-scoped (Section 3).' },
    );
    await queryInterface.addIndex('permission', ['resource', 'action'], {
      unique: true,
      name: 'uq_permission_resource_action',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('permission');
  },
};
