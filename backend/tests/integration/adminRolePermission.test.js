'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const {
  getOrCreatePermission,
  getOrCreateGlobalRole,
  getOrCreateTestTenant,
  createStaffUser,
  uniqueSuffix,
  tokenFor,
} = require('./helpers/fixtures');

describe('Administration — Role & Permission (docs/06-Administration-APIs.md §6.4-6.5)', () => {
  let tenant;
  let corpAdminToken;
  let officerToken;
  let permission;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    const { user: officer } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    officerToken = await tokenFor(officer, ['officer']);
    permission = await getOrCreatePermission('complaint', 'read');
    // This suite's own "list roles includes the officer system role" and
    // "a system role cannot be edited" tests expect the global 'officer'
    // role (tenantId: null) to already exist. It's created via
    // getOrCreateGlobalRole by adminUser.test.js/rbacMiddleware.test.js —
    // relying on cross-file execution order for that is fragile (Jest
    // schedules integration files largest-first when there's no timing
    // cache, so the order isn't guaranteed run to run). Ensured here too,
    // idempotently, so this file doesn't depend on another file having run
    // first.
    await getOrCreateGlobalRole('officer');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('happy path: create a custom role, read it back with its permissions', async () => {
    const name = `custom_role_${uniqueSuffix()}`;
    const created = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name, permissionIds: [permission.id] })
      .expect(201);
    expect(created.body.data.isSystemRole).toBe(false);
    expect(created.body.data.permissions).toHaveLength(1);

    const fetched = await request(app)
      .get(`/api/v1/roles/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(fetched.body.data.permissions[0].resource).toBe('complaint');
  });

  test('list roles includes permissionCount', async () => {
    const res = await request(app)
      .get('/api/v1/roles?size=100')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    const officerRow = res.body.data.find((r) => r.name === 'officer');
    expect(officerRow).toBeTruthy();
    expect(typeof officerRow.permissionCount).toBe('number');
  });

  test('validation: duplicate role name is rejected with 409', async () => {
    const name = `custom_role_${uniqueSuffix()}`;
    await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name, permissionIds: [permission.id] })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name, permissionIds: [permission.id] })
      .expect(409);
    expect(res.body.error.code).toBe('ROLE_NAME_ALREADY_EXISTS');
  });

  test('validation: an unknown permissionId is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name: `custom_role_${uniqueSuffix()}`, permissionIds: [999999] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a system role cannot be edited or deactivated (403)', async () => {
    const rolesRes = await request(app)
      .get('/api/v1/roles?isSystemRole=true&size=50')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    const systemRole = rolesRes.body.data.find((r) => r.name === 'officer');
    expect(systemRole).toBeTruthy();

    const updateRes = await request(app)
      .patch(`/api/v1/roles/${systemRole.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name: 'renamed_officer' })
      .expect(403);
    expect(updateRes.body.error.code).toBe('FORBIDDEN');

    const deleteRes = await request(app)
      .delete(`/api/v1/roles/${systemRole.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(403);
    expect(deleteRes.body.error.code).toBe('FORBIDDEN');
  });

  test('permission: Officer cannot list roles (403)', async () => {
    const res = await request(app).get('/api/v1/roles').set('Authorization', `Bearer ${officerToken}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('Permission catalog is read-only and filterable by resource', async () => {
    const res = await request(app)
      .get('/api/v1/permissions?resource=complaint')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(res.body.data.every((p) => p.resource === 'complaint')).toBe(true);

    const singleRes = await request(app)
      .get(`/api/v1/permissions/${permission.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(singleRes.body.data.action).toBe('read');
  });
});
