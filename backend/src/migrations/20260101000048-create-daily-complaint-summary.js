'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'daily_complaint_summary',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        summary_date: { type: Sequelize.DATEONLY, allowNull: false },
        department_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'department', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        category_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'complaint_category', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        registered_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        resolved_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        breached_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Per tenant/department/ward/category daily counts by status, SLA breach count — populated by scheduled jobs (Section 14, 17).',
      },
    );
    await queryInterface.addIndex(
      'daily_complaint_summary',
      ['tenant_id', 'summary_date', 'department_id', 'category_id'],
      { unique: true, name: 'uq_dcs_tenant_date_department_category' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_complaint_summary');
  },
};
