'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'weekly_officer_performance',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        officer_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        week_start_date: { type: Sequelize.DATEONLY, allowNull: false },
        assigned_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        resolved_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        overdue_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Per-officer weekly assigned/resolved/pending/overdue counts, feeding the Officer AI Agent weekly report (SRS §3.3, Section 14).',
      },
    );
    await queryInterface.addIndex('weekly_officer_performance', ['officer_id', 'week_start_date'], {
      unique: true,
      name: 'uq_wop_officer_week',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('weekly_officer_performance');
  },
};
