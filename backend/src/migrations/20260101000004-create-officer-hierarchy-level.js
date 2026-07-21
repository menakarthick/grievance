'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'officer_hierarchy_level',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        level_order: { type: Sequelize.INTEGER, allowNull: false },
        title: { type: Sequelize.STRING(128), allowNull: false },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Tenant-configurable officer hierarchy (SRS §6.1, Section 5).' },
    );
    await queryInterface.addIndex('officer_hierarchy_level', ['tenant_id'], { name: 'ix_ohl_tenant' });
    await queryInterface.addIndex('officer_hierarchy_level', ['tenant_id', 'level_order'], {
      unique: true,
      name: 'uq_ohl_tenant_level_order',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('officer_hierarchy_level');
  },
};
