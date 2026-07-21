'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/config/database');
const { redisClient } = require('../../src/config/redis');
const { FeatureFlagConfig } = require('../../src/models');
const { getOrCreateTestTenant, createStaffUser, uniqueSuffix, tokenFor } = require('./helpers/fixtures');

describe('Administration — Tenant Config / Feature Flags / Providers (docs/06-Administration-APIs.md §6.9-6.11)', () => {
  let tenant;
  let corpAdminToken;
  let superAdminToken;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
    const { user: corpAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'corporation_admin' });
    corpAdminToken = await tokenFor(corpAdmin, ['corporation_admin']);
    const { user: superAdmin } = await createStaffUser({ tenantId: tenant.id, userType: 'super_admin' });
    superAdminToken = await tokenFor(superAdmin, ['super_admin']);
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
    await redisClient.flushall().catch(() => {});
  });

  test('Tenant Config: GET is served from the real tenant row plus documented platform defaults', async () => {
    const res = await request(app)
      .get('/api/v1/tenant-config')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(res.body.data.tenantCode).toBe(tenant.code);
    expect(res.body.data.tenantName).toBe(tenant.name);
    expect(res.body.data.passwordPolicy.minLength).toBe(12);
  });

  test('Tenant Config: PATCH responds 501 NOT_ENABLED — no schema column exists to persist it', async () => {
    const res = await request(app)
      .patch('/api/v1/tenant-config')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ reopenWindowDays: 7 })
      .expect(501);
    expect(res.body.error.code).toBe('NOT_ENABLED');
  });

  test('Feature Flags: list + toggle a recognized flag', async () => {
    const flagKey = `test_flag_${uniqueSuffix()}`;
    await FeatureFlagConfig.create({ tenantId: tenant.id, flagKey, isEnabled: false, flagType: 'boolean' });

    const listRes = await request(app)
      .get('/api/v1/feature-flags')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(listRes.body.data.some((f) => f.flagKey === flagKey)).toBe(true);

    const toggled = await request(app)
      .patch(`/api/v1/feature-flags/${flagKey}`)
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ isEnabled: true })
      .expect(200);
    expect(toggled.body.data.isEnabled).toBe(true);
  });

  test('Feature Flags: toggling an unrecognized key is rejected with 404', async () => {
    const res = await request(app)
      .patch('/api/v1/feature-flags/not_a_real_flag')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ isEnabled: true })
      .expect(404);
    expect(res.body.error.code).toBe('FLAG_NOT_FOUND');
  });

  test('Providers: Set Active Provider requires Super Admin (Corp Admin gets 403)', async () => {
    const res = await request(app)
      .put('/api/v1/providers/sms')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .send({ providerName: 'dlt_sms_gateway', secretReference: 'secrets/test/sms' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('Providers: happy path set + list', async () => {
    const set = await request(app)
      .put('/api/v1/providers/sms')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ providerName: 'dlt_sms_gateway', secretReference: 'secrets/test/sms-2' })
      .expect(200);
    expect(set.body.data.isActive).toBe(true);

    const listRes = await request(app)
      .get('/api/v1/providers?providerType=sms')
      .set('Authorization', `Bearer ${corpAdminToken}`)
      .expect(200);
    expect(listRes.body.data.some((p) => p.providerType === 'sms')).toBe(true);
  });

  test('Providers: an unsupported providerName for the given providerType is rejected (422)', async () => {
    const res = await request(app)
      .put('/api/v1/providers/sms')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ providerName: 'not_a_real_adapter', secretReference: 'secrets/test/sms-3' })
      .expect(422);
    expect(res.body.error.code).toBe('UNSUPPORTED_PROVIDER');
  });

  test('Providers: a secretReference that looks like a raw credential is rejected', async () => {
    const res = await request(app)
      .put('/api/v1/providers/ai')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ providerName: 'claude', secretReference: 'sk-abcdefghijklmnopqrstuvwxyz0123456789' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
