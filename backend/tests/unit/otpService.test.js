'use strict';

const otpService = require('../../src/services/otp.service');
const { redisClient } = require('../../src/config/redis');
const redisKeys = require('../../src/utils/redisKeys');

describe('services/otp.service (citizen)', () => {
  const mobileNumber = '9876543210';

  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: request then verify succeeds and is single-use', async () => {
    const { otp, requestId } = await otpService.requestCitizenOtp(mobileNumber);

    const first = await otpService.verifyCitizenOtp(mobileNumber, requestId, otp);
    expect(first).toEqual({ ok: true });

    // Single-use: the same OTP cannot be replayed.
    const second = await otpService.verifyCitizenOtp(mobileNumber, requestId, otp);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('EXPIRED');
  });

  test('invalid OTP is rejected without consuming the record', async () => {
    const { requestId } = await otpService.requestCitizenOtp(mobileNumber);
    const result = await otpService.verifyCitizenOtp(mobileNumber, requestId, '000000');
    expect(result).toEqual({ ok: false, reason: 'INVALID' });
  });

  test('mismatched requestId is rejected', async () => {
    const { otp } = await otpService.requestCitizenOtp(mobileNumber);
    const result = await otpService.verifyCitizenOtp(mobileNumber, 'not-the-real-request-id', otp);
    expect(result).toEqual({ ok: false, reason: 'INVALID' });
  });

  test('expired OTP (key evicted) is reported as EXPIRED', async () => {
    const { otp, requestId } = await otpService.requestCitizenOtp(mobileNumber);
    await redisClient.del(redisKeys.otpCitizen(mobileNumber));
    const result = await otpService.verifyCitizenOtp(mobileNumber, requestId, otp);
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  test('exceeding max verify attempts invalidates the OTP', async () => {
    const { requestId } = await otpService.requestCitizenOtp(mobileNumber);
    for (let i = 0; i < 5; i += 1) {
      await otpService.verifyCitizenOtp(mobileNumber, requestId, '000000');
    }
    const result = await otpService.verifyCitizenOtp(mobileNumber, requestId, '000000');
    expect(result.ok).toBe(false);
    expect(['ATTEMPTS_EXCEEDED', 'EXPIRED']).toContain(result.reason);
  });
});

describe('services/otp.service (officer challenge)', () => {
  afterEach(async () => {
    await redisClient.flushall();
  });

  test('happy path: challenge resolves back to the issuing userId', async () => {
    const { otp, otpChallengeId } = await otpService.issueOfficerOtpChallenge(42, '9876500000');
    const result = await otpService.verifyOfficerOtp(otpChallengeId, otp);
    expect(result).toEqual({ ok: true, userId: 42 });
  });

  test('invalid OTP against a real challenge fails without leaking userId', async () => {
    const { otpChallengeId } = await otpService.issueOfficerOtpChallenge(42, '9876500000');
    const result = await otpService.verifyOfficerOtp(otpChallengeId, '000000');
    expect(result.ok).toBe(false);
  });

  test('unknown challenge id is reported as EXPIRED', async () => {
    const result = await otpService.verifyOfficerOtp('00000000-0000-0000-0000-000000000000', '123456');
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });
});
