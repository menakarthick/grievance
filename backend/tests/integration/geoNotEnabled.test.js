'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { getOrCreateTestTenant, createStaffUser, createCitizenUser, tokenFor } = require('./helpers/fixtures');

// State (§7.1) / Street (§7.8) / Locality (§7.9) are reference_value-backed
// (DATABASE_DESIGN.md §29); Corporation/Region/Division (§7.3/7.4/7.6) are
// org_unit-backed (§28); Map/Geocoding/Heatmap/Analytics/Boundaries
// (§7.11-7.16) are GIS-entity-backed (§26). All are v1.1, Pending Client
// Review per §36, so none of their backing tables exist in this
// deployment. This suite verifies the module degrades exactly the way
// docs/geographic.yaml documents — not silently, not by fabricating data.
describe('Geographic module — not-yet-enabled surface (§7.1, 7.3, 7.4, 7.6, 7.8, 7.9, 7.11-7.16)', () => {
  let tenant;
  let citizenToken;
  let corpAdminToken;
  let superAdminToken;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: citizen } = await createCitizenUser({ tenantId: tenant.id });
    citizenToken = await tokenFor(citizen, ['citizen']);
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    const { user: superAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'super_admin' });
    superAdminToken = await tokenFor(superAdmin, ['super_admin']);
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('State/Street/Locality list endpoints are genuinely served — empty, not gated (200)', async () => {
    for (const path of ['/api/v1/geo/states', '/api/v1/geo/streets', '/api/v1/geo/localities']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${citizenToken}`).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.pagination.totalCount).toBe(0);
    }
  });

  test('State/Street/Locality get-by-id always 404 (no reference_value table to search)', async () => {
    const res = await request(app)
      .get('/api/v1/geo/states/1')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('STATE_NOT_FOUND');
  });

  test('State create/update/delete respond 501 NOT_ENABLED for an authorized caller', async () => {
    const res = await request(app)
      .post('/api/v1/geo/states')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'TN', name: 'Tamil Nadu' })
      .expect(501);
    expect(res.body.error.code).toBe('NOT_ENABLED');
  });

  test('State write endpoints still enforce Super-Admin-only RBAC before the 501', async () => {
    const res = await request(app)
      .post('/api/v1/geo/states')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: 'TN', name: 'Tamil Nadu' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test.each([
    ['/api/v1/geo/corporations', 'corporation'],
    ['/api/v1/geo/regions', 'region'],
    ['/api/v1/geo/divisions', 'division'],
  ])('%s (org_unit-backed) responds 501 NOT_ENABLED even for List', async (path) => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${corpAdminToken}`).expect(501);
    expect(res.body.error.code).toBe('NOT_ENABLED');
  });

  test('Division create is Super-Admin-only, and 501 once authorized', async () => {
    const forbidden = await request(app)
      .post('/api/v1/geo/divisions')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: 'DIV1', name: 'Division One', regionId: 1 })
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const notEnabled = await request(app)
      .post('/api/v1/geo/divisions')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'DIV1', name: 'Division One', regionId: 1 })
      .expect(501);
    expect(notEnabled.body.error.code).toBe('NOT_ENABLED');
  });

  test.each([
    ['/api/v1/geo/map/config', 'corpAdmin'],
    ['/api/v1/geo/map/markers', 'corpAdmin'],
    ['/api/v1/geo/reverse-geocode', 'citizen'],
    ['/api/v1/geo/heatmap', 'corpAdmin'],
    ['/api/v1/geo/analytics', 'corpAdmin'],
    ['/api/v1/geo/boundaries', 'corpAdmin'],
  ])('%s responds 501 NOT_ENABLED', async (path, tokenName) => {
    const token = tokenName === 'citizen' ? citizenToken : corpAdminToken;
    const res = await request(app).get(path).set('Authorization', `Bearer ${token}`).expect(501);
    expect(res.body.error.code).toBe('NOT_ENABLED');
  });
});
