'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'provider_config',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        provider_type: { type: Sequelize.STRING(32), allowNull: false },
        provider_name: { type: Sequelize.STRING(64), allowNull: false },
        secret_reference: { type: Sequelize.STRING(255), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Selected AI/Voice/WhatsApp/SMS/SMTP provider per tenant (SRS §7, Section 7).' },
    );
    await queryInterface.addIndex('provider_config', ['tenant_id'], { name: 'ix_provider_config_tenant' });
    await queryInterface.addIndex('provider_config', ['tenant_id', 'provider_type'], {
      unique: true,
      name: 'uq_provider_config_tenant_type',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('provider_config');
  },
};
