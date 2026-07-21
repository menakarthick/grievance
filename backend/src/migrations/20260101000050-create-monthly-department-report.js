'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'monthly_department_report',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        month: { type: Sequelize.DATEONLY, allowNull: false },
        department_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'department', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        metrics: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Monthly department aggregates for Analytics Agent trend/prediction features (Section 14).' },
    );
    await queryInterface.addIndex('monthly_department_report', ['tenant_id', 'month', 'department_id'], {
      unique: true,
      name: 'uq_mdr_tenant_month_department',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('monthly_department_report');
  },
};
