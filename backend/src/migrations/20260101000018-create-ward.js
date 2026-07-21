'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'ward',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        zone_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'zone', key: 'id' },
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
      { comment: 'Tenant-configurable geographic hierarchy, leaf level, belongs to zone (SRS §7, Section 5).' },
    );
    await queryInterface.addIndex('ward', ['tenant_id'], { name: 'ix_ward_tenant' });
    await queryInterface.addIndex('ward', ['zone_id'], { name: 'ix_ward_zone' });
    await queryInterface.addIndex('ward', ['tenant_id', 'code'], { unique: true, name: 'uq_ward_tenant_code' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ward');
  },
};
