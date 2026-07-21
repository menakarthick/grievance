'use strict';

const { generateOtp, generateSalt, hashOtp, verifyOtpHash } = require('../../src/utils/otp');

describe('utils/otp', () => {
  test('generateOtp produces a 6-digit numeric string', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  test('hashOtp/verifyOtpHash round-trip correctly', () => {
    const otp = '123456';
    const salt = generateSalt();
    const hash = hashOtp(otp, salt);
    expect(verifyOtpHash(otp, salt, hash)).toBe(true);
  });

  test('verifyOtpHash rejects a wrong OTP', () => {
    const salt = generateSalt();
    const hash = hashOtp('123456', salt);
    expect(verifyOtpHash('654321', salt, hash)).toBe(false);
  });

  test('verifyOtpHash rejects a hash produced with a different salt', () => {
    const hash = hashOtp('123456', generateSalt());
    expect(verifyOtpHash('123456', generateSalt(), hash)).toBe(false);
  });
});
