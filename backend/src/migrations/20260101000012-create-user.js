'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'user',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        external_uuid: { type: Sequelize.UUID, allowNull: false, unique: true },
        user_type: { type: Sequelize.STRING(32), allowNull: false },
        mobile_number: { type: Sequelize.STRING(20), allowNull: true },
        email: { type: Sequelize.STRING(255), allowNull: true },
        username: { type: Sequelize.STRING(64), allowNull: true },
        password_hash: { type: Sequelize.STRING(255), allowNull: true },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'active' },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Base identity for every human actor — Citizen, Officer, all Admin tiers (Section 5).' },
    );
    await queryInterface.addIndex('user', ['tenant_id'], { name: 'ix_user_tenant' });
    await queryInterface.addIndex('user', ['tenant_id', 'mobile_number'], { name: 'ix_user_tenant_mobile' });
    await queryInterface.addIndex('user', ['tenant_id', 'email'], { name: 'ix_user_tenant_email' });
    await queryInterface.addIndex('user', ['tenant_id', 'username'], { unique: true, name: 'uq_user_tenant_username' });
    await queryInterface.addIndex('user', ['user_type'], { name: 'ix_user_type' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user');
  },
};
