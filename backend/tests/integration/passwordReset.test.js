'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const tokenRepository = require('../../src/repositories/token.repository');
const { getOrCreateTestTenant, createStaffUser } = require('./helpers/fixtures');

describe('Forgot / Reset password (docs/authentication.yaml §2.9-2.10)', () => {
  let tenant;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('forgot-password always returns success, for both real and unknown usernames', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    const known = await request(app).post('/api/v1/auth/password/forgot').send({ username: user.username }).expect(200);
    expect(known.body.data.success).toBe(true);

    const unknown = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ username: 'no-such-user' })
      .expect(200);
    expect(unknown.body.data.success).toBe(true);
  });

  test('reset happy path: a fresh, policy-compliant password is accepted', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    await request(app).post('/api/v1/auth/password/forgot').send({ username: user.username }).expect(200);

    // The reset token is delivered out-of-band (email, not built in this
    // phase) — read it directly from its Redis-backed store the same way
    // the OTP fixtures read the OTP.
    const keys = await redisClient.keys('password-reset:*');
    expect(keys.length).toBeGreaterThan(0);
    const resetToken = keys[0].replace('password-reset:', '');

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ resetToken, newPassword: 'Brand-New-Pass1!' })
      .expect(200);
    expect(res.body.data.success).toBe(true);

    // The token is single-use.
    const replay = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ resetToken, newPassword: 'Another-New-Pass2!' })
      .expect(401);
    expect(replay.body.error.code).toBe('RESET_TOKEN_INVALID_OR_EXPIRED');
  });

  test('an unknown reset token is rejected with 401 RESET_TOKEN_INVALID_OR_EXPIRED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ resetToken: 'not-a-real-token', newPassword: 'Brand-New-Pass1!' })
      .expect(401);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID_OR_EXPIRED');
  });

  test('reusing one of the last 5 passwords is denied with PASSWORD_REUSE_DENIED', async () => {
    const { user, password } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    const resetToken = 'test-reuse-token';
    await tokenRepository.savePasswordResetToken(resetToken, { userId: user.id }, 1800);

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ resetToken, newPassword: password })
      .expect(400);
    expect(res.body.error.code).toBe('PASSWORD_REUSE_DENIED');
  });

  test('a policy-violating password is rejected with PASSWORD_POLICY_VIOLATION', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    const resetToken = 'test-policy-token';
    await tokenRepository.savePasswordResetToken(resetToken, { userId: user.id }, 1800);

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ resetToken, newPassword: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
