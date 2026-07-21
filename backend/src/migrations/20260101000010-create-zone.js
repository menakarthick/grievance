'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'zone',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        district_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'district', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        code: { type: Sequelize.STRING(32), allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Tenant-configurable geographic hierarchy, mid level, belongs to district (SRS §7, Section 5).' },
    );
    await queryInterface.addIndex('zone', ['tenant_id'], { name: 'ix_zone_tenant' });
    await queryInterface.addIndex('zone', ['district_id'], { name: 'ix_zone_district' });
    await queryInterface.addIndex('zone', ['tenant_id', 'code'], { unique: true, name: 'uq_zone_tenant_code' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('zone');
  },
};
