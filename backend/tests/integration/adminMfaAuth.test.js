'use strict';

const request = require('supertest');
const { authenticator } = require('otplib');
const app = require('../../src/app');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const { getOrCreateTestTenant, createMfaEnrolledAdmin, createAdminWithoutMfa } = require('./helpers/fixtures');

describe('Admin login: password + TOTP MFA (docs/authentication.yaml §2.5-2.6)', () => {
  let tenant;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: password step issues an MFA challenge, correct TOTP issues tokens', async () => {
    const { user, password, totpSecret } = await createMfaEnrolledAdmin({ tenantId: tenant.id });

    const loginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ username: user.username, password })
      .expect(200);

    expect(loginRes.body.data.mfaChallengeId).toBeTruthy();
    expect(loginRes.body.data.mfaMethod).toBe('totp');

    const totpCode = authenticator.generate(totpSecret);
    const verifyRes = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaChallengeId: loginRes.body.data.mfaChallengeId, totpCode })
      .expect(200);

    expect(verifyRes.body.data.accessToken).toBeTruthy();
    expect(verifyRes.body.data.user.userType).toBe('corporation_admin');
  });

  test('an account with no enrolled MFA device gets 409 MFA_NOT_ENROLLED', async () => {
    const { user, password } = await createAdminWithoutMfa({ tenantId: tenant.id });

    const res = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ username: user.username, password })
      .expect(409);

    expect(res.body.error.code).toBe('MFA_NOT_ENROLLED');
  });

  test('wrong TOTP code is rejected with 401 MFA_INVALID_OR_EXPIRED', async () => {
    const { user, password } = await createMfaEnrolledAdmin({ tenantId: tenant.id });

    const loginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ username: user.username, password })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaChallengeId: loginRes.body.data.mfaChallengeId, totpCode: '000000' })
      .expect(401);

    expect(res.body.error.code).toBe('MFA_INVALID_OR_EXPIRED');
  });

  test('expired/unknown MFA challenge id is rejected with 401 MFA_INVALID_OR_EXPIRED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaChallengeId: '00000000-0000-0000-0000-000000000000', totpCode: '123456' })
      .expect(401);
    expect(res.body.error.code).toBe('MFA_INVALID_OR_EXPIRED');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
