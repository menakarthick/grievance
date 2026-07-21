'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'complaint_category',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        department_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'department', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        name: { type: Sequelize.STRING(255), allowNull: false },
        default_priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Tenant-configurable complaint categories (SRS §3.4, Section 5).' },
    );
    await queryInterface.addIndex('complaint_category', ['tenant_id'], { name: 'ix_complaint_category_tenant' });
    await queryInterface.addIndex('complaint_category', ['department_id'], {
      name: 'ix_complaint_category_department',
    });
    await queryInterface.addIndex('complaint_category', ['tenant_id', 'is_active'], {
      name: 'ix_complaint_category_tenant_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint_category');
  },
};
