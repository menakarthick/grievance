'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'staff_profile',
      {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          unique: true,
          references: { model: 'user', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        department_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'department', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        hierarchy_level_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'officer_hierarchy_level', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        scope_type: { type: Sequelize.STRING(16), allowNull: true },
        scope_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        employee_id: { type: Sequelize.STRING(64), allowNull: true },
        created_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      {
        comment:
          'Shared profile for Officer, Department Admin, Corporation Admin, Super Admin — consolidation decision explained in Section 17.',
      },
    );
    await queryInterface.addIndex('staff_profile', ['department_id'], { name: 'ix_staff_profile_department' });
    await queryInterface.addIndex('staff_profile', ['hierarchy_level_id'], {
      name: 'ix_staff_profile_hierarchy_level',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('staff_profile');
  },
};
