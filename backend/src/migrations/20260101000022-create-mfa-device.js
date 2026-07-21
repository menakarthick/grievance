'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'mfa_device',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        device_type: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'totp' },
        secret_reference: { type: Sequelize.STRING(255), allowNull: false },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      },
      {
        comment:
          'TOTP device registration for mandatory Corporation/Super Admin MFA (ARCHITECTURE.md §8.1, Section 13).',
      },
    );
    await queryInterface.addIndex('mfa_device', ['user_id'], { name: 'ix_mfa_device_user' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mfa_device');
  },
};
