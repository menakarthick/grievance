'use strict';

const express = require('express');
const request = require('supertest');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { authenticate, requirePermission, requireRole, requireTenant } = require('../../src/middleware/auth');
const tokenService = require('../../src/services/token.service');
const {
  getOrCreateTestTenant,
  createStaffUser,
  getOrCreateGlobalRole,
  getOrCreatePermission,
  grantPermissionToRole,
  assignRoleToUser,
} = require('./helpers/fixtures');

// No business route exists yet to protect (Complaint/Admin modules are out
// of scope for this phase) — this tiny app wires the real middleware
// exports onto throwaway routes, which is exactly what a future module's
// route file will do.
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected/role', authenticate, requireRole('department_admin'), (req, res) => res.json({ ok: true }));
  app.get('/protected/permission', authenticate, requirePermission('complaint', 'assign'), (req, res) =>
    res.json({ ok: true }),
  );
  app.get('/protected/tenant', authenticate, requireTenant(), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('RBAC middleware (requireRole / requirePermission / requireTenant)', () => {
  let tenant;
  const app = buildTestApp();

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  async function tokenFor(user, roleNames, scope = null) {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: user.id,
      userType: user.userType,
      tenantId: user.tenantId,
      roles: roleNames,
      scope,
    });
    return accessToken;
  }

  test('requireRole: 403 when the caller lacks the required role', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    const accessToken = await tokenFor(user, ['officer']);

    const res = await request(app).get('/protected/role').set('Authorization', `Bearer ${accessToken}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('requireRole: 200 when the caller holds the required role', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'department_admin' });
    const accessToken = await tokenFor(user, ['department_admin']);

    await request(app).get('/protected/role').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  test('requirePermission: 403 (permission denied) when the role grants no matching permission', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    const role = await getOrCreateGlobalRole('officer');
    await assignRoleToUser(user.id, role.id, 'department');
    const accessToken = await tokenFor(user, ['officer']);

    const res = await request(app)
      .get('/protected/permission')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('requirePermission: 200 once the role is granted the (resource, action) pair', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'department_admin' });
    const role = await getOrCreateGlobalRole('department_admin_rbac_test');
    const permission = await getOrCreatePermission('complaint', 'assign');
    await grantPermissionToRole(role.id, permission.id);
    await assignRoleToUser(user.id, role.id, 'department');
    const accessToken = await tokenFor(user, ['department_admin_rbac_test']);

    await request(app).get('/protected/permission').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  test('requirePermission: Super Admin override bypasses the permission catalog entirely', async () => {
    const { user } = await createStaffUser({ tenantId: null, userType: 'super_admin' });
    const accessToken = await tokenFor(user, ['super_admin']);

    // No role/permission rows are granted at all — Super Admin still passes.
    await request(app).get('/protected/permission').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  test('requireTenant: 403 for a tenant-less non-super-admin token', async () => {
    const { user } = await createStaffUser({ tenantId: null, userType: 'officer' });
    const accessToken = await tokenService
      .issueTokenPair({ userId: user.id, userType: 'officer', tenantId: null, roles: ['officer'], scope: null })
      .then((r) => r.accessToken);

    const res = await request(app).get('/protected/tenant').set('Authorization', `Bearer ${accessToken}`).expect(403);
    expect(res.body.error.code).toBe('TENANT_REQUIRED');
  });

  test('requireTenant: Super Admin passes even without a tenantId', async () => {
    const { user } = await createStaffUser({ tenantId: null, userType: 'super_admin' });
    const accessToken = await tokenFor(user, ['super_admin']);

    await request(app).get('/protected/tenant').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  test('no token at all is rejected with 401 before any RBAC check runs', async () => {
    const res = await request(app).get('/protected/permission').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
