'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { getOrCreateTestTenant, createStaffUser, uniqueSuffix, tokenFor } = require('./helpers/fixtures');

describe('Geographic module — GIS Capability Status & Hierarchy (docs/07-Geographic-APIs.md §7.10)', () => {
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

  test('GIS status is genuinely served (gisEnabled:false, since no GIS tables exist yet)', async () => {
    const res = await request(app)
      .get('/api/v1/geo/gis/status')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);
    expect(res.body.data).toMatchObject({ gisEnabled: false, boundaryEntityTypesPopulated: [] });
    expect(typeof res.body.data.mapsProviderConfigured).toBe('boolean');
  });

  test('GIS hierarchy walks the real district/zone/ward tree', async () => {
    const districtRes = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: 'GIS Test District' })
      .expect(201);
    const zoneRes = await request(app)
      .post('/api/v1/geo/zones')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `Z-${uniqueSuffix()}`, name: 'GIS Test Zone', districtId: districtRes.body.data.id })
      .expect(201);
    await request(app)
      .post('/api/v1/geo/wards')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `W-${uniqueSuffix()}`, name: 'GIS Test Ward', zoneId: zoneRes.body.data.id })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/geo/gis/hierarchy')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);

    const districtNode = res.body.data.children.find((d) => d.id === districtRes.body.data.id);
    expect(districtNode).toBeTruthy();
    expect(districtNode.orgUnitType).toBe('district');
    const zoneNode = districtNode.children.find((z) => z.id === zoneRes.body.data.id);
    expect(zoneNode).toBeTruthy();
    expect(zoneNode.children.length).toBeGreaterThan(0);
    expect(zoneNode.children[0].orgUnitType).toBe('ward');
  });

  test('GIS hierarchy requires Department Admin tier or above (Officer is forbidden)', async () => {
    const res = await request(app)
      .get('/api/v1/geo/gis/hierarchy')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
