'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'file_asset',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        asset_category: { type: Sequelize.STRING(32), allowNull: false },
        storage_path: { type: Sequelize.STRING(1024), allowNull: false },
        mime_type: { type: Sequelize.STRING(128), allowNull: false },
        size_bytes: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        checksum: { type: Sequelize.STRING(128), allowNull: true },
        uploaded_by: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        virus_scan_status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'pending' },
        lifecycle_state: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'quarantine' },
        linked_entity_type: { type: Sequelize.STRING(64), allowNull: false },
        linked_entity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        retention_expires_at: { type: Sequelize.DATE, allowNull: true },
        created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      { comment: 'Metadata for every uploaded/generated file — single generic table (Section 12, 17).' },
    );
    await queryInterface.addIndex('file_asset', ['tenant_id', 'created_at'], { name: 'ix_file_asset_tenant_created' });
    await queryInterface.addIndex('file_asset', ['linked_entity_type', 'linked_entity_id'], {
      name: 'ix_file_asset_linked_entity',
    });
    await queryInterface.addIndex('file_asset', ['uploaded_by'], { name: 'ix_file_asset_uploaded_by' });
    await queryInterface.addIndex('file_asset', ['lifecycle_state'], { name: 'ix_file_asset_lifecycle_state' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('file_asset');
  },
};
