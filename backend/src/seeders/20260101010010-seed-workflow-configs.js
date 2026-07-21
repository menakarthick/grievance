'use strict';

// Workflow States: the v1.0 workflow-configuration tables — escalation
// matrix (Section 7) and approval workflow (Section 7) — seeded against the
// hierarchy levels and departments/categories already seeded above.
module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;
    const [tenant] = await queryInterface.sequelize.query(`SELECT id FROM tenant WHERE code = 'TAMBARAM'`, {
      type: QueryTypes.SELECT,
    });
    const departments = await queryInterface.sequelize.query(
      `SELECT id, code FROM department WHERE tenant_id = :tenantId`,
      { replacements: { tenantId: tenant.id }, type: QueryTypes.SELECT },
    );
    const levels = await queryInterface.sequelize.query(
      `SELECT id, level_order FROM officer_hierarchy_level WHERE tenant_id = :tenantId ORDER BY level_order`,
      { replacements: { tenantId: tenant.id }, type: QueryTypes.SELECT },
    );

    const officerLevel = levels.find((l) => l.level_order === 1);
    const deptAdminLevel = levels.find((l) => l.level_order === 2);
    const corpAdminLevel = levels.find((l) => l.level_order === 3);

    const now = new Date();

    // Escalation matrix: Officer -> Dept Admin after 24h SLA overrun, Dept
    // Admin -> Corp Admin after 48h, for every seeded department.
    const escalationRows = [];
    for (const department of departments) {
      escalationRows.push(
        {
          tenant_id: tenant.id,
          department_id: department.id,
          from_level_id: officerLevel.id,
          to_level_id: deptAdminLevel.id,
          trigger_condition: 'sla_breach',
          escalate_after_hours: 24,
          version: 1,
          effective_from: now,
          created_at: now,
          updated_at: now,
        },
        {
          tenant_id: tenant.id,
          department_id: department.id,
          from_level_id: deptAdminLevel.id,
          to_level_id: corpAdminLevel.id,
          trigger_condition: 'sla_breach',
          escalate_after_hours: 48,
          version: 1,
          effective_from: now,
          created_at: now,
          updated_at: now,
        },
      );
    }
    await queryInterface.bulkInsert('escalation_matrix_config', escalationRows);

    // Approval workflow: only the highest-priority (priority 1) categories
    // require Dept Admin approval before closure.
    const priorityOneCategories = await queryInterface.sequelize.query(
      `SELECT id FROM complaint_category WHERE tenant_id = :tenantId AND default_priority = 1`,
      { replacements: { tenantId: tenant.id }, type: QueryTypes.SELECT },
    );
    if (priorityOneCategories.length > 0) {
      await queryInterface.bulkInsert(
        'approval_workflow_config',
        priorityOneCategories.map((category) => ({
          tenant_id: tenant.id,
          category_id: category.id,
          required_level_id: deptAdminLevel.id,
          version: 1,
          effective_from: now,
          created_at: now,
          updated_at: now,
        })),
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('approval_workflow_config', {});
    await queryInterface.bulkDelete('escalation_matrix_config', {});
  },
};
