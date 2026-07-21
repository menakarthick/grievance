'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'complaint_feedback',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        complaint_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'complaint', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        rating: { type: Sequelize.INTEGER, allowNull: false },
        comment: { type: Sequelize.TEXT, allowNull: true },
        submitted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Citizen post-resolution feedback (SRS §3.2, Section 6).' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint_feedback');
  },
};
