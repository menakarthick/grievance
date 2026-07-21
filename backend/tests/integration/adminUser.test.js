'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const tokenService = require('../../src/services/token.service');
const {
  getOrCreateTestTenant,
  createStaffUser,
  createDepartment,
  getOrCreateGlobalRole,
  uniqueSuffix,
  tokenFor,
} = require('./helpers/fixtures');

describe('Administration — User Management (docs/06-Administration-APIs.md §6.3)', () => {
  let tenant;
  let corpAdminToken;
  let officerRole;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    officerRole = await getOrCreateGlobalRole('officer');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('happy path: Corporation Admin provisions an Officer', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const username = `officer_${uniqueSuffix()}`;

    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        userType: 'officer',
        departmentId: department.id,
        roleIds: [officerRole.id],
      })
      .expect(201);
    expect(created.body.data.username).toBe(username);
    expect(created.body.data.userType).toBe('officer');

    const fetched = await request(app)
      .get(`/api/v1/users/${created.body.data.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(fetched.body.data.roles).toContain('officer');
    expect(fetched.body.data.departmentId).toBe(String(department.id));
  });

  test('validation: duplicate username is rejected with 409', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const username = `officer_${uniqueSuffix()}`;
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        userType: 'officer',
        departmentId: department.id,
        roleIds: [officerRole.id],
      })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({
        username,
        email: `dup2_${username}@example.test`,
        userType: 'officer',
        departmentId: department.id,
        roleIds: [officerRole.id],
      })
      .expect(409);
    expect(res.body.error.code).toBe('USERNAME_ALREADY_EXISTS');
  });

  test('privilege escalation guard: a Department Admin cannot create a Corporation Admin (403)', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const { user: deptAdmin } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: department.id,
    });
    const deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);
    const corpAdminRole = await getOrCreateGlobalRole('corporation_admin');

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .send({
        username: `escalation_${uniqueSuffix()}`,
        email: `escalation_${uniqueSuffix()}@example.test`,
        userType: 'corporation_admin',
        roleIds: [corpAdminRole.id],
      })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('privilege escalation guard: a Department Admin cannot grant a role above their own authority (403)', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const { user: deptAdmin } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: department.id,
    });
    const deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);
    const corpAdminRole = await getOrCreateGlobalRole('corporation_admin');

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .send({
        username: `officer_${uniqueSuffix()}`,
        email: `officer_${uniqueSuffix()}@example.test`,
        userType: 'officer',
        roleIds: [corpAdminRole.id],
      })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('a Department Admin can provision an Officer within their own department', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const { user: deptAdmin } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'department_admin',
      departmentId: department.id,
    });
    const deptAdminToken = await tokenFor(deptAdmin, ['department_admin']);

    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .send({
        username: `officer_${uniqueSuffix()}`,
        email: `officer_${uniqueSuffix()}@example.test`,
        userType: 'officer',
        roleIds: [officerRole.id],
      })
      .expect(201);

    const fetched = await request(app)
      .get(`/api/v1/users/${created.body.data.id}`)
      .set('Authorization', `Bearer ${deptAdminToken}`)
      .expect(200);
    expect(fetched.body.data.departmentId).toBe(String(department.id));
  });

  test('deactivating a user revokes their active sessions', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const { user: officer } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'officer',
      departmentId: department.id,
    });

    const { refreshToken } = await tokenService.issueTokenPair({
      userId: officer.id,
      userType: 'officer',
      tenantId: tenant.id,
      roles: ['officer'],
      scope: null,
    });

    await request(app)
      .patch(`/api/v1/users/${officer.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ isActive: false })
      .expect(200);

    const res = await request(app).post('/api/v1/auth/token/refresh').send({ refreshToken }).expect(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  test('permission: Officer cannot list users (403)', async () => {
    const department = await createDepartment({ tenantId: tenant.id });
    const { user: officer } = await createStaffUser({
      tenantId: tenant.id,
      userType: 'officer',
      departmentId: department.id,
    });
    const officerToken = await tokenFor(officer, ['officer']);

    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${officerToken}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
