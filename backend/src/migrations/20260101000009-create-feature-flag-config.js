'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'feature_flag_config',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        flag_key: { type: Sequelize.STRING(128), allowNull: false },
        is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        flag_type: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'boolean' },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Tenant-scoped feature flags (INFRASTRUCTURE_DEVOPS.md §16, Section 7).' },
    );
    await queryInterface.addIndex('feature_flag_config', ['tenant_id'], { name: 'ix_ffc_tenant' });
    await queryInterface.addIndex('feature_flag_config', ['tenant_id', 'flag_key'], {
      unique: true,
      name: 'uq_ffc_tenant_flag_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('feature_flag_config');
  },
};
