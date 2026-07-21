'use strict';

const request = require('supertest');
const app = require('../../src/app');
const { redisClient } = require('../../src/config/redis');
const { sequelize } = require('../../src/config/database');
const otpService = require('../../src/services/otp.service');
const { getOrCreateTestTenant, randomMobileNumber } = require('./helpers/fixtures');

describe('Citizen OTP authentication (docs/authentication.yaml §2.1-2.2)', () => {
  beforeAll(async () => {
    await getOrCreateTestTenant();
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: request -> verify registers a new citizen and issues tokens', async () => {
    const mobileNumber = randomMobileNumber();

    const requestRes = await request(app).post('/api/v1/auth/citizen/otp/request').send({ mobileNumber }).expect(200);

    expect(requestRes.body.success).toBe(true);
    expect(requestRes.body.data.requestId).toBeTruthy();
    expect(requestRes.body.data).not.toHaveProperty('otp');

    // The HTTP request above never reveals the OTP (by design — it "arrives
    // by SMS"). Calling the service directly for the ACT step's fixture is
    // the standard way to obtain a known-valid OTP without a real SMS
    // provider; this overwrites the OTP record for the same mobile number,
    // which is fine since we only need one valid, known OTP to verify with.
    const { otp, requestId } = await otpService.requestCitizenOtp(mobileNumber);

    const verifyRes = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId, mobileNumber, otp, name: 'Test Citizen' })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeTruthy();
    expect(verifyRes.body.data.refreshToken).toBeTruthy();
    expect(verifyRes.body.data.user.userType).toBe('citizen');
    expect(verifyRes.body.data.user.isNewRegistration).toBe(true);
  });

  test('second verification for the same mobile number logs in, not re-registers', async () => {
    const mobileNumber = randomMobileNumber();

    const first = await otpService.requestCitizenOtp(mobileNumber);
    const firstVerify = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId: first.requestId, mobileNumber, otp: first.otp, name: 'Repeat Citizen' })
      .expect(200);
    expect(firstVerify.body.data.user.isNewRegistration).toBe(true);
    const userId = firstVerify.body.data.user.id;

    const second = await otpService.requestCitizenOtp(mobileNumber);
    const secondVerify = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId: second.requestId, mobileNumber, otp: second.otp })
      .expect(200);
    expect(secondVerify.body.data.user.isNewRegistration).toBe(false);
    expect(secondVerify.body.data.user.id).toBe(userId);
  });

  test('invalid OTP is rejected with 401 OTP_INVALID_OR_EXPIRED', async () => {
    const mobileNumber = randomMobileNumber();
    const { requestId } = await otpService.requestCitizenOtp(mobileNumber);

    const res = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId, mobileNumber, otp: '000000', name: 'Nope' })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  test('expired OTP (evicted from Redis) is rejected with 401 OTP_INVALID_OR_EXPIRED', async () => {
    const mobileNumber = randomMobileNumber();
    const { requestId, otp } = await otpService.requestCitizenOtp(mobileNumber);
    await redisClient.flushall(); // simulates TTL eviction

    const res = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId, mobileNumber, otp, name: 'Too Late' })
      .expect(401);

    expect(res.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  test('missing mobileNumber fails request-time validation with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/auth/citizen/otp/request').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('name is required for a brand-new registration', async () => {
    const mobileNumber = randomMobileNumber();
    const { requestId, otp } = await otpService.requestCitizenOtp(mobileNumber);

    const res = await request(app)
      .post('/api/v1/auth/citizen/otp/verify')
      .send({ requestId, mobileNumber, otp })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  afterAll(async () => {
    await sequelize.close().catch(() => {});
  });
});
