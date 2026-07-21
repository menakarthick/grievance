'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const otpService = require('../../src/services/otp.service');
const { getOrCreateTestTenant, createStaffUser } = require('./helpers/fixtures');

describe('Officer login: password + OTP (docs/authentication.yaml §2.3-2.4)', () => {
  let tenant;

  beforeAll(async () => {
    tenant = await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: correct password issues an OTP challenge, correct OTP issues tokens', async () => {
    const { user, password } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    const loginRes = await request(app)
      .post('/api/v1/auth/officer/login')
      .send({ username: user.username, password })
      .expect(200);

    expect(loginRes.body.data.otpChallengeId).toBeTruthy();
    expect(loginRes.body.data.otpDeliveredTo).toMatch(/\*+\d{4}$/);

    // Same "read the real OTP via the service layer" pattern as the citizen
    // suite — issue a fresh challenge for this user to get a known OTP.
    const { otp, otpChallengeId } = await otpService.issueOfficerOtpChallenge(user.id, user.mobileNumber);

    const verifyRes = await request(app)
      .post('/api/v1/auth/officer/otp/verify')
      .send({ otpChallengeId, otp })
      .expect(200);

    expect(verifyRes.body.data.accessToken).toBeTruthy();
    expect(verifyRes.body.data.user.userType).toBe('officer');
  });

  test('wrong password is rejected with 401 INVALID_CREDENTIALS', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    const res = await request(app)
      .post('/api/v1/auth/officer/login')
      .send({ username: user.username, password: 'totally-wrong' })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('unknown username is rejected with the same INVALID_CREDENTIALS (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/officer/login')
      .send({ username: 'no-such-user', password: 'whatever12345' })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('invalid OTP at the verify step is rejected with 401 OTP_INVALID_OR_EXPIRED', async () => {
    const { user } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });
    const { otpChallengeId } = await otpService.issueOfficerOtpChallenge(user.id, user.mobileNumber);

    const res = await request(app)
      .post('/api/v1/auth/officer/otp/verify')
      .send({ otpChallengeId, otp: '000000' })
      .expect(401);

    expect(res.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  test('5 consecutive wrong passwords locks the account with 423 ACCOUNT_LOCKED', async () => {
    const { user, password } = await createStaffUser({ tenantId: tenant.id, userType: 'officer' });

    for (let i = 0; i < 4; i += 1) {
      await request(app)
        .post('/api/v1/auth/officer/login')
        .send({ username: user.username, password: 'wrong' })
        .expect(401);
    }

    const fifth = await request(app)
      .post('/api/v1/auth/officer/login')
      .send({ username: user.username, password: 'wrong' })
      .expect(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');

    // Even the correct password is now rejected while the lock is active.
    const stillLocked = await request(app)
      .post('/api/v1/auth/officer/login')
      .send({ username: user.username, password })
      .expect(423);
    expect(stillLocked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
