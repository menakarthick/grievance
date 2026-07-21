'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'user_role_assignment',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        role_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'role', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        scope_type: { type: Sequelize.STRING(16), allowNull: false },
        scope_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Which role(s) a user holds, and at what scope (ARCHITECTURE.md §11.2, Section 13).' },
    );
    await queryInterface.addIndex('user_role_assignment', ['user_id'], { name: 'ix_ura_user' });
    await queryInterface.addIndex('user_role_assignment', ['role_id'], { name: 'ix_ura_role' });
    await queryInterface.addIndex('user_role_assignment', ['user_id', 'role_id', 'scope_type', 'scope_id'], {
      unique: true,
      name: 'uq_ura_user_role_scope',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_role_assignment');
  },
};
