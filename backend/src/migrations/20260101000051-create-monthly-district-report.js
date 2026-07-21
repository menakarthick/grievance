'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'monthly_district_report',
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
        district_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'district', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        metrics: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Monthly district-scope aggregates for Analytics Agent trend/prediction features (Section 14).' },
    );
    await queryInterface.addIndex('monthly_district_report', ['tenant_id', 'month', 'district_id'], {
      unique: true,
      name: 'uq_mdr2_tenant_month_district',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('monthly_district_report');
  },
};
