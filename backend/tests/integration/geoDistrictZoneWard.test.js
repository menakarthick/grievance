'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const {
  getOrCreateTestTenant,
  createStaffUser,
  createCitizenUser,
  uniqueSuffix,
  tokenFor,
} = require('./helpers/fixtures');

describe('Geographic module — District / Zone / Ward (docs/07-Geographic-APIs.md §7.2, 7.5, 7.7)', () => {
  let tenant;
  let corpAdminToken;
  let citizenToken;
  let officerToken;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    const { user: citizen } = await createCitizenUser({ tenantId: tenant.id });
    citizenToken = await tokenFor(citizen, ['citizen']);
    const { user: officer } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    officerToken = await tokenFor(officer, ['officer']);
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  async function createDistrict(overrides = {}) {
    const res = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: `Test District ${uniqueSuffix()}`, ...overrides })
      .expect(201);
    return res.body.data;
  }

  async function createZone(districtId, overrides = {}) {
    const res = await request(app)
      .post('/api/v1/geo/zones')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `Z-${uniqueSuffix()}`, name: `Test Zone ${uniqueSuffix()}`, districtId, ...overrides })
      .expect(201);
    return res.body.data;
  }

  async function createWard(zoneId, overrides = {}) {
    const res = await request(app)
      .post('/api/v1/geo/wards')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `W-${uniqueSuffix()}`, name: `Test Ward ${uniqueSuffix()}`, zoneId, ...overrides })
      .expect(201);
    return res.body.data;
  }

  // --- Happy-path CRUD (Integration) --------------------------------------

  test('happy path: District -> Zone -> Ward can be created, read, updated, and listed', async () => {
    const district = await createDistrict();
    expect(district.id).toBeTruthy();
    expect(district.isActive).toBe(true);

    const zone = await createZone(district.id);
    expect(zone.districtId).toBe(district.id);

    const ward = await createWard(zone.id);
    expect(ward.zoneId).toBe(zone.id);

    const getDistrict = await request(app)
      .get(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(getDistrict.body.data.name).toBe(district.name);

    const updated = await request(app)
      .patch(`/api/v1/geo/wards/${ward.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ name: 'Renamed Ward' })
      .expect(200);
    expect(updated.body.data.name).toBe('Renamed Ward');

    const list = await request(app)
      .get(`/api/v1/geo/zones?districtId=${district.id}`)
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);
    expect(list.body.data.some((z) => z.id === zone.id)).toBe(true);
    expect(list.body.meta.pagination).toMatchObject({ page: 1, size: 20 });
  });

  // --- Pagination / Filtering / Searching / Sorting -----------------------

  test('supports pagination, sorting, and free-text search on List Districts', async () => {
    const marker = uniqueSuffix();
    await createDistrict({ name: `Zzz-Searchable-${marker}` });
    await createDistrict({ name: `Aaa-Searchable-${marker}` });

    const searchRes = await request(app)
      .get(`/api/v1/geo/districts?q=Searchable-${marker}&sort=name&size=50`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(searchRes.body.data).toHaveLength(2);
    expect(searchRes.body.data[0].name).toMatch(/^Aaa-Searchable/);
    expect(searchRes.body.data[1].name).toMatch(/^Zzz-Searchable/);
  });

  test('an unrecognized sort field is rejected with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/geo/districts?sort=passwordHash')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('size above the documented ceiling (100 for districts) is rejected', async () => {
    const res = await request(app)
      .get('/api/v1/geo/districts?size=500')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // --- Hierarchy validation ------------------------------------------------

  test('hierarchy: creating a Zone under a non-existent District is rejected with 404 DISTRICT_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/geo/zones')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `Z-${uniqueSuffix()}`, name: 'Orphan Zone', districtId: 999999 })
      .expect(404);
    expect(res.body.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  test('hierarchy: creating a Zone under a deactivated District is rejected', async () => {
    const district = await createDistrict();
    await request(app)
      .patch(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ isActive: false })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/geo/zones')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `Z-${uniqueSuffix()}`, name: 'Zone Under Inactive District', districtId: district.id })
      .expect(404);
    expect(res.body.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  test('hierarchy: a Ward under a non-existent Zone is rejected with 404 ZONE_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/geo/wards')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `W-${uniqueSuffix()}`, name: 'Orphan Ward', zoneId: 999999 })
      .expect(404);
    expect(res.body.error.code).toBe('ZONE_NOT_FOUND');
  });

  test('hierarchy: District cannot be deactivated while it still has active Zones (409)', async () => {
    const district = await createDistrict();
    await createZone(district.id);

    const res = await request(app)
      .delete(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('DISTRICT_HAS_ACTIVE_ZONES');
  });

  test('hierarchy: Zone cannot be deactivated while it still has active Wards (409)', async () => {
    const district = await createDistrict();
    const zone = await createZone(district.id);
    await createWard(zone.id);

    const res = await request(app)
      .delete(`/api/v1/geo/zones/${zone.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('ZONE_HAS_ACTIVE_WARDS');
  });

  test('hierarchy: a District with no active children can be deactivated, and reactivated via PATCH', async () => {
    const district = await createDistrict();
    await request(app)
      .delete(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(204);

    const afterDelete = await request(app)
      .get(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(afterDelete.body.data.isActive).toBe(false);

    const reactivated = await request(app)
      .patch(`/api/v1/geo/districts/${district.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ isActive: true })
      .expect(200);
    expect(reactivated.body.data.isActive).toBe(true);
  });

  // --- Duplicate / validation rules ----------------------------------------

  test('validation: duplicate district code within the same tenant is rejected with 409', async () => {
    const code = `DUP-${uniqueSuffix()}`;
    await createDistrict({ code });

    const res = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code, name: 'Second District Same Code' })
      .expect(409);
    expect(res.body.error.code).toBe('DISTRICT_CODE_ALREADY_EXISTS');
  });

  test('validation: required fields (code, name) are enforced on Create District', async () => {
    const res = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['code', 'name']));
  });

  test('validation: name shorter than 2 characters is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: 'A' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation: getting a non-existent district returns 404 DISTRICT_NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/geo/districts/999999')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  // --- Permission tests ------------------------------------------------------

  test('permission: any authenticated role can list/read geography', async () => {
    await request(app).get('/api/v1/geo/districts').set('Authorization', `Bearer ${citizenToken}`).expect(200);
    await request(app).get('/api/v1/geo/zones').set('Authorization', `Bearer ${officerToken}`).expect(200);
  });

  test('permission: Citizen/Officer cannot create a District (403 FORBIDDEN)', async () => {
    const asCitizen = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: 'Should Not Be Created' })
      .expect(403);
    expect(asCitizen.body.error.code).toBe('FORBIDDEN');

    const asOfficer = await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: 'Should Not Be Created' })
      .expect(403);
    expect(asOfficer.body.error.code).toBe('FORBIDDEN');
  });

  test('permission: no bearer token at all is rejected with 401', async () => {
    const res = await request(app).get('/api/v1/geo/districts').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('permission: Corporation Admin can create, Super Admin can also create', async () => {
    const { user: superAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'super_admin' });
    const superAdminToken = await tokenFor(superAdmin, ['super_admin']);

    await request(app)
      .post('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: `D-${uniqueSuffix()}`, name: 'Created By Super Admin' })
      .expect(201);
  });

  // --- Ward-specific: active-use guard ---------------------------------------

  test('ward: cannot be deactivated while a citizen address references it (409 WARD_IN_ACTIVE_USE)', async () => {
    const district = await createDistrict();
    const zone = await createZone(district.id);
    const ward = await createWard(zone.id);

    const { CitizenProfile, User } = require('../../src/models');
    const citizenUser = await User.create({
      tenantId: tenant.id,
      userType: 'citizen',
      mobileNumber: `9${Date.now()}`.slice(0, 10),
      status: 'active',
    });
    await CitizenProfile.create({ userId: citizenUser.id, name: 'Ward Resident', wardId: ward.id });

    const res = await request(app)
      .delete(`/api/v1/geo/wards/${ward.id}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('WARD_IN_ACTIVE_USE');
  });
});
