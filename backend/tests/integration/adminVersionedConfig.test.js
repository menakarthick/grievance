'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const {
  getOrCreateTestTenant,
  createStaffUser,
  createDepartment,
  createCategory,
  getOrCreateHierarchyLevel,
  tokenFor,
} = require('./helpers/fixtures');

describe('Administration — Versioned Configuration (docs/06-Administration-APIs.md §6.6-6.8)', () => {
  let tenant;
  let corpAdminToken;
  let officerLevel;
  let deptAdminLevel;
  let corpAdminLevel;
  let department;
  let category;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    officerLevel = await getOrCreateHierarchyLevel(tenant.id, 1, 'Officer');
    deptAdminLevel = await getOrCreateHierarchyLevel(tenant.id, 2, 'Department Admin');
    corpAdminLevel = await getOrCreateHierarchyLevel(tenant.id, 3, 'Corporation Admin');
    department = await createDepartment({ tenantId: tenant.id });
    category = await createCategory({ tenantId: tenant.id, departmentId: department.id });
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('Approval Workflow: create starts at version 1, update creates version 2 and closes version 1', async () => {
    const created = await request(app)
      .post('/api/v1/approval-workflows')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ categoryId: category.id, requiredLevelId: deptAdminLevel.id, effectiveFrom: new Date().toISOString() })
      .expect(201);
    expect(created.body.data.version).toBe(1);

    const versioned = await request(app)
      .patch(`/api/v1/approval-workflows/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ requiredLevelId: corpAdminLevel.id, effectiveFrom: new Date(Date.now() + 86400000).toISOString() })
      .expect(200);
    expect(versioned.body.data.version).toBe(2);
    expect(versioned.body.data.id).not.toBe(created.body.data.id);

    const original = await request(app)
      .get(`/api/v1/approval-workflows/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(original.body.data.effectiveTo).toBeTruthy();
  });

  test('SLA Rule: create + version, resolutionHours ceiling enforced (max 8760)', async () => {
    const created = await request(app)
      .post('/api/v1/sla-rules')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        departmentId: department.id,
        categoryId: category.id,
        priority: 'high',
        resolutionHours: 48,
        effectiveFrom: new Date().toISOString(),
      })
      .expect(201);
    expect(created.body.data.version).toBe(1);
    expect(created.body.data.priority).toBe('high');

    const versioned = await request(app)
      .patch(`/api/v1/sla-rules/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ resolutionHours: 72, effectiveFrom: new Date(Date.now() + 86400000).toISOString() })
      .expect(200);
    expect(versioned.body.data.version).toBe(2);
    expect(versioned.body.data.resolutionHours).toBe(72);

    const overCeiling = await request(app)
      .post('/api/v1/sla-rules')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        departmentId: department.id,
        categoryId: category.id,
        priority: 'low',
        resolutionHours: 9000,
        effectiveFrom: new Date().toISOString(),
      })
      .expect(400);
    expect(overCeiling.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('Escalation Rule: toLevelId must be a higher hierarchy level than fromLevelId (422)', async () => {
    const res = await request(app)
      .post('/api/v1/escalation-rules')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        departmentId: department.id,
        fromLevelId: corpAdminLevel.id,
        toLevelId: officerLevel.id,
        triggerCondition: 'sla_breach',
        escalateAfterHours: 24,
      })
      .expect(422);
    expect(res.body.error.code).toBe('INVALID_LEVEL_ORDER');
  });

  test('Escalation Rule: happy path create + version', async () => {
    const created = await request(app)
      .post('/api/v1/escalation-rules')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        departmentId: department.id,
        fromLevelId: officerLevel.id,
        toLevelId: deptAdminLevel.id,
        triggerCondition: 'sla_breach',
        escalateAfterHours: 24,
      })
      .expect(201);
    expect(created.body.data.version).toBe(1);

    const versioned = await request(app)
      .patch(`/api/v1/escalation-rules/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ escalateAfterHours: 12 })
      .expect(200);
    expect(versioned.body.data.version).toBe(2);
    expect(versioned.body.data.escalateAfterHours).toBe(12);

    const invalidReparent = await request(app)
      .patch(`/api/v1/escalation-rules/${versioned.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ toLevelId: officerLevel.id })
      .expect(422);
    expect(invalidReparent.body.error.code).toBe('INVALID_LEVEL_ORDER');
  });

  test('deleting a versioned config deactivates it (soft delete), and it no longer resolves', async () => {
    const created = await request(app)
      .post('/api/v1/escalation-rules')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        departmentId: department.id,
        fromLevelId: officerLevel.id,
        toLevelId: deptAdminLevel.id,
        triggerCondition: 'no_action_after_hours',
        escalateAfterHours: 48,
      })
      .expect(201);

    await request(app)
      .delete(`/api/v1/escalation-rules/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(204);
    const res = await request(app)
      .get(`/api/v1/escalation-rules/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('ESCALATION_RULE_NOT_FOUND');
  });
});
