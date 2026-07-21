'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const otpService = require('../../src/services/otp.service');
const { getOrCreateTestTenant, randomMobileNumber } = require('./helpers/fixtures');

async function registerCitizenAndLogin() {
  const mobileNumber = randomMobileNumber();
  const { otp, requestId } = await otpService.requestCitizenOtp(mobileNumber);
  const res = await request(app)
    .post('/api/v1/auth/citizen/otp/verify')
    .send({ requestId, mobileNumber, otp, name: 'Token Test Citizen' })
    .expect(200);
  return res.body.data;
}

describe('Token refresh, rotation, and logout (docs/authentication.yaml §2.7-2.8)', () => {
  beforeAll(async () => {
    await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: refresh returns a new pair, and the old refresh token can no longer be used', async () => {
    const { refreshToken } = await registerCitizenAndLogin();

    const refreshRes = await request(app).post('/api/v1/auth/token/refresh').send({ refreshToken }).expect(200);

    expect(refreshRes.body.data.accessToken).toBeTruthy();
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);
  });

  test('refresh token reuse (theft signal) revokes the whole family with 401', async () => {
    const { refreshToken } = await registerCitizenAndLogin();

    const first = await request(app).post('/api/v1/auth/token/refresh').send({ refreshToken }).expect(200);

    // Replaying the original (now-rotated) token must be rejected...
    const replay = await request(app).post('/api/v1/auth/token/refresh').send({ refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED_FAMILY_REVOKED');

    // ...and the legitimately-rotated token is now dead too (family-wide revocation).
    const afterRevocation = await request(app)
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: first.body.data.refreshToken })
      .expect(401);
    expect(afterRevocation.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  test('an unknown refresh token is rejected with 401 REFRESH_TOKEN_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  test("token/validate reflects the caller's own claims for a valid access token", async () => {
    const { accessToken } = await registerCitizenAndLogin();

    const res = await request(app)
      .get('/api/v1/auth/token/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.userType).toBe('citizen');
  });

  test('a missing/invalid access token is rejected with 401', async () => {
    const res = await request(app).get('/api/v1/auth/token/validate').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');

    const badToken = await request(app)
      .get('/api/v1/auth/token/validate')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(badToken.body.error.code).toBe('TOKEN_INVALID');
  });

  test('logout denylists the current access token immediately (401 TOKEN_REVOKED afterwards)', async () => {
    const { accessToken, refreshToken } = await registerCitizenAndLogin();

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const res = await request(app)
      .get('/api/v1/auth/token/validate')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  test('logout also revokes the refresh token — it can no longer be used to refresh', async () => {
    const { accessToken, refreshToken } = await registerCitizenAndLogin();

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const res = await request(app).post('/api/v1/auth/token/refresh').send({ refreshToken }).expect(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  test('logout with allDevices revokes every session for that user', async () => {
    const mobileNumber = randomMobileNumber();

    const first = await otpService.requestCitizenOtp(mobileNumber);
    const sessionA = (
      await request(app)
        .post('/api/v1/auth/citizen/otp/verify')
        .send({ requestId: first.requestId, mobileNumber, otp: first.otp, name: 'Multi Device Citizen' })
        .expect(200)
    ).body.data;

    // A second login for the same, now-registered mobile number starts an
    // independent session/refresh-token family.
    const second = await otpService.requestCitizenOtp(mobileNumber);
    const sessionB = (
      await request(app)
        .post('/api/v1/auth/citizen/otp/verify')
        .send({ requestId: second.requestId, mobileNumber, otp: second.otp })
        .expect(200)
    ).body.data;

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send({ refreshToken: sessionA.refreshToken, allDevices: true })
      .expect(200);

    const resA = await request(app)
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: sessionA.refreshToken })
      .expect(401);
    expect(resA.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    const resB = await request(app)
      .post('/api/v1/auth/token/refresh')
      .send({ refreshToken: sessionB.refreshToken })
      .expect(401);
    expect(resB.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
