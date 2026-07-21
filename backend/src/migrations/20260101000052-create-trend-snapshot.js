'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'trend_snapshot',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        snapshot_date: { type: Sequelize.DATEONLY, allowNull: false },
        metric_key: { type: Sequelize.STRING(128), allowNull: false },
        metric_value: { type: Sequelize.DECIMAL(18, 4), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'Periodic time-series snapshot of key metrics, purpose-built for the Analytics Agent trend/prediction responsibilities (SRS §3.5, Section 14).',
      },
    );
    await queryInterface.addIndex('trend_snapshot', ['tenant_id', 'snapshot_date', 'metric_key'], {
      unique: true,
      name: 'uq_trend_snapshot_tenant_date_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trend_snapshot');
  },
};
