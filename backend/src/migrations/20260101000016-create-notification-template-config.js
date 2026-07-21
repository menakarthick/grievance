'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notification_template_config',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        event_type: { type: Sequelize.STRING(64), allowNull: false },
        channel: { type: Sequelize.STRING(32), allowNull: false },
        language: { type: Sequelize.STRING(16), allowNull: false },
        body_template: { type: Sequelize.TEXT, allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Per-tenant, per-channel, per-language message templates, versioned (SRS §3.4, Section 7, 22).' },
    );
    await queryInterface.addIndex('notification_template_config', ['tenant_id'], { name: 'ix_ntc_tenant' });
    await queryInterface.addIndex(
      'notification_template_config',
      ['tenant_id', 'event_type', 'channel', 'language', 'version'],
      { unique: true, name: 'uq_ntc_scope_version' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_template_config');
  },
};
