'use strict';

const crypto = require('crypto');

// 6-digit numeric OTP (docs/authentication.yaml `otp` pattern `^\d{6}$`).
// Hashed at rest in Redis (ARCHITECTURE.md §16 "OTP | Hashed OTP, 5-minute
// TTL") using HMAC-SHA256 salted with a per-request random value — fast
// verification is desired here (unlike password hashing) because the OTP's
// resistance to offline brute force already comes from its 5-minute TTL,
// single-use consumption, and the request-rate/verify-attempt limits
// enforced around it, not from hash slowness.
function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashOtp(otp, salt) {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

function verifyOtpHash(otp, salt, expectedHash) {
  const actualHash = hashOtp(otp, salt);
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { generateOtp, generateSalt, hashOtp, verifyOtpHash };
