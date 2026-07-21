'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'complaint',
      {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        tenant_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'tenant', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        tracking_id: { type: Sequelize.STRING(64), allowNull: false },
        citizen_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'citizen_profile', key: 'id' },
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
        category_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint_category', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        status_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: 'complaint_status_definition', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        priority: { type: Sequelize.INTEGER, allowNull: false },
        severity: { type: Sequelize.STRING(32), allowNull: true },
        language: { type: Sequelize.STRING(16), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        location_address: { type: Sequelize.STRING(500), allowNull: true },
        location_latitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        location_longitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        current_officer_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: 'staff_profile', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        current_department_name: { type: Sequelize.STRING(255), allowNull: true },
        current_officer_name: { type: Sequelize.STRING(255), allowNull: true },
        sla_due_at: { type: Sequelize.DATE, allowNull: true },
        resolved_at: { type: Sequelize.DATE, allowNull: true },
        closed_at: { type: Sequelize.DATE, allowNull: true },
        version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Optimistic-locking row version (Sequelize-managed).',
        },
        created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        updated_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        deleted_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      },
      { comment: 'Core grievance record — central entity referenced by nearly every other table (Section 6).' },
    );
    await queryInterface.addIndex('complaint', ['tenant_id', 'status_id'], { name: 'ix_complaint_tenant_status' });
    await queryInterface.addIndex('complaint', ['tenant_id', 'department_id', 'status_id'], {
      name: 'ix_complaint_tenant_department_status',
    });
    await queryInterface.addIndex('complaint', ['tenant_id', 'current_officer_id', 'status_id'], {
      name: 'ix_complaint_tenant_officer_status',
    });
    await queryInterface.addIndex('complaint', ['tenant_id', 'tracking_id'], {
      unique: true,
      name: 'uq_complaint_tenant_tracking_id',
    });
    await queryInterface.addIndex('complaint', ['tenant_id', 'created_at'], { name: 'ix_complaint_tenant_created' });
    await queryInterface.addIndex('complaint', ['tenant_id', 'sla_due_at'], { name: 'ix_complaint_tenant_sla_due' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint');
  },
};
