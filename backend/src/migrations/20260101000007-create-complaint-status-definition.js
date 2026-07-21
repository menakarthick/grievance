'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'complaint_status_definition',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        code: { type: Sequelize.STRING(32), allowNull: false },
        label: { type: Sequelize.STRING(128), allowNull: false },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Tenant-configurable status values and allowed transitions (SRS §3.4, Section 7).' },
    );
    await queryInterface.addIndex('complaint_status_definition', ['tenant_id'], { name: 'ix_csd_tenant' });
    await queryInterface.addIndex('complaint_status_definition', ['tenant_id', 'code'], {
      unique: true,
      name: 'uq_csd_tenant_code',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint_status_definition');
  },
};
