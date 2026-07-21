'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const {
  getOrCreateTestTenant,
  createStaffUser,
  createDepartment,
  uniqueSuffix,
  tokenFor,
} = require('./helpers/fixtures');

describe('Administration — Department & Category (docs/06-Administration-APIs.md §6.1-6.2)', () => {
  let tenant;
  let corpAdminToken;
  let officerToken;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    const { user: officer } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    officerToken = await tokenFor(officer, ['officer']);
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('happy path: Department CRUD', async () => {
    const code = `DP${uniqueSuffix().slice(0, 6).toUpperCase()}`;
    const created = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code, name: 'Water Works' })
      .expect(201);
    expect(created.body.data.isActive).toBe(true);

    await request(app)
      .get(`/api/v1/departments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    const updated = await request(app)
      .patch(`/api/v1/departments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name: 'Water Supply' })
      .expect(200);
    expect(updated.body.data.name).toBe('Water Supply');

    await request(app)
      .delete(`/api/v1/departments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(204);
    const afterDelete = await request(app)
      .get(`/api/v1/departments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);
    expect(afterDelete.body.data.isActive).toBe(false);
  });

  test('validation: department code must be 2-10 uppercase alphanumeric', async () => {
    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: 'lowercase', name: 'Bad Code Dept' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation: duplicate department code is rejected with 409', async () => {
    const code = `DP${uniqueSuffix().slice(0, 6).toUpperCase()}`;
    await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code, name: 'First' })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code, name: 'Second' })
      .expect(409);
    expect(res.body.error.code).toBe('DEPARTMENT_CODE_ALREADY_EXISTS');
  });

  test('permission: Officer cannot create a Department (403)', async () => {
    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ code: `DP${uniqueSuffix().slice(0, 6).toUpperCase()}`, name: 'Nope' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('happy path: Category CRUD scoped to a department', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const created = await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ departmentId: department.id, name: `Pothole ${uniqueSuffix()}`, defaultPriority: 'high' })
      .expect(201);
    expect(created.body.data.defaultPriority).toBe('high');

    const updated = await request(app)
      .patch(`/api/v1/complaint-categories/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ defaultPriority: 'critical' })
      .expect(200);
    expect(updated.body.data.defaultPriority).toBe('critical');
  });

  test('validation: duplicate category name within the same department is rejected (409)', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const name = `Duplicate Category ${uniqueSuffix()}`;
    await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ departmentId: department.id, name, defaultPriority: 'low' })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ departmentId: department.id, name, defaultPriority: 'low' })
      .expect(409);
    expect(res.body.error.code).toBe('CATEGORY_NAME_ALREADY_EXISTS');
  });

  test('validation: invalid defaultPriority value is rejected', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const res = await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ departmentId: department.id, name: `Cat ${uniqueSuffix()}`, defaultPriority: 'urgent' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('hierarchy: category creation under a non-existent department 404s', async () => {
    const res = await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ departmentId: 999999, name: `Cat ${uniqueSuffix()}`, defaultPriority: 'low' })
      .expect(404);
    expect(res.body.error.code).toBe('DEPARTMENT_NOT_FOUND');
  });

  test('permission: Department Admin can only manage categories in their own department (403 otherwise)', async () => {
    const ownDept = await createDepartment({ tenantId: tenant.id });
    const otherDept = await createDepartment({ tenantId: tenant.id });
    const { user: deptAdmin } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: ownDept.id,
    });
    const deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);

    await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .send({ departmentId: ownDept.id, name: `Own Dept Cat ${uniqueSuffix()}`, defaultPriority: 'low' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/complaint-categories')
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .send({ departmentId: otherDept.id, name: `Other Dept Cat ${uniqueSuffix()}`, defaultPriority: 'low' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
