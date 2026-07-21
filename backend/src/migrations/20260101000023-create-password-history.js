'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'password_history',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Last-5-password hash history, enforcing no-reuse (ARCHITECTURE.md §8.1, Section 13).' },
    );
    await queryInterface.addIndex('password_history', ['user_id', 'created_at'], {
      name: 'ix_password_history_user_created',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('password_history');
  },
};
